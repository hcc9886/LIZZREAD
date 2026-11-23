#!/bin/bash
# 仓库瘦身（可选）：把大体积资源移出 git，让推送更快
# 用法：bash slim.sh [covers|books|both]
set -e
cd "$(dirname "$0")"
WHAT="${1:-covers}"
PROXY="${PROXY:-http://127.0.0.1:10808}"

echo "== 0 备份完整历史 =="
mkdir -p .backup
git bundle create ".backup/full-$(date +%Y%m%d-%H%M).bundle" --all >/dev/null 2>&1 || true
du -sh .backup 2>/dev/null | tail -1

echo "== 1 从工作区移出（保留在本地磁盘，只是不入库）=="
case "$WHAT" in
  covers) git rm -r --cached --ignore-unmatch covers -q ;;
  books)  git rm -r --cached --ignore-unmatch books  -q ;;
  both)   git rm -r --cached --ignore-unmatch covers books -q ;;
esac
python3 - <<'PY'
p='.gitignore'
s=open(p,encoding='utf-8').read() if __import__('os').path.exists(p) else ''
for d in ['covers/','books/']:
    if d not in s: s = s.rstrip() + '\n' + d + '\n'
open(p,'w',encoding='utf-8').write(s)
PY

echo "== 2 提交 =="
git add -A
git commit -m "chore(repo): 大体积资源移出仓库（本地保留），改用按需下载" || echo "无改动"

echo "== 3 压缩 =="
git reflog expire --expire=now --all
git gc --prune=now --aggressive
du -sh .git

echo "== 4 推送 =="
git config http.version HTTP/1.1
git config http.postBuffer 1572864000
git -c http.proxy="$PROXY" -c https.proxy="$PROXY" push -f -u origin main

echo "完成：$(git ls-remote origin 2>/dev/null | head -1)"
