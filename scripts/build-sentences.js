/* =====================================================================
   LIZZREAD —— 句子数据构建脚本（build-sentences.js）
   node scripts/build-sentences.js [--max=500]
   输入：books/pg*.txt + data/catalog.js（级别/书名）
   输出：sentences/bookXXXX.json（sentence_id / book_id / level / text / zh /
        target_words / chunks / chunk_roles / readability）
        sentences/index.json（sentence_id → 书文件）
        sentences/books.json（书清单，供拼装页选择器）
   中文提示：优先复用站内已有的人工译文（SAMPLES / GUIDES），
            其次读 sentences/zh-cache.json；没有则留空，运行时可补译并缓存。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const AssemblyCore = require(path.join(__dirname, '..', 'shared', 'assembly-core.js'));

const ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'sentences');
const MAX_PER_BOOK = Number((process.argv.find(a => a.startsWith('--max=')) || '--max=500').split('=')[1]) || 500;

/* ---------- 读取书库元数据 ---------- */
function loadCatalog(){
  const out = {};
  try{
    const raw = fs.readFileSync(path.join(ROOT, 'data', 'catalog.js'), 'utf8');
    const json = raw.replace(/^[\s\S]*?window\.PG_CATALOG\s*=\s*/, '').replace(/;\s*$/, '');
    const arr = JSON.parse(json);
    for(const b of arr) if(b && b.gb) out[Number(b.gb)] = b;
  }catch(e){ console.warn('catalog.js 读取失败：', e.message); }
  return out;
}

