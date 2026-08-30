import {
  $, state, cState, socket, toast, show, persist,
  garlandSrc, garlandThumb, attachSwipe, fillGarlandStrip, onCustomGarlandsChanged
} from './core.js';

// ---------- committee ----------
export function selectCommitteeGarland(id) {
  cState.garland = id;
  var all = $('#c-garland-strip').querySelectorAll('button[data-garland]');
  for (var i = 0; i < all.length; i++) all[i].classList.toggle('selected', all[i].dataset.garland === id);
  updateCStage();
}

export function buildCommitteeStrip() {
  fillGarlandStrip($('#c-garland-strip'), cState.garland, selectCommitteeGarland, function (id) {
    if (cState.garland === id) cState.garland = null;
    updateCStage();
  });
}
onCustomGarlandsChanged(buildCommitteeStrip); // อัปเดตแถบนี้เมื่อพวงมาลัยที่แต่งเองเปลี่ยน (เช่น ลบทิ้ง)

function updateCStage() {
  var c = $('#c-garland-card');
  if (cState.garland && !cState.sent) {
    $('#c-garland-card-img').src = garlandSrc(cState.garland);
    c.hidden = false;
    $('#c-stage-hint').hidden = true;
    commSwipe.reset();
  } else {
    c.hidden = true;
    $('#c-stage-hint').hidden = false;
  }
}

var commSwipe = attachSwipe($('#c-garland-card'), launchCommittee);

function launchCommittee(charge) {
  socket.emit('send-to-all-teachers', {
    src: garlandSrc(cState.garland),
    thumb: garlandThumb(cState.garland),
    power: +(charge || 0).toFixed(2)
  });
}

socket.on('registered', function (d) {
  if (!d || d.role !== 'committee') return;
  $('#committee-hello').textContent = 'สวัสดี ' + state.name;
  cState.garland = null; cState.sent = false;
  buildCommitteeStrip();
  $('#committee-pick').hidden = false;
  $('#committee-done').hidden = true;
  updateCStage();
  if (d.alreadySent) showCommitteeDone(null, 'ท่านได้ส่งพวงมาลัยไปแล้ว 🙏');
  show('screen-committee');
});

socket.on('register-rejected', function (d) {
  window.alert((d && d.reason) || 'เข้าใช้งานไม่ได้');
  state.role = null; state.name = '';
  persist();
  show('screen-role');
});

function showCommitteeDone(count, text) {
  cState.sent = true;
  $('#committee-pick').hidden = true;
  $('#committee-done').hidden = false;
  $('#committee-done-text').textContent = text || ('ส่งพวงมาลัยให้อาจารย์ ' + (count || 0) + ' ท่านแล้ว 🙏');
  updateCStage();
}

socket.on('send-all-ok', function (d) {
  showCommitteeDone((d && d.count) || 0);
});

socket.on('send-failed', function (d) {
  commSwipe.reset(); updateCStage();
  toast((d && d.reason) || 'ส่งไม่สำเร็จ', true);
});
