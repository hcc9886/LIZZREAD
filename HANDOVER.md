# LIZZREAD 项目交接文档

> 最后更新：2026-11-25（第 2 版）· 版本 2.1.0
> 给下一个 AI / 开发者：先读这份，再动手。所有"已完成/未完成/要问用户"都在这里。

---

## 0. 一句话现状

**LIZZREAD 是一个 16 门语言的原著阅读 + 点词学习 SPA**，单文件 `index.html`（约 66 万字节）+ 一个零依赖 Node 后端 `server.js`。
线上地址：https://hcc9886.github.io/LIZZREAD/
仓库：https://github.com/hcc9886/LIZZREAD（`main` 分支）
本地路径：`/Users/hcc/Desktop/LIZZREAD`

---

## 1. 技术栈与文件地图

| 文件/目录 | 作用 | 注意 |
|---|---|---|
| `index.html` | **全部前端逻辑与 UI**（约 9100+ 行，660 KB） | 改完必须做一次 `<script>` 抽取语法检查 |
| `server.js` | Node 后端（支付回调、发券、反馈、版本、青空代理） | 零依赖 |
| `server/pay.js` | 支付模块（支付宝 RSA2 + 微信 v3） | 与前端 `PLAN_DEF` 必须同步 |
| `dict.js` | **255,132 词条英汉词典** | 18 MB，懒加载 |
| `data/books-*.js` | 16 门语言书库（609 本） | |
| `data/offline-tr.js` | 离线翻译包 15,856 条 | 2.9 MB |
| `data/lang-tests.js` / `lang-test-options.js` | 16 语言测试题 | |
| `data/vocab-books.js` + `vocab-books-ext.js` | **9 本考试词书** | 见第 6 节"踩过的坑" |
| `data/app-version.json/js` | 版本号 | 改版本要两个都改 |
| `sw.js` | Service Worker | 缓存版本号当前为 `lizzread_v28` |
| `build-logo.js` | **生成品牌图标** | 改参数即可重出 icon.svg |
| `build-app.sh` | 一键出 APK/AAB | 见第 6 节版本号坑 |
| `scripts/build-web.sh` | 生成 `dist-web/` | 静态托管用 |
| `covers/` | 19,551 张本地封面 | 已 git 跟踪，体积大 |
| `weapp/` | 微信小程序壳 | web-view 套页面 |
| `android/`、`ios/` | 原生壳工程 | |
| `store/` | 上架与收费文档 | |

### 常用命令

```bash
# 语法检查（必做）
python3 -c "
import re
s=open('index.html',encoding='utf-8').read()
b=re.findall(r'<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>',s,re.S)
open('/tmp/inline0.js','w',encoding='utf-8').write('\n;\n'.join(b))
" && node --check /tmp/inline0.js

# 本地预览
python3 -m http.server 8765 --directory www

# 构建静态站
bash scripts/build-web.sh

# 构建 APK（需要 .sdk 工具链）
source /tmp/jdk_env.sh
export JAVA_HOME=$PWD/.sdk/amazon-corretto-21.jdk/Contents/Home
export ANDROID_HOME=$PWD/.sdk ANDROID_USER_HOME=$PWD/.sdk/android-home
export GRADLE_USER_HOME=$PWD/.sdk/gradle-user-home
export PATH="$PWD/.sdk/gradle-8.10.2/bin:$PATH"
./build-app.sh

# 升级版本
node scripts/bump-version.js 2.2.0
sed -i '' 's/lizzread_v28/lizzread_v29/' sw.js   # 记得也提缓存版本
```

---

## 2. ⚠️ 环境与推送（最重要的坑）

### 2.1 `git push` 在本机挂起

- `git push` 通过代理连 github 会**无限挂起**（smart-http 层问题）
- **变通方案**：用 GitHub REST API 直接写 blob/tree/commit/ref
- 可复用脚本：`/tmp/push_files.js`（用 `FILES=a,b,c` 环境变量指定文件）

