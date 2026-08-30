(function () {
  'use strict';
  var socket = io();
  var ring = document.getElementById('ring');
  var latestEl = document.getElementById('latest');
  var offlineEl = document.getElementById('offline');

  var flowers = [];        // { id, e, hue, name, at }
  var nodes = {};          // id -> .flower element
  var tassels = [];        // .tassel elements (อุบะ)
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function vmin() { return Math.min(window.innerWidth, window.innerHeight) / 100; }
  function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = n * 0x27d4eb2d; n = n ^ (n >>> 15); return n >>> 0; }
  function ellipseP(a, b) { // เส้นรอบรูปวงรี (Ramanujan)
    var h = Math.pow((a - b) / (a + b), 2);
    return Math.PI * (a + b) * (1 + 3 * h / (10 + Math.sqrt(4 - 3 * h)));
  }

  // จัดดอกไม้ทั้งหมดให้เป็น "พวงมาลัย" — อัดแน่นตามเส้นรอบวง เพิ่มวงชั้นในเมื่อวงนอกเต็ม
  // คืน { flowers: [{x,y,rot,fs}], tassels: [{x,y,len,rot,hue}] }
  function computeLayout() {
    var u = vmin();
    var n = flowers.length;
    var out = [];

    // ขนาดดอก: เล็กลงเมื่อเยอะ เพื่อให้พวงมาลัยไม่ล้นจอ
    var fs = Math.max(2.0, 5.3 - n / 130) * u;
    var gap = Math.max(fs * 0.78, 2.0 * u);   // ระยะห่างเป้าหมายระหว่างดอกบนวง

    var A0 = 27 * u, B0 = 30 * u;              // กึ่งแกนวงนอกสุด (ล้อมข้อความตรงกลาง)
    var placed = 0, rk = 0;
    while (placed < n && rk < 7) {
      var shrink = 1 - rk * 0.165;
      var A = A0 * shrink, B = B0 * shrink;
      var per = Math.max(6, Math.round(ellipseP(A, B) / gap));
      var take = Math.min(per, n - placed);
      var full = placed + take >= n && take < per ? false : true;
      // วงที่ยังไม่เต็ม → กระจายเท่า ๆ กันรอบวง (สมมาตร ดูเป็นพวงมาลัยเสมอ)
      var count = full ? per : take;
      var phase = (rk % 2) * 0.5;
      for (var i = 0; i < take; i++) {
        var t = (i + phase) / count;
        var th = t * Math.PI * 2;
        var pinch = 1 - 0.13 * Math.cos(th);       // บีบด้านบน = ทรงหยดน้ำ
        var jt = hash((placed + i) * 2654435761 + rk);
        var jx = ((jt & 15) - 7) * 0.10 * u;
        var jy = (((jt >> 4) & 15) - 7) * 0.10 * u;
        out.push({
          x: A * Math.sin(th) * pinch + jx,
          y: -B * Math.cos(th) * pinch + jy + 2 * u,
          rot: ((jt >> 8) & 63) - 31,
          fs: fs
        });
      }
      placed += take;
      rk++;
    }

    // อุบะ (พู่ห้อย) ที่ก้นพวงมาลัย — เพิ่มจำนวนช้า ๆ ตามดอกไม้
    var tas = [];
    if (n >= 6) {
      var nT = Math.min(9, 3 + Math.floor(n / 22));
      var spread = 0.9;                         // กว้างของช่วงก้นวง (เรเดียน)
      for (var k = 0; k < nT; k++) {
        var frac = nT === 1 ? 0.5 : k / (nT - 1);
        var ang = Math.PI + (frac - 0.5) * spread; // รอบ ๆ ก้นวง (th = π)
        var pnc = 1 - 0.13 * Math.cos(ang);
        var mid = Math.abs(frac - 0.5) * 2;       // 0 ตรงกลาง, 1 ริม
        tas.push({
          x: A0 * Math.sin(ang) * pnc,
          y: -B0 * Math.cos(ang) * pnc + 2 * u,
          len: (10 - mid * 4.5) * u,              // ตรงกลางยาวสุด
          rot: (frac - 0.5) * 26,
          hue: flowers[(k * 7) % n] ? flowers[(k * 7) % n].hue : (k * 40) % 360
        });
      }
    }
    return { flowers: out, tassels: tas };
  }

  function makeNode(f) {
    var el = document.createElement('div');
    el.className = 'flower';
    el.textContent = f.e;
    el.style.setProperty('--hue', f.hue + 'deg');
    return el;
  }

  function place(el, L, animate) {
    el.style.setProperty('--x', L.x.toFixed(1) + 'px');
    el.style.setProperty('--y', L.y.toFixed(1) + 'px');
    el.style.setProperty('--r', L.rot + 'deg');
    el.style.setProperty('--fs', L.fs.toFixed(1) + 'px');
    if (animate && !reduced) {
      el.classList.remove('pop');
      void el.offsetWidth;
      el.classList.add('pop');
    }
  }

  function syncTassels(list) {
    while (tassels.length > list.length) ring.removeChild(tassels.pop());
    while (tassels.length < list.length) {
      var t = document.createElement('div');
      t.className = 'tassel';
      ring.appendChild(t);
      tassels.push(t);
    }
    list.forEach(function (L, i) {
      var el = tassels[i];
      el.style.setProperty('--x', L.x.toFixed(1) + 'px');
      el.style.setProperty('--y', L.y.toFixed(1) + 'px');
      el.style.setProperty('--r', L.rot.toFixed(1) + 'deg');
      el.style.setProperty('--len', L.len.toFixed(1) + 'px');
      el.style.setProperty('--hue', Math.round(L.hue) + 'deg');
    });
  }

  function relayoutAll(lastAnimate) {
    var n = flowers.length;
    ring.classList.toggle('dense', n > 240);      // เยอะมาก → ปิด transition กันหน่วง
    var L = computeLayout();
    for (var i = 0; i < n; i++) {
      var el = nodes[flowers[i].id];
      if (el) place(el, L.flowers[i], lastAnimate && i === n - 1);
    }
    syncTassels(L.tassels);
  }

  function addFlower(f, animate) {
    if (nodes[f.id]) return;
    flowers.push(f);
    var el = makeNode(f);
    ring.appendChild(el);
    nodes[f.id] = el;
    relayoutAll(animate);
    if (animate && f.name) showLatest(f.name);
  }

  var latestTimer;
  function showLatest(name) {
    latestEl.textContent = '🌸 ' + name + ' ร่วมเติมดอกไม้';
    latestEl.classList.add('show');
    clearTimeout(latestTimer);
    latestTimer = setTimeout(function () { latestEl.classList.remove('show'); }, 4200);
  }

  function reset(list) {
    ring.querySelectorAll('.flower, .tassel').forEach(function (n) { n.remove(); });
    flowers = []; nodes = {}; tassels = [];
    (list || []).forEach(function (f) { if (!nodes[f.id]) { flowers.push(f); var el = makeNode(f); ring.appendChild(el); nodes[f.id] = el; } });
    relayoutAll(false);
  }

  socket.on('connect', function () {
    offlineEl.classList.remove('show');
    socket.emit('wall-hello');
  });
  socket.on('disconnect', function () { offlineEl.classList.add('show'); });
  socket.on('wall-state', function (list) { reset(list); });
  socket.on('wall-flower', function (f) { addFlower(f, true); });

  // ---- ปุ่มส่งพวงมาลัยรวมให้อาจารย์ทุกคน (มุมล่างซ้าย) ----
  var sendBtn = document.getElementById('send-all');
  var flashEl = document.getElementById('flash');
  var flashTimer;
  function flash(msg) {
    flashEl.textContent = msg;
    flashEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () { flashEl.classList.remove('show'); }, 3600);
  }
  sendBtn.addEventListener('click', function () {
    if (sendBtn.disabled) return;
    if (!flowers.length) { flash('ยังไม่มีดอกไม้ในพวงมาลัยรวม'); return; }
    if (!window.confirm('ส่งพวงมาลัยรวม (' + flowers.length + ' ดอก) ให้อาจารย์ทุกคนที่ออนไลน์อยู่ตอนนี้?')) return;
    sendBtn.disabled = true;
    socket.emit('wall-send-all');
    setTimeout(function () { sendBtn.disabled = false; }, 8000);
  });
  socket.on('wall-send-all-ok', function (d) {
    flash('🙏 ส่งพวงมาลัยรวมให้อาจารย์ ' + ((d && d.count) || 0) + ' ท่านแล้ว');
  });
  socket.on('wall-send-all-failed', function (d) {
    sendBtn.disabled = false;
    flash((d && d.reason) || 'ส่งไม่สำเร็จ');
  });

  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { relayoutAll(false); }, 150);
  });
})();
