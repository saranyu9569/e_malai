import { $, state, socket, toast, show } from './core.js';

export function enterTeacher() {
  $('#teacher-hello').textContent = 'สวัสดี อ.' + state.name;
  $('#teacher-history-view').hidden = true;
  $('#teacher-wait-view').hidden = false;
  updateReceivedCount();
  show('screen-teacher');
}

// เรียกจาก goHome() (home.js) — เคลียร์ UI/สถานะฝั่งอาจารย์ทั้งหมดในเครื่องนี้
export function resetTeacherUI() {
  $('#teacher-history-view').hidden = true;
  $('#teacher-wait-view').hidden = false;
  viewer.hidden = true;
  incoming.hidden = true;
  $('#keepsake').hidden = true;
  historyList.innerHTML = '';
  rack.innerHTML = '';
  rackThumbs.length = 0;
}

// ---------- teacher: รับพวงมาลัย + ประวัติ ----------
var queue = [];
var showing = false;
var incoming = $('#incoming');
var incomingImg = $('#incoming-img');
var incomingFrom = $('#incoming-from');
var autoTimer;
var historyList = $('#history-list');
var historyEmpty = $('#history-empty');

function updateReceivedCount() {
  $('#teacher-count').textContent = 'ได้รับแล้ว ' + state.receivedCount + ' พวง';
  var hl = $('#history-count-label');
  if (hl) hl.textContent = state.receivedCount + ' พวง';
  var clr = $('#clear-history');
  if (clr) clr.hidden = state.receivedCount === 0;
}

var clearAcked = true;
$('#clear-history').addEventListener('click', function () {
  if (!window.confirm('ล้างประวัติพวงมาลัยทั้งหมดที่ส่งถึงชื่อนี้? (ย้อนกลับไม่ได้)')) return;
  clearAcked = false;
  socket.emit('clear-my-history');
  setTimeout(function () {
    if (!clearAcked) toast('เซิร์ฟเวอร์ไม่ตอบสนอง — ลองรีสตาร์ท server (npm start) แล้วลองใหม่', true);
  }, 2500);
});
socket.on('history-cleared', function (d) {
  clearAcked = true;
  toast(d && d.removed ? 'ล้างประวัติแล้ว (' + d.removed + ' รายการ)' : 'ไม่มีประวัติให้ล้าง');
});

function fmtTime(ts) {
  var d = new Date(ts || Date.now());
  var sameDay = new Date().toDateString() === d.toDateString();
  var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  return (sameDay ? 'วันนี้ ' : d.getDate() + '/' + (d.getMonth() + 1) + ' ') + hm;
}

function makeHistoryRow(item) {
  var row = document.createElement('div');
  row.className = 'history-row';
  var img = item.thumb || 'assets/malai-1.svg';
  var pfx = item.fromRole === 'committee' ? '🎖️ ' : item.fromRole === 'wall' ? '🌼 ' : '';
  var who = pfx + (item.studentName || 'ลูกศิษย์');
  var when = fmtTime(item.at);

  var im = document.createElement('img');
  im.src = img;
  im.alt = '';
  im.loading = 'lazy';
  var info = document.createElement('div');
  info.className = 'history-info';
  var name = document.createElement('div');
  name.className = 'history-name';
  name.textContent = who;
  var time = document.createElement('div');
  time.className = 'history-time';
  time.textContent = when;
  info.appendChild(name);
  info.appendChild(time);
  row.appendChild(im);
  row.appendChild(info);

  row.addEventListener('click', function () { openViewer(img, who, when); });
  return row;
}

// ---------- ดูรูปพวงมาลัยแบบใหญ่ ----------
var viewer = $('#viewer');
function openViewer(src, name, time) {
  $('#viewer-img').src = src || 'assets/malai-1.svg';
  $('#viewer-name').textContent = name || '';
  $('#viewer-time').textContent = time || '';
  viewer.hidden = false;
}
function closeViewer() { viewer.hidden = true; }
$('#viewer-close').addEventListener('click', closeViewer);
viewer.addEventListener('click', function (e) {
  if (e.target === viewer) closeViewer(); // แตะพื้นหลังเพื่อปิด (แตะรูปไม่ปิด)
});