```bash
FILES="index.html,data/vocab-books.js" \
TOK="<github_token>" \
HTTPS_PROXY=http://127.0.0.1:10808 HTTP_PROXY=http://127.0.0.1:10808 \
node /tmp/push_files.js
```

### 2.2 GitHub Pages 工作流是坏的

- 仓库 Pages 是 **legacy（从分支构建）** 模式，`.github/workflows/*.yml` 里的 `deploy-pages` 一定失败
- **变通方案**：push 后调 API 触发构建

```bash
curl -X POST -H "Authorization: token <TOK>" \
  https://api.github.com/repos/hcc9886/LIZZREAD/pages/builds
# 等 100-130 秒后核对：
curl -sS -x http://127.0.0.1:10808 https://hcc9886.github.io/LIZZREAD/index.html -o /tmp/l.html
echo "$(wc -c < /tmp/l.html) vs $(wc -c < index.html)"   # 两个数字必须相等
```

### 2.3 缓存

- 改了 `data/*.js` 一定要在 `index.html` 里改 `?v=N`，否则浏览器用旧缓存
- 改完大版本顺手把 `sw.js` 里 `lizzread_vNN` 加一

### 2.4 Token

- 历史对话里出现过 GitHub 个人访问令牌（PAT），已暴露在网络与对话里
- **必须让用户去 GitHub → Settings → Developer settings → Tokens 吊销并重发**
- 新 token 只放在本地环境变量里，**不要写进任何 tracked 文件**（GitHub 会拦截推送）

---

## 3. 已完成的功能（可以直接用，已线上验证）

### 3.1 阅读核心
- [x] 16 门语言、609 本内置全文、19,551 张本地封面
- [x] 点词查义（音标 / 多义项 / 助记 / 例句 / 词组 / 词书标签）
- [x] 行间释义（Kindle Word Wise 风格，长词下加 2–8 字中文）
- [x] 双语对照（逐句 / 整段 / 翻页书三档）
- [x] **翻页书籍模式**（一页一页翻，← → 键与左右滑动）
- [x] 4+3 种版式：原书 / 简洁 / 紧凑双栏 / 宽屏大字 + **报纸 / 电子书 / 论文**
- [x] 字体与格式：7 种字体 + 字号 / 行距 / 段距 / 页边距 / 对齐 / 首行缩进
- [x] 长按整句翻译
- [x] 词汇覆盖率（书详情页，79% · C1 较难 这种）
- [x] 语法高亮（主语琥珀 / 谓语红 / 宾语青 / 从句紫）
- [x] 中英夹杂三档（关 → 渐进注释 → 生词填空）
- [x] 原格式阅读（导入书保留分段与首行缩进）

### 3.2 学习练习
- [x] 句子拼装（**只保留单词级分块** + 点选/拖拽 + 键盘输入，答案未提交前锁死）
- [x] 单词打怪闯关（5 种词源：高频 100 / 错词本 / 生词本 / 当前这本书 / 六级词）
- [x] 打怪增强：💡提示首字母、📖看例句、连击 ≥3 特效
- [x] 生词科学复习（SM-2）
- [x] 9 本考试词书（四六级/雅思/托福/GMAT/托业/考研/专四/专八），可整本标记 + 自定义颜色
- [x] 用生词写小故事（按词性套模板，可导入精读）
- [x] 逐句听写（视频页第二个标签，匹配百分比）
- [x] 句子精讲（主干 / 时态 / 语气 / 12 条语法规则）
- [x] 阅读统计（累计时长 / WPM / 近 14 天柱状图 / 读完纪念页）

