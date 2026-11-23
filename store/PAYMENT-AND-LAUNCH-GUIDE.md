# 付费接入 + 上架 全流程（照着做就行）

> 本文件是总纲。细节文档：iOS 上架 `store/CLOUD-BUILD-IOS.md`、内购 `store/iap/README-IAP.md`、
> 华为 `store/huawei/README-HUAWEI.md`、发版更新 `store/UPDATE-PLAYBOOK.md`。

---

# 第一部分：付费怎么接

## 0. 价格表（2026-11 新价，已写进代码）

| 商品 ID | 类型 | 网页版价格 | App 内价格（含商店抽成） | 解锁 |
|---|---|---|---|---|
| `com.lizzread.one.month` | 自动续期订阅 | ¥18/月 | ¥22/月 | 当前单语言不限量 |
| `com.lizzread.all.month` | 自动续期订阅 | ¥38/月 | ¥48/月 | 全部 16 门语言 |
| `com.lizzread.all.quarter` | 自动续期订阅 | ¥88/季 | ¥108/季 | 同上 |
| `com.lizzread.all.year` | 自动续期订阅 | ¥268/年 | ¥328/年 | 同上 |

> 为什么 App 内更贵：Apple/华为抽成 30%（次年 15%）。这是允许且常见的做法。
> 商品 ID 与 `index.html` 里的 `IAP_PRODUCTS` 一一对应，**不要改 ID**，只改价格。

## 1. 三条支付通道（互不干扰）

```
网页版  → 激活码 / 支付链接（PAYMENT_LINKS）
iOS    → StoreKit 内购（RevenueCat 封装）
华为    → HMS IAP Kit（AppGallery）
```

`isStoreBuild()` 会自动判断：浏览器里为 false，走网页版逻辑；打包成 App 为 true，
**自动隐藏全部激活码与外部支付入口**（Apple 3.1.1 / 华为政策硬性要求）。

## 2. iOS 内购：7 步配完

### 步骤 1｜创建订阅商品
1. 打开 https://appstoreconnect.apple.com → 我的 App → 选 LIZZREAD
2. 左侧 **App 内购买项目 → 订阅**
3. 先建 **订阅群组**：名称填「LIZZREAD 会员」（同一群组里选一个即互斥）
4. 在群组里新建 4 个 **自动续期订阅**，商品 ID 严格用上表
5. 每个商品填：参考名称 / 显示名称（中英）/ 描述 / 价格（中国区）→ 保存

### 步骤 2｜创建 Sandbox 测试账号
1. https://appstoreconnect.apple.com/access/users → **Sandbox → Testers → +**
2. 填一个**没注册过 Apple ID 的邮箱**、密码、中国区
3. 真机测试时：设置 → App Store → 沙盒账户 → 登录这个账号

### 步骤 3｜装 RevenueCat 插件
```bash
cd /Users/hcc/Desktop/LIZZREAD
npm i @revenuecat/purchases-capacitor --cache /tmp/npmcache
npx cap sync ios
```
> 我在能访问 npm 的机器上会直接帮你装；如果你自己装，命令如上。

### 步骤 4｜AppDelegate 里初始化（3 行）
编辑 `ios/App/App/AppDelegate.swift`，在 `application(_:didFinishLaunchingWithOptions:)` 里加：
```swift
import RevenueCat
Purchases.logLevel = .info
Purchases.configure(withAPIKey: "appl_你的公钥")   // RevenueCat → Project → API keys
```
（Android 同理在 `MainActivity.java` 的 `onCreate` 里 `Purchases.configure(withAPIKey: "goog_...")`）

### 步骤 5｜RevenueCat 后台配置
1. https://app.revenuecat.com → 新建 Project
2. **Products** → 导入 4 个商品 ID（iOS 用 App Store Connect 的 App-Specific Shared Secret 验证）
3. **Entitlements** → 建 `all`（挂 3 个全语言商品）和 `one`（挂单语言商品）
4. **Offerings** → 建 `default`，把 4 个商品都放进去
5. **API keys** → 复制 `appl_...`（公钥，给 App）和 `sk_...`（私钥，给服务端）

### 步骤 6｜服务端开校验
```bash
export REVENUECAT_SECRET=sk_你的私钥
export REVENUECAT_APP_ID=app_你的ID
node server.js 8080
```
App 购买成功后会 `POST /api/iap/verify`，服务端向 RevenueCat 再查一次。没配密钥时返回
`{ok:false, configured:false}`，客户端用本地票据（离线也能用，只是防不住改包）。

