/* =====================================================================
   LIZZREAD 本地服务器
   - 静态文件（index.html / books / sentences / data / vendor …）
   - /api/pg/:id 按需从 Project Gutenberg 镜像抓取全文，落盘缓存到 books/pg<id>.txt
     （浏览器直连 pglaf 会被 CORS 拦截，所以必须经由本机/服务端代理）
   - /api/health 健康检查
   用法：node server.js [port]
   ===================================================================== */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { Readable, PassThrough } = require('stream');
const zlib = require('zlib');

const ROOT = __dirname;
const PORT = Number(process.argv[2] || process.env.PORT || 8765);
const BOOKS_DIR = path.join(ROOT, 'books');
const COVERS_DIR = path.join(BOOKS_DIR, 'covers');
const TX_CACHE = new Map();
const METRICS = Object.create(null);
const TX_CACHE_MAX = 20000;
const REDEEM_FILE = path.join(ROOT, 'data', 'redemptions.json');
const REDEEM_CODES = {
  'wansuiwansuiwanwansui1313113': {plan:'permanent', days:0,   scope:'all'},
  'nulixuexiya2027':             {plan:'year',      days:366, scope:'all'},
  'lizzzhaohaoyon!!!':            {plan:'month',     days:31,  scope:'one'},
  /* 班级版：最多 30 台设备（老师+学生），一年内有效 */
  'lzbb3h-5qdy-dek3':         {plan:'all_year',  days:366, scope:'all', seats:30}
};
function readRedeemed(){
  try{ return JSON.parse(fs.readFileSync(REDEEM_FILE, 'utf8')) || {}; }catch(e){ return {}; }
}
function writeRedeemed(o){
  try{
    if(!fs.existsSync(path.join(ROOT,'data'))) fs.mkdirSync(path.join(ROOT,'data'), {recursive:true});
    const tmp = REDEEM_FILE + '.part';
    fs.writeFileSync(tmp, JSON.stringify(o, null, 2));
    fs.renameSync(tmp, REDEEM_FILE);
  }catch(e){}
}
const PG_MIRRORS = [
  id => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.txt`,
  id => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}-0.txt`,
  id => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.txt`
];
const MIME = {
  '.html':'text/html; charset=utf-8', '.htm':'text/html; charset=utf-8',
  '.js':'application/javascript; charset=utf-8', '.mjs':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.txt':'text/plain; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.ico':'image/x-icon',
  '.woff':'font/woff', '.woff2':'font/woff2', '.pdf':'application/pdf', '.zip':'application/zip',
  '.md':'text/markdown; charset=utf-8'
};

function sendJSON(res, code, obj){
  const body = JSON.stringify(obj);
  res.writeHead(code, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
  res.end(body);
}

/* 打包壳（Capacitor Android/iOS）与本机浏览器都允许：用于翻译/词典代理 */
function isTrustedClient(req){
  if(isLocalRequest(req)) return true;
  const o = String(req.headers.origin || '');
  if(!o) return false;
  try{
    const host = new URL(o).hostname;
    return host === 'localhost' || host === '127.0.0.1';
  }catch(e){ return false; }
}
function isLocalRequest(req){
  const h = String(req.headers.host || '');
  const m = h.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  const host = m ? m[1].replace(/^\[|\]$/g, '').toLowerCase() : '';
  const remote = String(req.socket && req.socket.remoteAddress || '');
  const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0' || host.endsWith('.local');
  const remoteLocal = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  return localHost || remoteLocal;
}

/* ---------- 语言模式：点词词典（多语言词典代理 + 磁盘缓存） ---------- */
const WD_CACHE_FILE = path.join(ROOT, 'data', 'word-cache.json');
let WD_CACHE = null;
function wdLoad(){
  if(WD_CACHE) return WD_CACHE;
  try{ WD_CACHE = JSON.parse(fs.readFileSync(WD_CACHE_FILE, 'utf8')) || {}; }catch(e){ WD_CACHE = {}; }
  return WD_CACHE;
}
let _wdSaveTimer = null;
function wdSave(){
  clearTimeout(_wdSaveTimer);
  _wdSaveTimer = setTimeout(() => {
    try{
      const dir = path.dirname(WD_CACHE_FILE);
      if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
      fs.writeFileSync(WD_CACHE_FILE, JSON.stringify(WD_CACHE));
    }catch(e){}
  }, 800);
}
function wdKey(lang, word){ return lang + '|' + String(word || '').trim().toLowerCase(); }
/* 语言 → 展示语言 的 Bing 代码 */
const BING_TARGET = { zh:'zh-Hans', en:'en', de:'de', fr:'fr', ja:'ja', ko:'ko', it:'it', es:'es' };
function bingLang(code){ return BING_TARGET[code] || code; }
async function bingTranslateTo(text, target, retry, from){
  const st = await bingToken();
  const form = 'fromLang=' + bingLang(from || 'auto-detect') + '&to=' + bingLang(target) + '&text=' + encodeURIComponent(String(text).slice(0,500)) +
    '&token=' + encodeURIComponent(st.token) + '&key=' + encodeURIComponent(st.key);
  const url = 'https://cn.bing.com/ttranslatev3?isVertical=1&IG=' + encodeURIComponent(st.ig) + '&IID=translator.5024.1';
  const r = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded',
      'Content-Length':String(Buffer.byteLength(form)),
      'User-Agent':BING_UA, 'Cookie':st.cookie,
      'Referer':'https://cn.bing.com/translator', 'Origin':'https://cn.bing.com',
      'Accept':'application/json, text/plain, */*', 'X-Requested-With':'XMLHttpRequest'
    },
    body:form, signal: AbortSignal.timeout(20000)
  });
  if((r.status === 401 || r.status === 429) && !retry){ BING_STATE = null; return bingTranslateTo(text, target, true); }
  if(!r.ok) throw new Error('bing '+r.status);
  const j = await r.json().catch(()=>null);
  const t = j && j[0] && j[0].translations && j[0].translations[0] && j[0].translations[0].text;
  if(!t) throw new Error('bing empty');
  return String(t).trim();
}

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/* 可取消的文本下载：读取完成后主动断开连接（大文件不必等服务器收尾） */
function downloadText(url, timeoutMs){
  return new Promise((resolve) => {
    let done = false;
    const finish = (obj) => { if(done) return; done = true; clearTimeout(timer); resolve(obj); };
    let req = null;
    const timer = setTimeout(() => { try{ if(req) req.destroy(); }catch(e){} finish({ok:false, status:'timeout', buf:null}); }, timeoutMs || 120000);
    req = https.get(url, {headers:{'User-Agent':BROWSER_UA,'Accept-Encoding':'identity','Accept':'text/plain,*/*'}}, res => {
      if(res.statusCode !== 200){
        res.resume(); finish({ok:false, status:res.statusCode, buf:null}); return;
      }
      const parts = [];
      let got = 0;
      const total = Number(res.headers['content-length'] || 0);
      res.on('data', c => {
        parts.push(c); got += c.length;
        /* 大文件（中文长篇小说 2-4MB）随时长抖动明显：收到绝大部分就收尾，不必等服务器关连接 */
        if(total && got >= total){ try{ res.destroy(); }catch(e){} finish({ok:true, status:200, buf:Buffer.concat(parts)}); }
      });
      res.on('end', () => { finish({ok:true, status:200, buf:Buffer.concat(parts)}); });
      res.on('error', () => { if(!done) finish({ok:got > 2000, status:got > 2000 ? 200 : 'stream', buf:got > 2000 ? Buffer.concat(parts) : null}); });
    });
    req.on('error', () => finish({ok:false, status:'error', buf:null}));
  });
}

/* 语言 → Gutenberg 语言代码 */
const PG_LANG = { en:'en', de:'de', fr:'fr', it:'it', es:'es', ja:'ja', ko:'ko' };
const PG_LANG_NAME = { en:'English', de:'German', fr:'French', it:'Italian', es:'Spanish', ja:'Japanese', ko:'Korean' };
const PG_LANG_CODE = { en:'en', de:'de', fr:'fr', it:'it', es:'es', ja:'ja', ko:'ko' };
async function fetchUpstream(id, lang){
  let lastErr = null;
  for(const make of PG_MIRRORS){
    const url = make(id);
    try{
      let got = await downloadText(url, 120000);
      if(!got.ok && (got.status === 503 || got.status === 'timeout' || got.status === 'error')){
        /* 偶发 503 / 超时：同一镜像重试一次 */
        await new Promise(r => setTimeout(r, 600));
        got = await downloadText(url, 120000);
      }
      if(!got.ok){ lastErr = new Error('HTTP ' + got.status + ' @ ' + url); continue; }
      const buf = got.buf;
      if(buf.length <= 2000){ lastErr = new Error('内容过短 @ ' + url); continue; }
      /* 语言守卫：非英文模式只接受目标语言文本（Gutenberg 标准 Language: 行） */
      if(lang && lang !== 'en'){
        const head = buf.subarray(0, 6000).toString('utf8');
        const lm = head.match(/^Language:\s*(.+)$/mi);
        const langName = lm ? lm[1].replace(/^[\s:]+/, '').trim() : '';
        const want = PG_LANG_NAME[lang] || lang;
        const okLang = langName && (langName.toLowerCase().includes(want.toLowerCase()) ||
          new RegExp('(^|[^A-Za-z])' + langName.toLowerCase() + '([^A-Za-z]|$)', 'i').test(PG_LANG_CODE[lang] || ''));
        if(!lm || !okLang){
          lastErr = new Error('语言不符（' + (lm ? lm[1] : '未知') + '） @ ' + url);
          continue;
        }
      }
      return { buf, url };
    }catch(e){
      lastErr = new Error((lastErr ? lastErr.message + ' | ' : '') + '异常 ' + (e && e.code || e && e.message || e));
    }
  }
  throw lastErr || new Error('所有镜像都失败');
}

function fileMatchesLang(file, lang){
  try{
    const fd = fs.openSync(file, 'r');
    const b = Buffer.alloc(6000);
    const n = fs.readSync(fd, b, 0, 6000, 0);
    fs.closeSync(fd);
    const head = b.subarray(0, n).toString('utf8');
    const lm = head.match(/^Language:\s*(.+)$/mi);
    const langName = lm ? lm[1].trim() : '';
    const want = PG_LANG_NAME[lang] || lang;
    return !!langName && langName.toLowerCase().includes(want.toLowerCase());
  }catch(e){ return false; }
}

const inflight = new Map();
async function ensureBook(id, lang){
  const file = path.join(BOOKS_DIR, 'pg' + id + '.txt');
  if(fs.existsSync(file)){
    const st = fs.statSync(file);
    if(st.size > 2000){
      /* 缓存文件也必须过语言守卫，避免把英文书当德语书返回 */
      if(lang && !fileMatchesLang(file, lang)){
        // 语言不符：重新抓取并覆盖
        try{ fs.unlinkSync(file); }catch(e){}
      } else {
        return { file, size: st.size, cached: true };
      }
    }
  }
  const flightKey = id + ':' + (lang || '');
  if(inflight.has(flightKey)) return inflight.get(flightKey);
  const p = (async () => {
    const { buf } = await fetchUpstream(id, lang);
    const tmp = file + '.part-' + Date.now();
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, file);
    return { file, size: buf.length, cached: false };
  })();
  inflight.set(flightKey, p);
  try{ return await p; } finally { inflight.delete(flightKey); }
}

function ensureDir(dir){
  if(!fs.existsSync(dir)) fs.mkdirSync(dir, {recursive:true});
}
const COVER_MIRRORS = [
  id => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
  id => `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.cover.small.jpg`,
  id => `https://www.gutenberg.org/cache/epub/${id}/pg${id}.cover.medium.jpg`
];
async function ensureCover(id){
  ensureDir(COVERS_DIR);
  const file = path.join(COVERS_DIR, id + '.jpg');
  if(fs.existsSync(file) && fs.statSync(file).size > 500) return file;
  let lastErr = null;
  for(const make of COVER_MIRRORS){
    try{
      const r = await fetch(make(id), {
        headers:{'User-Agent':'LIZZREAD/2.0','Accept-Encoding':'identity'},
        signal: AbortSignal.timeout(30000)
      });
      if(!r.ok){ lastErr = new Error('HTTP '+r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if(buf.length > 500){
        fs.writeFileSync(file, buf);
        return file;
      }
      lastErr = new Error('封面过小');
    }catch(e){ lastErr = e; }
  }
  throw lastErr || new Error('no cover');
}

/* ---------- 文本翻译（本机代理，绕开浏览器 CORS / 额度弹窗） ---------- */
function txGet(key){
  const hit = TX_CACHE.get(key);
  if(hit && Date.now() - hit.at < 7 * 86400000) return hit.text;
  return null;
}
function txSet(key, text){
  TX_CACHE.set(key, {text, at: Date.now()});
  if(TX_CACHE.size > TX_CACHE_MAX){
    const first = TX_CACHE.keys().next().value;
    TX_CACHE.delete(first);
  }
}
/* ---------- Bing 翻译（国内可访问，服务端代理） ---------- */
const BING_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
let BING_STATE = null;
async function bingToken(){
  if(BING_STATE && Date.now() - BING_STATE.at < 50 * 60 * 1000) return BING_STATE;
  const home = await fetch('https://cn.bing.com/translator', {
    headers:{'User-Agent':BING_UA,'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8'},
    signal: AbortSignal.timeout(20000)
  });
  if(!home.ok) throw new Error('bing home '+home.status);
  const html = await home.text();
  const ig = html.match(/IG:"([^"]+)"/);
  const ab = html.match(/params_AbusePreventionHelper\s*=\s*\[([0-9]+),\s*"([^"]+)"/);
  if(!ig || !ab) throw new Error('bing token missing');
  const cookie = (home.headers.getSetCookie ? home.headers.getSetCookie() : [])
    .map(c => c.split(';')[0]).join('; ');
  BING_STATE = {key:ab[1], token:ab[2], ig:ig[1], cookie, at:Date.now()};
  return BING_STATE;
}
async function bingTranslate(text, retry){
  const st = await bingToken();
  const form = 'fromLang=en&to=zh-Hans&text=' + encodeURIComponent(String(text).slice(0,500)) +
    '&token=' + encodeURIComponent(st.token) + '&key=' + encodeURIComponent(st.key);
  const url = 'https://cn.bing.com/ttranslatev3?isVertical=1&IG=' + encodeURIComponent(st.ig) + '&IID=translator.5024.1';
  const r = await fetch(url, {
    method:'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded',
      'Content-Length':String(Buffer.byteLength(form)),
      'User-Agent':BING_UA,
      'Cookie':st.cookie,
      'Referer':'https://cn.bing.com/translator',
      'Origin':'https://cn.bing.com',
      'Accept':'application/json, text/plain, */*',
      'Accept-Language':'zh-CN,zh;q=0.9,en;q=0.8',
      'X-Requested-With':'XMLHttpRequest'
    },
    body:form,
    signal: AbortSignal.timeout(20000)
  });
  if((r.status === 401 || r.status === 429) && !retry){
    BING_STATE = null;
    return bingTranslate(text, true);
  }
  if(!r.ok) throw new Error('bing '+r.status);
  const j = await r.json().catch(()=>null);
  const t = j && j[0] && j[0].translations && j[0].translations[0] && j[0].translations[0].text;
  if(!t || !String(t).trim()) throw new Error('bing empty');
  return String(t).trim();
}

