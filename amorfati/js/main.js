// AMOR FATI — boot. ?scene=desert jumps straight to a scene for testing;
// ?reset=1 forgets every recurrence (the demon disapproves).
(function () {
  function boot() {
    const cv = document.getElementById('stage');
    const g = cv.getContext('2d');
    Z.save.load();

    const params = new URLSearchParams(location.search);
    if (params.get('reset') === '1') {
      Z.save.data = { loop: 1, yes: 0, flags: {} };
      Z.save.write();
    }

    Z.engine.init(cv, g);

    // mouse
    cv.addEventListener('mousemove', (e) => {
      const r = cv.getBoundingClientRect();
      Z.input.mx = (e.clientX - r.left) / r.width * 960;
      Z.input.my = (e.clientY - r.top) / r.height * 540;
    });
    cv.addEventListener('mousedown', (e) => {
      Z.audio.ensure();
      Z.input.mdown = true;
      Z.input.mclicked = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => { Z.input.mdown = false; });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    const start = params.get('scene');
    Z.engine.goNow(start && Z.scenes[start] ? start : 'title');

    let last = performance.now();
    function loop(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
      last = ts;
      Z.engine.update(dt);
      Z.engine.draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
