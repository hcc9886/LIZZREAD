#!/bin/bash
# 为 Cloudflare Pages / Netlify 等「有文件数与单文件大小限制」的托管组装站点
#   Cloudflare Pages 限制：单文件 ≤ 25MiB，文件总数 ≤ 20,000
# 与大而全的 build-web.sh 相比：
#   - 跳过未被 index.html 引用的词典大包（dicts/zh-en.js 40MB、dicts/en 13MB）
#   - 封面只带"有本地全文的书"（LZ_LOCAL_BOOKS + 多语言公版包），其余走远程/生成封面
set -e
cd "$(dirname "$0")/.."

OUT="dist-pages"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "== 1/5 静态入口文件 =="
for f in index.html privacy.html manifest.json sw.js dict.js ai.js \
         icon.svg icon-wink.svg icon-maskable.svg icon-192.png icon-216.png \
         icon-512.png icon-512-maskable.png apple-touch-icon.png favicon.ico; do
  [ -f "$f" ] && cp "$f" "$OUT"/
done

echo "== 2/5 data / books / sentences =="
for d in data books sentences vendor manga-samples comics; do
  [ -d "$d" ] && cp -a "$d" "$OUT"/
done

echo "== 3/5 中文分词词典（只带被引用的 dicts/zh） =="
if [ -d dicts/zh ]; then
  mkdir -p "$OUT/dicts"
  cp -a dicts/zh "$OUT/dicts"/
fi

echo "== 4/5 精简封面 =="
mkdir -p "$OUT/covers"
node - "$OUT" <<'NODE'
const fs = require('fs'), path = require('path'), vm = require('vm');
const out = process.argv[2];

/* 收集"需要封面"的书：有本地全文的 + 多语言公版包里的 */
const ids = new Set();
function loadScript(rel, key){
  try{
    const code = fs.readFileSync(path.join(__dirname, rel), 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window[key];
  }catch(e){ return null; }
}
/* __dirname 在 heredoc 里不可靠，用 cwd */
function load(rel, key){
  try{
    const code = fs.readFileSync(rel, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(code, sandbox);
    return sandbox.window[key];
  }catch(e){ return null; }
}
const local = load('data/local-books.js', 'LZ_LOCAL_BOOKS') || [];
local.forEach(g => ids.add(String(g)));
for(const f of ['data/books-pg-multi.js','data/books-pg-multi2.js','data/books-zh-classics.js']){
  const arr = load(f, f.includes('zh-classics') ? 'LZ_ZH_CLASSICS' : (f.includes('multi2') ? 'LZ_PG_MULTI2' : 'LZ_PG_MULTI')) || [];
  arr.forEach(b => { if(b && b.gb) ids.add(String(b.gb)); });
}
if(fs.existsSync('data/books-en.js')){
  const en = load('data/books-en.js', 'LZ_BOOKS_EN') || [];
  en.forEach(b => { if(b && b.gb) ids.add(String(b.gb)); });
}

let copied = 0, missing = 0;
const list = [];
for(const gb of ids){
  const src = path.join('covers', gb + '.jpg');
  if(fs.existsSync(src)){
    fs.copyFileSync(src, path.join(out, 'covers', gb + '.jpg'));
    list.push(Number(gb));
    copied++;
  } else missing++;
}
/* 封面清单：index.html 用它判断哪些封面本地存在 */
fs.writeFileSync(path.join(out, 'covers', 'index.js'), 'window.LZ_COVERS=' + JSON.stringify(list) + ';\n');
console.log('  需要封面 ' + ids.size + ' 本 → 实际带上 ' + copied + ' 张，缺 ' + missing + ' 张');
NODE

# Wrangler 静态资源：排除源目录本身（只上传装配好的文件）
cat > "$OUT/.assetsignore" <<'IGN'
node_modules/
android/
.sdk/
www/
dist/
dist-web/
*.apk
*.aab
IGN

echo "== 5/5 统计 =="
FILES=$(find "$OUT" -type f | wc -l | tr -d ' ')
SIZE=$(du -sh "$OUT" | cut -f1)
BIG=$(find "$OUT" -type f -size +24M | head -5)
echo "  文件数：$FILES（Cloudflare 上限 20000）"
echo "  总体积：$SIZE"
if [ -n "$BIG" ]; then
  echo "  ⚠️ 有超过 24MB 的文件（Cloudflare 上限 25MB）："
  echo "$BIG"
else
  echo "  ✓ 没有超过 24MB 的单文件"
fi
echo "输出目录：$OUT"
