#!/usr/bin/env node
/* 「拍图取词」配套：把相册里的图片拖进网页即可识别（浏览器内 tesseract.js 离线识别）
   本脚本只做一件事：把 tesseract 的语言包下载到 vendor/tesseract，保证断网也能识别中文+英文 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'vendor', 'tesseract');
fs.mkdirSync(DIR, { recursive: true });
const LANGS = ['eng.traineddata.gz', 'chi_sim.traineddata.gz'];
(async () => {
  for (const l of LANGS) {
    const out = path.join(DIR, l);
    if (fs.existsSync(out) && fs.statSync(out).size > 100000) { console.log('已存在', l); continue; }
    const url = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/' + (l.startsWith('chi') ? 'chi_sim' : 'eng') + '/4.0.0/' + l;
    try {
      const r = await fetch(url);
      if (!r.ok) { console.log('下载失败', l, r.status); continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('已下载', l, (buf.length/1048576).toFixed(1) + 'MB');
    } catch (e) { console.log('下载异常', l, e.message); }
  }
})();
