#!/bin/bash
# 组装纯静态站点到 dist-web/（可直接上传 GitHub Pages / Vercel / Netlify / Gitee Pages / 阿里云 OSS）
set -e
cd "$(dirname "$0")/.."

OUT="dist-web"
rm -rf "$OUT"
mkdir -p "$OUT"

echo "== 复制静态资源 =="
rsync -a \
  index.html privacy.html manifest.json sw.js dict.js \
  icon.svg icon-192.png icon-512.png icon-216.png icon-512-maskable.png apple-touch-icon.png \
  "$OUT"/
for d in data books covers dicts sentences shared reader vendor; do
  [ -d "$d" ] && rsync -a "$d" "$OUT"/
done

# 封面：LIGHT=1 时只带热门书（部署到体积受限的托管），默认全量（GitHub Pages 够用）
if [ "${LIGHT:-0}" = "1" ] && [ -d covers-pick ] && [ -n "$(ls -A covers-pick 2>/dev/null)" ]; then
  echo "== 精简封面（LIGHT=1） =="
  rm -rf "$OUT/covers"
  mkdir -p "$OUT/covers"
  rsync -a covers-pick/ "$OUT/covers/"
fi
# 清单按「实际存在的文件」重建，保证不会指向缺失的封面（缺失才会回退到镜像）
if [ -d "$OUT/covers" ]; then
  node -e '
    const fs=require("fs"),path=require("path");
    const dir=process.argv[1];
    const ids=fs.readdirSync(dir).filter(f=>/^\d+\.jpg$/.test(f)).map(f=>Number(f.replace(".jpg","")));
    fs.writeFileSync(path.join(dir,"index.js"),"window.LZ_COVERS="+JSON.stringify(ids)+";\n");
    console.log("封面清单："+ids.length+" 张");
  ' "$OUT/covers"
fi

# 版本信息
[ -f data/app-version.js ] && cp data/app-version.js "$OUT/data/app-version.js"

echo "== 站点体积 =="
du -sh "$OUT"
echo "文件数：$(find "$OUT" -type f | wc -l | tr -d ' ')"
echo "输出目录：$OUT（把里面的内容整个上传到任意静态托管即可）"
