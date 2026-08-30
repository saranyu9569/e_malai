import {
  $, state, cState, toast, THUMB_SIDE,
  garlandSrc, garlandThumb, isCustom, editorBaseIds, customGarlands, saveCustom, drawScaledFrom
} from './core.js';
import { selectGarland, buildGarlandStrip } from './student.js';
import { selectCommitteeGarland, buildCommitteeStrip } from './committee.js';

// ---------- ตัวแต่งพวงมาลัย ----------
var wrap = $('#editor');
var canvas = $('#editor-canvas');
var ctx = canvas.getContext('2d');
var W = canvas.width, Hc = canvas.height;
var tmp = document.createElement('canvas');
tmp.width = W; tmp.height = Hc;
var tctx = tmp.getContext('2d');

var EMOJI = ['🌸','💐','🌼','🌺','🌷','🌹','✨','⭐','🌟','❤️','💛','💚','💜','🤍','🙏','👑','🎀','🪷','🦋','🌈','🕊️','🍀','😊','🎉'];

// จานสีสำหรับเพิ่มสีไล่เฉด
var PALETTE = ['#c1272d','#f4a300','#2e7d5b','#1e78c8','#7d5ba6','#e0559b','#d9b64e','#e8622c','#3aa0a0','#8a5a2b'];
var MAX_STOPS = 10;

// ค่าปรับแต่งต่อ 1 ชิ้น (สี/ไล่สี/ความเข้ม/แสง/เงา/ความกลมรี) — มีทั้งพวงมาลัยตั้งต้นและทุกเลเยอร์
function freshAdj() {
  return { stops: ['#c1272d'], tintAmt: 0, gradient: false, gradAngle: 90, sat: 1, light: 1, shadow: 0.25, round: 0 };
}
// baseT = ทรานส์ฟอร์มของพวงมาลัยตั้งต้น (ขยับ/ย่อขยาย/หมุน/กลับด้านได้ แต่ลบไม่ได้)
function freshEd(base) {
  return {
    base: base, items: [], sel: -1,
    baseT: { x: W / 2, y: Hc / 2, scale: 1, rot: 0, flip: false, adj: freshAdj() },
    draw: { on: false, color: '#7a1f2b', width: 7, strokes: [] } // ปากกาวาดมือ
  };
}
var penning = null; // เส้นที่กำลังลากอยู่
var ed = freshEd('malai-1');

var BASE_VBW = 220, BASE_VBH = 366; // viewBox ของไฟล์พวงมาลัย

var baseImg = new Image();
var baseReady = false;
baseImg.onload = function () { baseReady = true; redraw(); };

var baseSvgInner = {}; // id -> เนื้อใน <svg> ของไฟล์ asset (สำหรับ export เป็น SVG)
function fetchInner(id) {
  if (baseSvgInner[id] || isCustom(id)) return; // custom เป็น data URL ไม่ต้อง fetch
  fetch('assets/' + id + '.svg').then(function (r) { return r.text(); }).then(function (t) {
    baseSvgInner[id] = t.replace(/^[\s\S]*?<svg[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
  }).catch(function () {});
}
editorBaseIds().forEach(fetchInner); // โหลดล่วงหน้า

function loadBase(id) {
  ed.base = id;
  baseReady = false;
  baseImg.src = garlandSrc(id); // asset path หรือ data URL ของพวงมาลัยที่เซฟเอง
  fetchInner(id);
}

// คืน data URL แบบ self-contained ของพวงมาลัย/รูป id ใด ๆ (สำหรับใช้เป็นเลเยอร์)
function garlandAsDataUrl(id, cb) {
  var s = garlandSrc(id);
  if (s.indexOf('data:') === 0) { cb(s); return; }
  var inner = baseSvgInner[id];
  if (inner) {
    cb('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + BASE_VBW + ' ' + BASE_VBH +
      '" width="' + BASE_VBW + '" height="' + BASE_VBH + '">' + inner + '</svg>'))));
    return;
  }
  fetch(s).then(function (r) { return r.text(); }).then(function (t) {
    cb('data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(t))));
  }).catch(function () { cb(s); });
}

function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// เนื้อในของพวงมาลัยพื้นฐาน สำหรับฝังใน SVG (built-in = เวกเตอร์, custom = <image>)
function baseInnerMarkup() {
  var v = baseSvgInner[ed.base];
  if (v) return v;
  return '<image href="' + garlandSrc(ed.base) + '" x="0" y="0" width="' + BASE_VBW +
    '" height="' + BASE_VBH + '" preserveAspectRatio="xMidYMid meet"/>';
}

