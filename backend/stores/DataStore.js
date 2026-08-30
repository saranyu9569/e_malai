const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const { isData } = require('../utils/validate');

/**
 * ที่เก็บข้อมูลถาวรของแอป — ประวัติการส่ง (history), รายชื่อกรรมการที่ส่งแล้ว
 * (committeeDone), และพวงมาลัยรวม (wall) — ทั้งหมดอยู่ในไฟล์ data/history.json
 * เดียว (lowdb) บวกรูปย่อของนักศึกษาที่แยกเก็บเป็นไฟล์ใน data/thumbs/
 *
 * เขียนไฟล์แบบ async (debounce) เพื่อกัน fs.writeFileSync บล็อก event loop
 * ตอนไฟล์ history.json ใหญ่ขึ้นเรื่อย ๆ ระหว่างงาน (~100 คนออนไลน์พร้อมกัน)
 */
class DataStore {
  constructor({ dataDir, maxHistory, maxThumbLen }) {
    this.dataDir = dataDir;
    this.maxHistory = maxHistory;
    this.maxThumbLen = maxThumbLen;

    this.thumbDir = path.join(dataDir, 'thumbs');
    fs.mkdirSync(this.thumbDir, { recursive: true });

    this.historyFile = path.join(dataDir, 'history.json');
    this.db = low(new FileSync(this.historyFile));
    this.db.defaults({ history: [], committeeDone: [], wall: [] }).write();

    this._saveTimer = null;
    this._writing = false;
    this._writeAgain = false;

    const flush = () => { this.flushNow(); process.exit(0); };
    process.on('SIGINT', flush);
    process.on('SIGTERM', flush);
  }

  // ---------- เขียนไฟล์แบบ async (debounce) ----------
  _performWrite() {
    if (this._writing) { this._writeAgain = true; return; }
    this._writing = true;
    const json = JSON.stringify(this.db.getState(), null, 2);
    fs.writeFile(this.historyFile, json, (err) => {
      this._writing = false;
      if (err) console.error('บันทึกประวัติไม่สำเร็จ:', err.message);
      if (this._writeAgain) { this._writeAgain = false; this._performWrite(); }
    });
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      this._performWrite();
    }, 1500); // รวมการเขียนเป็นชุด อย่างมากทุก 1.5 วินาที
  }

  flushNow() {
    if (this._saveTimer) { clearTimeout(this._saveTimer); this._saveTimer = null; }
    try { this.db.write(); } catch (e) {}
  }

  // ---------- ประวัติการส่ง ----------
  addHistory(rec) {
    const arr = this.db.get('history').value();
    arr.push(rec);
    if (arr.length > this.maxHistory) {
      const evicted = arr.splice(0, arr.length - this.maxHistory);
      evicted.forEach((r) => this.deleteThumbFile(r.thumb));
    }
    this.scheduleSave();
  }

  historyForTeacher(name) {
    return this.db.get('history').value()
      .filter((r) => r.teacherName === name)
      .slice()
      .reverse(); // ทั้งหมด ใหม่สุดขึ้นก่อน
  }

  clearHistoryForTeacher(name) {
    const evicted = this.db.get('history').remove((r) => r.teacherName === name).value(); // .value() ไม่ใช่ .write() กัน sync write ทันที
    evicted.forEach((r) => this.deleteThumbFile(r.thumb));
    this.scheduleSave();
    return evicted.length;
  }

  historySize() {
    return this.db.get('history').size().value();
  }

  // ---------- กรรมการ ----------
  committeeAlreadySent(name) {
    return this.db.get('committeeDone').value().includes(name);
  }

  markCommitteeSent(name) {
    this.db.get('committeeDone').push(name).value();
    this.scheduleSave();
  }

  // ---------- พวงมาลัยรวม (จอพิธี /wall) ----------
  wallState() {
    return this.db.get('wall').value();
  }

  wallSize() {
    return this.db.get('wall').size().value();
  }

  pushWallFlower(flower, maxWall) {
    const arr = this.db.get('wall').value();
    arr.push(flower);
    if (arr.length > maxWall) arr.splice(0, arr.length - maxWall);
    this.scheduleSave();
  }

  // ---------- รูปย่อ (thumbnail) ของนักศึกษา — เก็บเป็นไฟล์แยกแทนฝัง data URL ----------
  // ใช้เฉพาะฝั่งนักศึกษา (send-garland) เพราะเป็น 1 แถวประวัติ : 1 ไฟล์ ลบตอน evict ได้ปลอดภัย
  // (ฝั่งกรรมการ/wall ส่งครั้งเดียวให้หลายอาจารย์พร้อมกัน = ไฟล์เดียวถูกอ้างจากหลายแถว จึงคงเก็บเป็น data URL)
  persistThumb(thumbImg) {
    if (!isData(thumbImg)) return thumbImg; // เป็น path อยู่แล้ว (พวงมาลัยพื้นฐาน) ไม่ต้องทำอะไร
    const m = /^data:image\/(png|jpeg|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/.exec(thumbImg);
    if (!m) return thumbImg;
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1] === 'svg+xml' ? 'svg' : m[1];
    const name = crypto.randomBytes(10).toString('hex') + '.' + ext;
    const buf = Buffer.from(m[2], 'base64');
    fs.writeFile(path.join(this.thumbDir, name), buf, (err) => {
      if (err) console.error('เซฟรูปย่อไม่สำเร็จ:', err.message);
    });
    return '/thumb/' + name;
  }

  deleteThumbFile(thumbRef) {
    if (typeof thumbRef !== 'string' || !thumbRef.startsWith('/thumb/')) return;
    const name = thumbRef.slice('/thumb/'.length);
    if (!/^[0-9a-f]{20}\.(png|jpe?g|webp|svg)$/.test(name)) return;
    fs.unlink(path.join(this.thumbDir, name), () => {}); // เงียบ ๆ พอไฟล์ไม่มีอยู่แล้วก็ไม่ error
  }
}

module.exports = DataStore;
