# LIZZREAD 上架手册（App Store / Google Play）

## 0. 上架前必须知道的三件事

1. **阅读器本身合规**：全部书源为公版（Project Gutenberg / 青空文库，作者逝世超过 70 年），属公有领域，不需要授权。
2. **翻译与词典属于“服务”**：App 内点词/翻译需要后端。上架前请把 `server.js` 部署到一个 HTTPS 域名（见第 3 节），并在 App「个性化 → 后端连接」里填入该域名；否则 App 只能走浏览器直连机翻，审核期间可能因“功能不完整”被拒。
3. **会员与支付（最重要）**：App Store 审核指南 3.1.1 要求**数字内容订阅必须使用 App 内购买（IAP）**。当前网页版用激活码/外部链接收费，**直接在 App 里放外部支付链接会被拒**。两种合规做法：
   - A. App 内接入 StoreKit（推荐，见第 5 节），价格与网页版保持一致或略高（覆盖 30% 抽成）；
   - B. App 内**完全不展示任何购买入口**（隐藏会员页的按钮与激活码输入），只保留已购买用户的功能；网页端继续用现有支付，这是允许的（"reader" 类 App 可引导到网页账号，但不能在 App 内有购买链接）。
   - 现在的代码里，会员页按钮调用 `selectCheckout()`，要按下面第 5 节改成 IAP 或隐藏。

## 1. 账号与证书（一次性）

- Apple Developer Program：**$99/年**，个人或公司（公司需 D-U-N-S 号）。
- 在 App Store Connect 创建 App：
  - Bundle ID：`com.lizzread.app`（与 `capacitor.config.json` 的 `appId` 一致，**创建后不可改**）
  - 名称：`LIZZREAD`（已被占用就加后缀，如 `LIZZREAD 多语阅读`）
  - 主语言：简体中文；类别：教育（次要：图书）
  - 年龄分级：4+（无用户生成内容公开、无广告）
- 隐私清单（PrivacyInfo.xcprivacy）：
  - 收集数据：**不收集**（所有数据在本地）
  - 必须声明的原因 API：UserDefaults（`CA92.1`）、文件时间戳（`C617.1`）
  - `ios/App/App/PrivacyInfo.xcprivacy` 需新建，示例见第 4 节

## 2. 构建 iOS 包

```bash
# 需要完整 Xcode（App Store 版）+ CocoaPods
xcode-select -s /Applications/Xcode.app
sudo gem install cocoapods            # 或 brew install cocoapods

cd /Users/hcc/Desktop/LIZZREAD
./build-app.sh                        # 同步 www → cap sync
npx cap open ios                      # 打开 Xcode
```

Xcode 里：
1. Signing & Capabilities → Team 选你的开发者账号，勾选 Automatically manage signing
2. 版本号：`MARKETING_VERSION = 2.0.0`，`CURRENT_PROJECT_VERSION = 1`
3. 图标：把 `Assets.xcassets/AppIcon` 换成 1024×1024 无透明通道的 `icon-1024.png`（本仓库 `icon-512.png` 放大即可，需去掉圆角与 alpha）
4. Product → Archive → Distribute App → App Store Connect

命令行方式（CI）：

```bash
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Release -archivePath build/LIZZREAD.xcarchive archive
xcodebuild -exportArchive -archivePath build/LIZZREAD.xcarchive \
  -exportOptionsPlist ExportOptions.plist -exportPath build/
xcrun altool --upload-app -f build/LIZZREAD.ipa -t ios \
  --apiKey $ASC_KEY_ID --apiIssuer $ASC_ISSUER_ID
```

## 3. 部署后端（翻译 / 词典 / 青空文库）

App 依赖 `/api/translate`、`/api/word`、`/api/az`、`/api/redeem`。最小部署：

```bash
# 任意有公网 IP 的服务器（1C1G 足够）
scp -r server.js data books dicts sentences shared reader vendor index.html package.json user@server:/opt/lizzread/
ssh user@server 'cd /opt/lizzread && (node server.js 8080 >log 2>&1 &)'
# 前面挂 Nginx + Let's Encrypt 证书，暴露 https://api.lizzread.com/
```

然后在 App 里：个性化 → 后端连接 → 填 `https://api.lizzread.com`。

## 4. 需要补齐的合规文件