### 3.3 内容与工具
- [x] 内置浏览器（Google/百度/Bing 搜索 + 网址 + 点词翻译开关 + **提取正文精读** + 可内嵌站点入口）
- [x] **整页翻译**（同源 iframe 注入逐词标注 + 段落译文 + 页面内工具条；跨域走正文提取）
- [x] 导航栏重构：6 个一级 + 「更多」折叠分组（解决会员菜单点不到）
- [x] 外刊 12 源（每条三按钮：**抓取正文精读 / 粘贴 / 官网**）
- [x] 看视频学（本地视频/音频 + SRT/VTT + 示例字幕 + 逐句听写）
- [x] 反馈 / Bug 报告（自动带设备与页面信息，落盘 `data/feedback.json`，`/api/feedback/list?token=` 可查）
- [x] 更新记录 + 立即更新（注销 SW + 清缓存 + reload）
- [x] 多端版式（desktop / tablet / phone / mini）

### 3.4 商业化
- [x] 早鸟价：单语言 ¥15/月、全语言 ¥29/月、¥88/季、¥199/年、**永久 ¥298（限 100 名，实时剩余）**
- [x] 支付（支付宝 RSA2 + 微信 v3，需用户提供密钥）
- [x] 兑换券：官网自动发券 + 手机号阿里云短信（需 Key）
- [x] 会员叠加（单语言 + 全语言互不覆盖）

### 3.5 品牌
- [x] 全新图标：极光绿渐变 + 两个温和的「＾＾」+ L 字母
- [x] 生成 icon.svg / 192 / 216 / 512 / maskable / apple-touch / Android 五档 mipmap

---

## 4. ❌ 还没做的（按能否立刻做分类）

### 4.1 无需任何外部资源，下一个 AI 可以直接做

| # | 功能 | 参考来源 | 难度 | 备注 |
|---|---|---|---|---|
| A1 | 三栏笔记（原文 / 生词 / 翻译对照） | 用户第 2 批图 | 中 | |
| A2 | 词根 + 同根词族（点词卡第四栏） | 用户第 3 批图 | 中 | 需要词族表，可本地生成 |
| A3 | 朗读时逐句高亮 | 用户第 1 批图 | 小 | 用 SpeechSynthesis 的 onboundary |
| A4 | 播客/音频影子跟读（导入本地音频） | 用户第 2 批图 | 中 | 复用看视频学的解析 |
| A5 | 中文小说英译模式 | 用户第 1 批图 #17 | 大 | 需用户提供中文文本 |
| A6 | 生词复习三态筛选界面（没练过/渐熟/记牢） | 用户第 1 批图 #8 | 小 | 数据已有，缺 UI |
| A7 | 漫画导入 + OCR 翻译 | 用户明示 | 大 | 浏览器内 tesseract.js，中文包 40MB 按需下载 |

### 4.2 需要用户提供 AI API Key

| # | 功能 | 备注 |
|---|---|---|
| B1 | 与书对话（AI 答整本书的问题） | |
| B2 | AI 原创连载（悬疑/奇幻/冒险/科幻/爱情/校园） | 用户已确认题材 |
| B3 | AI 陪读 + 情景对话 + 剧情对话 | 用户要语音 + 打字两种 |
| B4 | 自定义 AI 老师人设（"培训自己的陪读朋友"） | |
| B5 | AI 批改写作 | |
| B6 | AI 定制新闻（选领域/长度/难度） | |
| B7 | 点词卡里的「AI 解析」段 | 现在是本地生成 |

**推荐服务**：智谱 GLM-4-Flash（完全免费无限量）> 硅基流动（送 ¥14）> DeepSeek（送试用金）
**注册**：https://open.bigmodel.cn/ → 控制台 → API Key

**费用估算（DAU 1000、每人每天 5 次）**：
- DeepSeek ¥1/百万 token → 约 **¥30/天，¥900/月**
- 智谱 GLM-4-Flash → **¥0**

### 4.3 需要语音识别

| # | 功能 | 免费方案 | 付费方案 |
|---|---|---|---|
| C1 | 跟读录音 + 评分 | 浏览器 Web Speech API（¥0） | Whisper API ¥2.6/小时 |
| C2 | 音视频自动转文字稿（ASR） | Whisper 本地 transformers.js | 阿里云 ¥9/小时 |

