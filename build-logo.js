/* LIZZREAD 图标：黑底 + 墨绿
   = 两个倒 V（^）当妙脆角眼睛 + 一个 v 当嘴，三笔构成一张懵懵的小脸 */
const fs = require('fs');

function logo({ size = 512, maskable = false, wink = false }) {
  const pad = maskable ? size * 0.235 : size * 0.045;
  const inner = size - pad * 2;
  const cx = size / 2, cy = size / 2;
  const INK = "#4E9E76", INK_HI = "#6FC49A";
  const stroke = inner * 0.098;
  const eyeY  = cy - inner * 0.135;
  const eyeDx = inner * 0.215;
  const eyeW  = inner * 0.255;
  const eyeH  = inner * 0.135;
  const mouthY = cy + inner * 0.135;
  const mouthW = inner * 0.255;
  const mouthH = inner * 0.125;
  const rect = maskable
    ? `<rect x="0" y="0" width="${size}" height="${size}" fill="#0B0B0B"/>`
    : `<rect x="0" y="0" width="${size}" height="${size}" rx="${size * 0.235}" fill="#0B0B0B"/>`;
  const caret = (dx) => {
    const x0 = cx + dx - eyeW / 2, x1 = cx + dx + eyeW / 2;
    return `M ${x0} ${eyeY + eyeH} L ${cx + dx} ${eyeY} L ${x1} ${eyeY + eyeH}`;
  };
  const winkEye = (dx) => {
    const x0 = cx + dx - eyeW * 0.36, x1 = cx + dx + eyeW * 0.36;
    return `M ${x0} ${eyeY + eyeH * 0.55} L ${x1} ${eyeY + eyeH * 0.55}`;
  };
  const left  = `<path d="${caret(-eyeDx)}" stroke="url(#ink)" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const right = wink
    ? `<path d="${winkEye(eyeDx)}" stroke="url(#ink)" stroke-width="${stroke}" fill="none" stroke-linecap="round"/>`
    : `<path d="${caret(eyeDx)}"  stroke="url(#ink)" stroke-width="${stroke}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
  const mouth = `M ${cx - mouthW * 0.5} ${mouthY} L ${cx} ${mouthY + mouthH} L ${cx + mouthW * 0.5} ${mouthY}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <defs>
    <linearGradient id="ink" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${INK_HI}"/>
      <stop offset="100%" stop-color="${INK}"/>
    </linearGradient>
  </defs>
  ${rect}
  ${left}
  ${right}
  <path d="${mouth}" stroke="url(#ink)" stroke-width="${stroke * 0.86}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

fs.writeFileSync('icon.svg', logo({ size: 512 }));
fs.writeFileSync('icon-maskable.svg', logo({ size: 512, maskable: true }));
fs.writeFileSync('icon-wink.svg', logo({ size: 512, wink: true }));
console.log('icon.svg / icon-maskable.svg / icon-wink.svg 已生成（^^ + v 懵脸）');