`ios/App/App/PrivacyInfo.xcprivacy`：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>NSPrivacyTracking</key><false/>
  <key>NSPrivacyTrackingDomains</key><array/>
  <key>NSPrivacyCollectedDataTypes</key><array/>
  <key>NSPrivacyAccessedAPITypes</key>
  <array>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryUserDefaults</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>CA92.1</string></array>
    </dict>
    <dict>
      <key>NSPrivacyAccessedAPIType</key>
      <string>NSPrivacyAccessedAPICategoryFileTimestamp</string>
      <key>NSPrivacyAccessedAPITypeReasons</key><array><string>C617.1</string></array>
    </dict>
  </array>
</dict>
</plist>
```

`Info.plist` 增加（可选，便于以后分享）：

```xml
<key>NSPhotoLibraryAddUsageDescription</key><string>保存学习证书与摘抄图片</string>
```

## 5. 会员：接入 App 内购买（三选一）

**推荐：StoreKit 2 + 三个订阅商品**

| 商品 ID | 类型 | 价格（Tier） | 对应网页方案 |
|---|---|---|---|
| `com.lizzread.one.month` | 自动续期订阅 | ¥12/月 | 单语言会员 |
| `com.lizzread.all.quarter` | 自动续期订阅 | ¥68/季 | 全语言季度（+13% 覆盖抽成） |
| `com.lizzread.all.year` | 自动续期订阅 | ¥198/年 | 全语言年度 |

改动点（我可以代做，需要你先在 App Store Connect 建好商品）：
1. 用 `@capacitor-community/in-app-purchases` 或自写 `StoreKit2` 插件
2. `selectCheckout()`：`window.__LIZZREAD_COMMERCE === "store"` 时走 IAP，否则保持现有激活码流程
3. 校验收据：本地校验 + 服务端 `/api/iap/verify` 二次校验（防越狱绕过）

**不想做内购**：在 `capacitor.config.json` 里加 `"commerce": "off"`，我会把 App 内的会员页按钮与激活码输入隐藏起来（只保留“已开通”状态查询），这样审核一定通过。

## 6. 审核常见被拒原因与本项目的对策

| 被拒理由 | 对策 |
|---|---|
| 3.1.1 数字内容用外部支付 | 见第 5 节 |
| 4.2 功能过于简单 | 本项目有 8 门语言书库、分级推荐、点词多语言释义、拼装、SRS 复习、报告导出，有明显功能深度 |
| 2.3.1 隐藏功能 | 不要用 `?admin=1` 之类隐藏入口；运营接口只开在 127.0.0.1 |
| 5.1.1 收集数据未声明 | 隐私清单声明“不收集”，且代码确实不采集个人数据 |
| 2.5.2 动态加载代码 | App 只加载包内 JS（语言数据与字典都在 `www/` 内），符合要求 |
| 内容版权 | 只收录作者去世 70 年以上的公版作品，并在“关于”页写明来源 |

## 7. Google Play（Android）

```bash
# 需要 Android Studio 或 SDK 命令行工具
export ANDROID_SDK_ROOT=~/Library/Android/sdk
cd android && ./gradlew bundleRelease
# 输出 app/build/outputs/bundle/release/app-release.aab → 上传 Play Console
```

- 首次上传需要签名密钥：`keytool -genkey -v -keystore lizzread.keystore -alias lizzread -keyalg RSA -keysize 2048 -validity 10000`
- Play 的数字商品抽成 15%/30%，同样需要接入 Play Billing 才能卖会员（规则与 App Store 类似）
- 数据安全表单：勾选“不收集数据”

## 8. 提审材料清单

- 截图：6.7"（1290×2796）与 6.5"（1242×2688），各 3–5 张；建议拍：书城（8 语言）、点词多语言释义、分级推荐、句子拼装、生词复习、学习报告
- 应用描述（4000 字符内）+ 关键词（100 字符）：`外语阅读,英语,德语,法语,日语,韩语,词典,分级阅读,公版书`
- 支持网址 + 隐私政策网址（必须可访问）：`https://lizzread.com/privacy`
- 审核备注：说明“全部内容为公版书籍，无需登录即可使用；翻译由第三方翻译 API 提供”
- 演示账号：无需（无登录墙）

## 9. 上架后的运营

- TestFlight 内测：先发给自己 + 5 位朋友，重点看：首次启动是否白屏、点词是否 1 秒内出结果、切语言是否生效
- 崩溃与性能：Xcode → Organizer → Crashes；关键指标是冷启动 < 2 秒、切语言 < 1.5 秒
- 版本节奏：每 2 周一个小版本（新书 / 新语言 / 修复），App Store 允许频繁更新且有利于排名
