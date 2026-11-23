# 现在就能上线的（不花 Apple 的钱）

## 一、三条零成本/低成本通道

| 通道 | 费用 | 上线时间 | 覆盖 | 更新方式 |
|---|---|---|---|---|
| **① PWA 网页版（最快）** | ¥0 | 今天 | iPhone + Android + 电脑，全平台 | 自动 |
| **② Android APK 侧载** | ¥0 | 今天 | 安卓用户（含华为） | 应用内一键更新 |
| **③ 华为 AppGallery** | ¥0（需企业实名+软著） | 1–3 天审核 + 软著 30 天 | 华为/荣耀 | 应用市场更新 |
| ④ Google Play | $25 一次性 | 审核 1–3 天 + 14 天测试 | 海外安卓 | 应用市场更新 |
| ⑤ Apple App Store | $99/年 | — | iPhone | 应用市场更新 |

**建议顺序：① → ② → ③ →（有收入后）⑤**

---

## 二、① PWA：今天就能给别人用

前提：代码已推到 GitHub。

1. 仓库 **Settings → Pages → Source** 选 **GitHub Actions**
2. push 一次，等 Actions 跑完
3. 得到链接：`https://hcc9886.github.io/LIZZREAD/`

**怎么装到手机**：
- **iPhone**：Safari 打开链接 → 底部「分享」→「添加到主屏幕」→ 桌面出现图标，全屏运行，和 App 几乎没区别
- **Android**：Chrome 打开 → 菜单「安装应用」/ 底部弹「安装」

**这是目前唯一不花钱就能在 iPhone 上用的方式**（详见第四部分）。

---

## 三、② Android APK：现在就能发

文件：[dist/LIZZREAD-2.0.0-debug.apk](dist/LIZZREAD-2.0.0-debug.apk)（107MB）

发送方式：微信文件传输 / 数据线 / 网盘 → 手机点开安装 → 允许「未知来源」

**更新机制（已实现）**：
- App 内「设置 → 关于 → 🔄 检查更新」
- 如果服务端 `/api/version` 的版本号更高，弹窗出现「下载安装包」
- 点击直接下载新 APK，覆盖安装，**书籍、生词、进度、会员全部保留**

前提：你得把这个 APK 放到能访问的地址。两种做法：
1. 部署后端（见 `store/DEPLOY-BACKEND.md`），把新 APK 放到 `download/LIZZREAD.apk`，`/download/LIZZREAD.apk` 自动可下载
2. 或者把 APK 传到任意网盘，把链接填进 `data/app-version.json` 的 `android.url`

---

## 四、④ 关于 iOS：TestFlight 也需要 $99

必须说清楚：**TestFlight 不是免费的**。它属于 Apple Developer Program 的功能，没有 $99 账号无法上传、无法分发。

所以「先做 TestFlight 版，等筹到钱再上架」这个折中方案**不成立**——TestFlight 和正式上架用的是同一个 $99 账号，区别只是不用等审核。

### 免费能在 iPhone 上用的三个办法

| 办法 | 做法 | 效果 | 限制 |
|---|---|---|---|
| **A. PWA 添加到主屏幕（推荐）** | Safari 打开网页 → 分享 → 添加到主屏幕 | 有图标、全屏、离线可读，和 App 几乎一样 | 不能卖内购（可用网页激活码） |
| **B. 个人免费签名（7 天）** | 需一台 Mac + Xcode + 免费 Apple ID，`xcodebuild` 签到自己手机 | 真 App | 只有你自己的设备，7 天过期要重签；你电脑装不了 Xcode → 不可行 |
| **C. 第三方企业签名** | 淘宝「TF 上架/企业签」几百元 | 能装 | **违反 Apple 条款，随时掉签，用户数据有风险，不建议** |

### 结论

**现在用 A（PWA）**。等有了收入，一次付 $99，用我已写好的 `codemagic.yaml` 云构建，
20 分钟就能出 TestFlight 包，不需要你装 Xcode。代码和配置**现在就是就绪的**，付钱当天就能上。

---

## 五、更新机制总览（三条通道都能更新）

| 载体 | 用户怎么拿到更新 | 你要做什么 |
|---|---|---|
| **PWA / 网页** | 打开时自动检测，底部出现「🎉 有新版本可用 / 立即更新」，点一下切换并刷新 | 改代码 → push → Actions 自动部署 |
| **Android 侧载 APK** | 设置 → 关于 → 🔄 检查更新 → 有新版本 → 点「下载安装包」覆盖安装 | 出新 APK 放到 `download/LIZZREAD.apk` |
| **应用市场（华为/Google/Apple）** | 商店自动更新 | 上传新版本（版本号 +1） |

### 版本号怎么改

```bash
# 打新版本
APPVER=2.0.1 ./build-app.sh
```
`build-app.sh` 会自动：
1. 把 `2.0.1` + 构建时间写进 `data/app-version.json` 和 `data/app-version.js`
2. 更新 www 供 Web/App 读取
3. 同步 `android/app/build.gradle` 的 versionName

Web 端还会同步更新 `sw.js` 的 `CACHE` 版本号（`lizzread_v26` → `v27`），触发所有用户拿到新版。

---

## 六、当前状态

- 代码：本地 10 个 commit 待推送
- APK：[dist/LIZZREAD-2.0.0-debug.apk](dist/LIZZREAD-2.0.0-debug.apk)
- 后端部署：`Dockerfile` / `render.yaml` / `fly.toml` 已就绪，见 `store/DEPLOY-BACKEND.md`
- iOS：`codemagic.yaml` 已就绪，付费当天可用
