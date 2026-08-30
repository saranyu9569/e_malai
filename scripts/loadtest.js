/*
 * ทดสอบโหลด E-malai
 *
 *   node scripts/loadtest.js
 *   TEACHERS=50 STUDENTS=500 ROUNDS=1 node scripts/loadtest.js
 *   URL=https://xxxx.trycloudflare.com node scripts/loadtest.js   (ทดสอบผ่าน tunnel จริง)
 *
 * ต้องเปิด `npm start` ไว้ก่อนอีกหน้าต่างหนึ่ง
 *
 * ตัวแปรที่ปรับได้ (env):
 *   URL        ปลายทาง (ค่าเริ่มต้น http://localhost:3000)
 *   TEACHERS   จำนวนอาจารย์จำลอง        (50)
 *   STUDENTS   จำนวนนักศึกษาจำลอง       (500)
 *   ROUNDS     นักศึกษาแต่ละคนส่งกี่ครั้ง (1)
 *   RAMP       ทยอยเปิดคอนเนกชันภายในกี่ ms (8000)
 *   SENDWIN    กระจายการส่งภายในกี่ ms  (12000)
 *   DRAIN      รอเก็บผลหลังส่งเสร็จกี่ ms (6000)
 *   PNG_RATIO  สัดส่วนที่ส่งเป็นรูปอัปโหลด (0.15)
 */
const http = require('http');
const https = require('https');
const { io } = require('socket.io-client');

const URL = process.env.URL || 'http://localhost:3000';
const T = +(process.env.TEACHERS || 50);
const S = +(process.env.STUDENTS || 500);
const ROUNDS = +(process.env.ROUNDS || 1);
const RAMP = +(process.env.RAMP || 8000);
const SENDWIN = +(process.env.SENDWIN || 12000);
const DRAIN = +(process.env.DRAIN || 6000);
const PNG_RATIO = +(process.env.PNG_RATIO || 0.15);
const PNG_KB = +(process.env.PNG_KB || 250); // ขนาดรูปอัปโหลดจำลอง (โดยประมาณ) ต่อรูป

const BUILTINS = [1, 2, 3, 4, 5, 6].map((n) => `assets/malai-${n}.svg`);
// จำลอง data URL ของรูปที่อัปโหลด ~PNG_KB KB (เนื้อในเป็นข้อมูลสุ่ม เซิร์ฟเวอร์เช็คแค่ส่วนหัว)
const BIG_PNG =
  'data:image/png;base64,' +
  Buffer.from(require('crypto').randomBytes(Math.max(1, Math.round((PNG_KB * 1024 * 3) / 4)))).toString('base64');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => Date.now();

function stat(arr, p) {
  if (!arr.length) return null;
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
}
function summ(arr) {
  if (!arr.length) return 'ไม่มีข้อมูล';
  const avg = arr.reduce((s, x) => s + x, 0) / arr.length;
  return `avg ${avg.toFixed(0)}  p50 ${stat(arr, 50)}  p95 ${stat(arr, 95)}  p99 ${stat(arr, 99)}  max ${stat(arr, 100)}  (n=${arr.length})`;
}

const M = {
  tConn: 0, tErr: 0, sConn: 0, sErr: 0,
  sends: 0, ok: 0, failed: 0, failReasons: {},
  recv: 0, srvToTeacher: [], ackRtt: [],
  disconnects: 0, connErrors: {},
};

function fetchStats() {
  return new Promise((res) => {
    const lib = URL.startsWith('https') ? https : http;
    const req = lib.get(URL.replace(/\/$/, '') + '/stats', (r) => {
      let b = '';
      r.on('data', (d) => (b += d));
      r.on('end', () => { try { res(JSON.parse(b)); } catch { res(null); } });
    });
    req.on('error', () => res(null));
    req.setTimeout(4000, () => { req.destroy(); res(null); });
  });
}

function newSocket() {
  return io(URL, {
    transports: ['websocket'],
    reconnection: false,
    timeout: 20000,
    rejectUnauthorized: false,
  });
}

