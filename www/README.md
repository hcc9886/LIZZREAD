# LIZZREAD · 双语线上图书馆

面向中文读者的英文原版阅读器：**3700+ 本 Project Gutenberg 公版书全文**、点词即译、整章/整书翻译、离线阅读、句子意群拼装、生词与学习报告。纯静态单页 + 一个很小的本地 Node 代理，无框架、无数据库、无需登录。

## 快速开始

```bash
node server.js 8765
# 打开 http://127.0.0.1:8765/
# 同一 Wi-Fi 手机：http://<电脑局域网IP>:8765/   （本机 IP 可在「个性化 → 分享与访问」复制）
```

`server.js` 提供两件事：

1. 静态文件服务；
2. `/api/pg/:id` —— 浏览器直连 `gutenberg.pglaf.org` 会被 CORS 拦截，所以由本机服务端按需抓取全文，**首次抓取后落盘到 `books/pg<id>.txt`**，之后再打开就是本地秒开。抓不到的旧书会依次尝试备用镜像和 `r.jina.ai` 跨域阅读代理（Capacitor 壳内没有本地服务时走这一条）。

> 也可以把整个目录当作纯静态站点部署（GitHub Pages / Cloudflare Pages），但 3000+ 本未打包的书会因 CORS 无法取正文；已打包在 `books/` 的 284 本不受影响。生产部署建议保留 Node 代理，或自建一个同样的 `/api/pg/:id` 服务。

## 已落地的 15 项改造

| # | 项目 | 说明 |
|---|---|---|
| 1 | 3700+ 本书库 | `data/catalog.js` 由 `scripts/build-catalog.py` 从 Gutenberg 官方 catalog 生成；全部为完整全文，按需加载 |
| 2 | 原版封面 | 优先使用 Gutenberg 官方 cover，经 `/api/cover/:id` 缓存；缺失时本地生成 SVG 书衣，永不空白 |
| 3 | 16 种导入格式 | TXT / MD / HTML / EPUB / DOCX / ODT / PDF / FB2 / RTF / SRT / VTT / CSV / JSON / ZIP / MOBI / AZW3（`shared/importers.js`） |
| 4 | 导入自动转换 | 自动分章、分句、统一成站内排版；大文件存 IndexedDB，不占 localStorage |
| 5 | 新手引导 + 教程 | 首次自动弹出 7 步引导；「🎓 教程」含上手路径、快捷键、FAQ、15 项清单 |
| 6 | 个性化 | 10 套背景、6 种强调色、字号、衬线/无衬线、版心宽度、动效开关；按账号保存 |
| 7 | 点词秒开 | 本地 24 万词词典优先 + 悬停预取 + 命中缓存 12ms 内出词卡 |
| 8 | 词义覆盖 ≥99% | 当前章批量补全：Google 多行批量翻译，一次 36 词，结果写入 IndexedDB；UI 实时显示覆盖率 |
| 9 | 整章翻译 | 8 句/批、3 并发；译文写回句子对象并持久化到 IndexedDB，断网仍显示 |
| 10 | 离线 | 离线模式开关、离线本书、批量离线（会员）、离线译文缓存 |
| 11 | 句子拼装 | 独立页面 + 阅读器内嵌面板；点选/拖拽与键盘输入双模式；顺序/拼写错误定位；IndexedDB 日志 |
| 12 | 订阅 | ¥12/月、¥30/季、¥98/年（另有永久会员）；免费版每日 120 句翻译、3 本离线书、1 组预设词表；会员不限量 |
| 13 | 学习报告 | 阅读时长、查词、翻译句数、拼装正确率、连续天数、7 日柱状图、阅读进度 |
| 14 | 全文搜索 | 跨导入书 + 已缓存书籍搜索，命中后跳回原句（不会把上百 MB 全文一次读进内存） |
| 15 | 分享/导出 | 金句分享（Web Share / 剪贴板）、学习报告 Markdown、生词 JSON、链接复制与安装入口 |