// มาร์กอัพ 1 ชิ้น (content วาดที่จุดกำเนิด กว้าง w สูง h) พร้อมค่าปรับแต่ง adj ของมันเอง
function nodeSVG(pfx, content, cx, cy, w, h, rot, flip, adj) {
  var gtf = 'translate(' + cx.toFixed(2) + ' ' + cy.toFixed(2) + ') rotate(' + rot + ')' + (flip ? ' scale(-1 1)' : '');
  var sh = adj.shadow;
  var d = '<filter id="' + pfx + 's" x="-60%" y="-60%" width="220%" height="220%">' +
    '<feDropShadow dx="' + (sh * 4).toFixed(1) + '" dy="' + (3 + sh * 12).toFixed(1) +
    '" stdDeviation="' + (2 + sh * 12).toFixed(1) + '" flood-color="#5a141d" flood-opacity="' +
    (0.15 + sh * 0.55).toFixed(2) + '"/></filter>';

  var tint = '';
  if (adj.tintAmt > 0) {
    d += '<mask id="' + pfx + 'm" style="mask-type:alpha">' + content + '</mask>';
    var fill;
    if (adj.gradient && adj.stops.length >= 2) {
      var ang = adj.gradAngle * Math.PI / 180, len = Math.max(w, h) / 2;
      var gx = Math.cos(ang) * len, gy = Math.sin(ang) * len;
      var st = adj.stops.map(function (c, i) {
        return '<stop offset="' + (i / (adj.stops.length - 1) * 100).toFixed(1) + '%" stop-color="' + c + '"/>';
      }).join('');
      d += '<linearGradient id="' + pfx + 'g" gradientUnits="userSpaceOnUse" x1="' + (-gx).toFixed(1) +
        '" y1="' + (-gy).toFixed(1) + '" x2="' + gx.toFixed(1) + '" y2="' + gy.toFixed(1) + '">' + st + '</linearGradient>';
      fill = 'url(#' + pfx + 'g)';
    } else {
      fill = adj.stops[0];
    }
    tint = '<g mask="url(#' + pfx + 'm)" style="mix-blend-mode:color">' +
      '<rect x="-3000" y="-3000" width="6000" height="6000" fill="' + fill + '" opacity="' + adj.tintAmt.toFixed(2) + '"/></g>';
  }

  var body = '<g filter="url(#' + pfx + 's)" transform="' + gtf + '">' +
    '<g style="filter:saturate(' + adj.sat + ') brightness(' + adj.light + ')">' + content + '</g>' +
    tint + '</g>';
  return { defs: d, body: body };
}