function makeTeacher(i) {
  return new Promise((resolve) => {
    const s = newSocket();
    let done = false;
    s.on('connect', () => {
      M.tConn++;
      s.emit('register', { role: 'teacher', name: `ทดสอบ อาจารย์${i}` });
      if (!done) { done = true; resolve(s); }
    });
    s.on('connect_error', (e) => {
      M.tErr++;
      M.connErrors[e.message] = (M.connErrors[e.message] || 0) + 1;
      if (!done) { done = true; resolve(null); }
    });
    s.on('disconnect', () => M.disconnects++);
    s.on('receive-garland', (d) => {
      M.recv++;
      if (d && typeof d.at === 'number') M.srvToTeacher.push(now() - d.at);
    });
  });
}

function makeStudent(i) {
  return new Promise((resolve) => {
    const s = newSocket();
    s._teachers = [];
    s._pending = [];
    let done = false;
    s.on('connect', () => {
      M.sConn++;
      s.emit('register', { role: 'student', name: `ทดสอบ นศ${i}` });
      if (!done) { done = true; resolve(s); }
    });
    s.on('connect_error', (e) => {
      M.sErr++;
      M.connErrors[e.message] = (M.connErrors[e.message] || 0) + 1;
      if (!done) { done = true; resolve(null); }
    });
    s.on('disconnect', () => M.disconnects++);
    s.on('teachers', (list) => { s._teachers = list || []; });
    s.on('send-ok', () => {
      M.ok++;
      const t0 = s._pending.shift();
      if (t0 != null) M.ackRtt.push(now() - t0);
    });
    s.on('send-failed', (d) => {
      M.failed++;
      const r = (d && d.reason) || '(ไม่ระบุ)';
      M.failReasons[r] = (M.failReasons[r] || 0) + 1;
      s._pending.shift();
    });
  });
}

async function ramp(n, factory) {
  const gap = n > 0 ? RAMP / n : 0;
  const pending = [];
  for (let i = 0; i < n; i++) {
    pending.push(factory(i));
    await sleep(gap);
  }
  return (await Promise.all(pending)).filter(Boolean);
}

function sendOne(stu) {
  const list = stu._teachers;
  if (!list || !list.length) {
    M.failed++;
    M.failReasons['นักศึกษายังไม่เห็นรายชื่ออาจารย์'] =
      (M.failReasons['นักศึกษายังไม่เห็นรายชื่ออาจารย์'] || 0) + 1;
    return;
  }
  const t = list[(Math.random() * list.length) | 0];
  const src = Math.random() < PNG_RATIO ? BIG_PNG : BUILTINS[(Math.random() * BUILTINS.length) | 0];
  M.sends++;
  stu._pending.push(now());
  stu.emit('send-garland', { toTeacherId: t.id, src });
}

