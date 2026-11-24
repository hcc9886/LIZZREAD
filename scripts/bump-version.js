#!/usr/bin/env node
/* 一条命令发新版：提升版本号 → 写 app-version.json/js → 打 APK + AAB
   用法：
     node scripts/bump-version.js patch   # 2.0.0 → 2.0.1
     node scripts/bump-version.js minor   # 2.0.0 → 2.1.0
     node scripts/bump-version.js 2.1.3   # 指定版本
   之后执行：./build-app.sh   （会读 app-version.json 自动写进 gradle） */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const vf = path.join(ROOT, 'data', 'app-version.json');
const cur = JSON.parse(fs.readFileSync(vf, 'utf8'));
const arg = process.argv[2] || 'patch';

let next;
if(/^\d+\.\d+\.\d+$/.test(arg)){
  next = arg;
} else {
  const p = String(cur.latest || '2.0.0').split('.').map(Number);
  if(arg === 'minor'){ p[1] += 1; p[2] = 0; }
  else if(arg === 'major'){ p[0] += 1; p[1] = 0; p[2] = 0; }
  else { p[2] += 1; }
  next = p.join('.');
}

const now = new Date();
const build = now.getFullYear() +
  String(now.getMonth()+1).padStart(2,'0') + String(now.getDate()).padStart(2,'0') +
  String(now.getHours()).padStart(2,'0');

const out = Object.assign({}, cur, {
  latest: next,
  min: cur.min || next,
  build,
  notes: process.env.NOTES || cur.notes || '',
  ios: Object.assign({}, cur.ios, { latest: next }),
  android: Object.assign({}, cur.android, { latest: next })
});
fs.writeFileSync(vf, JSON.stringify(out, null, 2));

/* 同步 app-version.js（页面直接 <script> 引入，避免额外请求） */
fs.writeFileSync(path.join(ROOT, 'data', 'app-version.js'),
  'window.LZ_BUILD=' + JSON.stringify({ version: next, build, notes: out.notes }) + ';\n');

console.log(`版本：${cur.latest} → ${next}（build ${build}）`);
console.log('下一步：./build-app.sh  然后 git add -A && git commit -m "release: ' + next + '" && git push');