### 4.4 技术上做不到（要给用户解释清楚）

| # | 需求 | 原因 |
|---|---|---|
| D1 | 跨 App 悬浮翻译（在别的软件里也翻） | 网页/PWA 没有跨应用悬浮窗权限，必须做原生 App |
| D2 | 浏览器"整页翻译"**跨域**网页 | iframe 跨域读不到 DOM。**已于第 2 版部分解决**：同源可注入，跨域退化为"提取正文精读"（服务端抓正文进阅读器再翻）。要像沉浸式翻译那样直接改写第三方页面，必须做**浏览器扩展**，见 E1 |
| D3 | 内嵌 BBC/Guardian/Google/Bing | 这些站设了 X-Frame-Options，任何工具都绕不过 |
| D4 | 直接导入 YouTube/B 站视频 | 平台禁止第三方抓取 + 版权 |

### 4.5 需要做浏览器扩展才能完全实现

| # | 需求 | 说明 |
|---|---|---|
| E1 | 在**任意第三方网页**上直接双语对照/逐词标注 | 需要 Manifest V3 扩展（Chrome/Edge/Firefox）。核心 API 与现有 `brTranslatePage()` 相同，只是权限从 iframe 换成 `content_scripts`。工作量约 1–2 天 |

---

## 5. 用户提出的需求全表（按图片批次）

### 用户原话要点（必须保留）
- "只 iOS 微信小程序保留兑换券，其他端直接支付"
- "已删除的内容只有微信不删除"
- "不要到其他网页去"
- "不要抄袭不要侵权"
- 全语言年价格 → **¥299 改成了 ¥199**（用户后来说 199）
- 永久名额 **100 个**
- 拼装分块**只要单词**（不要意群/混合）
- 漫画/视频**只用用户自己导入 + 无版权素材**

### 第一批 20 张（LinguoLand / 灵瓜 / YuanDu / ListenLeap）
| # | 功能 | 状态 |
|---|---|---|
| 1 | 行间释义 | ✅ |
| 2 | 双语对照 | ✅ |
| 3 | 词汇覆盖率 | ✅ |
| 4 | 长按整句翻译 | ✅ |
| 5 | 阅读统计 WPM/折线 | ✅ |
| 6 | 点词卡 + AI 解析 | ⚠️ 卡完整，AI 段本地生成（B7） |
| 7 | 长难句精讲 | ⚠️ 规则版 |
| 8 | 生词科学复习 | ✅（三态 UI 待做 A6） |
| 9 | 音频精听 + 逐句字幕 | ✅ |
| 10 | 语法高亮 | ✅ |
| 11 | 生词高亮 + 大纲词表 | ✅ |
| 12 | 与书对话 | ❌ B1 |
| 13 | AI 原创连载 | ❌ B2 |
| 14 | 阅读器（下划线/行间/朗读） | ⚠️ 缺 A3 |
| 15 | 点词三栏 | ⚠️ 缺 A2 |
| 16 | 跟读高亮 | ❌ C1 |
| 17 | 中文小说英译 | ❌ A5 |
| 18 | 浏览器点词面板 | ✅ |
| 19 | 视频字幕学习 | ✅ |
| 20 | 影子跟读软件 | ❌ C1 |

### 第二批 3 张
| # | 功能 | 状态 |
|---|---|---|
| 21 | 播客影子跟读 | ❌ A4 |
| 22 | 三栏笔记 | ❌ A1 |
| 23 | 中英夹杂阅读 | ✅ |

