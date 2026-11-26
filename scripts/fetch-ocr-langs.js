#!/usr/bin/env node
/* 下载 tesseract.js 多语言识别包到 vendor/tessdata/
   为什么单独放：主包不打包，用户第一次用漫画翻译时按需加载对应语言 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'vendor', 'tessdata');
fs.mkdirSync(DIR, { recursive: true });

/* 与 LIZZREAD 16 门语言对应 */
const LANGS = {
  eng: 'English', chi_sim: '简体中文', chi_tra: '繁體中文', jpn: '日本語', kor: '한국어',
  deu: 'Deutsch', fra: 'Français', ita: 'Italiano', spa: 'Español', nld: 'Nederlands',
  por: 'Português', ell: 'Ελληνικά', fin: 'Suomi', hun: 'Magyar', swe: 'Svenska'
};
const CDN = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data';

(async () => {
  let ok = 0, fail = 0;
  for (const [code, name] of Object.entries(LANGS)) {
    const out = path.join(DIR, code + '.traineddata.gz');
    if (fs.existsSync(out) && fs.statSync(out).size > 50000) { console.log('已存在', code, name); ok++; continue; }
    const url = `${CDN}/${code}/4.0.0/${code}.traineddata.gz`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(120000) });
      if (!r.ok) { console.log('下载失败', code, r.status); fail++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      fs.writeFileSync(out, buf);
      console.log('已下载', code, name, (buf.length / 1048576).toFixed(1) + 'MB');
      ok++;
    } catch (e) { console.log('异常', code, e.message); fail++; }
  }
  console.log(`完成：成功 ${ok}，失败 ${fail}`);
})();
