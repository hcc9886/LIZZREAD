# 更新与发布手册

三条独立的发布通道，互不影响：

| 通道 | 用户怎么拿到更新 | 你要做的事 |
|---|---|---|
| 网页版 (PWA) | 下次打开自动更新（Service Worker v25） | 推代码到 `main`，GitHub Actions 自动部署 |
| Android (Play) | 应用商店自动更新 | `./build-app.sh` → 上传 AAB → Play Console 滚动发布 |
| iOS (App Store) | App Store 自动更新 | Xcode Archive → 上传 → TestFlight → 提审 |

---

## 1. Web 版：推到 main 即上线

`.github/workflows/pages.yml` 已配置：push 到 `main` 会自动把网站发布到 GitHub Pages。

首次启用：
1. 仓库 Settings → **Pages** → Source 选 **GitHub Actions**
2. push 一次，Actions 里会看到 "Deploy web app to GitHub Pages" 跑完
3. 网址：`https://hcc9886.github.io/LIZZREAD/`（这就是给所有人的链接）

**每次改完代码**（版本号在 `sw.js` 的 `CACHE`）：
```bash
cd /Users/hcc/Desktop/LIZZREAD
sed -i '' 's/lizzread_v25/lizzread_v26/' sw.js     # 每次发版 +1
rsync -a --delete ... ./ www/                      # build-app.sh 会做
./build-app.sh
git add -A && git commit -m "feat: xxx" && git push
```
用户下次打开自动拿到新版本（Service Worker 生效后刷新一次）。

---

## 2. Android：出包 → 上传 → 滚动发布

### 2.1 一次性准备（正式签名，之后复用）

```bash
cd /Users/hcc/Desktop/LIZZREAD
keytool -genkey -v -keystore android/app/lizzread.keystore \
  -alias lizzread -keyalg RSA -keysize 2048 -validity 10000
# 记住 keystore 密码与 alias 密码（丢了就无法更新，只能换包名重新上架）
```

把签名配置写进 `android/app/build.gradle`（`android { signingConfigs { release { ... } } }`），
或直接用 `store/upload-android.sh`（脚本里会提示）。

### 2.2 出包

```bash
./store/upload-android.sh          # 产出 app-release.aab（上架用）+ APK（测试用）
```
版本号在 `android/app/build.gradle`：每次上架**必须** `versionCode` +1（现在是 20000），`versionName` 改成 2.0.1 / 2.1.0。

### 2.3 上传 Play Console

1. Play Console → 你的应用 → 正式版 → **创建新版本**
2. 上传 `.aab`，填写「版本说明」
3. 发布轨道选 **逐步发布**（先 10% → 观察崩溃率 → 100%）
4. 审核一般 1–3 天

### 2.4 不想走商店（自测/朋友安装）

直接把 `dist/LIZZREAD-2.0.0-debug.apk` 发给他们安装即可，支持覆盖安装（同签名）。

### 2.5 GitHub Actions 自动打包（可选）

`.github/workflows/release-android.yml` 已写好：在仓库 Secrets 里配置
`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`，
之后打 `v2.0.1` 这样的 tag，会自动产出 AAB + APK 并挂在 Actions 产物里。

---

## 3. iOS：Archive → TestFlight → 提审

### 3.1 前置（一次性）

- 安装完整 **Xcode**（App Store，约 12GB）+ `sudo gem install cocoapods`
- `xcode-select -s /Applications/Xcode.app`
- Apple Developer Program 会员（$99/年），在 Xcode → Settings → Accounts 登录

### 3.2 每次发版

```bash
cd /Users/hcc/Desktop/LIZZREAD
./build-app.sh                       # 同步网页资源 + cap sync
./store/upload-ios.sh YOUR_TEAM_ID   # 归档 + 导出 + 上传
```
脚本做的事：
1. `capacitor sync ios`
2. `xcodebuild archive`（自动签名，需 `-allowProvisioningUpdates`）
3. `xcodebuild -exportArchive`（用 `store/ExportOptions.plist`）
4. `xcrun altool --upload-app`

也可以手动：Xcode → 打开 `ios/App/App.xcworkspace` → 改 `MARKETING_VERSION`（现在是 2.0.0）/`CURRENT_PROJECT_VERSION`（20000，每次 +1）→ Product → Archive → Distribute App。

### 3.3 TestFlight 与提审

1. 上传后 5–15 分钟在 App Store Connect → TestFlight 出现构建
2. 加内部测试员（最多 100 人）→ 装 TestFlight 邀请
3. 测试通过后 → 「提交审核」，填写：版本说明、支持网址、隐私政策网址（已备好 `privacy.html`）、审核备注
4. 首版审核 1–3 天；更新版通常 1 天内

### 3.4 提审前自查清单

- [ ] `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` 已递增
- [ ] 版本说明写清楚改了什么
- [ ] 截图更新（如界面有变化）：6.7"、6.5" 各 3–5 张
- [ ] 内购商品状态是「准备提交」并已附在本次版本里
- [ ] App 内无外部支付链接、无激活码输入框（`isStoreBuild()` 已保证）
- [ ] 「恢复购买」按钮可用
- [ ] 隐私政策网址可访问
- [ ] 用 Sandbox 账号走通：购买 → 杀进程重开仍有会员 → 恢复购买

---

## 4. 版本号规则（建议）

| 场景 | Android | iOS | Web |
|---|---|---|---|
| 修 bug | versionCode +1，versionName 2.0.1 | build +1，marketing 2.0.1 | 无，SW 缓存号 +1 |
| 加功能 | versionCode +1，versionName 2.1.0 | build +1，2.1.0 | 无 |
| 大改版 | versionName 3.0.0 | 3.0.0 | 无 |

App 内「设置 → 关于 → 🔄 检查更新」会请求 `/api/version`，
如果服务端返回的 `latest` 比当前新，会弹窗引导去商店更新（强制升级用 `min` 字段）。

---

## 5. 回滚

- **Web**：`git revert` 后 push；或 Actions 里重跑旧的 deployment
- **Android**：Play Console → 发布 → 「停止发布」并回滚到上一个版本（AAB 保留历史）
- **iOS**：App Store Connect → 「从销售中移除」该版本，再提交上一个版本的构建；已安装的用户不会被自动降级

---

## 6. 每次发版的最小 checklist

```
[ ] 本地跑一遍：node /tmp/full16.mjs（16 语言 11 页面全绿）
[ ] ./build-app.sh（APK 产出）
[ ] sw.js 缓存号 +1
[ ] git commit && git push（Pages 自动上线）
[ ] Android：versionCode+1 → upload-android.sh → Play Console
[ ] iOS：CURRENT_PROJECT_VERSION+1 → upload-ios.sh → TestFlight → 提审
```
