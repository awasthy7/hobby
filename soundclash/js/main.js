// SOUNDCLASH — boot, input, loop. ?fight=riff,echo&cpu=1&level=2&fast=1
// jumps straight into a match for testing.

(function () {
  const KEYMAP = {
    p1: { a: 'left', d: 'right', w: 'up', s: 'down', j: 'light', k: 'heavy', l: 'special', u: 'super' },
    p2: { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', ',': 'light', '.': 'heavy', '/': 'special', m: 'super' },
  };

  const blank = () => ({
    left: false, right: false, up: false, down: false,
    light: false, heavy: false, special: false, super: false,
    leftPressed: false, rightPressed: false, upPressed: false, downPressed: false,
    lightPressed: false, heavyPressed: false, specialPressed: false, superPressed: false,
  });
  S.input = { p1: blank(), p2: blank(), enterPressed: false };
  S.paused = false;

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    S.audio.ensure();
    if (!S.audio.music && S.sceneName !== 'match') {
      S.audio.startMusic('synthwave', { intensity: 1, volume: 0.7 });
    }
    if (e.key === 'Enter') S.input.enterPressed = true;
    if (e.key === 'Escape') S.paused = !S.paused;
    for (const side of ['p1', 'p2']) {
      const act = KEYMAP[side][e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (act) {
        S.input[side][act] = true;
        S.input[side][act + 'Pressed'] = true;
        e.preventDefault();
      }
    }
  });
  window.addEventListener('keyup', (e) => {
    for (const side of ['p1', 'p2']) {
      const act = KEYMAP[side][e.key.length === 1 ? e.key.toLowerCase() : e.key];
      if (act) S.input[side][act] = false;
    }
  });

  S.setScene = function (name, ...args) {
    S.sceneName = name;
    S.scene = S.scenes[name];
    S.scene.enter?.(...args);
  };

  function clearPressed() {
    for (const side of ['p1', 'p2']) {
      for (const k of Object.keys(S.input[side])) {
        if (k.endsWith('Pressed')) S.input[side][k] = false;
      }
    }
    S.input.enterPressed = false;
  }

  function boot() {
    const cv = document.getElementById('stage');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = 960 * dpr;
    cv.height = 540 * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    const params = new URLSearchParams(location.search);
    const fight = params.get('fight');
    S.FAST = params.get('fast') === '1';
    if (fight) {
      const [k1, k2] = fight.split(',');
      S.game.start(k1 || 'riff', k2 || 'echo', {
        cpu: params.get('cpu') !== '0',
        level: parseInt(params.get('level') || '1', 10),
      });
      if (S.FAST) { S.game.f1.hp = S.game.f1.maxHp = 320; S.game.f2.hp = S.game.f2.maxHp = 320; }
      S.setScene('match');
    } else {
      S.setScene('title');
    }

    let last = performance.now();
    function loop(ts) {
      const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
      last = ts;
      S.audio.update(dt);
      if (!S.paused) S.scene.update(dt);
      S.scene.draw(g);
      if (S.paused) {
        g.fillStyle = 'rgba(0,0,0,0.6)';
        g.fillRect(0, 0, 960, 540);
        S.gfx.text(g, 'PAUSED', 480, 260, 54, { fill: '#fff' });
        S.gfx.text(g, 'ESC to resume', 480, 310, 16, { fill: '#8891ac', stroke: null });
      }
      clearPressed();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
