#!/usr/bin/env node
/* 预抓 Gutenberg 封面到 covers/（随站点一起发布，GitHub Pages/离线都能显示）
   用法：node scripts/fetch-covers.js [并发数]
   来源：gutenberg.pglaf.org（www.gutenberg.org 经常 503 维护） */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const COVERS = path.join(ROOT, 'covers');
fs.mkdirSync(COVERS, { recursive: true });

function loadIds(){
  const ids = new Set();
  const files = fs.readdirSync(path.join(ROOT, 'data')).filter(f => /\.js$/.test(f));
  for(const f of files){
    const src = fs.readFileSync(path.join(ROOT, 'data', f), 'utf8');
    for(const m of src.matchAll(/"gb":(\d{1,6})/g)) ids.add(Number(m[1]));
    for(const m of src.matchAll(/gb:(\d{1,6})/g)) ids.add(Number(m[1]));
  }
  return [...ids].filter(n => n > 0);
}

async function fetchOne(id){
  const file = path.join(COVERS, id + '.jpg');
  if(fs.existsSync(file) && fs.statSync(file).size > 500) return 'skip';
  const urls = [
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.cover.medium.jpg`,
    `https://gutenberg.pglaf.org/cache/epub/${id}/pg${id}.cover.small.jpg`
  ];
  for(const u of urls){
    try{
      const r = await fetch(u, { headers:{ 'User-Agent':'LIZZREAD/2.0' }, signal: AbortSignal.timeout(20000) });
      if(!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if(!/image\//.test(ct)) continue;
      const buf = Buffer.from(await r.arrayBuffer());
      if(buf.length < 500) continue;
      fs.writeFileSync(file, buf);
      return 'ok';
    }catch(e){}
  }
  return 'miss';
}

(async () => {
  const ids = loadIds();
  const conc = Number(process.argv[2] || 6);
  console.log('封面任务:', ids.length, '本，并发', conc);
  let ok = 0, skip = 0, miss = 0, done = 0;
  const queue = ids.slice();
  async function worker(){
    while(queue.length){
      const id = queue.shift();
      const r = await fetchOne(id);
      if(r === 'ok') ok++; else if(r === 'skip') skip++; else miss++;
      done++;
      if(done % 50 === 0) console.log(`  ${done}/${ids.length}  新增 ${ok} 跳过 ${skip} 缺失 ${miss}`);
    }
  }
  await Promise.all(Array.from({length: conc}, worker));
  console.log(`完成：已有 ${skip}，新抓 ${ok}，无封面 ${miss}`);
})();

/* 生成封面清单 covers/index.js（页面据此决定用本地封面还是回退） */
function writeIndex(){
  const ids = fs.readdirSync(COVERS).filter(f => /^\d+\.jpg$/.test(f)).map(f => Number(f.replace('.jpg','')));
  fs.writeFileSync(path.join(COVERS, 'index.js'), 'window.LZ_COVERS=' + JSON.stringify(ids) + ';\n');
  console.log('封面清单已生成：' + ids.length + ' 张');
}
process.on('exit', writeIndex);
