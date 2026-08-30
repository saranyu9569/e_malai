const fs = require('fs');
const path = require('path');

// สร้างไฟล์รูปพวงมาลัย (SVG) ลงใน public/assets
// รันด้วย:  node scripts/generate-garlands.js
// อยากใช้รูป PNG จริงของตัวเอง ให้วางไฟล์ชื่อ malai-1.png ... malai-6.png ไว้ใน public/assets
// แล้วแก้ตัวแปร GARLANDS / ฟังก์ชัน garlandSrc ใน public/app/core.js ให้ชี้ไปที่ .png
const outDir = path.join(__dirname, '..', 'public', 'assets');
fs.mkdirSync(outDir, { recursive: true });

const variants = [
  { file: 'malai-1', name: 'พวงมาลัยกุหลาบแดง', accent: '#c1272d', light: '#e0605f' },
  { file: 'malai-2', name: 'พวงมาลัยชมพู', accent: '#e0559b', light: '#f39ac6' },
  { file: 'malai-3', name: 'พวงมาลัยดาวเรือง', accent: '#f4a300', light: '#ffc954' },
  { file: 'malai-4', name: 'พวงมาลัยม่วง', accent: '#7d5ba6', light: '#a98fca' },
  { file: 'malai-5', name: 'พวงมาลัยส้ม', accent: '#e8622c', light: '#f59463' },
  { file: 'malai-6', name: 'พวงมาลัยทอง', accent: '#d9b64e', light: '#efd98c' },
];

// width/height ตั้งไว้ 4x ของ viewBox เพื่อให้ตอนแรสเตอร์ลง <canvas>/<img> คมขึ้น
const svg = (v) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 366" width="880" height="1464" role="img" aria-label="${v.name}">
  <defs>
    <radialGradient id="jb" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#fffef9"/>
      <stop offset="70%" stop-color="#f4f1e4"/>
      <stop offset="100%" stop-color="#e2ddc9"/>
    </radialGradient>
    <radialGradient id="ac" cx="35%" cy="30%" r="70%">
      <stop offset="0%" stop-color="${v.light}"/>
      <stop offset="100%" stop-color="${v.accent}"/>
    </radialGradient>
  </defs>

  <path d="M110,10 L110,32" stroke="#c9a24a" stroke-width="3" stroke-linecap="round"/>
  <circle cx="110" cy="10" r="5" fill="#c9a24a"/>

  <path d="M110,32 C58,32 44,94 44,162 C44,234 74,288 110,306 C146,288 176,234 176,162 C176,94 162,32 110,32 Z"
        fill="none" stroke="#6f9a53" stroke-width="16" stroke-linecap="round" opacity="0.30"/>
  <path d="M110,32 C58,32 44,94 44,162 C44,234 74,288 110,306 C146,288 176,234 176,162 C176,94 162,32 110,32 Z"
        fill="none" stroke="url(#jb)" stroke-width="15" stroke-linecap="round" stroke-dasharray="1.5 11"/>

  <path d="M110,250 C92,250 84,270 84,286 C84,300 96,312 110,318 C124,312 136,300 136,286 C136,270 128,250 110,250 Z"
        fill="none" stroke="url(#ac)" stroke-width="12" stroke-linecap="round" stroke-dasharray="1.5 9"/>

  <g transform="translate(110,182)">
    <g fill="url(#ac)">
      <ellipse cx="0" cy="-16" rx="11" ry="16"/>
      <ellipse cx="15" cy="-5" rx="11" ry="16" transform="rotate(72 15 -5)"/>
      <ellipse cx="9" cy="14" rx="11" ry="16" transform="rotate(144 9 14)"/>
      <ellipse cx="-9" cy="14" rx="11" ry="16" transform="rotate(216 -9 14)"/>
      <ellipse cx="-15" cy="-5" rx="11" ry="16" transform="rotate(288 -15 -5)"/>
    </g>
    <circle r="7" fill="#f4d06f"/>
  </g>

  <g stroke-linecap="round">
    <path d="M92,316 L88,348" stroke="url(#jb)" stroke-width="9" stroke-dasharray="1.5 9"/>
    <path d="M110,322 L110,356" stroke="url(#jb)" stroke-width="9" stroke-dasharray="1.5 9"/>
    <path d="M128,316 L132,348" stroke="url(#jb)" stroke-width="9" stroke-dasharray="1.5 9"/>
  </g>
  <g fill="url(#ac)">
    <circle cx="88" cy="350" r="7"/>
    <circle cx="110" cy="358" r="7"/>
    <circle cx="132" cy="350" r="7"/>
  </g>
</svg>
`;

for (const v of variants) {
  fs.writeFileSync(path.join(outDir, v.file + '.svg'), svg(v), 'utf8');
  console.log('wrote', v.file + '.svg');
}
