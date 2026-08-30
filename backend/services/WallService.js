const fs = require('fs');
const path = require('path');
const { cleanName, newId } = require('../utils/validate');

const ellipseP = (a, b) => {
  const h = Math.pow((a - b) / (a + b), 2);
  return Math.PI * (a + b) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
};
const fnv = (s) => {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
};

/**
 * พวงมาลัยรวม (จอพิธี /wall) — ตรรกะเติมดอกไม้ + ประกอบเป็น SVG + เตรียมส่งให้อาจารย์ทุกคน
 * สถานะจริงเก็บผ่าน DataStore (ไฟล์ data/history.json คีย์ 'wall' ไฟล์เดียวกับประวัติ)
 */
class WallService {
  constructor({ dataStore, dataDir, maxWall, wallEmoji, sendAllCooldown }) {
    this.dataStore = dataStore;
    this.dataDir = dataDir;
    this.maxWall = maxWall;
    this.wallEmoji = wallEmoji;
    this.sendAllCooldown = sendAllCooldown;
    this._lastSendAll = 0; // กันกดส่งรัว ๆ จากจอพิธี
  }

  state() {
    return this.dataStore.wallState();
  }

  cleanFlower(raw, fromName) {
    const r = raw || {};
    const e = this.wallEmoji.includes(r.e) ? r.e : this.wallEmoji[0];
    let hue = Math.round(+r.hue);
    if (!isFinite(hue)) hue = Math.floor(Math.random() * 360);
    hue = ((hue % 360) + 360) % 360;
    return { id: newId(), e, hue, name: cleanName(fromName).slice(0, 40), at: Date.now() };
  }

  addFlower(raw, fromName) {
    const flower = this.cleanFlower(raw, fromName);
    this.dataStore.pushWallFlower(flower, this.maxWall);
    return flower;
  }

  // ประกอบพวงมาลัยรวม (ดอกไม้จากนักศึกษาทุกคน) เป็น SVG — คืน { svg, src(dataURL) }
  // จัดเรียงแบบเดียวกับจอพิธี: อัดแน่นตามเส้นรอบวง + เพิ่มวงชั้นในเมื่อวงนอกเต็ม + อุบะที่ก้น
  buildSVG() {
    const list = this.state();
    if (!list.length) return null;
    const CW = 900, CH = 1180, cx = CW / 2, cy = CH * 0.46;
    const n = list.length;
    const A0 = 300, B0 = 335;
    const fontSize = Math.max(22, 58 - n / 5);
    const gap = Math.max(fontSize * 0.78, 24);

    let body = '';
    let placed = 0, rk = 0;
    while (placed < n && rk < 7) {
      const shrink = 1 - rk * 0.165;
      const A = A0 * shrink, B = B0 * shrink;
      const per = Math.max(6, Math.round(ellipseP(A, B) / gap));
      const take = Math.min(per, n - placed);
      const count = placed + take >= n && take < per ? take : per;
      const phase = (rk % 2) * 0.5;
      for (let i = 0; i < take; i++) {
        const th = ((i + phase) / count) * Math.PI * 2;
        const pinch = 1 - 0.13 * Math.cos(th);
        const jt = fnv((placed + i) + ':' + rk);
        const jx = ((jt & 15) - 7) * 1.1;
        const jy = (((jt >> 4) & 15) - 7) * 1.1;
        const rot = ((jt >> 8) & 63) - 31;
        const f = list[placed + i];
        body +=
          `<g transform="translate(${(cx + A * Math.sin(th) * pinch + jx).toFixed(1)} ${(cy - B * Math.cos(th) * pinch + jy).toFixed(1)}) rotate(${rot})" ` +
          `style="filter:hue-rotate(${f.hue}deg) saturate(1.2)">` +
          `<text text-anchor="middle" dominant-baseline="central" font-size="${fontSize.toFixed(0)}">${f.e}</text></g>`;
      }
      placed += take;
      rk++;
    }

    // อุบะ (พู่ห้อยก้นพวงมาลัย)
    let tass = '';
    if (n >= 6) {
      const nT = Math.min(9, 3 + Math.floor(n / 22));
      for (let k = 0; k < nT; k++) {
        const frac = nT === 1 ? 0.5 : k / (nT - 1);
        const ang = Math.PI + (frac - 0.5) * 0.9;
        const pnc = 1 - 0.13 * Math.cos(ang);
        const mid = Math.abs(frac - 0.5) * 2;
        const tx = cx + A0 * Math.sin(ang) * pnc;
        const ty = cy - B0 * Math.cos(ang) * pnc;
        const len = 120 - mid * 54;
        const hue = list[(k * 7) % n] ? list[(k * 7) % n].hue : (k * 40) % 360;
        tass +=
          `<line x1="${tx.toFixed(1)}" y1="${ty.toFixed(1)}" x2="${tx.toFixed(1)}" y2="${(ty + len).toFixed(1)}" stroke="#c9a24a" stroke-width="3"/>` +
          `<g transform="translate(${tx.toFixed(1)} ${(ty + len + 14).toFixed(1)})" style="filter:hue-rotate(${hue}deg) saturate(1.2)">` +
          `<text text-anchor="middle" dominant-baseline="central" font-size="34">❋</text></g>`;
      }
    }

    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CW} ${CH}" width="${CW}" height="${CH}">` +
      `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="120" fill="#c9a24a" font-family="serif">๛</text>` +
      `<text x="${cx}" y="${(cy + 200).toFixed(0)}" text-anchor="middle" font-size="38" fill="#7a1f2b" font-family="sans-serif">พวงมาลัยรวมน้ำใจศิษย์</text>` +
      tass + body + `</svg>`;
    return { svg, src: 'data:image/svg+xml;base64,' + Buffer.from(svg, 'utf8').toString('base64') };
  }

  canSendAll() {
    return !this._lastSendAll || Date.now() - this._lastSendAll >= this.sendAllCooldown;
  }

  // เรียกเมื่อผ่านทุกเงื่อนไขแล้วเท่านั้น (คูลดาวน์ + มีอาจารย์ออนไลน์) — ประกอบ SVG, บันทึกไฟล์,
  // แล้วค่อย mark คูลดาวน์ (เหมือนโค้ดเดิม: ตั้งเวลาคูลดาวน์ใหม่เฉพาะตอนส่งสำเร็จจริง)
  prepareSendAll() {
    const built = this.buildSVG();
    if (!built) return null;

    this._lastSendAll = Date.now();
    const { svg, src } = built;

    // บันทึกพวงมาลัยรวมเป็นไฟล์ SVG ก่อนส่ง (เก็บเป็นหลักฐาน/นำไปใช้ต่อ)
    let savedPath = '';
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      savedPath = path.join(this.dataDir, `wall-${stamp}.svg`);
      fs.writeFileSync(savedPath, svg, 'utf8');
      fs.writeFileSync(path.join(this.dataDir, 'wall-latest.svg'), svg, 'utf8');
    } catch (e) {
      console.error('บันทึกไฟล์พวงมาลัยรวมไม่สำเร็จ:', e.message);
    }

    return { svg, src, savedPath, flowerCount: this.state().length };
  }
}

module.exports = WallService;