// ประกอบพวงมาลัยที่แต่งแล้วเป็น SVG (ทุกชิ้นมีค่าปรับแต่งของตัวเอง)
function buildSVG() {
  if (!baseSvgInner[ed.base] && !isCustom(ed.base)) return null; // built-in ยังโหลดไม่เสร็จ
  var b = garlandBox();
  var baseContent = '<g transform="scale(' + (b.w / BASE_VBW).toFixed(5) + ' ' + (b.h / BASE_VBH).toFixed(5) +
    ') translate(' + (-BASE_VBW / 2) + ' ' + (-BASE_VBH / 2) + ')">' + baseInnerMarkup() + '</g>';

  var nodes = [nodeSVG('nB', baseContent, b.cx, b.cy, b.w, b.h, ed.baseT.rot, ed.baseT.flip, ed.baseT.adj)];

  ed.items.forEach(function (it, idx) {
    var dd = itemWH(it), content;
    if (it.kind === 'img') {
      content = '<image x="' + (-dd.w / 2).toFixed(1) + '" y="' + (-dd.h / 2).toFixed(1) +
        '" width="' + dd.w.toFixed(1) + '" height="' + dd.h.toFixed(1) + '" href="' + it.src + '"/>';
    } else {
      var S = Math.min(dd.w, dd.h);
      content = '<g transform="scale(' + (dd.w / S).toFixed(4) + ' ' + (dd.h / S).toFixed(4) + ')">' +
        '<text text-anchor="middle" dominant-baseline="central" font-size="' + S.toFixed(1) + '">' + xmlEsc(it.e) + '</text></g>';
    }
    nodes.push(nodeSVG('nL' + idx, content, it.x, it.y, dd.w, dd.h, it.rot, it.flip, it.adj));
  });

  var strokeSVG = '';
  if (ed.draw.strokes.length) {
    strokeSVG = '<g fill="none" stroke-linejoin="round" stroke-linecap="round">' +
      ed.draw.strokes.map(function (st) {
        if (!st.pts || st.pts.length < 2) return '';
        var dd = 'M' + st.pts.map(function (p) { return p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join(' L');
        return '<path d="' + dd + '" stroke="' + st.color + '" stroke-width="' + st.width + '"/>';
      }).join('') + '</g>';
  }

  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + Hc + '" width="' + W + '" height="' + Hc + '">' +
    '<defs>' + nodes.map(function (n) { return n.defs; }).join('') + '</defs>' +
    nodes.map(function (n) { return n.body; }).join('') + strokeSVG + '</svg>';
}
function svgDataUrl(svg) {
  return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
}

var STICKER_BASE = W * 0.16; // ขนาดฐานของสติกเกอร์ emoji
var IMG_BASE = W * 0.42;     // ความกว้างฐานของเลเยอร์รูป/พวงมาลัย

function roundS(round) {
  return { sx: 1 + Math.max(0, round) * 1.2, sy: 1 + Math.max(0, -round) * 1.2 };
}

// กล่องของพวงมาลัยตั้งต้น (scale=1 = พอดีกรอบ) รวมผล round + baseT.scale
function garlandBox() {
  var pad = 28;
  var iw = baseImg.naturalWidth || 220, ih = baseImg.naturalHeight || 366;
  var r = roundS(ed.baseT.adj.round);
  var fit = Math.min((W - pad * 2) / (iw * r.sx), (Hc - pad * 2) / (ih * r.sy));
  var w = iw * fit * r.sx * ed.baseT.scale, h = ih * fit * r.sy * ed.baseT.scale;
  return { cx: ed.baseT.x, cy: ed.baseT.y, x: ed.baseT.x - w / 2, y: ed.baseT.y - h / 2, w: w, h: h };
}

function itemWH(it) {
  var r = roundS(it.adj ? it.adj.round : 0);
  if (it.kind === 'img') {
    var iw = (it._img && it._img.naturalWidth) || 3, ih = (it._img && it._img.naturalHeight) || 5;
    var w = IMG_BASE * it.scale;
    return { w: w * r.sx, h: w * ih / iw * r.sy };
  }
  var s = STICKER_BASE * it.scale;
  return { w: s * r.sx, h: s * r.sy };
}

// วาดเนื้อหาชิ้นเดียว (รูป/emoji) ที่จุดกำเนิด ขนาด w×h — ผู้เรียกตั้ง translate/rotate/flip เอง
function paintContent(context, o) {
  if (o.img) {
    if (o.img.complete && o.img.naturalWidth) context.drawImage(o.img, -o.w / 2, -o.h / 2, o.w, o.h);
  } else {
    context.font = Math.min(o.w, o.h) + 'px "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.save(); context.scale(o.w / Math.min(o.w, o.h), o.h / Math.min(o.w, o.h));
    context.fillText(o.emoji, 0, 0);
    context.restore();
  }
}

// เรนเดอร์ 1 ชิ้น พร้อมค่าปรับแต่งของมันเอง (o.adj)
function renderNode(o) {
  var a = o.adj, rad = o.rot * Math.PI / 180;

  tctx.clearRect(0, 0, W, Hc);
  tctx.save();
  try { tctx.filter = 'saturate(' + a.sat + ') brightness(' + a.light + ')'; } catch (e) {}
  tctx.translate(o.cx, o.cy); tctx.rotate(rad); if (o.flip) tctx.scale(-1, 1);
  paintContent(tctx, o);
  tctx.restore();
  try { tctx.filter = 'none'; } catch (e) {}

  if (a.tintAmt > 0) {
    tctx.save();
    tctx.globalCompositeOperation = 'color';
    tctx.globalAlpha = a.tintAmt;
    if (a.gradient && a.stops.length >= 2) {
      var ang = a.gradAngle * Math.PI / 180, len = Math.max(o.w, o.h) / 2;
      var gx = Math.cos(ang) * len, gy = Math.sin(ang) * len;
      var grd = tctx.createLinearGradient(o.cx - gx, o.cy - gy, o.cx + gx, o.cy + gy);
      for (var gi = 0; gi < a.stops.length; gi++) grd.addColorStop(gi / (a.stops.length - 1), a.stops[gi]);
      tctx.fillStyle = grd;
    } else {
      tctx.fillStyle = a.stops[0];
    }
    tctx.fillRect(0, 0, W, Hc);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.globalAlpha = 1;
    tctx.translate(o.cx, o.cy); tctx.rotate(rad); if (o.flip) tctx.scale(-1, 1);
    paintContent(tctx, o);
    tctx.restore();
  }

  ctx.save();
  var sh = a.shadow;
  ctx.shadowColor = 'rgba(90,20,25,' + (0.15 + sh * 0.55).toFixed(3) + ')';
  ctx.shadowBlur = 6 + sh * 26;
  ctx.shadowOffsetX = sh * 4;
  ctx.shadowOffsetY = 3 + sh * 12;
  ctx.drawImage(tmp, 0, 0);
  ctx.restore();

  if (o.selected) {
    ctx.save();
    ctx.translate(o.cx, o.cy); ctx.rotate(rad);
    ctx.strokeStyle = '#7a1f2b'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.strokeRect(-o.w / 2 - 4, -o.h / 2 - 4, o.w + 8, o.h + 8);
    ctx.restore();
  }
  ctx.setLineDash([]);
}

function redraw() {
  ctx.clearRect(0, 0, W, Hc); // พื้นหลังโปร่งใสเสมอ
  if (baseReady) {
    var b = garlandBox();
    renderNode({ img: baseImg, cx: b.cx, cy: b.cy, w: b.w, h: b.h, rot: ed.baseT.rot, flip: ed.baseT.flip, adj: ed.baseT.adj, selected: ed.sel === 'base' });
  }
  for (var i = 0; i < ed.items.length; i++) {
    var it = ed.items[i], d = itemWH(it);
    renderNode({
      img: it.kind === 'img' ? it._img : null, emoji: it.e,
      cx: it.x, cy: it.y, w: d.w, h: d.h, rot: it.rot, flip: it.flip,
      adj: it.adj, selected: i === ed.sel
    });
  }
  drawStrokes(ctx);
}

// วาดเส้นปากกามือทั้งหมดลงบน context ที่กำหนด (พิกัดพื้นที่ canvas 480x800)
function drawStrokes(context) {
  if (!ed.draw.strokes.length) return;
  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';
  ed.draw.strokes.forEach(function (st) {
    if (!st.pts || st.pts.length < 2) return;
    context.strokeStyle = st.color;
    context.lineWidth = st.width;
    context.beginPath();
    context.moveTo(st.pts[0].x, st.pts[0].y);
    for (var i = 1; i < st.pts.length; i++) context.lineTo(st.pts[i].x, st.pts[i].y);
    context.stroke();
  });
  context.restore();
}

function toCanvas(e) {
  var rc = canvas.getBoundingClientRect();
  return { x: (e.clientX - rc.left) * (W / rc.width), y: (e.clientY - rc.top) * (Hc / rc.height) };
}
function hit(p) {
  for (var i = ed.items.length - 1; i >= 0; i--) {
    var it = ed.items[i];
    var d = itemWH(it);
    if (Math.abs(p.x - it.x) < d.w / 2 + 10 && Math.abs(p.y - it.y) < d.h / 2 + 10) return i;
  }
  var b = garlandBox(); // พวงมาลัยตั้งต้น (ชั้นล่างสุด)
  if (p.x > b.x - 12 && p.x < b.x + b.w + 12 && p.y > b.y - 12 && p.y < b.y + b.h + 12) return 'base';
  return -1;
}

// เป้าหมายที่กำลังเลือก: baseT | item | null  — ทั้งคู่มี x,y,scale,rot,flip เหมือนกัน
function curTarget() {
  if (ed.sel === 'base') return ed.baseT;
  if (typeof ed.sel === 'number' && ed.sel >= 0) return ed.items[ed.sel];
  return null;
}
function selActive() { return curTarget() !== null; }

var drag = null;
var ptrs = {};
var pinch = null;
function ptrArr() { return Object.keys(ptrs).map(function (k) { return ptrs[k]; }); }
function normDeg(d) { return ((d % 360) + 360) % 360; }

canvas.addEventListener('pointerdown', function (e) {
  if (ed.draw.on) {
    try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
    var p0 = toCanvas(e);
    penning = { pts: [{ x: p0.x, y: p0.y }], color: ed.draw.color, width: ed.draw.width };
    ed.draw.strokes.push(penning);
    redraw();
    return;
  }
  ptrs[e.pointerId] = { x: e.clientX, y: e.clientY };
  try { canvas.setPointerCapture(e.pointerId); } catch (x) {}
  var n = Object.keys(ptrs).length;

  if (n === 1) {
    var p = toCanvas(e);
    ed.sel = hit(p);
    var t = curTarget();
    drag = t ? { t: t, ox: t.x - p.x, oy: t.y - p.y } : null;
    syncControls(); redraw();
  } else if (n === 2 && selActive()) {
    drag = null;
    var a = ptrArr();
    var t2 = curTarget();
    pinch = {
      t: t2,
      d0: Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y) || 1,
      ang0: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x),
      scale0: t2.scale,
      rot0: t2.rot
    };
  }
});

