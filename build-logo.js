/* 生成 LIZZREAD 品牌图标：极光绿底 + 两个尖尖的「＾＾」妙脆角眼睛 + L + 呆萌脸红 */
const fs = require('fs');

function logo({ size = 512, maskable = false }) {
  const pad = maskable ? size * 0.22 : size * 0.055;
  const inner = size - pad * 2;
  const cx = size / 2, cy = size / 2;

  const eyeY = cy - inner * 0.055;      // 眼睛中线
  const eyeDx = inner * 0.175;         // 两眼水平间距的一半
  const eyeW = inner * 0.28;           // 单只眼宽度
  const eyeH = inner * 0.125;           // 单只眼高度（越大越尖）
  const lw = inner * 0.072;            // 线宽

  const grad = `
  <defs>
    <radialGradient id="aur" cx="36%" cy="24%" r="86%">
      <stop offset="0%"  stop-color="#8CFFCF"/>
      <stop offset="38%" stop-color="#2ED695"/>
      <stop offset="100%" stop-color="#0A6247"/>
    </radialGradient>
    <linearGradient id="face" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="100%" stop-color="#E7FFF4"/>
    </linearGradient>
    <radialGradient id="blush" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#FF9FB8" stop-opacity=".75"/>
      <stop offset="100%" stop-color="#FF9FB8" stop-opacity="0"/>
    </radialGradient>
  </defs>`;

  const rect = maskable
    ? `<rect x="0" y="0" width="${size}" height="${size}" fill="url(#aur)"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.235}" fill="url(#aur)"/>`;

  /* 妙脆角：底边微弧 + 两条几乎笔直的斜边收成尖顶 */
  const cone = (dx) => {
    const x0 = cx + dx - eyeW / 2;     // 左下
    const x1 = cx + dx + eyeW / 2;     // 右下
    const yb = eyeY + eyeH * 0.52;     // 底边高度
    const yt = eyeY - eyeH;            // 尖顶
    return `M ${x0} ${yb}
            Q ${cx + dx - eyeW * 0.32} ${yb + eyeH * 0.34} ${cx + dx} ${yb + eyeH * 0.40}
            Q ${cx + dx + eyeW * 0.32} ${yb + eyeH * 0.34} ${x1} ${yb}
            L ${cx + dx + eyeW * 0.055} ${yt}
            Q ${cx + dx} ${yt - eyeH * 0.075} ${cx + dx - eyeW * 0.055} ${yt}
            Z`;
  };

  const eyes = `
    <path d="${cone(-eyeDx)}" fill="url(#face)"/>
    <path d="${cone(eyeDx)}"  fill="url(#face)"/>`;

  /* L：圆头折线，放在两眼下方正中 */
  const lTop = cy + inner * 0.155;
  const lH = inner * 0.195;
  const lW = inner * 0.185;
  const lX = cx - lW * 0.52;
  const L = `<path d="M ${lX} ${lTop} L ${lX} ${lTop + lH} L ${lX + lW} ${lTop + lH}"
               stroke="#F4FFFA" stroke-width="${lw}" fill="none"
               stroke-linecap="round" stroke-linejoin="round" opacity=".96"/>`;

  /* 呆萌：两颊腮红 */
  const blushes = `
    <ellipse cx="${cx - inner * 0.29}" cy="${cy + inner * 0.235}" rx="${inner * 0.095}" ry="${inner * 0.052}" fill="url(#blush)"/>
    <ellipse cx="${cx + inner * 0.29}" cy="${cy + inner * 0.235}" rx="${inner * 0.095}" ry="${inner * 0.052}" fill="url(#blush)"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${grad}
  ${rect}
  ${blushes}
  ${eyes}
  ${L}
</svg>`;
}

fs.writeFileSync('icon.svg', logo({ size: 512 }));
fs.writeFileSync('icon-maskable.svg', logo({ size: 512, maskable: true }));
console.log('icon.svg / icon-maskable.svg 已生成（尖角妙脆角 + 呆萌腮红 + L）');
