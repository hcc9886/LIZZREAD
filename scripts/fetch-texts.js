#!/usr/bin/env node
/* 抓取书库全文到 books/pg<gb>.txt（用于把「推荐/书城前排」的书打包进站点，离线与静态托管可直接读）
   用法：node scripts/fetch-texts.js [并发=4] [上限MB=80] */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const BOOKS = path.join(ROOT, 'books');
const CONC = Number(process.argv[2] || 4);
const MAXMB = Number(process.argv[3] || 80);

const PER_LANG = Number(process.env.PER_LANG || 60);
function loadIds(){
  const ids = new Set();
  const read = f => { try{ return fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'); }catch(e){ return ''; } };
  const en = read('books-en.js');
  for(const m of en.matchAll(/gb:(\d{1,6})/g)) ids.add(Number(m[1]));
  for(const f of fs.readdirSync(path.join(ROOT, 'data'))){
    if(!/^lang-[a-z]{2}\.js$/.test(f)) continue;
    const src = read(f);
    const gbs = [...src.matchAll(/"gb":(\d{1,6})/g)].map(m => Number(m[1])).filter(n => n > 0);
    gbs.slice(0, PER_LANG).forEach(n => ids.add(n));   /* 每门语言只取排在前面的几十本 */
  }
  /* 句子包涉及的书优先 */
  try{
    const books = JSON.parse(fs.readFileSync(path.join(ROOT, 'sentences', 'books.json'), 'utf8'));
    books.forEach(b => b.gb && ids.add(Number(b.gb)));
  }catch(e){}
  return [...ids].filter(n => n > 0);
}

async function fetchOne(id){
  const file = path.join(BOOKS, 'pg' + id + '.txt');
  if(fs.existsSync(file) && fs.statSync(file).size > 2000) return 'skip';
  const urls = [
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.txt`,
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}-0.txt`
  ];
  for(const u of urls){
    try{
      const r = await fetch(u, { headers:{ 'User-Agent':'LIZZREAD/2.0' }, signal: AbortSignal.timeout(60000) });
      if(!r.ok) continue;
      const t = await r.text();
      if(!t || t.length < 2000) continue;
      if(/^\s*(URL Source:|<!DOCTYPE|<html)/i.test(t.slice(0, 300))) continue;
      fs.writeFileSync(file, t);
      return 'ok';
    }catch(e){}
  }
  return 'miss';
}

(async () => {
  const ids = loadIds();
  const queue = ids.slice();
  let ok = 0, skip = 0, miss = 0, bytes = 0, done = 0;
  console.log('全文任务:', ids.length, '本，并发', CONC, '，上限', MAXMB, 'MB');
  async function worker(){
    while(queue.length){
      if(bytes / 1048576 > MAXMB){ return; }
      const id = queue.shift();
      const r = await fetchOne(id);
      if(r === 'ok'){ ok++; bytes += fs.statSync(path.join(BOOKS, 'pg'+id+'.txt')).size; }
      else if(r === 'skip') skip++; else miss++;
      done++;
      if(done % 20 === 0) console.log(`  ${done}/${ids.length} 新增 ${ok} 已有 ${skip} 失败 ${miss} 体积 ${(bytes/1048576).toFixed(1)}MB`);
    }
  }
  await Promise.all(Array.from({length: CONC}, worker));
  console.log(`完成：新增 ${ok}，已有 ${skip}，失败 ${miss}，新增体积 ${(bytes/1048576).toFixed(1)}MB`);
})();