async function translateOne(text, from, to){
  const q = String(text || '').slice(0, 500);
  if(!q.trim()) return '';
  from = from || 'en'; to = to || 'zh';
  const ck = from + '>' + to + '|' + q;
  const cached = txGet(ck);
  if(cached) return cached;
  let lastErr = null;
  /* 1) Bing（国内直连可用，质量稳定） */
  try{
    const t = await bingTranslateTo(q, to, false, from);
    if(t){ txSet(ck, t); return t; }
  }catch(e){ lastErr = e; }
  /* 1.5) Google gtx（若服务器网络可达） */
  try{
    const gl = (await fetch('https://translate.googleapis.com/translate_a/single?client=gtx&sl=' + encodeURIComponent(from) + '&tl=' + encodeURIComponent(to === 'zh' ? 'zh-CN' : to) + '&dt=t&q=' + encodeURIComponent(q),
      {signal: AbortSignal.timeout(8000)})).json();
    const j = await gl;
    const t = (j && j.sentences) ? j.sentences.map(x => x[0] || '').join('') : '';
    if(t && t.trim()){ txSet(ck, t.trim()); return t.trim(); }
  }catch(e){ lastErr = e; }
  /* 2) MyMemory 兜底（按请求语言对，不再写死 en|zh） */
  try{
    const pair = from + '|' + (to === 'zh' ? 'zh-CN' : to);
    const r = await fetch('https://api.mymemory.translated.net/get?q=' + encodeURIComponent(q) + '&langpair=' + encodeURIComponent(pair) + '&de=contact%40lizzread.app', {
      headers:{'User-Agent':'LIZZREAD/2.0'},
      signal: AbortSignal.timeout(15000)
    });
    if(r.ok){
      const j = await r.json();
      let t = j && j.responseData && j.responseData.translatedText;
      if(t && /MYMEMORY WARNING|QUOTA|INVALID/i.test(t)) t = '';
      if(t && t.trim()){ txSet(ck, t.trim()); return t.trim(); }
    }
  }catch(e){ lastErr = e; }
  throw lastErr || new Error('translation failed');
}

