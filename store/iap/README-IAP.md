# 内购接入操作手册（15 分钟能配完）

## 0. 结构总览

```
用户点「购买」
   ↓
index.html: selectCheckout(plan) → 商店版 → iapPlugin()（Capacitor.Plugins.Purchases）
   ↓
RevenueCat SDK（或自写的 StoreKit2 桥）→ App Store 系统弹窗
   ↓
付款成功 → 客户端 applyStoreEntitlement() 立即解锁
   ↓
POST /api/iap/verify（服务端用 RevenueCat REST 再查一次，防改包）
```

网页版完全不受影响：`isStoreBuild()` 在浏览器里始终为 false，走原来的激活码/支付链接。

## 1. 商品 ID（必须与 index.html 的 IAP_PRODUCTS 完全一致）

| 商品 ID | 类型 | 建议价格 | 解锁内容 |
|---|---|---|---|
| `com.lizzread.all.month` | 自动续期订阅 | ¥38/月 | 全部 16 门语言不限量 |
| `com.lizzread.all.quarter` | 自动续期订阅 | ¥98/季 | 同上（覆盖 30% 抽成） |
| `com.lizzread.all.year` | 自动续期订阅 | ¥298/年 | 同上 |
| `com.lizzread.one.month` | 自动续期订阅 | ¥18/月 | 当前语言单语言 |

> App Store 抽成 30%（首年）/15%（第二年），所以 App 内定价比网页贵约 20%–30%，这不违反规则。

## 2. App Store Connect 配置步骤

1. App Store Connect → 你的 App → **App 内购买项目 / Subscriptions**
2. 先建一个 **订阅群组**（例如「LIZZREAD 会员」），同一群组内的套餐互斥升降级
3. 在群组里创建 4 个 **自动续期订阅**，商品 ID 用上表
4. 每个商品填：参考名称、本地化显示名（中/英）、描述、价格（中国区 ¥）、审核截图
5. 「审核信息」里需要一个**审核用的测试账号**：Settings → Users and Access → Sandbox → Testers，新建一个邮箱账号
6. 每个订阅的「App Store 推广」可忽略；「税务」信息必须填完，否则商品不可购买

## 3. 插件安装（二选一）

**方案 A：RevenueCat（推荐，跨 iOS/Android、自带收据校验与恢复）**

```bash
cd /Users/hcc/Desktop/LIZZREAD
npm i @revenuecat/purchases-capacitor --cache /tmp/npmcache
npx cap sync ios && npx cap sync android
```

然后在 `ios/App/App/AppDelegate.swift` 的 `application(_:didFinishLaunchingWithOptions:)` 里：

```swift
import RevenueCat
// 在 webView 初始化之后
Purchases.logLevel = .info
Purchases.configure(withAPIKey: "appl_xxxxxxxxxxxx")   // RevenueCat → Project settings → API keys
```

Android 同理在 `MainActivity.java` 的 `onCreate` 里调用 `Purchases.configure(...)`（Billing key 以 `goog_` 开头）。

最后在 RevenueCat 后台：
- Products 里把 4 个商品 ID 导入
- Entitlements 建一个 `all`（附上 3 个全语言商品）和 `one`（附 12 元商品）
- Offerings 建一个 `default`，把 4 个商品包进去
- 生成一个 **应用内用户 ID**（就是 `lz_iap_uid`，客户端已自动生成）

**方案 B：自写 StoreKit2 桥**

把 `store/iap/StoreKit.purchase.swift` 加入 `ios/App/App.xcodeproj`，按文件头部注释注入 `window.Capacitor.Plugins.Purchases`。
好处是不依赖第三方；坏处是要自己写收据校验（可以把 verify 交给 `/api/iap/verify`，但那个接口走的是 RevenueCat，需要改成直接调 App Store 的 `/verifyReceipt`）。

## 4. 服务端校验（可选但强烈建议）

```bash
# 在部署节点上设置环境变量后重启 server.js
export REVENUECAT_SECRET=sk_xxxxxxxxxxxx   # RevenueCat → Project settings → Secret keys
export REVENUECAT_APP_ID=app_xxxxxxxxxx
node server.js 8080
```

App 购买成功后会 `POST /api/iap/verify {appUserId, product}`，服务端向 RevenueCat 查询订阅状态：

- 返回 `{ok:true, entitlements:[...]}` → 客户端以后端有效期为准
- 未配置密钥 → 返回 `{ok:false, configured:false}`，客户端用本地票据（离线可用）

## 5. 测试

1. Xcode → Product → Scheme → Run → **StoreKit Configuration** 选 `store/iap/Products.storekit`（可直接用 Xcode 编辑器新建，填上表 4 个商品）
2. 真机用 **Sandbox 测试账号** 登录（设置 → App Store → 沙盒账户）
3. 走一遍：购买 → 解锁 → 杀掉 App 重开（应保持会员）→ 换机「恢复购买」
4. 审核前务必确认：**App 内任何地方都不出现外部支付链接或激活码输入框**

## 6. 常见被拒原因与对策

| 被拒 | 原因 | 对策 |
|---|---|---|
| 3.1.1 | App 内出现网页支付/激活码 | 已用 `isStoreBuild()` 全部隐藏 |
| 2.3.2 | 订阅条款缺失 | 购买页已放「隐私政策」链接，审核备注里写明「自动续订，可在 App Store 账户设置中取消」 |
| 3.1.2 | 恢复购买按钮缺失 | 已加「♻️ 恢复购买」（设置 → 关于） |
| 4.2 | 功能太单薄 | 16 门语言、分级推荐、拼装、SRS、报告 |

---

## 7. 多份订阅叠加规则（重要）

用户可能同时买「单语言 A」「单语言 B」「全语言」——**不能互相覆盖**。
代码里的权益模型（`lz_entitlements_v2`）是这样存的：

```json
{
  "all":  { "expires": 1798091506727, "permanent": false, "plan": "all_quarter", "sources": ["iap:com.lizzread.all.quarter"] },
  "one":  { "de": { "expires": ..., "plan": "lang", "sources": [...] },
            "ja": { "expires": ..., "plan": "lang", "sources": [...] } },
  "permanent": false
}
```

规则：

| 场景 | 结果 |
|---|---|
| 买两次同一语言月卡 | 取**最晚到期**，不叠加时长（避免刷漏洞） |
| 买单语言 A + 单语言 B | 两门都解锁，界面显示「Deutsch·31天 + 日本語·62天」 |
| 买单语言 A + 全语言 | 全部解锁；A 的单语言条目保留，到期后仍受全语言覆盖 |
| 买永久码 + 任意订阅 | 永久优先生效 |
| 旧版本只存一个 pro 对象 | 首次启动**自动迁移**成新结构，不丢权益 |

RevenueCat 侧：三个全语言商品挂同一个 entitlement `all`，单语言商品挂 `one`。
恢复购买时用 `customerInfo.entitlements.active`，把 `expirationDate` 传进 `applyStoreEntitlement()` 即可，
叠加逻辑由客户端统一处理——**不需要为每个商品单独写判断**。

服务端 `/api/iap/verify` 返回的 `entitlements` 数组同样会带上每份权益的到期时间，
客户端以「较晚的到期时间」为准，防篡改也防丢失。