canvas.addEventListener('pointermove', function (e) {
  if (penning) {
    var pp = toCanvas(e);
    var last = penning.pts[penning.pts.length - 1];
    if (!last || Math.hypot(pp.x - last.x, pp.y - last.y) > 1.5) {
      penning.pts.push({ x: pp.x, y: pp.y });
      redraw();
    }
    return;
  }
  if (ptrs[e.pointerId]) { ptrs[e.pointerId].x = e.clientX; ptrs[e.pointerId].y = e.clientY; }

  if (pinch && Object.keys(ptrs).length >= 2) {
    var a = ptrArr();
    var d = Math.hypot(a[1].x - a[0].x, a[1].y - a[0].y);
    var ang = Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x);
    pinch.t.scale = Math.max(0.2, Math.min(4, pinch.scale0 * (d / pinch.d0)));
    pinch.t.rot = normDeg(pinch.rot0 + (ang - pinch.ang0) * 180 / Math.PI);
    syncControls(); redraw();
    return;
  }

  if (drag) {
    var p = toCanvas(e);
    drag.t.x = Math.max(0, Math.min(W, p.x + drag.ox));
    drag.t.y = Math.max(0, Math.min(Hc, p.y + drag.oy));
    redraw();
  }
});

function endPtr(e) {
  if (penning) {
    if (penning.pts.length < 2) ed.draw.strokes.pop(); // แตะเฉย ๆ ไม่นับเป็นเส้น
    penning = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
    redraw();
    return;
  }
  delete ptrs[e.pointerId];
  try { canvas.releasePointerCapture(e.pointerId); } catch (x) {}
  if (Object.keys(ptrs).length < 2) pinch = null;
  if (Object.keys(ptrs).length === 0) drag = null;
}
canvas.addEventListener('pointerup', endPtr);
canvas.addEventListener('pointercancel', endPtr);

