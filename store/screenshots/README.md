# App Store / Play 截图说明

这些图是用真实界面在 iPhone 尺寸下渲染的（无模拟数据），可直接用于提审。

## 文件与尺寸

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `01-library.png` | 1290×2796 | iPhone 6.7"（必填）— 书城 + 分级推荐 + 真实封面 |
| `02-word.png` | 1290×2796 | iPhone 6.7" — 点词弹窗（释义/翻译/生词） |
| `03-translate.png` | 1290×2796 | iPhone 6.7" — 整章翻译 |
| `04-assembly.png` | 1290×2796 | iPhone 6.7" — 句子意群拼装 |
| `05-vocab.png` | 1290×2796 | iPhone 6.7" — 生词本 |
| `06-plan.png` | 1290×2796 | iPhone 6.7" — 会员套餐 |
| `07-report.png` | 1290×2796 | iPhone 6.7" — 学习报告 |
| `08-langs.png` | 1290×2796 | iPhone 6.7" — 16 门语言切换 |
| `01b-library-65.png` | 1242×2688 | iPhone 6.5"（必填） |
| `02b-word-65.png` | 1242×2688 | iPhone 6.5" |
| `04b-assembly-65.png` | 1242×2688 | iPhone 6.5" |

App Store 要求：6.7" 至少 3 张、6.5" 至少 3 张。上面已满足。
Google Play：需要 2–8 张，尺寸 1080×1920 以上，直接用 6.7" 那组即可（Play 会自动缩放）。

## 重新生成

```bash
# 1. 起服务
node server.js 8765
# 2. 起无头 Chrome
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --remote-debugging-port=9244 --user-data-dir=/tmp/lz-shot about:blank &
# 3. 截图
node /tmp/shots.mjs
```

## 建议搭配的文案（App Store 描述用）

- 16 门语言，从一个界面读完世界经典
- 点一下，任何单词都有释义
- 整章翻译，断网也能看
- 打乱意群，把句子拼回去
- 19,000+ 张原版封面，离线可读
