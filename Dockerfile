# LIZZREAD 后端（词典代理 / 翻译代理 / 公版书抓取 / 激活码 / 内购校验）
FROM node:20-alpine

WORKDIR /app

# 只装运行期需要的依赖（无第三方依赖，纯 Node 内置模块）
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund || true

# 代码与数据
COPY server.js index.html privacy.html manifest.json sw.js ./
COPY data ./data
COPY books ./books
COPY dicts ./dicts
COPY sentences ./sentences
COPY shared ./shared
COPY reader ./reader
COPY vendor ./vendor
COPY covers ./covers
COPY icon.svg icon-192.png icon-512.png ./

# 运行时可写目录
RUN mkdir -p books/covers cache download

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js", "8080"]