### 第三批 15 张
| # | 功能 | 状态 |
|---|---|---|
| 24–26 | 视频字幕/词汇标签/独立面板 | ✅ |
| 27 | 暂停查词 + AI 上下文释义 | ⚠️ B7 |
| 28 | 听写模式 | ✅ |
| 29 | 跟读录音对比 | ❌ C1 |
| 30 | 词卡合集（习语/短语分类） | ⚠️ |
| 31 | 词根 + 同根词族 | ❌ A2 |
| 32 | 打字练习 | ✅ |
| 33–34 | AI 即时回复 / 日记批改 | ❌ B3/B5 |
| 35 | 外刊精读 | ✅ |
| 36 | 播客/TED 听力库 | ❌ 需内容源 |
| 37–38 | AI 定制新闻 / 批改写作 | ❌ B6/B5 |

### 第四批 3 张
| # | 功能 | 状态 |
|---|---|---|
| 39–41 | 字体格式 / 报纸电子书 / 打怪 | ✅ |

### 第五批 4 张（报错）
| # | 问题 | 状态 |
|---|---|---|
| 42–45 | 青空加载失败 / 多语言乱码 / 外刊打不开 / 拼装答案可见 | ✅ 已修 |

---

## 6. 踩过的坑（别再踩）

| 坑 | 现象 | 解法 |
|---|---|---|
| **词书是假词** | 生成脚本按词长取词，取到 `aaaargh`、`aagaard` | 只保留有中文释义、无三连字母、非专名的词；当前用 800 高频词表优先排序 |
| **`dictEntry()` 依赖当前语言** | 学习语言不是英语时返回 `null`，打怪队列为空 | 需要英文释义时直接查 `window.LIZ_DICT[w]` |
| **`data/*.js` 缓存** | 改了词书页面不变 | `index.html` 里改 `?v=2` |
| **build-app.sh 不写版本** | APK 永远 2.0.0 | 已修：sed 真写 `versionName/versionCode`；APK 文件名用 `${APPVER}` |
| **app-version.js 缓存** | 线上版本卡 2.0.0 | 已修：`?v=2` |
| **代码写进 `<style>`** | 函数未定义、页面空白 | 改完跑语法检查 + 打开页面看 console |
| **`escapedAttr` vs `escAttr`** | 两套工具函数都有，别混用 | 看上下文 |
| **词卡只显示 2 字** | 句首大写词被判专有名词 | 已修：加"句中出现小写形式"判定 |
| **拼装打字区渲染两处** | 重复的 textarea | 已修：只在 type 模式渲染 |
| **导航塞了 20 个按钮** | 窄屏换行错位，会员按钮点不到 | 已修：6 个一级 + 「更多」分组；`go()` 切到二级页自动展开分组 |
| **`offlineTranslate()` 只认整句** | 传一段话进去返回空 | 它只查 `LZ_OFFTR` 的整句键；短语要先 `offlineWordHint()` 或走 `mtTo()` |
| **`dictEntry()` 依赖当前语言**（第二遍） | 打怪词书队列为空 | 直接查 `window.LIZ_DICT` |
| **GitHub secret scanning** | HANDOVER 里写明文 token 推送被 422 拦 | 任何 tracked 文件都不能出现 `ghp_` 开头的串 |

---

## 7. 测试方法

### 7.1 无头 Chrome（CDP 端口 9244）

```javascript
const l = await (await fetch('http://127.0.0.1:9244/json')).json();
const pg = l.find(t => t.type === 'page');
const ws = new WebSocket(pg.webSocketDebuggerUrl);
let id = 0; const p = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && p.has(m.id)) { p.get(m.id)(m); p.delete(m.id); } };
await new Promise(r => ws.onopen = r);
const send = (m, params = {}) => new Promise(r => { const i = ++id; p.set(i, r); ws.send(JSON.stringify({ id: i, method: m, params })); });
await send('Runtime.enable'); await send('Page.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
const ev = async (expr, ms = 60000) => {
  const pr = send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true, userGesture: true });
  const r = await Promise.race([pr, new Promise(res => setTimeout(() => res({ __t: 1 }), ms))]);
  return r.__t ? 'TIMEOUT' : r.result?.result?.value;
};
```

### 7.2 可用测试脚本（在 /tmp，重启会丢，可重建）

