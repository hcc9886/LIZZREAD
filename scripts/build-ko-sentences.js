#!/usr/bin/env node
/* 韩语句子包：由 lang-ko.js 的 demo 句 + lang-ko-tr.js 的译本条目生成
   输出 sentences/ko-demo.json（bookId = ko-<idx>），并合并进 index.json / books.json */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'sentences');
const AssemblyCore = require(path.join(ROOT, 'shared', 'assembly-core.js'));

global.window = {};
eval(fs.readFileSync(path.join(ROOT, 'data', 'lang-ko.js'), 'utf8'));
eval(fs.readFileSync(path.join(ROOT, 'data', 'lang-ko-tr.js'), 'utf8'));
const books = global.window.LZ_LANG_KO || [];
const trs = global.window.LZ_LANG_KO_TR || [];

const index = JSON.parse(fs.readFileSync(path.join(OUT, 'index.json'), 'utf8'));
const booksIndex = JSON.parse(fs.readFileSync(path.join(OUT, 'books.json'), 'utf8'));
const have = new Set(booksIndex.map(b => b.bookId));

let total = 0, made = 0;
books.forEach((b, bi) => {
  const demo = (b.demo || []).filter(s => typeof s === 'string' && s.trim().length > 8);
  if(!demo.length) return;
  const bookId = 'ko-' + (bi + 1);
  if(have.has(bookId)) return;
  const out = [];
  demo.forEach((s, i) => {
    let chunks = AssemblyCore.splitIntoChunks(s).map(c => c.trim()).filter(Boolean);
    if(chunks.length < 2){
      /* 太短：按空格对半切，保证至少两块 */
      const parts = s.split(/\s+/);
      if(parts.length >= 4){
        const mid = Math.ceil(parts.length / 2);
        chunks = [parts.slice(0, mid).join(' '), parts.slice(mid).join(' ')];
      }
    }
    if(chunks.length < 2) return;
    const sid = `${bookId}_s${String(i + 1).padStart(3, '0')}`;
    out.push({
      sentence_id: sid, book_id: bookId, lang: 'ko', level: b.lv || 'B1',
      text: s, zh: '', target_words: [], chunks,
      chunk_roles: AssemblyCore.chunkRoles(chunks), readability: 0
    });
    index[sid] = `${bookId}.json`;
  });
  if(!out.length) return;
  fs.writeFileSync(path.join(OUT, `${bookId}.json`), JSON.stringify(out));
  booksIndex.push({ bookId, gb: 0, lang: 'ko', n: out.length, levels: [b.lv || 'B1'], title: b.t || bookId });
  have.add(bookId);
  total += out.length; made++;
});

fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index));
fs.writeFileSync(path.join(OUT, 'books.json'), JSON.stringify(booksIndex.sort((a, b) => b.n - a.n)));
console.log(`韩语：生成 ${made} 本 / ${total} 句；句子包总计 ${booksIndex.length} 本`);