function isLayerSel() { return typeof ed.sel === 'number' && ed.sel >= 0; }

function syncControls() {
  var t = curTarget();
  $('#editor-selected').hidden = !t;
  var layerOnly = isLayerSel() ? '' : 'none'; // ปุ่มเหล่านี้ใช้ได้เฉพาะเลเยอร์ (ไม่ใช่พวงมาลัยตั้งต้น)
  $('#ed-del').style.display = layerOnly;
  $('#ed-forward').style.display = layerOnly;
  $('#ed-backward').style.display = layerOnly;
  if (t) { $('#ed-size').value = t.scale; $('#ed-rot').value = t.rot; }
  syncAdjInputs(); // แผงปรับสี/แสงเงา ตามชิ้นที่เลือก
}
$('#ed-size').addEventListener('input', function () { var t = curTarget(); if (t) { t.scale = +this.value; redraw(); } });
$('#ed-rot').addEventListener('input', function () { var t = curTarget(); if (t) { t.rot = +this.value; redraw(); } });
$('#ed-flip').addEventListener('click', function () { var t = curTarget(); if (t) { t.flip = !t.flip; redraw(); } });

// เปลี่ยนลำดับเลเยอร์ (ท้าย array = อยู่ด้านหน้าสุด)
function moveLayer(dir) {
  if (!isLayerSel()) return;
  var j = ed.sel + dir;
  if (j < 0 || j >= ed.items.length) return;
  var tmp2 = ed.items[ed.sel]; ed.items[ed.sel] = ed.items[j]; ed.items[j] = tmp2;
  ed.sel = j;
  syncControls(); redraw();
}
$('#ed-forward').addEventListener('click', function () { moveLayer(1); });
$('#ed-backward').addEventListener('click', function () { moveLayer(-1); });