| 脚本 | 作用 |
|---|---|
| `/tmp/full16.mjs` | 16 语言 × 11 页面回归 |
| `/tmp/final_check.mjs` | 16 页面 + 价格 + 词卡 + 版式 + 设备类 |
| `/tmp/push_files.js` | API 推送 |
| `/tmp/mkicons.js` | 生成 PNG 图标 |

### 7.3 必查清单

- [ ] `node --check /tmp/inline0.js` 通过
- [ ] 16 页面逐页 `go(v)` 不报错
- [ ] JS 异常 0
- [ ] 网络 404 = 0
- [ ] 线上文件大小 == 本地文件大小
- [ ] 关键数值：价格 6 档、词书 9 本、拼装 word 模式、打怪队列 > 0

---

## 8. 用户需要做的事（只有用户能做的）

| # | 事项 | 费用 | 时间 |
|---|---|---|---|
| 1 | **注册智谱 GLM-4-Flash 拿 API Key** | ¥0 | 5 分钟 |
| 2 | 吊销泄露的 GitHub token 并重发 | ¥0 | 2 分钟 |
| 3 | 个体工商户 | ¥0 | 1–3 天 |
| 4 | 域名 + 服务器 | ~¥150/年 | 1 天 |
| 5 | ICP 备案 | ¥0 | 7–20 天 |
| 6 | 支付宝商户（open.alipay.com） | ¥0 | 1–3 天 |
| 7 | 微信支付商户（pay.weixin.qq.com） | ¥0 | 1–3 天 |
| 8 | 微信小程序注册 | ¥300/年 | 1 天 |
| 9 | 阿里云短信（发券用） | ¥0.045/条 | 1 天 |
| 10 | 软著（copyright.com.cn） | ¥0（自办） | 30 天 |
| 11 | 华为企业实名 | ¥0 | 1–3 天 |
| 12 | 把 Pages 从 "Deploy from a branch" 改成 "GitHub Actions" | ¥0 | 1 分钟 |

---

## 9. 下一个 AI 的建议顺序

```
第 1 步：先跑一遍测试确认现在没坏（第 7 节）
第 2 步：A6 生词复习三态筛选 → A3 朗读逐句高亮（小而快）
第 3 步：A1 三栏笔记 → A2 词根词族
第 4 步：用户给了 AI Key 就做 B1 与书对话 → B3 AI 陪读 → B2 原创连载
第 5 步：C1 跟读录音（浏览器 Web Speech API 免费）
第 6 步：E1 浏览器扩展（要用户有 Chrome 才能测）
第 7 步：A4 播客跟读 → A7 漫画 OCR
```

---

## 10. 用户沟通偏好（重要）

- 喜欢**表格**，不喜欢长篇文字
- 要**如实说限制**，不要粉饰
- 反复强调**不要抄袭不要侵权**
- 反复强调**不要跳到外部网站**
- 每次改完要**立即部署并验证线上**
- 会说"你上一轮没实现"，所以**每条需求都要明确标注状态**

---

## 11. 关键常量速查

```javascript
// 价格（前后端必须同步）
const PLAN_DEF = {
  lang:        { price:1500,  days:31,  scope:"one" },
  all_month:   { price:2900,  days:31,  scope:"all" },
  all_quarter: { price:8800,  days:93,  scope:"all" },
  all_year:    { price:19900, days:366, scope:"all" },
  permanent:   { price:29800, days:0,   scope:"all", quota:100 }
};

// 验证有效的激活码（测试用，上线前清掉 data/redemptions.json）
// 永久: wansuiwansuiwanwansui1313113
// 年卡: nulixuexiya2027
// 单语言月: lizzzhaohaoyon!!!
// 班级码: lzbb3h-5qdy-dek3

// Service Worker 缓存版本
'const CACHE = "lizzread_v28"'
```

---

**文档结束。有任何不确定的，先跑一遍第 7 节的测试，再动代码。**