// ---------- บันทึกรูปพวงมาลัยลงเครื่อง ----------
function fileStamp() {
  var d = new Date();
  function p(n) { return ('0' + n).slice(-2); }
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}
function safeName(s) {
  return (s || '')
    .replace(/[^\p{L}\p{M}\p{N} ._-]/gu, '') // เก็บตัวอักษร (รวมสระ/วรรณยุกต์ไทย) ตัวเลข เว้นวรรค . _ -
    .trim().replace(/\s+/g, '-').slice(0, 60);
}
function clickLink(href, download) {
  var a = document.createElement('a');
  a.href = href;
  if (download) a.download = download;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// วิธีหลัก: ให้เซิร์ฟเวอร์ส่งไฟล์พร้อมชื่อ (ชื่อไทยถูกต้องแม้บน iOS/Safari)
function saveViaServer(dataUrl, fname, done) {
  fetch('prepare-download', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ png: dataUrl, name: fname })
  })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (j) {
      if (j && j.token) { clickLink('dl/' + j.token); done(true); }
      else done(false);
    })
    .catch(function () { done(false); });
}

// ดาวน์โหลด PNG (data URL) เป็นไฟล์ชื่อ fname — ผ่าน server ก่อน, fallback ฝั่ง client
function downloadPng(dataUrl, fname) {
  saveViaServer(dataUrl, fname, function (ok) {
    if (ok) return;
    try {
      var bin = atob(dataUrl.split(',')[1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      var u = URL.createObjectURL(new Blob([arr], { type: 'image/png' }));
      clickLink(u, fname + '.png');
      setTimeout(function () { URL.revokeObjectURL(u); }, 6000);
    } catch (e) {
      clickLink(dataUrl, fname + '.png');
    }
  });
}

$('#viewer-save').addEventListener('click', function () {
  var src = $('#viewer-img').src;
  if (!src) return;
  var fname = 'e-malai-' + (safeName($('#viewer-name').textContent) || fileStamp());
  var im = new Image();
  im.onload = function () {
    var ow = im.naturalWidth || 800, oh = im.naturalHeight || 1333;
    if (ow < 900) { var k = 900 / ow; ow = Math.round(ow * k); oh = Math.round(oh * k); }
    if (ow > 1400) { var k2 = 1400 / ow; ow = Math.round(ow * k2); oh = Math.round(oh * k2); }
    var cv = document.createElement('canvas');
    cv.width = ow; cv.height = oh;
    cv.getContext('2d').drawImage(im, 0, 0, ow, oh);
    var dataUrl;
    try { dataUrl = cv.toDataURL('image/png'); } catch (e) { window.open(src, '_blank'); return; }
    downloadPng(dataUrl, fname);
  };
  im.onerror = function () { window.open(src, '_blank'); };
  im.src = src;
});

function addHistoryRow(item, prepend) {
  if (historyEmpty) { historyEmpty.hidden = true; }
  var row = makeHistoryRow(item);
  if (prepend && historyList.firstChild) historyList.insertBefore(row, historyList.firstChild);
  else historyList.appendChild(row);
}

// ---------- ราวแขวนพวงมาลัย (หน้ารอรับ) ----------
var rack = $('#garland-rack');
var rackThumbs = []; // เก็บ src สำหรับการ์ดที่ระลึก
var RACK_MAX = 60;
function rackAdd(src, atStart) {
  src = src || 'assets/malai-1.svg';
  var hook = document.createElement('div');
  hook.className = 'rack-hook';
  var swing = document.createElement('div');
  swing.className = 'rack-swing';
  var im = document.createElement('img');
  im.src = src; im.alt = ''; im.loading = 'lazy';
  swing.appendChild(im); hook.appendChild(swing);
  if (atStart && rack.firstChild) rack.insertBefore(hook, rack.firstChild);
  else rack.appendChild(hook);
  while (rack.children.length > RACK_MAX) rack.removeChild(atStart ? rack.lastChild : rack.firstChild);
}
function rebuildRack(thumbs) {
  rack.innerHTML = '';
  rackThumbs.length = 0;
  (thumbs || []).slice(0, 200).forEach(function (s) { rackThumbs.push(s); });
  rackThumbs.slice(0, RACK_MAX).forEach(function (s) { rackAdd(s, false); });
}

// ---------- กลีบดอกไม้ระเบิด + สั่น ----------
var PETALS = ['🌸', '💮', '🌼', '🌺', '✿', '❀'];
function petalBurst(n) {
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var box = $('#petal-burst');
  n = n || 16;
  for (var i = 0; i < n; i++) {
    var p = document.createElement('span');
    p.className = 'petal';
    p.textContent = PETALS[(Math.random() * PETALS.length) | 0];
    var ang = Math.random() * Math.PI * 2;
    var dist = 90 + Math.random() * 210;
    p.style.setProperty('--tx', (Math.cos(ang) * dist).toFixed(0) + 'px');
    p.style.setProperty('--ty', (Math.sin(ang) * dist - 40).toFixed(0) + 'px');
    p.style.setProperty('--rot', ((Math.random() * 720 - 360) | 0) + 'deg');
    p.style.setProperty('--dur', (800 + Math.random() * 700 | 0) + 'ms');
    p.style.fontSize = (16 + Math.random() * 16 | 0) + 'px';
    box.appendChild(p);
    (function (el) { setTimeout(function () { el.remove(); }, 1700); })(p);
  }
}
function haptic(strong) {
  try { if (navigator.vibrate) navigator.vibrate(strong ? [0, 60, 30, 90, 30, 120] : [0, 35, 22, 55]); } catch (e) {}
}

socket.on('history', function (rows) {
  rows = rows || [];
  historyList.innerHTML = '';
  state.receivedCount = rows.length;
  updateReceivedCount();
  rebuildRack(rows.map(function (r) { return r.thumb; }).reverse()); // เก่า→ใหม่ (ใหม่อยู่ซ้าย)
  if (!rows.length) {
    historyEmpty = document.createElement('p');
    historyEmpty.className = 'muted';
    historyEmpty.id = 'history-empty';
    historyEmpty.textContent = 'ยังไม่มีใครส่งพวงมาลัยมา';
    historyList.appendChild(historyEmpty);
    return;
  }
  historyEmpty = null;
  rows.forEach(function (r) { addHistoryRow(r, false); }); // ใหม่สุดก่อนอยู่แล้ว
});

socket.on('receive-garland', function (d) {
  queue.push(d);
  state.receivedCount++;
  updateReceivedCount();
  addHistoryRow({ studentName: d.fromName, fromRole: d.fromRole, thumb: d.src, at: d.at }, true);
  rackThumbs.unshift(d.src);
  rackAdd(d.src, true);
  var powered = (d.power || 0) > 0.5;
  petalBurst(powered ? 30 : 16);
  haptic(powered);
  chime(d.src, powered);
  if (!showing) next();
});

function next() {
  if (!queue.length) { showing = false; return; }
  showing = true;
  var d = queue.shift();
  incomingImg.src = d.src || 'assets/malai-1.svg';
  incomingFrom.textContent = d.fromRole === 'committee' ? (d.fromName || 'กรรมการ') + ' (กรรมการ)' : (d.fromName || 'ลูกศิษย์');
  $('.incoming-inner').classList.toggle('powered', (d.power || 0) > 0.5);
  incoming.hidden = false;
  incomingImg.style.animation = 'none';
  void incomingImg.offsetWidth;
  incomingImg.style.animation = '';
  clearTimeout(autoTimer);
  autoTimer = setTimeout(dismiss, 6000);
}
function dismiss() {
  clearTimeout(autoTimer);
  incoming.hidden = true;
  setTimeout(next, 250);
}
$('#incoming-dismiss').addEventListener('click', dismiss);

// teacher sub-view toggle
$('#go-history').addEventListener('click', function () {
  $('#teacher-wait-view').hidden = true;
  $('#teacher-history-view').hidden = false;
});
$('#back-to-wait').addEventListener('click', function () {
  $('#teacher-history-view').hidden = true;
  $('#teacher-wait-view').hidden = false;
});

// ---------- การ์ดที่ระลึก (ฝั่งอาจารย์) ----------
function keepsakeFinish(cv) {
  var url;
  try { url = cv.toDataURL('image/png'); } catch (e) { toast('สร้างการ์ดไม่สำเร็จ', true); return; }
  $('#keepsake-img').src = url;
  $('#keepsake').hidden = false;
}
function buildKeepsake() {
  if (!state.receivedCount) { toast('ยังไม่มีพวงมาลัยให้ทำการ์ด', true); return; }
  var KW = 900, KH = 1240;
  var cv = document.createElement('canvas'); cv.width = KW; cv.height = KH;
  var x = cv.getContext('2d');
  x.fillStyle = '#fbf6ec'; x.fillRect(0, 0, KW, KH);
  x.strokeStyle = '#c9a24a'; x.lineWidth = 10; x.strokeRect(24, 24, KW - 48, KH - 48);
  x.lineWidth = 2; x.strokeRect(42, 42, KW - 84, KH - 84);
  x.textAlign = 'center';
  x.fillStyle = '#c9a24a'; x.font = '112px serif'; x.fillText('๛', KW / 2, 156);
  x.fillStyle = '#7a1f2b'; x.font = 'bold 30px "Kanit","Sarabun","Noto Sans Thai",sans-serif';
  x.fillText('คณะวิทยาศาสตร์และเทคโนโลยี', KW / 2, 224);
  x.font = '26px "Kanit","Sarabun","Noto Sans Thai",sans-serif';
  x.fillText('มหาวิทยาลัยหัวเฉียวเฉลิมพระเกียรติ', KW / 2, 264);
  x.fillStyle = '#2b2320'; x.font = 'bold 46px "Kanit","Sarabun","Noto Sans Thai",sans-serif';
  x.fillText('อ.' + (state.name || ''), KW / 2, 358);
  x.font = '36px "Kanit","Sarabun","Noto Sans Thai",sans-serif';
  x.fillText('ได้รับพวงมาลัย ' + state.receivedCount + ' พวง', KW / 2, 420);
  x.fillStyle = '#8a7f74'; x.font = '26px "Kanit","Sarabun","Noto Sans Thai",sans-serif';
  x.fillText('ปีการศึกษา ' + ($('#year-val') ? $('#year-val').textContent : ''), KW / 2, 462);

  var thumbs = rackThumbs.slice(0, 12);
  if (!thumbs.length) { keepsakeFinish(cv); return; }
  var cols = 4, cellW = 190, cellH = 232, gx = (KW - cols * cellW) / 2, gy = 512;
  var loaded = 0, imgs = [];
  thumbs.forEach(function (s, i) {
    var im = new Image();
    im.onload = im.onerror = function () {
      imgs[i] = im.naturalWidth ? im : null;
      if (++loaded !== thumbs.length) return;
      imgs.forEach(function (m, k) {
        if (!m) return;
        var cx = gx + (k % cols) * cellW, cy = gy + Math.floor(k / cols) * cellH;
        var iw = m.naturalWidth, ih = m.naturalHeight;
        var sc = Math.min((cellW - 16) / iw, (cellH - 16) / ih);
        var w = iw * sc, hh = ih * sc;
        x.drawImage(m, cx + (cellW - w) / 2, cy + (cellH - hh) / 2, w, hh);
      });
      keepsakeFinish(cv);
    };
    im.src = s;
  });
}
$('#open-keepsake').addEventListener('click', buildKeepsake);
$('#keepsake-close').addEventListener('click', function () { $('#keepsake').hidden = true; });
$('#keepsake').addEventListener('click', function (e) { if (e.target === $('#keepsake')) $('#keepsake').hidden = true; });
$('#keepsake-save').addEventListener('click', function () {
  var src = $('#keepsake-img').src;
  if (src) downloadPng(src, 'e-malai-การ์ด-' + (safeName(state.name) || fileStamp()));
});

// เสียงกรุ๊งเฉพาะตัวต่อพวงมาลัยแต่ละแบบ — สเกลเพนทาโทนิก (โทนไทย) เลือกจาก hash ของรูป
var PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];
function hashStr(s) {
  var h = 2166136261;
  s = String(s || '');
  for (var i = 0; i < s.length; i += 7) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function chime(seed, strong) {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ac = new Ctx();
    var h = hashStr(seed);
    var root = h % (PENTA.length - 4);
    var pattern = [0, 2, 4, (h >> 3) % 2 ? 5 : 3];
    if (strong) pattern = pattern.concat([4, 6]); // เต็มพลัง → เสียงยาวขึ้น
    var vol = strong ? 0.3 : 0.22;
    pattern.forEach(function (step, i) {
      var f = PENTA[root + step] || PENTA[PENTA.length - 1];
      var o = ac.createOscillator();
      var g = ac.createGain();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f;
      o.connect(g); g.connect(ac.destination);
      var t = ac.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
      o.start(t);
      o.stop(t + 0.9);
    });
    setTimeout(function () { ac.close(); }, 1900);
  } catch (e) {}
}