### 步骤 7｜本地测试（不用真机也能测）
1. Xcode 打开 `ios/App/App.xcworkspace`
2. Product → Scheme → Edit Scheme → Run → **StoreKit Configuration**
3. 选 `store/iap/Products.storekit.example.json`（重命名去掉 `.example`）
4. 运行 → 点会员 → 购买 → 应立刻解锁；杀进程重开仍为会员；点「恢复购买」能找回

---

## 3. 华为内购：5 步配完

### 步骤 1｜开发者账号
https://developer.huawei.com/consumer/cn/ → 注册 → **企业实名认证**
（个人账号不能发布付费内容；同时需要**软件著作权证书**，见第三部分）

### 步骤 2｜创建应用
AGC 控制台 → 我的应用 → 新建 → 包名 `com.lizzread.app` → 分类「教育-阅读」

### 步骤 3｜开通 IAP 并创建商品
我的应用 → **API 管理 → 开通「应用内支付服务 IAP」**
→ **产品运营 → 商品管理** → 新建 4 个**自动续期订阅**（商品 ID 与苹果一致）

### 步骤 4｜下载配置并接入 SDK
1. AGC → 我的应用 → **常规 → 应用信息 → agconnect-services.json** 下载
2. 放到 `android/app/agconnect-services.json`
3. `android/app/build.gradle` 的 `dependencies` 加：
   ```gradle
   implementation 'com.huawei.hms:iap:6.13.0.300'
   ```
4. 客户端调用 `IapClient.createPurchaseIntent()`，成功拿到 `purchaseToken`

### 步骤 5｜服务端验单（已实现）
`POST /api/huawei/verify {purchaseToken, productId}` → 服务端调华为验单接口。
部署时设置：
```bash
export HUAWEI_APP_ID=你的AppID
export HUAWEI_APP_SECRET=你的AppSecret   # AGC → 应用信息 → App information
```

---

## 4. 网页版付费（现状）

- 激活码：老师在会员页自助生成班级码；你手上有永久码/年度码（见 `REDEEM_CODES`）
- 正式支付：在 `PAYMENT_LINKS` 里填 Stripe/微信/支付宝的付款链接即可，`selectCheckout()` 会自动跳转

---

# 第二部分：上架怎么走（按平台）

## A. iOS（不需要 Mac，用云构建）

### 你必做的 4 件
| # | 事项 | 链接 | 费用 | 耗时 |
|---|---|---|---|---|
| 1 | Apple 开发者计划 | https://developer.apple.com/programs/enroll/ | $99/年 | 1–2 天审核 |
| 2 | 创建 App 记录 | https://appstoreconnect.apple.com → 我的 App → + | 免费 | 10 分钟 |
| 3 | 准备截图 | 6.7"（1290×2796）与 6.5"（1242×2688）各 3–5 张 | — | 30 分钟 |
| 4 | 隐私政策网址 | 用 GitHub Pages 上的 `privacy.html` | 免费 | 已就绪 |

创建 App 时填：
- Bundle ID：**`com.lizzread.app`**（固定不可改）
- 名称：**LIZZREAD**
- 主要语言：简体中文；类别：教育（次要：图书）
- 年龄分级：4+

### 云构建出包（Codemagic，不用装 Xcode）
1. https://codemagic.io/start/ → 用 GitHub 登录 → **Add your first app** → 选 `hcc9886/LIZZREAD` → 类型选 **Other**
2. 左侧 Settings → **Code signing identities → iOS → Automatic**：
   - Apple ID（邮箱）
   - App 专用密码（https://appleid.apple.com/ → 安全 → App 专用密码）
3. 生成 App Store Connect API Key：https://appstoreconnect.apple.com/access/integrations/api → **+** → 权限选 App Manager → 下载 `.p8`（只给一次）
4. Codemagic → Environment variables → 新建组 `appstore_credentials`，加三个变量：
   - `APP_STORE_CONNECT_PRIVATE_KEY`（`.p8` 全文，勾 Secret）
   - `APP_STORE_CONNECT_KEY_IDENTIFIER`（Key ID）
   - `APP_STORE_CONNECT_ISSUER_ID`（Issuer ID）
