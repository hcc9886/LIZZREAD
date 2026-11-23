#!/usr/bin/env node
/* =====================================================================
   LIZZREAD —— 多语言句子拼装数据生成
   用法：node scripts/build-sentences-multi.js [--max=120] [--langs=de,fr,it,es,ja,ko,zh,nl,pt,la,el,fi,hu,sv,eo]

   每门语言取长书里最靠前的几本，抽取可拼装的句子（含意群切分），
   输出 sentences/<lang>-<gb>.json，并合并进 sentences/index.json 与 books.json。
   已有中文提示（zh 字段）会从 sentences/zh-<lang>.json 读取（可选）。
   ===================================================================== */
const fs = require('fs');
const path = require('path');
const AssemblyCore = require(path.join(__dirname, '..', 'shared', 'assembly-core.js'));

const ROOT = path.join(__dirname, '..');
const BOOKS_DIR = path.join(ROOT, 'books');
const OUT_DIR = path.join(ROOT, 'sentences');
const MAX_PER_BOOK = Number((process.argv.find(a => a.startsWith('--max=')) || '--max=120').split('=')[1]) || 120;
const LANGS = (process.argv.find(a => a.startsWith('--langs=')) || '').split('=')[1]?.split(',') ||
  ['de','fr','it','es','ja','ko','zh','nl','pt','la','el','fi','hu','sv','eo'];
const BOOKS_PER_LANG = 12;

function langMeta(code){
  const raw = fs.readFileSync(path.join(ROOT, 'data', 'lang-manifest.js'), 'utf8');
  const json = JSON.parse(raw.replace(/^[\s\S]*?window\.LZ_LANGS\s*=\s*/, '').replace(/;\s*$/, ''));
  return json.find(x => x.code === code) || { levels: ['B1'] };
}

function loadLangBooks(code){
  const f = path.join(ROOT, 'data', `lang-${code}.js`);
  if(!fs.existsSync(f)) return [];
  const raw = fs.readFileSync(f, 'utf8');
  const json = raw.replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '');
  try{ return JSON.parse(json); }catch(e){ return []; }
}

function trimPG(t){
  t = String(t || '').replace(/\r/g, '');
  const st = t.search(/\*\*\*\s*START OF (THE|THIS) PROJECT GUTENBERG/i);
  if(st > -1) t = t.slice(st).replace(/^[^\n]*\n/, '');
  let end = t.length;
  [/\*\*\*\s*END OF (THE|THIS) PROJECT GUTENBERG/i,
   /\n\s*End of (the )?Project Gutenberg/i,
   /\n\s*THE FULL PROJECT GUTENBERG LICENSE/i].forEach(re => {
    const m = t.search(re);
    if(m > -1 && m < end) end = m;
  });
  return t.slice(0, end).trim();
}

