/* 用浏览器里的 Google 机翻批量补全句子包的中文（构建期缓存，运行时零 API）
   前置：node server.js 8765 已运行；本机有 Chrome。
   用法：node scripts/translate-packs.mjs [每本句数=30] [并发=5]
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PER_BOOK = Number(process.argv[2] || 30);
const WORKERS = Number(process.argv[3] || 5);
const ROOT = process.cwd();
const SENT_DIR = path.join(ROOT, 'sentences');
const CACHE_FILE = path.join(SENT_DIR, 'zh-cache.json');

/* 1. 收集待翻译句子 */
const files = fs.readdirSync(SENT_DIR).filter(f => /^book\d+\.json$/.test(f));
const existing = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) : {};
const picked = [];
for(const f of files){
  const arr = JSON.parse(fs.readFileSync(path.join(SENT_DIR, f), 'utf8'));
  let n = 0;
  for(const s of arr){
    if(n >= PER_BOOK) break;
    if(s.zh) continue;
    if(!s.text || s.text.length < 20 || s.text.length > 240) continue;
    if(existing[s.text]){ s.zh = existing[s.text]; continue; }
    picked.push(s.text);
    n++;
  }
}
const unique = [...new Set(picked)];
console.log('待翻译句子', unique.length, '（每本', PER_BOOK, '，已有缓存', Object.keys(existing).length, '）');

/* 2. 连接浏览器 */
const port = 9230;
let chrome = null;
async function getPage(){
  try{
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    return list.find(t => t.type === 'page' && !t.url.startsWith('devtools'));
  }catch(e){ return null; }
}
let page = await getPage();
if(!page){
  chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    ['--headless','--no-sandbox','--disable-gpu','--disable-software-rasterizer','--disable-dev-shm-usage',
     `--remote-debugging-port=${port}`,'--user-data-dir=/tmp/lztranslate2','--window-size=1200,900','about:blank'],
    {stdio:'ignore'});
  chrome.unref();
  await new Promise(r=>setTimeout(r,3500));
  page = await getPage();
}
if(!page) throw new Error('无法连接浏览器');

const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if(m.id && pending.has(m.id)){ pending.get(m.id)(m); pending.delete(m.id); }
};
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
const send = (method, params={}) => new Promise(res => {
  const i = ++id; pending.set(i, res);
  ws.send(JSON.stringify({id:i, method, params}));
});
await send('Runtime.enable');
await send('Page.navigate', {url:'http://127.0.0.1:8765/index.html?translate=' + Date.now()});
await new Promise(r=>setTimeout(r,5500));
const check = await send('Runtime.evaluate', {expression:'typeof mtFetchSentences', returnByValue:true});
if(check.result?.result?.value !== 'function') throw new Error('页面未加载 mtFetchSentences');

/* 3. 在浏览器内并发翻译 */
const expr = `(async()=>{
  const list = ${JSON.stringify(unique)};
  const out = {};
  const batches = [];
  for(let i=0;i<list.length;i+=8) batches.push(list.slice(i,i+8));
  let done = 0;
  const run = async (b) => {
    try{
      const map = await mtFetchSentences(b);
      for(const [k,v] of Object.entries(map||{})) if(v) out[k]=v;
    }catch(e){}
    done += b.length;
    if(done % 400 < 8) console.log('translated', done, '/', list.length);
  };
  await Promise.all(Array.from({length:${WORKERS}}, async (_, w) => {
    for(let i=w;i<batches.length;i+=${WORKERS}) await run(batches[i]);
  }));
  return out;
})()`;
console.log('开始翻译…');
const t0 = Date.now();
const res = await send('Runtime.evaluate', {expression:expr, awaitPromise:true, returnByValue:true});
const out = res.result?.result?.value || {};
console.log('完成', Object.keys(out).length, '条，用时', Math.round((Date.now()-t0)/1000), '秒');
const merged = Object.assign({}, existing, out);
fs.writeFileSync(CACHE_FILE, JSON.stringify(merged, null, 0));
console.log('写入', CACHE_FILE, '共', Object.keys(merged).length, '条');
ws.close();
if(chrome) chrome.kill('SIGTERM');
process.exit(0);