/* ---------- 已有译文（SAMPLES / GUIDES 中的 en→zh 对照） ---------- */
function loadExistingZh(){
  const map = {};
  try{
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const re = /\{\s*en\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*,\s*zh\s*:\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')\s*\}/g;
    let m;
    while((m = re.exec(html)) !== null){
      const en = JSON.parse(m[1][0] === "'" ? '"' + m[1].slice(1, -1).replace(/"/g, '\\"') + '"' : m[1]);
      const zh = JSON.parse(m[2][0] === "'" ? '"' + m[2].slice(1, -1).replace(/"/g, '\\"') + '"' : m[2]);
      if(en && zh) map[en.trim()] = zh;
    }
  }catch(e){ console.warn('内置译文读取失败：', e.message); }
  try{
    const cache = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'zh-cache.json'), 'utf8'));
    for(const [k, v] of Object.entries(cache)) if(v) map[k.trim()] = v;
  }catch(e){ /* 可选文件 */ }
  return map;
}

/* ---------- 修剪 Gutenberg 头尾 ---------- */
function trimPG(text){
  let t = String(text || '').replace(/\r/g, '');
  const st = t.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i);
  if(st > -1) t = t.slice(st).replace(/^[^\n]*\n/, '');
  let end = t.length;
  [/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i,
   /\n\s*End of (the )?Project Gutenberg/i,
   /\n\s*THE FULL PROJECT GUTENBERG LICENSE/i,
   /\n\s*Section\s+1\.\s+General Terms of Use/i].forEach(re => {
    const m = t.search(re);
    if(m > -1 && m < end) end = m;
  });
  return t.slice(0, end).trim();
}

/* ---------- 分句（处理缩写、引号、省略号） ---------- */
const ABBR = /\b(Mr|Mrs|Ms|Dr|Prof|Capt|Col|Gen|Hon|Rev|St|Sr|Jr|Esq|Mt|Ft)\./g;
const LATIN = /\b(e\.g|i\.e|etc|viz|cf|vs)\./gi;
function splitSentences(text){
  const out = [];
  const paras = String(text || '').split(/\n\s*\n|\n(?=[A-Z“"'])/);
  for(const raw of paras){
    let p = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if(!p) continue;
    p = p.replace(ABBR, '$1@@DOT@@').replace(LATIN, '$1@@DOT@@').replace(/(\d)\.(\d)/g, '$1@@DOT@@$2');
    /* 在句末标点 + 空白处切，保留引号闭合 */
    const parts = p.split(/(?<=[.!?…]['"”’]?)\s+(?=["“'‘A-Z0-9(])/);
    for(let s of parts){
      s = s.replace(/@@DOT@@/g, '.').replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '').trim();
      if(!s) continue;
      out.push(s);
    }
  }
  return out;
}

/* ---------- 句子过滤（只保留适合拼装练习的正文句） ---------- */
const JUNK = /^(chapter|part|book|volume|letter|episode|canto|stave|act|scene|section|contents|table of contents|copyright|transcriber|produced by|project gutenberg|the end|end of|by |illustration|plate |frontispiece|note:|footnote)/i;
function keepSentence(s){
  if(!s || s.length < 8 || s.length > 320) return false;
  if(JUNK.test(s)) return false;
  if(/\.{3,}|(\s\.){3,}|…{2,}/.test(s)) return false;
  /* 目录行：书名 + CHAPTER/PART 编号（"Down the Rabbit-Hole CHAPTER II."） */
  if(/\b(chapter|part|book|volume|section|canto|act|scene)\s+[ivxlcdm\d]+\.?$/i.test(s) && !/[.!?]\s+[A-Za-z]/.test(s)) return false;
  if(/^(down the|a caucus|advice from|the rabbit|the pool|the queen|the mock|the lobster|who stole)/i.test(s) && s.length < 80) return false;
  if(/[_|<>{}\[\]]{2,}/.test(s)) return false;
  if(/\b\d{2,}\b.*\b\d{2,}\b.*\b\d{2,}\b/.test(s)) return false;
  const words = s.match(/[A-Za-z'’-]+/g) || [];
  if(words.length < 4) return false;
  const letters = (s.match(/[A-Za-z]/g) || []).length;
  if(letters / s.length < 0.6) return false;
  if(s === s.toUpperCase() && words.length > 3) return false;
  if(!/[.!?…]["'”’)]?$/.test(s)) return false;
  return true;
}

/* ---------- Flesch Reading Ease（英文近似） ---------- */
function syllables(w){
  w = w.toLowerCase().replace(/[^a-z]/g, '');
  if(!w) return 0;
  if(w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const m = w.match(/[aeiouy]{1,2}/g);
  return Math.max(1, m ? m.length : 1);
}
function readability(s){
  const words = s.match(/[A-Za-z'’-]+/g) || [];
  if(!words.length) return 0;
  const sentCount = Math.max(1, (s.match(/[.!?]+/g) || []).length);
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);
  const score = 206.835 - 1.015 * (words.length / sentCount) - 84.6 * (syl / words.length);
  return Math.max(0, Math.min(100, Math.round(score * 10) / 10));
}

/* ---------- 目标词 ---------- */
const STOP = new Set(('the a an is are was were be been being have has had do does did will would shall should can could may might must of in on at to for with by from as and but or that which who whom this these those it its i me my mine we us our you your he him his she her they them their what when where why how not no so if then than just about into through over under up down out off all any some more most such very too only own same other another each both few many much little less least own').split(/\s+/));
function targetWords(text, limit){
  const words = (text.match(/[A-Za-z'’-]+/g) || [])
    .map(w => w.toLowerCase().replace(/^[-']+|[-']+$/g, ''))
    .filter(w => w.length > 3 && !STOP.has(w));
  return [...new Set(words)].slice(0, limit || 3);
}

/* ---------- 主流程 ---------- */
function main(){
  if(!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, {recursive:true});
  const catalog = loadCatalog();
  const zhMap = loadExistingZh();

  const files = fs.readdirSync(BOOKS_DIR).filter(f => /^pg\d+\.txt$/i.test(f));
  const index = {};
  const booksIndex = [];
  let total = 0;

  for(const f of files){
    const gb = Number(f.match(/^pg(\d+)\.txt$/i)[1]);
    /* 与 index.html gbToBookId 保持一致：book + 3 位起补零 */
    const bookId = 'book' + String(gb).padStart(3, '0');
    const meta = catalog[gb] || {};
    const level = meta.lv || 'B1';

    let text;
    try{ text = fs.readFileSync(path.join(BOOKS_DIR, f), 'utf8'); }catch(e){ continue; }
    const cleaned = trimPG(text);
    const all = splitSentences(cleaned).filter(keepSentence);
    if(all.length < 10){ console.log(`  ⚠️ ${bookId} 有效句太少，跳过`); continue; }

    /* 均匀抽样，覆盖全书（不是只要开头） */
    let selected;
    if(all.length <= MAX_PER_BOOK) selected = all;
    else {
      selected = [];
      const step = all.length / MAX_PER_BOOK;
      for(let i = 0; i < MAX_PER_BOOK; i++) selected.push(all[Math.floor(i * step)]);
    }
    /* 去重 */
    const seen = new Set();
    selected = selected.filter(s => { const k = s.toLowerCase(); if(seen.has(k)) return false; seen.add(k); return true; });

    const out = [];
    selected.forEach((s, i) => {
      let chunks = AssemblyCore.splitIntoChunks(s);
      chunks = chunks.map(c => c.trim()).filter(Boolean);
      if(chunks.length < 2) return;
      const roles = AssemblyCore.chunkRoles(chunks);
      const sid = `${bookId}_s${String(i + 1).padStart(3, '0')}`;
      out.push({
        sentence_id: sid,
        book_id: bookId,
        level,
        text: s,
        zh: zhMap[s] || '',
        target_words: targetWords(s, 3),
        chunks,
        chunk_roles: roles,
        readability: readability(s)
      });
      index[sid] = `${bookId}.json`;
    });

    if(!out.length) continue;
    fs.writeFileSync(path.join(OUT_DIR, `${bookId}.json`), JSON.stringify(out));
    booksIndex.push({ bookId, gb, n: out.length, levels: [...new Set(out.map(x => x.level))], title: meta.t || bookId });
    total += out.length;
    console.log(`  ✅ ${bookId}: ${out.length} 句`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(OUT_DIR, 'books.json'), JSON.stringify(booksIndex.sort((a, b) => b.n - a.n)));
  const withZh = booksIndex.reduce((sum, b) => {
    try{ return sum + JSON.parse(fs.readFileSync(path.join(OUT_DIR, b.bookId + '.json'))).filter(s => s.zh).length; }catch(e){ return sum; }
  }, 0);
  console.log(`\n🎉 构建完成：${booksIndex.length} 本书 / ${total} 句 / 已有中文 ${withZh} 句`);
}

main();
