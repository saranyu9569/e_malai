import { $, socket, toast } from './core.js';

// ---------- พวงมาลัยรวม (จอพิธี) — เติมดอกไม้ได้หลายดอก ----------
var WALL_EMOJI = ['🌼', '🌸', '💮', '🏵️', '🌺', '🌻', '🌷', '🪷', '🌹', '💐'];
var wallSheet = $('#wall-sheet');
var wallSel = '🌼', wallHue = 0, wallBusy = false;

function wallPreview() {
  var pv = $('#wall-preview');
  pv.textContent = wallSel;
  pv.style.setProperty('--wh', wallHue + 'deg');
}
function buildWallEmoji() {
  var row = $('#wall-emoji');
  row.innerHTML = '';
  WALL_EMOJI.forEach(function (em) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    if (em === wallSel) b.classList.add('on');
    b.addEventListener('click', function () {
      wallSel = em;
      row.querySelectorAll('button').forEach(function (x) { x.classList.remove('on'); });
      b.classList.add('on');
      wallPreview();
    });
    row.appendChild(b);
  });
}
function openWall() {
  buildWallEmoji();
  $('#wall-hue').value = wallHue;
  wallPreview();
  $('#wall-send').disabled = false;
  $('#wall-send').textContent = 'เติมดอกไม้ 🌸';
  wallSheet.hidden = false;
}
export function closeWall() { wallSheet.hidden = true; }
document.querySelectorAll('[data-wall-open]').forEach(function (b) {
  b.addEventListener('click', openWall);
});
$('#wall-close').addEventListener('click', closeWall);
wallSheet.addEventListener('click', function (e) { if (e.target === wallSheet) closeWall(); });
$('#wall-hue').addEventListener('input', function () { wallHue = +this.value; wallPreview(); });
$('#wall-send').addEventListener('click', function () {
  if (wallBusy) return;
  wallBusy = true;
  $('#wall-send').disabled = true;
  socket.emit('wall-add', { e: wallSel, hue: wallHue });
  setTimeout(function () { wallBusy = false; $('#wall-send').disabled = false; }, 500);
});
socket.on('wall-added', function (d) {
  wallBusy = false;
  $('#wall-send').disabled = false;
  if (d && d.limit) { toast('เติมครบจำนวนสูงสุดต่อคนแล้ว 🌸'); return; }
  var mine = d && d.mine;
  toast(mine ? ('เติมดอกไม้แล้ว · คุณเติมไป ' + mine + ' ดอก 🌸') : 'เติมดอกไม้ลงพวงมาลัยรวมแล้ว 🌸');
});