$('#ed-del').addEventListener('click', function () {
  if (!isLayerSel()) return; // ลบได้เฉพาะเลเยอร์
  ed.items.splice(ed.sel, 1); ed.sel = -1; syncControls(); redraw();
});
$('#ed-undo').addEventListener('click', function () { ed.items.pop(); ed.sel = -1; syncControls(); redraw(); });
$('#ed-reset').addEventListener('click', function () { ed.items = []; ed.sel = -1; syncControls(); redraw(); });

function addSticker(em) {
  ed.items.push({ kind: 'emoji', e: em, x: W / 2, y: Hc * 0.4, scale: 1, rot: 0, flip: false, adj: freshAdj() });
  ed.sel = ed.items.length - 1;
  syncControls(); redraw();
}

// เพิ่มรูป (data URL) เป็นเลเยอร์สติกเกอร์
function addImgStickerSrc(src) {
  var im = new Image();
  var it = { kind: 'img', src: src, x: W / 2, y: Hc * 0.42, scale: 1, rot: 0, flip: false, adj: freshAdj(), _img: im };
  im.onload = function () { redraw(); };
  im.src = src;
  ed.items.push(it);
  ed.sel = ed.items.length - 1;
  syncControls(); redraw();
}

// เพิ่มพวงมาลัย/รูป เป็นเลเยอร์ (สติกเกอร์รูป)
function addImgSticker(id) {
  garlandAsDataUrl(id, function (src) { addImgStickerSrc(src); });
}

// ---- ปากกาวาดมือ ----
var penBtn = $('#ed-pen'), penTools = $('#ed-pen-tools');
function syncPenUI() {
  penBtn.classList.toggle('on', ed.draw.on);
  penTools.hidden = !ed.draw.on;
  $('#ed-pen-color').value = ed.draw.color;
  $('#ed-pen-size').value = ed.draw.width;
}
penBtn.addEventListener('click', function () {
  ed.draw.on = !ed.draw.on;
  if (ed.draw.on) { ed.sel = -1; syncControls(); }
  syncPenUI();
});
$('#ed-pen-color').addEventListener('input', function () { ed.draw.color = this.value; });
$('#ed-pen-size').addEventListener('input', function () { ed.draw.width = +this.value; });
$('#ed-pen-undo').addEventListener('click', function () { ed.draw.strokes.pop(); redraw(); });
$('#ed-pen-clear').addEventListener('click', function () { ed.draw.strokes = []; redraw(); });

// ---- ปรับแต่งชิ้นที่เลือก (ต่อ object) ----
var stopsEl = $('#ed-stops'), adjGrad = $('#ed-gradient'),
    adjAngle = $('#ed-gradangle'), adjAngleWrap = $('#ed-grad-angle-wrap'),
    adjAmt = $('#ed-coloramt'), adjSat = $('#ed-sat'), adjLight = $('#ed-light'),
    adjShadow = $('#ed-shadow'), adjRound = $('#ed-round');

function curAdj() { var t = curTarget(); return t ? t.adj : null; }

// ทับสีที่พวงมาลัยตั้งต้น → ซ่อนแถวเลือกพวงมาลัยพื้นฐาน
function updateBaseVisibility() { $('#ed-base-section').hidden = ed.baseT.adj.tintAmt > 0; }
function updateGradUI() { var a = curAdj(); adjAngleWrap.hidden = !(a && a.gradient); }
function bumpTintIfOff() {
  var a = curAdj(); if (a && a.tintAmt === 0) { a.tintAmt = 0.5; adjAmt.value = 0.5; }
}