/* 多语言分句：句末标点 + 空白切开；保留引号闭合 */
function splitSentences(text){
  const out = [];
  const paras = String(text || '').split(/\n\s*\n/);
  for(const raw of paras){
    let p = raw.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if(!p) continue;
    const parts = p.split(/(?<=[.!?。！？…]["'”’»)]?)\s+/);
    for(let s of parts){
      s = s.replace(/^[\s"'“”‘’«»]+|[\s"'“”‘’«»]+$/g, '').trim();
      if(s) out.push(s);
    }
  }
  return out;
}

function keepSentence(s, code){
  if(!s || s.length < 12 || s.length > 260) return false;
  if(/\.{3,}|_{3,}|\|/.test(s)) return false;
  if(/^(chapter|kapitel|chapitre|capitolo|capítulo|hoofdstuk|capítulo|глава|第.{1,3}章)/i.test(s)) return false;
  const letters = (s.match(/[\p{L}]/gu) || []).length;
  if(letters / s.length < 0.6) return false;
  /* 句子里的词数（按空格 / 中日文计数） */
  const words = code === 'ja' || code === 'zh'
    ? (s.match(/[\p{L}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length / 2
    : (s.match(/[\p{L}][\p{L}'’-]*/gu) || []).length;
  if(words < 4) return false;
  if(!/[.!?。！？…]["'”’»)]?$/.test(s)) return false;
  return true;
}

function targetWords(s, code, limit){
  const m = s.match(/[\p{L}][\p{L}'’-]*/gu) || [];
  const stop = new Set(['the','and','that','have','with','this','from','they','their','which','would','could','should','there']);
  const uniq = [...new Set(m.map(w => w.toLowerCase().replace(/^[-']+|[-']+$/g, '')).filter(w => w.length > 3 && !stop.has(w)))];
  return uniq.slice(0, limit || 3);
}

function main(){
  if(!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  const index = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'index.json'), 'utf8'));
  const booksIndex = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'books.json'), 'utf8'));
  const haveBook = new Set(booksIndex.map(b => b.bookId));
  let total = 0, books = 0;

  for(const code of LANGS){
    const meta = langMeta(code);
    const levels = meta.levels || ['B1'];
    const booksLang = loadLangBooks(code).filter(b => b && b.gb);
    /* 取文件最大的几本（内容多的更容易切出好句） */
    const cands = booksLang
      .map(b => {
        const f = path.join(BOOKS_DIR, 'pg' + b.gb + '.txt');
        return fs.existsSync(f) ? { b, size: fs.statSync(f).size, f } : null;
      })
      .filter(Boolean)
      .sort((a, z) => z.size - a.size)
      .slice(0, BOOKS_PER_LANG);
    if(!cands.length){ console.log(`${code}: 没有本地文本，跳过`); continue; }

    for(const { b, f } of cands){
      let text;
      try{ text = fs.readFileSync(f, 'utf8'); }catch(e){ continue; }
      const all = splitSentences(trimPG(text)).filter(s => keepSentence(s, code));
      if(all.length < 8) continue;
      const bookId = code + '-' + b.gb;
      if(haveBook.has(bookId)) continue;

      /* 均匀抽样 */
      const selected = [];
      const step = Math.max(1, Math.floor(all.length / MAX_PER_BOOK));
      for(let i = 0; i < all.length && selected.length < MAX_PER_BOOK; i += step) selected.push(all[i]);
      const seen = new Set();
      const out = [];
      selected.forEach((s, i) => {
        const k = s.toLowerCase();
        if(seen.has(k)) return;
        seen.add(k);
        let chunks = AssemblyCore.splitIntoChunks(s).map(c => c.trim()).filter(Boolean);
        if(chunks.length < 2) return;
        const lv = b.lv || levels[Math.min(levels.length - 1, 2)];
        const sid = `${bookId}_s${String(i + 1).padStart(3, '0')}`;
        out.push({
          sentence_id: sid,
          book_id: bookId,
          lang: code,
          level: lv,
          text: s,
          zh: '',
          target_words: targetWords(s, code, 3),
          chunks,
          chunk_roles: AssemblyCore.chunkRoles(chunks),
          readability: 0
        });
        index[sid] = `${bookId}.json`;
      });
      if(!out.length) continue;
      fs.writeFileSync(path.join(OUT_DIR, `${bookId}.json`), JSON.stringify(out));
      booksIndex.push({ bookId, gb: b.gb, lang: code, n: out.length, levels: [...new Set(out.map(x => x.level))], title: b.t || bookId });
      haveBook.add(bookId);
      total += out.length; books++;
    }
    console.log(`${code}: 生成 ${books} 本 / ${total} 句（累计）`);
  }

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(index));
  fs.writeFileSync(path.join(OUT_DIR, 'books.json'), JSON.stringify(booksIndex.sort((a, b) => b.n - a.n)));
  console.log(`\n完成：新增 ${books} 本 / ${total} 句；句子包总计 ${booksIndex.length} 本`);
}

main();
