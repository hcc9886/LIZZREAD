#!/bin/bash
# LIZZREAD 一键推送（在本地终端运行，交互式输入 GitHub 账号 + Token）
set -e
cd "$(dirname "$0")"

PROXY="${PROXY:-http://127.0.0.1:10808}"

echo "== 1/4 检查代理 =="
if curl -sS -m 8 -x "$PROXY" -o /dev/null -w "" https://github.com 2>/dev/null; then
  echo "代理可用：$PROXY"
  GIT_PROXY=(-c http.proxy="$PROXY" -c https.proxy="$PROXY")
else
  echo "代理 $PROXY 不可用，改为直连（可能很慢）"
  GIT_PROXY=()
fi

echo "== 2/4 优化大仓库推送参数 =="
git config http.version HTTP/1.1
git config http.postBuffer 1572864000

echo "== 3/4 开始推送（会提示输入用户名与 Token）=="
echo "   用户名：hcc9886"
echo "   密码：粘贴你的 Personal Access Token（ghp_ 开头）"
echo "   获取地址：https://github.com/settings/tokens/new （勾选 repo）"
echo
git "${GIT_PROXY[@]}" push -u origin main

echo
echo "== 4/4 完成 =="
git log --oneline -1
git ls-remote origin 2>/dev/null | head -2