function renderStops() {
  var a = curAdj();
  stopsEl.innerHTML = '';
  if (!a) return;
  a.stops.forEach(function (hex, i) {
    var box = document.createElement('span');
    box.className = 'ed-stop';
    var inp = document.createElement('input');
    inp.type = 'color';
    inp.value = hex;
    inp.addEventListener('input', function () {
      a.stops[i] = this.value;
      bumpTintIfOff(); updateBaseVisibility(); redraw();
    });
    box.appendChild(inp);
    if (a.gradient && a.stops.length > 2) {
      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'ed-stop-x';
      rm.textContent = '×';
      rm.title = 'ลบสีนี้';
      rm.addEventListener('click', function () { a.stops.splice(i, 1); renderStops(); redraw(); });
      box.appendChild(rm);
    }
    stopsEl.appendChild(box);
  });
  if (a.gradient && a.stops.length < MAX_STOPS) {
    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'ed-stop-add';
    add.textContent = '＋';
    add.title = 'เพิ่มสี';
    add.addEventListener('click', function () {
      a.stops.push(PALETTE[a.stops.length % PALETTE.length]);
      bumpTintIfOff(); renderStops(); updateBaseVisibility(); redraw();
    });
    stopsEl.appendChild(add);
  }
}

function syncAdjInputs() {
  var a = curAdj();
  $('#ed-adjust-section').hidden = !a;
  if (!a) { stopsEl.innerHTML = ''; return; }
  adjGrad.checked = a.gradient;
  adjAngle.value = a.gradAngle;
  adjAmt.value = a.tintAmt;
  adjSat.value = a.sat;
  adjLight.value = a.light;
  adjShadow.value = a.shadow;
  adjRound.value = a.round;
  updateGradUI();
  renderStops();
}

adjGrad.addEventListener('change', function () {
  var a = curAdj(); if (!a) return;
  a.gradient = this.checked;
  if (a.gradient) { if (a.stops.length < 2) a.stops.push(PALETTE[1]); bumpTintIfOff(); }
  updateGradUI(); renderStops(); updateBaseVisibility(); redraw();
});
adjAngle.addEventListener('input', function () { var a = curAdj(); if (a) { a.gradAngle = +this.value; redraw(); } });
adjAmt.addEventListener('input', function () { var a = curAdj(); if (a) { a.tintAmt = +this.value; updateBaseVisibility(); redraw(); } });
adjSat.addEventListener('input', function () { var a = curAdj(); if (a) { a.sat = +this.value; redraw(); } });
adjLight.addEventListener('input', function () { var a = curAdj(); if (a) { a.light = +this.value; redraw(); } });
adjShadow.addEventListener('input', function () { var a = curAdj(); if (a) { a.shadow = +this.value; redraw(); } });
adjRound.addEventListener('input', function () { var a = curAdj(); if (a) { a.round = +this.value; redraw(); } });
$('#ed-adjreset').addEventListener('click', function () {
  var t = curTarget(); if (!t) return;
  t.adj = freshAdj();
  if (ed.sel === 'base') { ed.baseT.x = W / 2; ed.baseT.y = Hc / 2; ed.baseT.scale = 1; ed.baseT.rot = 0; ed.baseT.flip = false; }
  $('#ed-size').value = t.scale; $('#ed-rot').value = t.rot;
  syncAdjInputs(); updateBaseVisibility(); redraw();
});

function garlandThumbBtn(id) {
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'ed-thumb';
  b.dataset.gid = id;
  var im = document.createElement('img');
  im.src = garlandThumb(id);
  b.appendChild(im);
  return b;
}

var TEMPLATES = [
  { name: '🤍 มะลิคลาสสิก', base: 'malai-1',
    adj: { tintAmt: 0, gradient: false, stops: ['#c1272d'], gradAngle: 90, sat: 1, light: 1.04, shadow: 0.32, round: 0 } },
  { name: '👑 โทนทอง', base: 'malai-3',
    adj: { tintAmt: 0.62, gradient: true, stops: ['#f6df9a', '#d4ab53', '#8a5a2b'], gradAngle: 90, sat: 1.18, light: 1.02, shadow: 0.38, round: 0 } },
  { name: '🌈 สายรุ้ง', base: 'malai-2',
    adj: { tintAmt: 0.72, gradient: true, stops: ['#e0559b', '#f4a300', '#d9b64e', '#2e7d5b', '#1e78c8', '#7d5ba6'], gradAngle: 55, sat: 1.25, light: 1, shadow: 0.3, round: 0 } }
];
function applyTemplate(t) {
  ed.baseT.adj = Object.assign(freshAdj(), t.adj, { stops: t.adj.stops.slice() });
  if (t.base && editorBaseIds().indexOf(t.base) !== -1) loadBase(t.base);
  ed.sel = 'base';
  buildPalettes();
  syncControls(); updateBaseVisibility(); redraw();
}