5. 回到项目页 → **Start new build** → 选 `main` + `LIZZREAD iOS Release`

构建完成 → Artifacts 里有 `.ipa`，并自动进 **TestFlight**。

### 提审
1. App Store Connect → TestFlight 装到手机自测（用 Sandbox 账号测内购）
2. 版本信息里填：描述、关键词（`外语阅读,英语,德语,法语,日语,韩语,词典,分级阅读,公版书`）、截图、隐私政策网址
3. 「App 内购买项目」里把 4 个订阅勾到本版本
4. 审核备注写：**本应用全部书籍为公有领域作品，无需登录；订阅为自动续订，可在 App Store 账户设置中取消**
5. 提交 → 审核 1–3 天

### 备选（Codemagic 卡住时）
- GitHub Actions：仓库 → Actions → **iOS Release** → Run workflow（需先在 Settings→Secrets 配 6 个值）
- 租云 Mac：https://www.macincloud.com/ （$30/月起）→ 远程桌面内跑 `./store/upload-ios.sh 你的TEAM_ID`

---

## B. Android（Google Play）

```bash
cd /Users/hcc/Desktop/LIZZREAD
./store/upload-android.sh        # 产出 app-release.aab
```
1. https://play.google.com/console 注册（$25 一次性）
2. 创建应用 → 包名 `com.lizzread.app`
3. 上传 `.aab` → 内部测试 → 正式版 → **逐步发布（先 10%）**
4. 首次提审需要 14 天封闭测试（Google 新账号政策）

**自测/朋友安装**：直接发 `dist/LIZZREAD-2.0.0-debug.apk`，支持覆盖安装。

---

## C. 华为 AppGallery

1. 企业实名 + **软件著作权**（必须！见下）
2. AGC 新建应用，包名 `com.lizzread.app`
3. 上传 **APK**（华为不认 AAB）：`android/app/build/outputs/apk/release/app-release.apk`
4. 签名必须 release keystore：
   ```bash
   keytool -genkey -v -keystore android/app/lizzread.keystore -alias lizzread -keyalg RSA -keysize 2048 -validity 10000
   ```
5. 审核 1–3 个工作日

**软件著作权**（华为独有门槛）：中国版权保护中心 https://www.ccopyright.com.cn/
需要：源码前 30 页 + 后 30 页 + 说明书 → 30 个工作日（可加急）→ **尽早启动**

**鸿蒙 HarmonyOS NEXT**：纯血鸿蒙不兼容 APK，需要 DevEco Studio 写 Web 壳重新适配（3–5 人日），
可先上 AppGallery 覆盖 95% 华为用户。

---

# 第三部分：总清单（谁做什么）

## 我做（已完成）
- [x] 16 门语言书库 + 19551 张封面本地化 + 新手分步引导
- [x] 多语言拼装句库（18 本 / 1463 句）
- [x] 内购代码（购买 / 恢复 / 启动同步 / 服务端校验）
- [x] 云构建配置 `codemagic.yaml`、GitHub Actions 三个 workflow
- [x] 更新接口 `/api/version`、检查更新按钮、发版手册

## 你做（按顺序）
| # | 事项 | 链接 | 费用 | 时长 |
|---|---|---|---|---|
| 1 | 推送代码 | 终端 `git push`（见 `PUSH-COMMAND.md`） | 0 | 1 分钟 |
| 2 | Apple 开发者申请 | https://developer.apple.com/programs/enroll/ | $99/年 | 1–2 天 |
| 3 | Codemagic 登录加应用 | https://codemagic.io/start/ | 免费额度够 | 2 分钟 |
| 4 | App Store Connect 建 App + 4 个订阅 | https://appstoreconnect.apple.com | 0 | 30 分钟 |
| 5 | RevenueCat 建项目 | https://app.revenuecat.com | 免费档够 | 20 分钟 |
| 6 | Google Play 注册 | https://play.google.com/console | $25 | 1 天 |
| 7 | 华为企业实名 | https://developer.huawei.com/consumer/cn/ | 免费 | 1–3 天 |
| 8 | 软件著作权 | https://www.ccopyright.com.cn/ | 0–300 | 30 天 |
| 9 | 截图（可用我提供的页面截图，或真机拍） | — | 0 | 30 分钟 |

## 每一步都能找我
你把错误截图或日志贴给我，我直接定位并改代码/配置。
