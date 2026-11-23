# 没有 Xcode 如何上架 iOS（云构建）

你的电脑装不了 Xcode（需要 macOS + 约 40GB 空间），但 **iOS 包完全可以在云端编译**。
下面三条路，按「省事程度」排序：

---

## 路线 A：Codemagic（推荐，有免费额度）

**为什么选它**：原生支持 Capacitor 项目，自带 macOS 构建机、App Store 上传、TestFlight 分发，
免费额度每月 500 分钟（1 个 iOS 包约 10–15 分钟，够发 30 次）。

### 一次性配置

1. 打开 https://codemagic.io/start/ ，用 **GitHub 账号登录**（前提：仓库已推送成功）
2. Add application → 选 `hcc9886/LIZZREAD` → 项目类型选 **Capacitor**
3. 在 Codemagic 里把仓库加入授权：Settings → Integrations → GitHub → 授权

### 上传签名证书（关键一步）

iOS 打包必须有 Apple 的签名证书。Codemagic 可以自动生成：

1. Codemagic → 你的 App → **Code signing identities**
2. 选 **iOS**，方式选 **Automatic**（Codemagic 会自动创建证书与描述文件）
3. 填你的 **Apple ID 邮箱**和 **App 专用密码**
   （App 专用密码生成：https://appleid.apple.com/ → 登录 → 安全 → App 专用密码 → 生成）
4. 保存后会生成 `Certificate` 与 `Provisioning profile`

### 添加构建配置

在仓库根目录建 `codemagic.yaml`（我已经写好了，见下），Codemagic 会自动识别。

### 触发构建

Codemagic 里点 **Start new build** → 选分支 `main` → 构建完成后：

- 产物里会有一个 `.ipa`
- 如果配置了 App Store Connect API Key，会自动上传到 TestFlight

### App Store Connect API Key（自动上传用）

1. https://appstoreconnect.apple.com/access/integrations/api → 生成一个 **Team Key**
2. 下载 `.p8` 文件（只能下一次），记下 **Issuer ID** 和 **Key ID**
3. 在 Codemagic → 你的 App → Environment variables 里加：
   - `APP_STORE_CONNECT_ISSUER_ID`
   - `APP_STORE_CONNECT_KEY_IDENTIFIER`
   - `APP_STORE_CONNECT_PRIVATE_KEY`（`.p8` 文件内容）

---

## 路线 B：GitHub Actions + macOS Runner

GitHub 对公开仓库免费提供 macOS 运行器。仓库里已放好 `.github/workflows/ios.yml`，
你只需在仓库 **Settings → Secrets** 里加：

| Secret 名 | 内容 |
|---|---|
| `APPLE_TEAM_ID` | 你的 Team ID（10 位，App Store Connect → 会员详细信息里看） |
| `BUILD_CERTIFICATE_BASE64` | `.p12` 证书的 base64（`base64 -i cert.p12 \| pbcopy`） |
| `P12_PASSWORD` | `.p12` 的密码 |
| `PROVISIONING_PROFILE_BASE64` | `.mobileprovision` 的 base64 |
| `KEYCHAIN_PASSWORD` | 随便设一个密码（临时钥匙串用） |
| `APP_STORE_CONNECT_API_KEY` | `.p8` 文件 base64 |

然后 Actions → iOS Release → Run workflow，产物在 Artifacts 里（`.ipa`），手动用 **Transporter.app** 上传到 App Store Connect。

> 证书和描述文件必须先在 Apple Developer 网站生成：
> https://developer.apple.com/account/resources/certificates/add
> （选 Apple Distribution）→ 上传 CSR（Mac 上用「钥匙串访问 → 证书助理 → 从证书颁发机构请求证书」生成）
> 描述文件：https://developer.apple.com/account/resources/profiles/add → 选 App Store 类型

---

## 路线 C：租一台 macOS 云主机（最灵活）

- MacinCloud https://www.macincloud.com/ （$30/月起，美国机房）
- MacStadium https://www.macstadium.com/
- 阿里云无影 macOS / 华为云 Mac 实例（国内机房，延迟低）

流程：远程桌面连上去 → 装 Xcode → 把仓库 clone 下来 → 双击运行 `store/upload-ios.sh`。

---

## 通用：上架前必须准备的 Apple 侧资料

| 项目 | 在哪填 | 说明 |
|---|---|---|
| App 名称 | App Store Connect → App 信息 | `LIZZREAD` |
| Bundle ID | 同上 | `com.lizzread.app`（固定，不可改） |
| 类别 | 同上 | 教育（次要：图书） |
| 年龄分级 | 同上 | 4+ |
| 隐私政策 | 同上 | 填你的 `privacy.html` 网址（可放 GitHub Pages） |
| 支持网址 | 同上 | 同上 |
| 截图 | 版本信息 | 6.7"（1290×2796）与 6.5"（1242×2688）各 3–5 张 |
| 图标 | App 图标 | 1024×1024，无透明通道 |
| 内购商品 | App 内购买项目 | 4 个订阅（见 store/iap/README-IAP.md） |
| 审核备注 | 提交时 | 写明：公版书籍、无账号、内购为自动续订 |

---

## 常见问题

**Q: 没 Mac 也能上架吗？**
能。Codemagic / GitHub Actions 的 macOS 运行器就是租来的 Mac。

**Q: 审核被拒「无法使用」怎么办？**
App 不能要求登录才能使用——我们本来就是无需登录，阅读与查词全部免费，符合要求。

**Q: 内购没配好会被拒吗？**
会（3.1.1）。所以必须先建好 4 个订阅商品，并在 App 内接好 RevenueCat。代码已写好，只需配置。

**Q: 多久能从零到上线？**
资料齐全的话：Codemagic 出包 20 分钟 + TestFlight 处理 15 分钟 + 审核 1–3 天。
