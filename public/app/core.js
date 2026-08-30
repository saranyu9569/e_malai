// ---------- ค่าคงที่ + สถานะที่ใช้ร่วมกันทุกหน้าจอ ----------
export var GARLANDS = ['malai-1', 'malai-2', 'malai-3', 'malai-4', 'malai-5', 'malai-6'];
export var FIGURE_BASES = ['stu-female', 'stu-male'];
export var THUMB_SIDE = 300; // รูปย่อสำหรับประวัติ (ใหญ่พอให้กดดูรูปใหญ่แล้วยังคมพอควร)

export var socket = io();

// พวงมาลัยที่แต่งเองในเครื่อง: { id, src(dataURL), thumb(dataURL) } เก็บลง localStorage
// เป็น const แล้วแก้ "เนื้อใน" อาร์เรย์เสมอ (push/splice/length=0) แทนการ reassign ทั้งตัวแปร
// เพื่อให้โมดูลอื่นที่ import ตัวนี้เห็นการเปลี่ยนแปลงแบบเดียวกันได้ (ตาม ES module semantics)
export var customGarlands = [];
try {
  var loaded = JSON.parse(localStorage.getItem('emalai_custom') || '[]');
  if (Array.isArray(loaded)) loaded.forEach(function (g) { customGarlands.push(g); });
} catch (e) {}

export function saveCustom() {
  try { localStorage.setItem('emalai_custom', JSON.stringify(customGarlands)); } catch (e) {}
}
function findCustom(id) {
  return customGarlands.filter(function (g) { return g.id === id; })[0] || null;
}
export function isCustom(id) { return !!findCustom(id); }
export function garlandSrc(id) {
  if (!id) return '';
  var c = findCustom(id);
  return c ? c.src : 'assets/' + id + '.svg';
}
export function garlandThumb(id) {
  if (!id) return '';
  var c = findCustom(id);
  return c ? (c.thumb || c.src) : 'assets/' + id + '.svg';
}
// "พวงมาลัยพื้นฐาน" ในตัวแต่ง = 6 แบบ + พวงมาลัยที่ผู้ใช้เซฟเอง + รูปนักศึกษา
export function editorBaseIds() {
  return GARLANDS
    .concat(customGarlands.map(function (g) { return g.id; }))
    .concat(FIGURE_BASES);
}

export var state = {
  role: null,          // 'student' | 'teacher' | 'committee'
  name: '',
  garland: null,       // พวงมาลัยที่นักศึกษาเลือก
  teacherId: null,     // อาจารย์ปลายทางที่นักศึกษาเลือก
  teachers: [],
  teacherQuery: '',
  receivedCount: 0
};
export var cState = { garland: null, sent: false }; // สถานะฝั่งกรรมการ

// ---------- helpers ----------
export function $(sel, root) { return (root || document).querySelector(sel); }
export function show(id) {
  var screens = document.querySelectorAll('.screen');
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove('active');
  $('#' + id).classList.add('active');
}
var toastTimer;
export function toast(msg, bad) {
  var active = document.querySelector('.screen.active');
  var el = (active && active.querySelector('.toast')) || $('#toast');
  el.textContent = msg;
  el.classList.toggle('bad', !!bad);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { el.hidden = true; }, 2600);
}
export function muted(text) {
  var p = document.createElement('p');
  p.className = 'muted';
  p.textContent = text;
  return p;
}

// ---------- connection status ----------
var connNote = $('#conn-note');
socket.on('connect', function () {
  connNote.textContent = 'เชื่อมต่อแล้ว พร้อมใช้งาน';
  connNote.className = 'conn-note ok';
  if (state.role && state.name) {
    socket.emit('register', { role: state.role, name: state.name });
  }
});
socket.on('disconnect', function () {
  connNote.textContent = 'การเชื่อมต่อหลุด กำลังลองใหม่…';
  connNote.className = 'conn-note bad';
});

// ---------- restore session ----------
try {
  var saved = JSON.parse(sessionStorage.getItem('emalai') || 'null');
  if (saved && saved.role && saved.name) { state.role = saved.role; state.name = saved.name; }
} catch (e) {}
export function persist() {
  try { sessionStorage.setItem('emalai', JSON.stringify({ role: state.role, name: state.name })); } catch (e) {}
}

// ---------- แถบเลือกพวงมาลัย (ใช้ร่วมกันทั้งนักศึกษาและกรรมการ) ----------
// แจ้งเตือนโมดูลที่สนใจเมื่อ customGarlands เปลี่ยน (เช่น ลบพวงมาลัยออก) โดยไม่ต้อง import
// กลับไปที่ student.js/committee.js ตรง ๆ (จะกลายเป็น circular import) — ให้แต่ละโมดูลมา
// "สมัคร" callback ของตัวเองแทน
var garlandStripRefreshers = [];
export function onCustomGarlandsChanged(fn) { garlandStripRefreshers.push(fn); }
function notifyCustomGarlandsChanged() {
  garlandStripRefreshers.forEach(function (fn) { fn(); });
}

function makeGarlandButton(id, onPick) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.garland = id;
  var im = document.createElement('img');
  im.src = garlandThumb(id);
  im.alt = id;
  btn.appendChild(im);
  btn.addEventListener('click', function () { onPick(id, btn); });
  return btn;
}

