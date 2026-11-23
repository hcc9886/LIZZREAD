#!/usr/bin/env node
/* 打包时挑选封面：把「热门书」封面放进 www/covers-pick/，只保留这些
   规则：英语书库全部 + 每门语言书库前 40 本 + 句子包涉及的书 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const PICK = path.join(ROOT, 'covers-pick');

function readJs(file, varName){
  const raw = fs.readFileSync(file, 'utf8');
  const json = raw.replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '');
  try{ return JSON.parse(json); }catch(e){ return []; }
}

const ids = new Set();
try{
  const en = readJs(path.join(ROOT, 'data', 'books-en.js'));
  en.forEach(b => b.gb && ids.add(Number(b.gb)));
}catch(e){}
for(const f of fs.readdirSync(path.join(ROOT, 'data'))){
  const m = f.match(/^lang-([a-z]{2})\.js$/);
  if(!m) continue;
  const arr = readJs(path.join(ROOT, 'data', f)).slice(0, 40);
  arr.forEach(b => b.gb && ids.add(Number(b.gb)));
}
try{
  const books = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentences', 'books.json'), 'utf8'));
  books.forEach(b => b.gb && ids.add(Number(b.gb)));
}catch(e){}

fs.rmSync(PICK, { recursive: true, force: true });
fs.mkdirSync(PICK, { recursive: true });
let n = 0, bytes = 0;
for(const id of ids){
  const src = path.join(ROOT, 'covers', id + '.jpg');
  if(!fs.existsSync(src)) continue;
  const dst = path.join(PICK, id + '.jpg');
  fs.copyFileSync(src, dst);
  n++; bytes += fs.statSync(dst).size;
}
const picked = [...ids].filter(id => fs.existsSync(path.join(ROOT, 'covers', id + '.jpg')));
fs.writeFileSync(path.join(PICK, 'index.js'), 'window.LZ_COVERS=' + JSON.stringify(picked) + ';\n');
console.log(`封面打包：${n} 张 / ${(bytes/1048576).toFixed(1)} MB`);
