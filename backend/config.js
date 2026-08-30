const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

module.exports = {
  ROOT_DIR,
  PUBLIC_DIR: path.join(ROOT_DIR, 'public'),
  DATA_DIR: path.join(__dirname, 'data'), // ข้อมูลรันไทม์เป็นของ backend เอง — อยู่ใต้ backend/ ไม่ใช่ root
  PORT: process.env.PORT || 3000,

  MAX_HISTORY: +(process.env.MAX_HISTORY || 3000),  // เก็บล่าสุดกี่รายการ (กันไฟล์บวม)
  MAX_THUMB_LEN: 200000,                             // ความยาว data URL ของ thumbnail ที่ยอมให้เก็บ (~150KB)
  MAX_COMMITTEE: +(process.env.MAX_COMMITTEE || 5),  // จำนวนกรรมการสูงสุด
  MAX_WALL: +(process.env.MAX_WALL || 800),          // ดอกไม้ในพวงมาลัยรวมสูงสุด (จอพิธี)
  WALL_EMOJI: ['🌼', '🌸', '💮', '🏵️', '🌺', '🌻', '🌷', '🪷', '🌹', '💐', '✿', '❀'],

  DL_TTL: 90 * 1000,             // อายุ token ดาวน์โหลด
  WALL_ADD_COOLDOWN: 250,        // ms ระหว่างการเติมดอกไม้ของ socket เดียว
  WALL_ADD_PER_SOCKET: 80,       // เพดานจำนวนดอกต่อ 1 คน
  WALL_SEND_ALL_COOLDOWN: 8000,  // ms กันกดส่งพวงมาลัยรวมรัว ๆ
};