(async function main() {
  console.log(`\n=== E-malai load test ===`);
  console.log(`ปลายทาง : ${URL}`);
  console.log(`เป้าหมาย : อาจารย์ ${T} คน, นักศึกษา ${S} คน, ส่งคนละ ${ROUNDS} ครั้ง (รวม ${S * ROUNDS} การส่ง)`);
  console.log(`รูปอัปโหลดจำลอง : ${(BIG_PNG.length / 1024).toFixed(0)} KB/รูป, สัดส่วน ${(PNG_RATIO * 100).toFixed(0)}%\n`);

  const before = await fetchStats();

  const t0 = now();
  console.log('• เปิดคอนเนกชันอาจารย์…');
  const teachers = await ramp(T, makeTeacher);
  await sleep(1500);

  console.log('• เปิดคอนเนกชันนักศึกษา…');
  const students = await ramp(S, makeStudent);

  // รอให้รายชื่ออาจารย์กระจายถึงนักศึกษา
  console.log('• รอรายชื่ออาจารย์กระจาย…');
  let waited = 0;
  while (waited < 8000) {
    const seen = students.filter((s) => s._teachers.length > 0).length;
    if (students.length && seen === students.length) break;
    await sleep(500);
    waited += 500;
  }
  const seenCounts = students.map((s) => s._teachers.length);
  const avgSeen = seenCounts.reduce((a, b) => a + b, 0) / (seenCounts.length || 1);
  const zeroSeen = seenCounts.filter((x) => x === 0).length;

  console.log(`• เริ่มยิงการส่ง (กระจายภายใน ${SENDWIN} ms)…`);
  const connectMs = now() - t0;
  const total = students.length * ROUNDS;
  for (let k = 0; k < total; k++) {
    const stu = students[k % students.length];
    setTimeout(() => sendOne(stu), Math.random() * SENDWIN);
  }

  await sleep(SENDWIN + DRAIN);

  const after = await fetchStats();

  // ---------- รายงาน ----------
  const line = '─'.repeat(60);
  console.log(`\n${line}\nสรุปผล\n${line}`);
  console.log(`เวลาเปิดคอนเนกชันทั้งหมด : ${(connectMs / 1000).toFixed(1)} s`);
  console.log(`อาจารย์เชื่อมต่อสำเร็จ    : ${M.tConn}/${T}  (ล้มเหลว ${M.tErr})`);
  console.log(`นักศึกษาเชื่อมต่อสำเร็จ   : ${M.sConn}/${S}  (ล้มเหลว ${M.sErr})`);
  console.log(`หลุดกลางทาง (disconnect) : ${M.disconnects}`);
  console.log(`รายชื่ออาจารย์ที่นักศึกษาเห็น : เฉลี่ย ${avgSeen.toFixed(1)}/${M.tConn}  (เห็น 0 คน: ${zeroSeen} ราย)`);
  console.log(`\nการส่งพวงมาลัย`);
  console.log(`  พยายามส่ง      : ${M.sends}`);
  console.log(`  สำเร็จ (send-ok): ${M.ok}`);
  console.log(`  ล้มเหลว        : ${M.failed}`);
  if (Object.keys(M.failReasons).length) {
    for (const [r, c] of Object.entries(M.failReasons)) console.log(`     - ${r}: ${c}`);
  }
  console.log(`\nการรับที่ฝั่งอาจารย์`);
  const deliv = M.ok ? ((M.recv / M.ok) * 100).toFixed(1) : '—';
  console.log(`  ได้รับจริง (receive-garland): ${M.recv}`);
  console.log(`  อัตราส่งถึง = รับ/สำเร็จ    : ${deliv}%`);
  console.log(`\nดีเลย์ (ms)`);
  console.log(`  student → server → student (ack) : ${summ(M.ackRtt)}`);
  console.log(`  server → teacher (เด้งขึ้นจอ)    : ${summ(M.srvToTeacher)}`);
  if (Object.keys(M.connErrors).length) {
    console.log(`\nข้อผิดพลาดคอนเนกชัน`);
    for (const [e, c] of Object.entries(M.connErrors)) console.log(`  - ${e}: ${c}`);
  }
  if (before || after) {
    console.log(`\nหน่วยความจำเซิร์ฟเวอร์ (/stats)`);
    if (before) console.log(`  ก่อน : rss ${before.rssMB} MB, heap ${before.heapUsedMB} MB, sockets ${before.sockets}`);
    if (after) console.log(`  หลัง : rss ${after.rssMB} MB, heap ${after.heapUsedMB} MB, sockets ${after.sockets}, users ${after.users}`);
  }
  console.log(line);

  const healthy =
    M.tConn === T && M.sConn === S && M.failed === 0 && M.recv === M.ok && zeroSeen === 0;
  console.log(healthy ? '\n✅ ผ่าน: ส่งถึงครบ ไม่มีคอนเนกชันล้มเหลว\n' : '\n⚠️  มีจุดที่ควรดู (ดูตัวเลขด้านบน)\n');

  [...teachers, ...students].forEach((s) => s && s.close());
  process.exit(0);
})().catch((e) => {
  console.error('load test error:', e);
  process.exit(1);
});
