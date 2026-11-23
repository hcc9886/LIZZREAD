# 上架总清单（按顺序打勾）

## 阶段 0：代码与仓库（我做，你只需推一次）

- [x] 16 门语言书库、网址导入、翻译修复、内购代码、更新接口
- [x] `codemagic.yaml`（云端出 iOS 包）
- [x] `.github/workflows/pages.yml`（Web 版自动部署）
- [x] `.github/workflows/ios.yml`（GitHub Actions 出 iOS 包）
- [x] `.github/workflows/release-android.yml`（出 AAB/APK）
- [ ] **你执行一次 `git push`**（见根目录 `PUSH-COMMAND.md`）

## 阶段 1：账号（你，约 30 分钟 + 等待期）

| 事项 | 链接 | 费用 | 备注 |
|---|---|---|---|
| Apple Developer Program | https://developer.apple.com/programs/enroll/ | $99/年 | 个人可直接申请，1–2 天审核 |
| Google Play Console | https://play.google.com/console | $25 一次性 | 新账号有 14 天内测要求 |
| 华为开发者联盟 | https://developer.huawei.com/consumer/cn/ | 免费 | **要卖会员必须企业实名** |
| 软件著作权（华为必须） | https://www.ccopyright.com.cn/ | 免费–¥300 加急 | 30 工作日，尽早启动 |
| GitHub PAT（推送用） | https://github.com/settings/tokens/new | 免费 | 勾选 repo |

## 阶段 2：云端出包（我做，无需你的电脑装 Xcode）

- [ ] 仓库推送成功后，你登录 https://codemagic.io/start/ 用 GitHub 授权（一次点击）
- [ ] 我提供 `codemagic.yaml`，你只需在 Codemagic 里填 Apple ID + App 专用密码
- [ ] 构建 → 得到 `.ipa` → 自动进 TestFlight
- 备选：GitHub Actions → Actions → iOS Release → Run workflow（需先配 6 个 Secrets）

## 阶段 3：应用市场资料（你填，我提供文案和截图）

| 项目 | 内容 | 我是否已提供 |
|---|---|---|
| 应用名 | LIZZREAD | ✅ |
| 副标题 | 16 门语言经典阅读器 | ✅ |
| 描述（4000 字符） | — | 📝 待写（你说一声我就写） |
| 关键词 | 外语阅读,英语,德语,法语,日语,韩语,词典 | ✅ |
| 图标 1024×1024 | — | ✅ icon-512 可放大（需去透明通道） |
| 截图 | 6.7"/6.5" 各 3–5 张 | ⚠️ 需要真机截图（我可先用浏览器模拟生成草稿） |
| 隐私政策 | privacy.html | ✅ 需部署到网址 |
| 支持网址 | 同上 | ✅ |
| 年龄分级 | 4+ | ✅ |

## 阶段 4：内购（你配置，代码已就绪）

- [ ] App Store Connect 建 4 个订阅（ID 见 store/iap/README-IAP.md）
- [ ] RevenueCat 建项目 + 权益 + Offering
- [ ] `npm i @revenuecat/purchases-capacitor`
- [ ] AppDelegate 里 `Purchases.configure(withAPIKey:)`
- [ ] 部署服务端设 `REVENUECAT_SECRET`
- [ ] Sandbox 账号测试：购买 → 重开仍有会员 → 恢复购买
- [ ] 华为：AGC 建 IAP 商品 + `agconnect-services.json` + HMS IAP SDK

## 阶段 5：提审（你点按钮）

- [ ] iOS：TestFlight 内测通过 → 提交审核（1–3 天）
- [ ] Android：Play Console 上传 AAB → 内部测试 → 逐步发布
- [ ] 华为：上传 APK + 软著 → 审核（1–3 工作日）

## 阶段 6：上线后

- [ ] 开启 GitHub Pages（我做，所有人可访问的链接）
- [ ] 部署后端（`server.js`）到公网 HTTPS，App 里填地址
- [ ] 监控：`/api/metrics`、崩溃统计、下载量