function serveFile(req, res, file, { cache = false } = {}){
  fs.stat(file, (err, st) => {
    if(err || !st.isFile()){ sendJSON(res, 404, {error:'not found'}); return; }
    const ext = path.extname(file).toLowerCase();
    const baseHeaders = {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': cache ? 'public, max-age=604800' : 'no-cache',
      'Access-Control-Allow-Origin': '*'
    };
    /* gzip：文本类资源压缩后体积约为 1/4（首页 448KB → ~90KB），慢网络首屏明显更快 */
    const GZIP_EXT = new Set(['.html','.js','.css','.json','.svg','.txt','.md','.xml','.webmanifest']);
    const gzOn = GZIP_EXT.has(ext) && st.size > 1024 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if(req.method === 'HEAD'){
      res.writeHead(200, gzOn ? Object.assign({'Vary':'Accept-Encoding'}, baseHeaders) : Object.assign({'Content-Length': st.size}, baseHeaders));
      res.end(); return;
    }
    if(gzOn){
      res.writeHead(200, Object.assign({'Content-Encoding':'gzip','Vary':'Accept-Encoding'}, baseHeaders));
      const gz = zlib.createGzip({level: 6});
      gz.on('error', ()=>{ try{ res.destroy(); }catch(e){} });
      fs.createReadStream(file).pipe(gz).pipe(res);
      return;
    }
    res.writeHead(200, Object.assign({'Content-Length': st.size}, baseHeaders));
    fs.createReadStream(file).pipe(res);
  });
}

