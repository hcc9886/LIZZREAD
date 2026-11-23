# 后端部署（10 分钟，让 App 里的词典/翻译真的能用）

## 为什么要部署

App 里的「点词查词典」「整章翻译」「青空文库下载」都请求 `/api/*`。
不部署后端，App 只能走浏览器直连机翻，速度慢且部分网络不通。
部署后：一次部署，Android / iOS / 网页全部受益。

## 三种方式，按便宜排序

| 方式 | 价格 | 适合 | 缺点 |
|---|---|---|---|
| **Render 免费档** | ¥0 | 先跑起来 | 15 分钟无访问会休眠，首次访问慢 30 秒 |
| **Render 付费档** | $7/月（≈¥50） | 正式运营 | 无 |
| **自己的服务器 / 阿里云轻量** | ¥24–60/月 | 国内用户（延迟低） | 要自己配 Nginx + HTTPS |
| **Fly.io** | 按量，约 $3/月 | 全球加速、香港节点 | 需要信用卡 |

---

## 方式 A：Render（最简单，有免费档）

1. 注册 https://render.com （GitHub 登录）
2. **New → Web Service** → 连你的 GitHub 仓库 `hcc9886/LIZZREAD`
3. Render 会自动识别仓库里的 `render.yaml`，直接点 **Create**
4. 等 5–10 分钟构建完成，得到网址：`https://lizzread-api.onrender.com`
5. 验证：浏览器打开 `https://lizzread-api.onrender.com/api/health`，返回 `{"ok":true,...}` 即成功

> 免费档冷启动慢是正常的；要稳定就升到 $7/月。

## 方式 B：Fly.io（香港节点，国内延迟低）

```bash
# 1. 安装 CLI（macOS）
curl -L https://fly.io/install.sh | sh

# 2. 登录（需要信用卡验证）
fly auth signup      # 或 fly auth login

# 3. 在仓库根目录部署
cd /Users/hcc/Desktop/LIZZREAD
fly launch --no-deploy --copy-config
fly deploy

# 4. 查看网址
fly open
```

部署完网址形如 `https://lizzread-api.fly.dev`。

## 方式 C：自己的服务器（国内最快）

```bash
# 服务器上（Ubuntu 22.04，1核1G 足够）
sudo apt update && sudo apt install -y docker.io nginx certbot python3-certbot-nginx
git clone https://github.com/hcc9886/LIZZREAD.git /opt/lizzread
cd /opt/lizzread
sudo docker build -t lizzread .
sudo docker run -d --name lizzread -p 8080:8080 --restart=always \
  -v /opt/lizzread/books:/app/books \
  -v /opt/lizzread/covers:/app/covers \
  lizzread

# Nginx 反代 + HTTPS
sudo tee /etc/nginx/sites-available/lizzread >/dev/null <<'NGINX'
server {
  listen 80;
  server_name api.你的域名.com;
  client_max_body_size 20m;
  location / { proxy_pass http://127.0.0.1:8080; proxy_read_timeout 300s; }
}
NGINX
sudo ln -s /etc/nginx/sites-available/lizzread /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d api.你的域名.com
```

## 部署后：把地址填进 App

三种方式任选：

1. **App 内设置**（推荐）：个性化 → 🔌 后端连接 → 填 `https://lizzread-api.onrender.com` → 保存并重连
2. **打包时写死**：修改 `index.html` 里 `API_BASE` 的默认值
3. **环境变量**（网页版）：不需要，网页版默认同源

## 可选：配上内购校验密钥

```bash
# Render: Environment → Add Environment Variable
REVENUECAT_SECRET=sk_xxx        # RevenueCat 私钥
HUAWEI_APP_ID=xxx
HUAWEI_APP_SECRET=xxx
```

配好后 `/api/iap/verify` 与 `/api/huawei/verify` 才会真正校验。

## 验证清单

```bash
BASE=https://你的后端地址
curl $BASE/api/health                       # {"ok":true}
curl "$BASE/api/word?lang=en&word=truth&to=zh"   # 有 gloss
curl -X POST $BASE/api/translate -H 'Content-Type: application/json' \
     -d '{"texts":["It is a truth."],"from":"en","to":"zh"}'   # 有译文
curl -o /dev/null -w "%{http_code}\n" "$BASE/api/pg/1342"      # 200（全文抓取）
curl -o /dev/null -w "%{http_code}\n" "$BASE/covers/1342.jpg"  # 200（封面）
```

全绿就说明后端可用。

## 注意

- **书籍与封面体积大**（books 65MB + covers 336MB）。免费/低配主机建议：
  - 只部署 `books` 里常用的几十本，其余靠运行时抓取（会自动落盘）
  - `covers` 可以不打包，靠 `/covers/<id>.jpg` 的 302 回退到镜像
- 调整方法：编辑 `Dockerfile`，把 `COPY books ./books` 换成 `RUN mkdir books`。