// แถบเลือกพวงมาลัยของ "ผู้ส่ง" = เฉพาะพวงมาลัยที่แต่งเอง (ไม่มี 6 แบบพื้นฐาน)
export function fillGarlandStrip(strip, selectedId, onPick, onDeselect) {
  strip.innerHTML = '';
  if (!customGarlands.length) {
    var p = document.createElement('p');
    p.className = 'muted';
    p.textContent = 'ยังไม่มีพวงมาลัย — กด 🎨 แต่งพวงมาลัย เพื่อสร้าง';
    strip.appendChild(p);
    return;
  }
  customGarlands.forEach(function (g) {
    var slot = document.createElement('div');
    slot.className = 'garland-slot';
    var btn = makeGarlandButton(g.id, onPick);
    if (g.id === selectedId) btn.classList.add('selected');
    slot.appendChild(btn);
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'remove-garland';
    x.textContent = '×';
    x.title = 'ลบพวงมาลัยนี้';
    x.addEventListener('click', function (ev) {
      ev.stopPropagation();
      var idx = customGarlands.findIndex(function (c) { return c.id === g.id; });
      if (idx !== -1) customGarlands.splice(idx, 1);
      saveCustom();
      onDeselect(g.id);
      notifyCustomGarlandsChanged();
    });
    slot.appendChild(x);
    strip.appendChild(slot);
  });
}

export function drawScaledFrom(srcCanvasOrImg, w, h) {
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(srcCanvasOrImg, 0, 0, w, h);
  return cv;
}

// ---------- swipe-up (ใช้ร่วมกันทั้งนักศึกษาและกรรมการ) ----------
export function attachSwipe(card, onLaunch) {
  var d = { active: false, startY: 0, dy: 0, id: null, charge: 0, downAt: 0, raf: 0 };
  var CHARGE_MS = 1500;

  function reset() {
    cancelAnimationFrame(d.raf); d.raf = 0;
    d.charge = 0;
    card.classList.remove('launching', 'charging');
    card.style.transition = 'transform .28s ease, opacity .28s ease';
    card.style.transform = 'translateY(0)';
    card.style.opacity = '1';
  }
  function chargeLoop() {
    if (!d.active) return;
    // ชาร์จเฉพาะตอนยังไม่ปัดขึ้นชัด ๆ
    if (d.dy > -24) d.charge = Math.min(1, (performance.now() - d.downAt) / CHARGE_MS);
    if (d.charge > 0.02) {
      card.classList.add('charging');
      card.style.setProperty('--chg', d.charge.toFixed(3));
      if (d.dy > -24) card.style.transform = 'scale(' + (1 + d.charge * 0.08) + ')';
    }
    d.raf = requestAnimationFrame(chargeLoop);
  }

  // ยิงพวงมาลัยพุ่งโค้งออกจอ (physics)
  function flyOut(charge, done) {
    card.classList.remove('charging');
    var y = d.dy, x = 0, s = 1 + charge * 0.1, rot = d.dy * 0.02;
    var vy = -19 - charge * 11;
    var vx = (Math.random() * 2 - 1) * (2.4 + charge * 3.5);
    var vr = (Math.random() * 2 - 1) * (5 + charge * 7);
    card.style.transition = 'none';
    function step() {
      vy += 0.16; y += vy; x += vx; rot += vr; s *= 0.982;
      card.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + s.toFixed(3) + ') rotate(' + rot.toFixed(1) + 'deg)';
      card.style.opacity = String(Math.max(0, 1 + y / (window.innerHeight * 0.85)));
      if (y > -window.innerHeight * 1.25 && s > 0.18) requestAnimationFrame(step);
      else if (done) done();
    }
    requestAnimationFrame(step);
  }

  card.addEventListener('pointerdown', function (e) {
    if (card.hidden || card.classList.contains('launching')) return;
    d.active = true; d.startY = e.clientY; d.dy = 0; d.id = e.pointerId;
    d.charge = 0; d.downAt = performance.now();
    try { card.setPointerCapture(e.pointerId); } catch (x) {}
    card.style.transition = 'none';
    cancelAnimationFrame(d.raf); d.raf = requestAnimationFrame(chargeLoop);
  });
  card.addEventListener('pointermove', function (e) {
    if (!d.active || e.pointerId !== d.id) return;
    d.dy = Math.min(0, e.clientY - d.startY);
    var p = Math.min(1, -d.dy / 160);
    card.style.transform = 'translateY(' + d.dy + 'px) scale(' + (1 + d.charge * 0.08 - p * 0.12) + ') rotate(' + (d.dy * 0.02) + 'deg)';
    card.style.opacity = String(1 - p * 0.3);
  });
  card.addEventListener('pointerup', function (e) {
    if (!d.active || e.pointerId !== d.id) return;
    d.active = false;
    cancelAnimationFrame(d.raf); d.raf = 0;
    try { card.releasePointerCapture(e.pointerId); } catch (x) {}
    if (d.dy < -110) {
      var charge = d.charge;
      card.classList.add('launching');
      onLaunch(charge);
      flyOut(charge, function () { /* reset จะถูกเรียกจาก updateStage หลัง onLaunch */ });
    } else {
      reset();
    }
  });
  card.addEventListener('pointercancel', function () { if (d.active) { d.active = false; reset(); } });
  return { reset: reset };
}
