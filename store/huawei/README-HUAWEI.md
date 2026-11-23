# 华为 AppGallery（含鸿蒙）上架与支付

## 一、三条上架华为的路径

| 路径 | 适用 | 说明 |
|---|---|---|
| **A. AppGallery（Android APK）** | 绝大多数华为/荣耀手机 | 上传 `.app`/`.apk`，最简单，先做这个 |
| **B. 鸿蒙 HarmonyOS NEXT（原生）** | 纯血鸿蒙（无 AOSP） | 需要 ArkTS 重写或用 WebView 壳，工作量大 |
| **C. 华为快应用** | 轻量入口 | 不适合本项目（文件大、要离线阅读） |

**建议：先走 A**，覆盖 95% 以上华为用户；鸿蒙 NEXT 用户占比还小，可后续再投。

## 二、路线 A：AppGallery 上架步骤

### 1. 注册开发者

- 个人开发者：https://developer.huawei.com/consumer/cn/ → 注册 → 实名认证（身份证 + 人脸）
- 企业开发者：需要营业执照（分成比例与结算更快）
- **注意**：个人开发者**不能发布含“付费内容”的应用**（华为政策），要卖会员必须用企业开发者账号

### 2. 创建应用

1. https://developer.huawei.com/consumer/cn/service/josp/agc/index.html → 我的应用 → 新建应用
2. 包名填 **`com.lizzread.app`**（必须与 APK 一致，否则无法上传）
3. 选分类：教育 → 阅读
4. 上传图标（216×216）、截图（多种尺寸，华为要求 1080×1920 起）

### 3. 打包上传

```bash
cd /Users/hcc/Desktop/LIZZREAD
./store/upload-android.sh      # 产出 app-release.aab
```

> **华为要的是 `.app`（即 APK）而不是 AAB！**
> 从 `android/app/build/outputs/apk/release/` 拿 `app-release.apk` 上传。

签名必须是**正式 release keystore**（debug 签名会被拒）：

```bash
keytool -genkey -v -keystore android/app/lizzread.keystore \
  -alias lizzread -keyalg RSA -keysize 2048 -validity 10000
```

把签名写进 `android/app/build.gradle` 的 `signingConfigs.release`。

### 4. 上架审核

- 提交后一般 **1–3 个工作日**
- 华为审核比 Google 严格：必须能完整使用（不能要求登录才能用——我们本来就无需登录）
- 「应用权限说明」：只用了 INTERNET，如实填写

### 5. 华为分发渠道优化

- 在「分发信息」里勾选：华为应用市场、荣耀应用市场
- 上传「一键安装包」可提升下载转化

## 三、付费：华为支付（IAP Kit）

华为有自己的支付体系，和 Apple 一样**必须用华为 IAP**，不能引导外部支付。

### 代码侧现状

服务端已支持华为 IAP 的**服务端验证接口**（`/api/huawei/verify`，见下），客户端需要接：

1. 华为 AGC 后台 → 我的应用 → **API 管理** → 开通 IAP → 创建商品：
   - 商品 ID 与苹果保持一致：`com.lizzread.all.month` 等
   - 类型选「自动续期订阅」（Subscriptions）
2. Android 里接入 HMS Core：
   ```bash
   # 在 AppGallery Connect 下载 agconnect-services.json 放到 android/app/
   ```
   依赖（`android/app/build.gradle`）：
   ```gradle
   implementation 'com.huawei.hms:iap:6.13.0.300'
   ```
3. 客户端调用 `IapClient.createPurchaseIntent()` → 支付成功后把 `purchaseToken` 发给服务端
4. 服务端调华为验证接口：
   ```
   POST https://orders-dre.iap.hicloud.com/applications/purchases/tokens/verify
   Authorization: Basic base64(appId:appSecret)
   ```

### 为什么不能直接复用苹果的内购代码

华为没有 StoreKit，用的是 HMS IAP Kit。但**业务层完全一致**：
客户端 `iapPlugin()` 里加一个 HMS 分支，返回同样的 `{customerInfo:{entitlements:{active:{...}}}}` 结构，
`applyStoreEntitlement()` 不需要改。

我已在 `server.js` 里预留 `/api/huawei/verify` 接口（读 `HUAWEI_APP_ID`/`HUAWEI_APP_SECRET` 环境变量），
客户端插件接入后直接可用。

## 四、鸿蒙 HarmonyOS NEXT（路线 B）简述

纯血鸿蒙不再兼容 APK，需要：

1. DevEco Studio（Windows/macOS 均可，不需要特别高配置）
2. 用 ArkTS + Web 组件加载打包后的 `www/`（Capacitor 不支持鸿蒙，需要写一个 Web 壳）
3. 华为应用市场（鸿蒙版）单独提交，包名可与 Android 相同

**工作量估计**：3–5 人日（Web 壳 + 文件读写 + 内购 IAP Kit 鸿蒙版 + 上架审核）。
如果你确认要做，我可以先写出 ArkTS 壳工程骨架。

## 五、和苹果的对比表

| 项目 | Apple | 华为 |
|---|---|---|
| 开发者费用 | $99/年 | 免费（个人） |
| 审核时长 | 1–3 天 | 1–3 个工作日 |
| 抽成 | 30%（次年 15%） | 15%–30%（不含税的 30%，按档） |
| 个人能否卖会员 | 能 | **不能**（必须企业号） |
| 支付 SDK | StoreKit / RevenueCat | IAP Kit（HMS） |
| 装机来源 | App Store 唯一 | 华为市场 + 侧载 APK |
| 必须项 | 隐私清单、恢复购买 | 实名认证、软件著作权（软著）**必须** |

> ⚠️ 华为上架**必须提供软件著作权证书**（软著）。申请：中国版权保护中心
> https://www.ccopyright.com.cn/ ，线上登记，约 30 个工作日（可加急），需要源码前 30 页 + 后 30 页 + 说明书。
> 这是华为独有的硬门槛，请尽早启动。
