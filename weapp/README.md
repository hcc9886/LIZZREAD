# LIZZREAD 微信小程序（web-view 套壳）

## 3 分钟上手

1. **改两处**
   - `app.js` 里 `SITE` 改成你**已备案**的 HTTPS 域名（默认是 GitHub Pages）
   - `project.config.json` 里 `appid` 改成你的小程序 AppID

2. **必须做的事**（否则 web-view 白屏）
   - 小程序后台 → 开发 → 开发管理 → 开发设置 → **业务域名**
   - 添加 `SITE` 的域名，并把微信给的校验文件放到网站根目录

3. **导入**
   - 打开微信开发者工具 → 导入项目 → 选 `weapp/` 目录
   - AppID 填你的 → 确定

4. **预览 / 上传**
   - 点「预览」给自己扫码
   - 点「上传」→ 版本号 2.0.0 → 后台提交审核

## 已内置的功能

| 功能 | 说明 |
|---|---|
| 语言参数透传 | 分享卡片带 `?lang=xx`，打开即对应语言 |
| 分享好友 / 朋友圈 | `onShareAppMessage` / `onShareTimeline` |
| 网页 → 小程序消息 | `wx.miniProgram.postMessage({data:{type:'lang',value:'de'}})` |
| 加载失败提示 | 弹窗引导检查网络 |
| 语言记忆 | 上次选的语言写进 storage |

## 注意事项

- **iOS 端不能用微信支付卖会员**（微信 + Apple 双限制），请在小程序里只做免费阅读
- 网页里的「导入书籍」「网址导入」在小程序中不可用，已在 `index.html` 里按 UA 自动隐藏
- 业务域名每月只能改 3 次，改之前想清楚