function safeJoin(root, urlPath){
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const p = path.normalize(path.join(root, decoded));
  if(!p.startsWith(root)) return null;
  return p;
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if(req.method === 'OPTIONS'){
    res.writeHead(204, {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,HEAD,OPTIONS','Access-Control-Allow-Headers':'*'});
    res.end(); return;
  }
  if(u.pathname === '/api/health'){
    sendJSON(res, 200, {ok:true, books: fs.existsSync(BOOKS_DIR) ? fs.readdirSync(BOOKS_DIR).filter(f=>/^pg\d+\.txt$/.test(f)).length : 0, at: Date.now()});
    return;
  }
  /* /api/az/:card —— 青空文库（日语公版）按需抓取，Shift_JIS 转码后落盘 */
  const az = u.pathname.match(/^\/api\/az\/(.+?)(\.txt)?$/);
  if(az){
    const card = decodeURIComponent(az[1]);
    const file = path.join(BOOKS_DIR, 'az-' + card.replace(/[^A-Za-z0-9_]/g, '_') + '.txt');
    try{
      if(!fs.existsSync(file) || fs.statSync(file).size < 500){
        const r = await fetch('https://www.aozora.gr.jp/cards/' + (card.includes('/') ? card : card.slice(0, 6) + '/files/' + card) + '.html', {
          headers:{'User-Agent':'LIZZREAD/2.0'},
          signal: AbortSignal.timeout(90000)
        });
        if(!r.ok){
          const debugUrl = 'https://www.aozora.gr.jp/cards/' + (card.includes('/') ? card : card.slice(0, 6) + '/files/' + card) + '.html';
          throw new Error('aozora HTTP ' + r.status + ' url=' + debugUrl);
        }
        const buf = Buffer.from(await r.arrayBuffer());
        const sjis = new TextDecoder('shift_jis').decode(buf);
        const body = sjis.replace(/<rp>[\s\S]*?<\/rp>/g, '').replace(/<rt>[\s\S]*?<\/rt>/g, '')
          .replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ')
          .replace(/&#\d+;/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
        fs.writeFileSync(file, body);
      }
      const txt = fs.readFileSync(file);
      res.writeHead(200, {'Content-Type':'text/plain; charset=utf-8','Content-Length':txt.length,
        'Cache-Control':'public, max-age=86400','Access-Control-Allow-Origin':'*'});
      res.end(txt);
    }catch(e){
      sendJSON(res, 502, {error:'青空文库抓取失败', detail:String(e.message||e)});
    }
    return;
  }

  /* /api/pg/:id —— 按需抓取全文 */
  const m = u.pathname.match(/^\/api\/pg\/(\d{1,6})(\.txt)?$/);
  if(m){
    const id = Number(m[1]);
    const lang = String(u.searchParams.get('lang') || '').toLowerCase().slice(0,4);
    try{
      const out = await ensureBook(id, lang);
      const txt = fs.readFileSync(out.file);
      res.writeHead(200, {
        'Content-Type':'text/plain; charset=utf-8',
        'Content-Length': txt.length,
        'Cache-Control':'public, max-age=86400',
        'Access-Control-Allow-Origin':'*',
        'X-LZ-Cached': out.cached ? '1' : '0'
      });
      res.end(txt);
    }catch(e){
      sendJSON(res, 502, {error:'无法从古腾堡镜像取回全文', detail:String(e.message||e), id});
    }
    return;
  }
  /* /api/iap/verify —— App 内购买的服务端二次校验（RevenueCat REST）。
     客户端拿到购买凭证后调用；服务端向 RevenueCat 查询订阅状态，避免越狱/改包白嫖。
     未配置 REVENUECAT_SECRET 时返回 {ok:false, configured:false}，客户端回落为本地校验。 */
  if(u.pathname === '/api/iap/verify' && req.method === 'POST'){
    const SECRET = process.env.REVENUECAT_SECRET || '';
    const APP_ID = process.env.REVENUECAT_APP_ID || 'app_lizzread';
    let body = '';
    try{
      body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; if(raw.length > 1e5) req.destroy(); });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
      });
    }catch(e){ body = ''; }
    let j = {};
    try{ j = JSON.parse(body || '{}'); }catch(e){ j = {}; }
    if(!SECRET){ sendJSON(res, 200, {ok:false, configured:false, message:'服务端未配置内购校验密钥'}); return; }
    const uid = String(j.appUserId || j.device || '').slice(0, 80);
    if(!uid){ sendJSON(res, 400, {ok:false, message:'缺少 appUserId'}); return; }
    try{
      const r = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(uid), {
        headers:{ 'Authorization': 'Bearer ' + SECRET, 'X-Platform': 'ios', 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(15000)
      });
      if(!r.ok){ sendJSON(res, 200, {ok:false, message:'订阅查询失败（' + r.status + '）'}); return; }
      const data = await r.json();
      const ents = (data && data.subscriber && data.subscriber.entitlements) || {};
      const active = Object.entries(ents).filter(([, v]) => !v.expires_date || Date.parse(v.expires_date) > Date.now());
      const products = (data && data.subscriber && data.subscriber.subscriptions) || {};
      sendJSON(res, 200, {
        ok: active.length > 0,
        entitlements: active.map(([k, v]) => ({ id:k, product: v.product_identifier, expires: v.expires_date || '' })),
        subscriptions: Object.keys(products)
      });
    }catch(e){
      sendJSON(res, 200, {ok:false, message:'订阅查询异常：' + (e.message || e)});
    }
    return;
  }

  /* /api/huawei/verify —— 华为 IAP 收据校验（服务端）
     客户端支付成功后把 purchaseToken 发来；服务端用华为 IAP 的验单接口核对，
     避免改包白嫖。未配置 HUAWEI_APP_ID/SECRET 时返回 configured:false。 */
  if(u.pathname === '/api/huawei/verify' && req.method === 'POST'){
    const APP_ID = process.env.HUAWEI_APP_ID || '';
    const APP_SECRET = process.env.HUAWEI_APP_SECRET || '';
    let body = '';
    try{
      body = await new Promise((resolve, reject) => {
        let raw = '';
        req.on('data', c => { raw += c; if(raw.length > 2e5) req.destroy(); });
        req.on('end', () => resolve(raw));
        req.on('error', reject);
      });
    }catch(e){ body = ''; }
    let j = {};
    try{ j = JSON.parse(body || '{}'); }catch(e){ j = {}; }
    if(!APP_ID || !APP_SECRET){ sendJSON(res, 200, {ok:false, configured:false, message:'服务端未配置华为 IAP 密钥'}); return; }
    const token = String(j.purchaseToken || '').slice(0, 4000);
    const productId = String(j.productId || '').slice(0, 120);
    const subId = String(j.subscriptionId || productId).slice(0, 120);
    if(!token){ sendJSON(res, 400, {ok:false, message:'缺少 purchaseToken'}); return; }
    try{
      const auth = 'Basic ' + Buffer.from(APP_ID + ':' + APP_SECRET).toString('base64');
      const r = await fetch('https://orders-dre.iap.hicloud.com/applications/purchases/tokens/verify', {
        method:'POST',
        headers:{ 'Authorization': auth, 'Content-Type':'application/x-www-form-urlencoded' },
        body: 'purchaseToken=' + encodeURIComponent(token),
        signal: AbortSignal.timeout(15000)
      });
      const data = await r.json();
      const rc = data && data.responseCode;
      const ok = String(rc) === '0';
      sendJSON(res, 200, {
        ok,
        configured: true,
        product: subId,
        purchaseState: data && data.purchaseState,
        responseCode: rc,
        expiresAt: data && data.data && data.data.expirationDate ? Number(data.data.expirationDate) : 0
      });
    }catch(e){
      sendJSON(res, 200, {ok:false, configured:true, message:'验单异常：' + (e.message || e)});
    }
    return;
  }

  /* /api/version —— 客户端版本与更新提示（App 内“检查更新”与强制升级用） */
  if(u.pathname === '/api/version'){
    sendJSON(res, 200, {
      ok: true,
      ios:     { latest: '2.0.0', min: '2.0.0', url: 'https://apps.apple.com/app/id0000000000' },
      android: { latest: '2.0.0', min: '2.0.0', url: 'https://play.google.com/store/apps/details?id=com.lizzread.app' },
      notes: '16 门语言 · 网址导入 · 翻译稳定性修复'
    });
    return;
  }

  /* 语言译本目录按需存在：缺文件时返回空数组，避免控制台 404 噪音 */
  const trMiss = u.pathname.match(/^\/data\/lang-([a-z]{2})-tr\.js$/);
  if(trMiss && !fs.existsSync(path.join(ROOT, 'data', 'lang-' + trMiss[1] + '-tr.js'))){
    const body = 'window.LZ_LANG_' + trMiss[1].toUpperCase() + '_TR = [];';
    res.writeHead(200, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'public, max-age=86400'});
    res.end(body);
    return;
  }

  /* /api/admin/health —— 仅本机可访问的运营数据 */
  if(u.pathname === '/api/admin/health'){
    if(!isLocalRequest(req)){ sendJSON(res, 403, {error:'仅本机可访问'}); return; }
    const cache = wdLoad();
    const wdCount = Object.keys(cache).length;
    const books = fs.existsSync(BOOKS_DIR) ? fs.readdirSync(BOOKS_DIR).filter(f=>/^pg\d+\.txt$/.test(f)) : [];
    const az = fs.existsSync(BOOKS_DIR) ? fs.readdirSync(BOOKS_DIR).filter(f=>/^az-/.test(f)) : [];
    const covers = fs.existsSync(COVERS_DIR) ? fs.readdirSync(COVERS_DIR).filter(f=>/\.jpg$/.test(f)) : [];
    sendJSON(res, 200, {
      ok:true,
      uptimeSec: Math.round(process.uptime()),
      booksLocal: books.length,
      aozoraLocal: az.length,
      coversCached: covers.length,
      wordCache: wdCount,
      txCache: TX_CACHE.size,
      redemptions: Object.keys(readRedeemed()).length,
      memoryMB: Math.round(process.memoryUsage().rss / 1048576)
    });
    return;
  }
  /* /api/metrics —— 前端上报的匿名使用计数（只累加，不存个人信息） */
  if(u.pathname === '/api/metrics' && (req.method === 'POST' || req.method === 'GET')){
    const name = String(u.searchParams.get('n') || '').slice(0,40);
    if(name){ METRICS[name] = (METRICS[name] || 0) + 1; }
    sendJSON(res, 200, {ok:true});
    return;
  }

  /* /api/redeem —— 内测码核销：一机一码一次 */
  if(u.pathname === '/api/redeem' && req.method === 'POST'){
    let body = {};
    try{
      const raw = await new Promise((resolve, reject) => {
        let t = '';
        req.on('data', c => { t += c; if(t.length > 1e5) req.destroy(); });
        req.on('end', () => resolve(t));
        req.on('error', reject);
      });
      body = JSON.parse(raw || '{}');
    }catch(e){ body = {}; }
    const code = String(body.code || '').trim().toLowerCase();
    const device = String(body.device || '').trim();
    const def = REDEEM_CODES[code];
    if(!def || !device){
      sendJSON(res, 400, {ok:false, message:'激活码无效或设备标识缺失'});
      return;
    }
    const used = readRedeemed();
    const now = Date.now();
    const seats = Math.max(1, Number(def.seats || 1));
    /* 多人码（班级版）：登记设备列表，最多 seats 台 */
    const entry = used[code] || (used[code] = {devices: [], plan: def.plan, at: now, expires: def.days ? now + def.days * 86400000 : 0});
    const devs = entry.devices || (entry.devices = entry.device ? [entry.device] : []);
    if(!devs.includes(device)){
      if(devs.length >= seats){
        sendJSON(res, 409, {ok:false, message:'这个激活码的名额已满（' + seats + ' 台设备），请联系购买者扩容', plan: entry.plan, at: entry.at});
        return;
      }
      devs.push(device);
      entry.devices = devs;
      entry.device = entry.device || device;
    } else if(seats === 1 && entry.device !== device){
      sendJSON(res, 409, {ok:false, message:'这个激活码已经在另一台设备使用过了（一机一码一次）', plan: entry.plan, at: entry.at});
      return;
    }
    if(entry.expires && entry.expires < now){
      sendJSON(res, 409, {ok:false, message:'这个激活码已过期', plan: entry.plan, at: entry.at});
      return;
    }
    writeRedeemed(used);
    sendJSON(res, 200, {ok:true, plan: def.plan, scope: def.scope || 'all', expires: entry.expires, at: now, seats, used: devs.length});
    return;
  }

  /* /api/word?lang=de&word=Haus&to=zh —— 点词释义（外语词典代理 + 磁盘缓存） */
  if(u.pathname === '/api/word'){
    const lang = String(u.searchParams.get('lang') || 'en').toLowerCase().slice(0,4);
    const word = String(u.searchParams.get('word') || '').slice(0,64).trim();
    const to = String(u.searchParams.get('to') || 'zh').toLowerCase().slice(0,4);
    const tos = String(u.searchParams.get('tos') || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean).slice(0, 8);
    if(tos.length > 1){
      /* 多目标语言：一次返回 zh/en/de/fr/… 的对照释义（学汉语时最常用） */
      const key = wdKey(lang, word) + '>' + tos.sort().join('+');
      const cache1 = wdLoad();
      if(cache1[key]){ sendJSON(res, 200, Object.assign({cached:true}, cache1[key])); return; }
      const out = { word, lang, tos, gloss:{}, glossZh:'' };
      await Promise.all(tos.map(async (tg) => {
        try{ out.gloss[tg] = await bingTranslateTo(word, tg, false, lang); }catch(e){ out.gloss[tg] = ''; }
      }));
      out.glossZh = out.gloss.zh || '';
      const any = Object.values(out.gloss).filter(Boolean);
      if(!any.length){ sendJSON(res, 404, {error:'查不到', word}); return; }
      cache1[key] = out; wdSave();
      sendJSON(res, 200, out);
      return;
    }
    if(!word){ sendJSON(res, 400, {error:'word required'}); return; }
    const cache = wdLoad();
    const key = wdKey(lang, word) + '>' + to;
    if(cache[key]){ sendJSON(res, 200, Object.assign({cached:true}, cache[key])); return; }
    const out = { word, lang, to, gloss:[], senses:[], pos:'', phonetic:'', examples:[] };
    try{
      if(lang !== 'en'){
        /* 多语言词典：由学习语言翻译到展示语言（主展示语言会再从中文/英文派生） */
        out.gloss.push(await bingTranslateTo(word, to, false, lang));
        if(to !== 'zh'){ try{ out.gloss.push(await bingTranslateTo(word, 'zh')); }catch(e){} }
      } else {
        out.gloss.push(await bingTranslateTo(word, to, false, lang));
        if(to !== 'zh'){ try{ out.gloss.push(await bingTranslateTo(word, 'zh')); }catch(e){} }
      }
    }catch(e){
      sendJSON(res, 502, {error:'查词失败', detail:String(e.message||e), word, lang});
      return;
    }
    out.gloss = [...new Set(out.gloss.filter(Boolean))];
    if(out.gloss.length){
      cache[key] = out;
      if(Object.keys(cache).length > 50000){
        const ks = Object.keys(cache); ks.slice(0, 5000).forEach(k => delete cache[k]);
      }
      wdSave();
      sendJSON(res, 200, out);
    } else {
      sendJSON(res, 404, {error:'没有查到', word, lang});
    }
    return;
  }

  /* /api/cover/:id —— 原版封面（Gutenberg 封面图，落盘缓存） */
  const cm = u.pathname.match(/^\/api\/cover\/(\d{1,6})$/);
  if(cm){
    const id = Number(cm[1]);
    try{
      const file = await ensureCover(id);
      const buf = fs.readFileSync(file);
      res.writeHead(200, {
        'Content-Type':'image/jpeg',
        'Content-Length':buf.length,
        'Cache-Control':'public, max-age=604800',
        'Access-Control-Allow-Origin':'*'
      });
      res.end(buf);
    }catch(e){
      res.writeHead(404, {'Content-Type':'text/plain; charset=utf-8','Access-Control-Allow-Origin':'*'});
      res.end('no cover');
    }
    return;
  }
  /* /api/translate —— 批量翻译代理（浏览器不可用时兜底） */
  if(u.pathname === '/api/translate'){
    let REQ_FROM = 'en', REQ_TO = 'zh';
    let texts = [];
    if(req.method === 'GET'){
      const t = u.searchParams.get('q') || u.searchParams.get('text') || '';
      texts = t ? [t] : [];
    } else if(req.method === 'POST'){
      try{
        const body = await new Promise((resolve, reject) => {
          let raw = '';
          req.on('data', c => { raw += c; if(raw.length > 2e6) req.destroy(); });
          req.on('end', () => resolve(raw));
          req.on('error', reject);
        });
        const j = JSON.parse(body || '{}');
        texts = Array.isArray(j.texts) ? j.texts : (j.q || j.text ? [j.q || j.text] : []);
        REQ_FROM = j.from || 'en'; REQ_TO = j.to || 'zh';
      }catch(e){ texts = []; }
    }
    texts = texts.map(t => String(t || '').slice(0, 500)).filter(t => t.trim()).slice(0, 40);
    const out = {};
    for(let i = 0; i < texts.length; i += 3){
      const batch = texts.slice(i, i + 3);
      const results = await Promise.all(batch.map(async t => {
        try{ return [t, await translateOne(t, REQ_FROM, REQ_TO)]; }catch(e){ return [t, '']; }
      }));
      results.forEach(([t, zh]) => { if(zh) out[t] = zh; });
    }
    sendJSON(res, 200, {ok:true, translations:out, count:Object.keys(out).length});
    return;
  }

  /* 静态文件 */
  let p = safeJoin(ROOT, u.pathname);
  if(!p){ sendJSON(res, 403, {error:'forbidden'}); return; }
  if(u.pathname === '/' || u.pathname === '') p = path.join(ROOT, 'index.html');
  fs.stat(p, (err, st) => {
    if(!err && st.isDirectory()) p = path.join(p, 'index.html');
    if(!err && st.isFile()){
      const large = /^\/books\/pg\d+\.txt$/.test(u.pathname);
      serveFile(req, res, p, {cache: !p.endsWith('index.html') && !p.endsWith('sw.js')});
      return;
    }
    /* 无扩展名的前端路由回退到 index.html */
    if(!path.extname(u.pathname)){
      serveFile(req, res, path.join(ROOT, 'index.html'));
      return;
    }
    sendJSON(res, 404, {error:'not found', path:u.pathname});
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('LIZZREAD server: http://0.0.0.0:' + PORT + '/');
});