function buildPalettes() {
  var ids = editorBaseIds();

  var tplEl = $('#ed-templates'); tplEl.innerHTML = '';
  TEMPLATES.forEach(function (t) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'mini-btn ed-tpl';
    b.textContent = t.name;
    b.addEventListener('click', function () { applyTemplate(t); });
    tplEl.appendChild(b);
  });

  var basesEl = $('#ed-bases'); basesEl.innerHTML = '';
  ids.forEach(function (g) {
    var b = garlandThumbBtn(g);
    if (g === ed.base) b.classList.add('on');
    b.addEventListener('click', function () {
      basesEl.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on'); loadBase(g);
    });
    basesEl.appendChild(b);
  });

  var layersEl = $('#ed-layers'); layersEl.innerHTML = '';
  ids.forEach(function (g) {
    var b = garlandThumbBtn(g);
    b.addEventListener('click', function () { addImgSticker(g); });
    layersEl.appendChild(b);
  });

  var stEl = $('#ed-stickers'); stEl.innerHTML = '';
  EMOJI.forEach(function (em) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'ed-emoji';
    b.textContent = em;
    b.addEventListener('click', function () { addSticker(em); });
    stEl.appendChild(b);
  });
}

function inCommittee() { return document.querySelector('.screen.active').id === 'screen-committee'; }

function open() {
  var cur = inCommittee() ? cState.garland : state.garland;
  var base = (cur && editorBaseIds().indexOf(cur) !== -1) ? cur : 'malai-1';
  ed = freshEd(base); // ใช้พวงมาลัยที่เลือกอยู่เป็นฐาน (รวมที่เซฟเอง)
  editorBaseIds().forEach(fetchInner);
  buildPalettes();
  syncAdjInputs();
  updateGradUI();
  updateBaseVisibility();
  syncControls();
  syncPenUI();
  wrap.hidden = false;
  loadBase(ed.base);
  redraw();
}
function close() { wrap.hidden = true; }

function rasterThumb(source, cb) {
  var im = new Image();
  im.onload = function () {
    var tw = THUMB_SIDE, th = Math.round(THUMB_SIDE * Hc / W);
    var tc = document.createElement('canvas');
    tc.width = tw; tc.height = th;
    tc.getContext('2d').drawImage(im, 0, 0, tw, th);
    var t;
    try { t = tc.toDataURL('image/webp', 0.82); } catch (e) { t = null; }
    if (!t || t.indexOf('data:image/webp') !== 0) t = tc.toDataURL('image/png');
    cb(t);
  };
  im.onerror = function () { cb(source); };
  im.src = source;
}

function finishSave(src, thumb) {
  var id = 'custom-' + Date.now();
  customGarlands.push({ id: id, src: src, thumb: thumb });
  saveCustom();
  var committee = inCommittee();
  buildGarlandStrip();
  buildCommitteeStrip();
  if (committee) selectCommitteeGarland(id);
  else selectGarland(id);
  close();
  toast('บันทึกพวงมาลัยที่แต่งแล้ว');
}

function save() {
  var svg = buildSVG();
  if (svg) {
    var src = svgDataUrl(svg);
    if (src.length > 900000) {
      // SVG ใหญ่มาก (ซ้อนรูปหลายชั้น) → แปลงทั้งหมดเป็น PNG กันไฟล์บวม
      rasterThumb(src, function (big) {
        rasterThumb(big, function (t) { finishSave(big, t); });
      });
    } else if (src.length > 40000) {
      rasterThumb(src, function (t) { finishSave(src, t); });
    } else {
      finishSave(src, src);
    }
    return;
  }
  // สำรอง: export เป็น PNG (วาดใหม่โดยไม่มีกรอบเลือกก่อน)
  var keepSel = ed.sel;
  ed.sel = -1;
  redraw();
  var png = canvas.toDataURL('image/png');
  var tc = drawScaledFrom(canvas, THUMB_SIDE, Math.round(THUMB_SIDE * Hc / W));
  var pthumb;
  try { pthumb = tc.toDataURL('image/webp', 0.85); } catch (e) { pthumb = null; }
  if (!pthumb || pthumb.indexOf('data:image/webp') !== 0) pthumb = tc.toDataURL('image/png');
  ed.sel = keepSel;
  finishSave(png, pthumb);
}

$('#open-editor').addEventListener('click', open);
$('#c-open-editor').addEventListener('click', open);
$('#editor-cancel').addEventListener('click', close);
$('#editor-save').addEventListener('click', save);
