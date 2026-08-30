import {
  $, state, socket, toast, show, muted,
  garlandSrc, garlandThumb, attachSwipe, fillGarlandStrip, onCustomGarlandsChanged
} from './core.js';

export function enterStudent() {
  $('#student-hello').textContent = 'สวัสดี ' + state.name;
  buildGarlandStrip();
  renderTeachers();
  updateStage();
  show('screen-student');
}

// ---------- student: garland strip ----------
export function selectGarland(id) {
  state.garland = id;
  var all = $('#garland-strip').querySelectorAll('button[data-garland]');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('selected', all[i].dataset.garland === id);
  updateStage();
}

export function buildGarlandStrip() {
  fillGarlandStrip($('#garland-strip'), state.garland, selectGarland, function (id) {
    if (state.garland === id) state.garland = null;
    updateStage();
  });
}
onCustomGarlandsChanged(buildGarlandStrip); // อัปเดตแถบนี้เมื่อพวงมาลัยที่แต่งเองเปลี่ยน (เช่น ลบทิ้ง)

// ---------- student: teacher list ----------
socket.on('teachers', function (list) {
  state.teachers = list || [];
  if (state.teacherId && !state.teachers.some(function (t) { return t.id === state.teacherId; })) {
    state.teacherId = null;
    updateStage();
  }
  renderTeachers();
});

function renderTeachers() {
  var wrap = $('#teacher-list');
  var search = $('#teacher-search');
  wrap.innerHTML = '';
  search.hidden = state.teachers.length === 0;

  if (!state.teachers.length) { wrap.appendChild(muted('ยังไม่มีอาจารย์ออนไลน์')); return; }

  var q = state.teacherQuery.trim().toLowerCase();
  var list = state.teachers.filter(function (t) { return !q || t.name.toLowerCase().indexOf(q) !== -1; });
  if (state.teacherId && !list.some(function (t) { return t.id === state.teacherId; })) {
    var sel = state.teachers.find(function (t) { return t.id === state.teacherId; });
    if (sel) list = [sel].concat(list);
  }
  if (!list.length) { wrap.appendChild(muted('ไม่พบอาจารย์ชื่อ “' + state.teacherQuery.trim() + '”')); return; }

  list.forEach(function (t) {
    var chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'teacher-chip' + (t.id === state.teacherId ? ' selected' : '');
    chip.textContent = 'อ.' + t.name;
    chip.addEventListener('click', function () {
      state.teacherId = t.id;
      renderTeachers();
      updateStage();
    });
    wrap.appendChild(chip);
  });
}

$('#teacher-search').addEventListener('input', function () {
  state.teacherQuery = this.value;
  renderTeachers();
});

// ---------- student: stage ----------
var stageHint = $('#stage-hint');
var card = $('#garland-card');
var cardImg = $('#garland-card-img');
var swipeText = $('#swipe-text');
var studentSwipe = attachSwipe(card, launchStudent);

function selectedTeacherName() {
  var t = state.teachers.find(function (x) { return x.id === state.teacherId; });
  return t ? t.name : null;
}

function updateStage() {
  var ready = state.garland && state.teacherId;
  if (ready) {
    cardImg.src = garlandSrc(state.garland);
    swipeText.textContent = 'ปัดขึ้นเพื่อส่งให้ อ.' + selectedTeacherName();
    card.hidden = false;
    stageHint.hidden = true;
    studentSwipe.reset();
  } else {
    card.hidden = true;
    stageHint.hidden = false;
    if (!state.garland && !state.teacherId) stageHint.innerHTML = 'เลือกพวงมาลัยและอาจารย์ก่อน<br />แล้วจึงปัดขึ้นเพื่อส่ง';
    else if (!state.garland) stageHint.textContent = 'เลือกพวงมาลัยที่จะส่ง';
    else stageHint.textContent = 'เลือกอาจารย์ปลายทาง';
  }
}

function launchStudent(charge) {
  var teacherName = selectedTeacherName();
  socket.emit('send-garland', {
    toTeacherId: state.teacherId,
    src: garlandSrc(state.garland),
    thumb: garlandThumb(state.garland),
    power: +(charge || 0).toFixed(2)
  });
  setTimeout(function () {
    state.garland = null;
    var sel = document.querySelectorAll('#garland-strip button.selected');
    for (var i = 0; i < sel.length; i++) sel[i].classList.remove('selected');
    updateStage();
    if (teacherName) {
      toast((charge > 0.6 ? 'ส่งพวงมาลัยเต็มพลังให้ อ.' : 'ส่งพวงมาลัยให้ อ.') + teacherName + ' แล้ว 🙏');
    }
  }, 640);
}

socket.on('send-ok', function () {});
socket.on('send-failed', function (d) {
  studentSwipe.reset(); updateStage();
  toast((d && d.reason) || 'ส่งไม่สำเร็จ', true);
});
