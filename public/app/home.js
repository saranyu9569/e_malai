import { $, show, toast, persist, state, cState, customGarlands, socket } from './core.js';
import { enterStudent } from './student.js';
import { enterTeacher, resetTeacherUI } from './teacher.js';
import { closeWall } from './wall-sheet.js';

// ---------- committee counter on home ----------
socket.on('committee-status', function (s) {
  var btn = $('#role-committee');
  var c = (s && s.count) || 0;
  var m = (s && s.max) || 5;
  $('#committee-counter').textContent = c + '/' + m;
  var full = c >= m;
  btn.disabled = full;
  btn.classList.toggle('disabled', full);
});

// ---------- role screen ----------
var roleBtns = document.querySelectorAll('.role-btn');
for (var r = 0; r < roleBtns.length; r++) {
  roleBtns[r].addEventListener('click', function () {
    if (this.disabled || this.classList.contains('disabled')) return;
    var role = this.getAttribute('data-role');
    state.role = role;
    $('#name-title').textContent =
      role === 'teacher' ? 'กรอกชื่ออาจารย์' : role === 'committee' ? 'กรอกชื่อกรรมการ' : 'กรอกชื่อนักศึกษา';
    $('#first-name').value = '';
    $('#last-name').value = '';
    $('#name-submit').disabled = true;
    show('screen-name');
    $('#first-name').focus();
  });
}

var backBtns = document.querySelectorAll('[data-back]');
for (var b = 0; b < backBtns.length; b++) {
  backBtns[b].addEventListener('click', function () {
    var target = this.getAttribute('data-back');
    if (target === 'screen-role') { state.role = null; persist(); }
    show(target);
  });
}

// ---------- ปีการศึกษา (แก้ไขได้ด้วยการกดย้ำ ๆ) ----------
var YEAR_KEY = 'emalai_year';
var yearVal = $('#year-val');
function loadYear() {
  var y;
  try { y = localStorage.getItem(YEAR_KEY); } catch (e) {}
  if (y) yearVal.textContent = y;
}
loadYear();
var yearTaps = 0, yearTapTimer;
$('#year-line').addEventListener('click', function () {
  yearTaps++;
  clearTimeout(yearTapTimer);
  yearTapTimer = setTimeout(function () { yearTaps = 0; }, 2500);
  if (yearTaps < 5) return;
  yearTaps = 0;
  var cur = yearVal.textContent.trim();
  var next = window.prompt('แก้ไขปีการศึกษา', cur);
  if (next == null) return;
  next = next.replace(/\s+/g, ' ').trim().slice(0, 20) || cur;
  yearVal.textContent = next;
  try { localStorage.setItem(YEAR_KEY, next); } catch (e) {}
});

// ---------- back to home (ล้างข้อมูลในเครื่อง) ----------
function goHome() {
  if (!window.confirm('ออกจากระบบและล้างข้อมูลในเครื่องนี้ เพื่อเริ่มใหม่?')) return;
  var keepYear;
  try { keepYear = localStorage.getItem(YEAR_KEY); } catch (e) {}
  try { localStorage.clear(); } catch (e) {}
  try { if (keepYear) localStorage.setItem(YEAR_KEY, keepYear); } catch (e) {}
  try { sessionStorage.clear(); } catch (e) {}
  try {
    document.cookie.split(';').forEach(function (c) {
      var n = c.split('=')[0].trim();
      if (n) document.cookie = n + '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/';
    });
  } catch (e) {}
  customGarlands.length = 0;
  state.role = null; state.name = ''; state.garland = null;
  state.teacherId = null; state.teacherQuery = ''; state.receivedCount = 0;
  cState.garland = null; cState.sent = false;
  resetTeacherUI();
  closeWall();
  try { socket.disconnect(); socket.connect(); } catch (e) {}
  show('screen-role');
}
var homeBtns = document.querySelectorAll('.home-btn');
for (var h = 0; h < homeBtns.length; h++) homeBtns[h].addEventListener('click', goHome);

// ---------- name screen ----------
var firstName = $('#first-name');
var lastName = $('#last-name');
var nameSubmit = $('#name-submit');
function checkName() { nameSubmit.disabled = !(firstName.value.trim() && lastName.value.trim()); }
firstName.addEventListener('input', checkName);
lastName.addEventListener('input', checkName);

$('#name-form').addEventListener('submit', function (e) {
  e.preventDefault();
  state.name = (firstName.value.trim() + ' ' + lastName.value.trim()).replace(/\s+/g, ' ');
  persist();
  socket.emit('register', { role: state.role, name: state.name });

  if (state.role === 'student') {
    enterStudent();
  } else if (state.role === 'teacher') {
    enterTeacher();
  } else {
    toast('กำลังเข้าห้องกรรมการ…'); // รอ event 'registered' / 'register-rejected'
  }
});
