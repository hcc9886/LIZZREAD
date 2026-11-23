# PWA 上手指南（给用户看的，可直接发）

## iPhone / iPad 安装（Safari）

1. **必须用 Safari**（微信、QQ、钉钉内置浏览器不支持安装）
2. 打开 `https://hcc9886.github.io/LIZZREAD`
3. 点屏幕**底部中间**的「分享 ⬆️」按钮
4. 在菜单里往下滑，点 **「添加到主屏幕」**
5. 右上角点 **「添加」**

桌面会出现 LIZZREAD 图标。点开就是全屏，没有浏览器地址栏，和 App 一样。

> 装好后：**支持离线**（打开过的书和译文会缓存）、**有独立图标**、**不占双份存储**。

## Android 安装（Chrome / Edge / 华为浏览器）

1. 打开 `https://hcc9886.github.io/LIZZREAD`
2. 底部会自动弹出「把 LIZZREAD 装成 App」→ 点 **安装**
   （没弹窗就问：右上角 ⋮ 菜单 → 「安装应用」/「添加到主屏幕」）
3. 桌面出现图标

## 电脑安装（Chrome / Edge）

地址栏右侧会出现一个**安装图标 ⊕**，点一下就装成独立窗口的应用。

---

## 常见问题

**Q：iPhone 上为什么搜不到 App Store 版本？**
A：目前只做 PWA（免开发者年费）。功能和 App 版一致，且能离线用。

**Q：为什么翻译有时候慢/失败？**
A：网页版没有后端，翻译走浏览器直连的免费机翻接口，高峰期限流。
装 Android 版 APK 或部署后端后立刻变快。

**Q：能离线用吗？**
A：可以。打开过的书、译文、生词都会缓存；书卡标「📶 已内置全文」的 609 本可完全离线。

**Q：怎么更新？**
A：打开时自动检查，底部出现「🎉 有新版本可用 / 立即更新」，点一下即可。
也可以 设置 → 关于 → 🔄 检查更新。

**Q：数据会丢吗？**
A：所有数据（进度、生词、标记、会员）都存在你自己的设备上，不上传。
清理浏览器数据会清空，建议定期用「生词本 → 导出 JSON」备份。

---

## 部署到自己的域名（可选）

如果想让链接更好记（例如 `read.yourdomain.com`）：

```bash
cd /Users/hcc/Desktop/LIZZREAD
bash scripts/build-web.sh          # 生成 dist-web/
# 把 dist-web/ 整个目录上传到任意静态托管
```

支持：GitHub Pages、Vercel（`vercel deploy dist-web`）、Netlify（拖拽上传）、
Cloudflare Pages、阿里云 OSS + CDN、腾讯云 COS、Gitee Pages。

> 注意：必须完整保留目录结构（covers/ data/ books/ sentences/ 等），否则封面和书会 404。
