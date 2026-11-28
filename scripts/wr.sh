#!/usr/bin/env bash
# 持久化 wrangler 登录（配置存在 .wrangler-auth/，已在 .gitignore 里）
# 用法：bash scripts/wr.sh pages deploy dist-pages --project-name lizzread --branch main
cd "$(dirname "$0")/.." || exit 1
export XDG_CONFIG_HOME="$PWD/.wrangler-auth"
export npm_config_cache="${npm_config_cache:-/tmp/npmcache}"
exec npx --yes wrangler@4 "$@"
