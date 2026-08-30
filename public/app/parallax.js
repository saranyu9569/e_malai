import { $ } from './core.js';

// ---------- พารัลแลกซ์: เอียงเครื่องแล้วป๊อปอัปพวงมาลัยขยับ ----------
if (!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
  var inner = null;
  var onOrient = function (e) {
    if (e.gamma == null && e.beta == null) return;
    var g = Math.max(-28, Math.min(28, e.gamma || 0));      // ซ้าย-ขวา
    var b = Math.max(-28, Math.min(28, (e.beta || 0) - 42)); // ก้ม-เงย (หักค่ากลางถือมือ)
    var el = inner || (inner = $('.incoming-inner'));
    if (!el) return;
    el.style.setProperty('--tiltx', (g / 28 * 16).toFixed(1) + 'px');
    el.style.setProperty('--tilty', (b / 28 * 16).toFixed(1) + 'px');
  };
  var enable = function () {
    var DO = window.DeviceOrientationEvent;
    if (!DO) return;
    if (typeof DO.requestPermission === 'function') {
      DO.requestPermission().then(function (st) {
        if (st === 'granted') window.addEventListener('deviceorientation', onOrient);
      }).catch(function () {});
    } else {
      window.addEventListener('deviceorientation', onOrient);
    }
  };
  window.addEventListener('pointerdown', function once() {
    window.removeEventListener('pointerdown', once);
    enable();
  }, { once: true });
}
