/* 生成 LIZZREAD 品牌图标：极光绿底 + 两个温和的「＾＾」眼睛 + L 字母 */
const fs = require('fs');

function logo({ size = 512, maskable = false, blink = false, bg = true }) {
  const pad = maskable ? size * 0.22 : size * 0.06;      // maskable 安全区
  const inner = size - pad * 2;
  const cx = size / 2, cy = size / 2;
  const eyeY = cy - inner * 0.13;
  const eyeDx = inner * 0.20;
  const eyeW = inner * 0.30;
  const lw = inner * 0.085;

  // 极光绿渐变
  const grad = bg ? `
  <defs>
    <radialGradient id="aur" cx="38%" cy="26%" r="82%">
      <stop offset="0%"  stop-color="#7CF7C4"/>
      <stop offset="42%" stop-color="#22C98A"/>
      <stop offset="100%" stop-color="#0B6E4F"/>
    </radialGradient>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#EAFFF6" stop-opacity=".95"/>
      <stop offset="100%" stop-color="#B8FFE2" stop-opacity=".75"/>
    </linearGradient>
  </defs>` : '';

  const rect = bg
    ? `<rect x="0" y="0" width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.225}" fill="url(#aur)"/>`
    : '';

  // 眼睛：温和的圆弧（＾＾）
  const eyePath = (dx) => {
    const x0 = cx + dx - eyeW / 2, x1 = cx + dx + eyeW / 2;
    return `M ${x0} ${eyeY + eyeW * 0.14} Q ${cx + dx} ${eyeY - eyeW * 0.26} ${x1} ${eyeY + eyeW * 0.14}`;
  };
  const eyes = blink
    ? `<path d="M ${cx - eyeDx - eyeW * 0.34} ${eyeY} Q ${cx - eyeDx - eyeW * 0.18} ${eyeY - eyeW * 0.16} ${cx - eyeDx} ${eyeY} Q ${cx - eyeDx + eyeW * 0.18} ${eyeY + eyeW * 0.16} ${cx - eyeDx + eyeW * 0.34} ${eyeY}"
          stroke="url(#glow)" stroke-width="${lw}" fill="none" stroke-linecap="round"/>
       <path d="M ${cx + eyeDx - eyeW * 0.34} ${eyeY} Q ${cx + eyeDx - eyeW * 0.18} ${eyeY - eyeW * 0.16} ${cx + eyeDx} ${eyeY} Q ${cx + eyeDx + eyeW * 0.18} ${eyeY + eyeW * 0.16} ${cx + eyeDx + eyeW * 0.34} ${eyeY}"
          stroke="url(#glow)" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`
    : `<path d="${eyePath(-eyeDx)}" stroke="url(#glow)" stroke-width="${lw}" fill="none" stroke-linecap="round"/>
       <path d="${eyePath(eyeDx)}" stroke="url(#glow)" stroke-width="${lw}" fill="none" stroke-linecap="round"/>`;

  // 字母 L：竖 + 横，圆头
  const lTop = cy + inner * 0.02;
  const lH = inner * 0.28;
  const lX = cx - inner * 0.13;
  const lW = inner * 0.26;
  const L = `<path d="M ${lX} ${lTop} L ${lX} ${lTop + lH} L ${lX + lW} ${lTop + lH}"
              stroke="#F3FFF9" stroke-width="${lw}" fill="none" stroke-linecap="round" stroke-linejoin="round" opacity=".94"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  ${grad}
  ${rect}
  <g>${eyes}${L}</g>
</svg>`;
}

fs.writeFileSync('icon.svg', logo({ size: 512 }));
fs.writeFileSync('icon-512.png.svg.tmp', '');
console.log('icon.svg 已生成（极光绿 + ＾＾ + L）');