## 句子拼装模块（独立运行）

- 数据：`sentences/book<xxx>.json`，每句含 `sentence_id / book_id / level / text / zh / target_words / chunks / chunk_roles / readability`；`sentences/index.json` 是 `sentence_id → 文件` 映射；`sentences/books.json` 是书清单。
- 构建：`node scripts/build-sentences.js`（294 本、约 13.8 万句，其中约 1.6 万句带构建期译文缓存；TOC/页码/标题页已过滤）。
- 练习设计：默认隐藏原句、不自动给出答案；先看「这句话的意思 / 联系本文 / 换个地方怎么用」自己拼，核对需主动点「查看答案」；看过答案或用了「提示一块」本次不计分，重置后可重新计分。
- 核心：`shared/assembly-core.js` —— `initReaderAssembly()`、`loadBookSentences(bookId)`（Cache API + 内存懒加载）、`loadSentence(sentenceId)`、`openAssembly(sentenceId)`、`judgeAssembly(userChunks, targetChunks)`、`recordAssembly(log)`、`recentLogs()`。
- 面板：`reader/assembly-panel.js` —— 2–5 个槽位；点选/拖拽 + 键盘输入（`/` 或 `|` 分隔）；提交后错误块高亮并指出正确位置；日志写 `lizzread_local / assembly_log_v2`，带 `duration_ms`；若存在 `window.SharedStore` 同步写共享层。
- 约束：只能由用户主动触发；阅读器里「拆解当前句」默认**关**，开启后只在含已标记生词的句子旁显示入口，绝不自动展开、不跳页。

## 会员与支付

免费版不限制阅读、查词、词典、拼装；限制的是有持续成本的服务：每天 120 句整章翻译、3 本离线书、1 组预设词表。会员（¥12/月、¥30/季、¥98/年、永久）解锁不限量翻译、整书预翻译、全部离线下载、报告导出。

- 当前为内测阶段，三个内测码（大小写不敏感，一机一码一次，服务端记录 `data/redemptions.json`）：
  - `wansuiwansuiwanwansui1313113` → 永久会员
  - `nulixuexiya2027` → 年度会员（1 年）
  - `lizzzhaohaoyon!!!` → 月度会员（1 个月）
- 权益保存在本机账号（`lz_pro_v1`）；每个码只能在一台设备使用一次，清空浏览器数据会丢失权益。
- 真实支付需要商户号/后端回调。接入方式：在 `index.html` 的 `selectCheckout(plan)` 中把激活弹层替换为你的微信/支付宝/Paddle/Lemon Squeezy 收银台链接，并在支付成功后回调 `activatePro(plan, 'order:<id>')`。当前按钮结构与权益校验已就位。

## 数据与版权

- 书籍正文来自 Project Gutenberg（公版）。`books/` 内 295 本为本地副本，其余通过代理按需缓存到本地磁盘。
- 书封面优先使用 Gutenberg 官方 `pg<id>.cover.medium.jpg`，经 `/api/cover/:id` 落盘缓存；缺失时回退到本地生成的书衣。
- 词典 `dict.js` 约 24 万词条；导入解析库 JSZip / PDF.js 放在 `vendor/`，可离线使用。
- 代码为本站自有实现；未引入任何第三方课程/UI 代码。

## 目录

```
index.html            单页应用（UI + 全部前端逻辑）
server.js             静态服务 + /api/pg 代理（按需落盘）
data/catalog.js       3700+ 本书目（构建产物）
books/                Gutenberg 全文（打包 + 按需缓存）
sentences/            拼装句子包 + 索引
shared/               assembly-core.js / importers.js
reader/               assembly-panel.js
vendor/               jszip / pdf.js
scripts/              build-catalog.py / build-sentences.js / translate-packs.mjs
www/                  Capacitor 同步产物（npm run cap:sync 前先同步）
```

## 多语言学习模式（v2 新增）

LIZZREAD 现在是「多学习语言 + 多展示语言」的阅读理解器，7 门学习语言各自独立：

| 学习语言 | 书库规模 | 等级体系 | 免费日额度 |
|---|---|---|---|
| English | 3787 本（含 295 本已打包全文） | CEFR A1–C2 | 120 句/天 |
| Deutsch | 2406 本 | CEFR A1–C2 | 40 句/天 |
| Français | 4191 本 | CEFR A1–C2 | 40 句/天 |
| Italiano | 1108 本 | CEFR A1–C2 | 40 句/天 |
| Español | 886 本 | CEFR A1–C2 | 30 句/天 |
| 日本語 | 25 本（青空文库按需抓取） | JLPT N5–N1 | 25 句/天 |
| 한국어 | 14 部朝鲜王朝经典（双语导览） | TOPIK 1–6 | 25 句/天 |

- **展示语言**：中文 / English / Deutsch / Français / Italiano / Español / 日本語 / 한국어，译文与界面文案跟着变。
- **独立存储**：阅读进度、生词本、词族状态、词汇测试等级、统计都按学习语言分开存（localStorage 键加 `_<lang>` 后缀）。
- **点词**：英语走站内 25 万词本地词典（按首字母分片懒加载）；其他语言走本机 `/api/word` 代理 + 磁盘缓存，带词形提示。
- **翻译**：源语言 = 学习语言，目标语言 = 展示语言；整章翻译、整书预翻译、离线译文全部复用。
- **每门语言一套新手带练**（4 步）+ 语言专属示例书。
- **账户权益**：免费版可启用 1 门额外语言，会员（月/季/年/永久）解锁全部语言。

服务端新增接口：

```
GET  /api/word?lang=de&word=Haus&to=zh    多语言点词（磁盘缓存 data/word-cache.json）
GET  /api/az/000148%2Ffiles%2F773_14560   青空文库日语全文（Shift_JIS 转码缓存）
POST /api/translate {texts, from, to}     指定语言对的批量翻译
GET  /api/admin/health                    本机运营数据（仅 127.0.0.1 可访问）
POST /api/metrics?n=事件名                 匿名使用计数
```

## 语言等级与分级推荐（本轮新增）

每个学习语言都有自己的**等级体系 + 分级推荐书单 + 专属词汇测试**：

| 学习语言 | 等级体系 | 分级推荐 | 词汇测试 | 书库 |
|---|---|---|---|---|
| English | CEFR A1–C2 | 每级 3 本 | 24 题 | 3787 |
| 中文 | **HSK 1–6** | 每级 2–4 本 | 24 题（中文词 → 英文义） | 435 |
| Deutsch | CEFR A1–C2 | 每级 2–3 本 | 24 题 | 2406 |
| Français | CEFR A1–C2 | 每级 3 本 | 24 题 | 4191 |
| Italiano | CEFR A1–C2 | 每级 1–3 本 | 24 题 | 1108 |
| Español | CEFR A1–C2 | 每级 2–3 本 | 24 题 | 886 |
| 日本語 | **JLPT N5–N1** | 每级 1–5 本 | 24 题 | **95**（青空文库 76 + Gutenberg 19） |
| 한국어 | **TOPIK 1–6** | 每级 1–6 本 | 24 题 | **22** |

- 书城顶部新增「本等级读什么」横滑书单，按当前等级和下一等级推荐，可一键「只看 B2 / N2 / HSK5」。
- 每本书都带**中文名 + 英文名**（汉语模式：中文名 + 英文译名；日语/韩语：原名 + 中文名）。
- 汉语模式点词：本地中→英索引（16 分片，169k 词，按首字懒加载）+ 一次请求拿到**英/德/法/意/西/日/韩**对照释义。
- 其他语言点词同样新增「各国语言怎么说」一行（同一译文自动合并语言标签）。
- 听书语速 0.7x–1.3x，按学习语言自动选择发音（de-DE / fr-FR / ja-JP / ko-KR / zh-CN …）。
