// AMOR FATI — engine: scene management, cinematic dressing (letterbox,
// grain, vignette), the Demon's interludes, captions. Scenes are objects
// with enter/update/draw; the engine owns the frame and the dark.
(function () {
  Z.scenes = {};
  Z.W = 960; Z.H = 540;

  Z.input = {
    left: false, right: false, up: false, down: false,
    use: false, space: false,
    usePressed: false, spacePressed: false, anyPressed: false,
    mx: 480, my: 270, mdown: false, mclicked: false,
  };

  const KEYS = {
    a: 'left', arrowleft: 'left', d: 'right', arrowright: 'right',
    w: 'up', arrowup: 'up', s: 'down', arrowdown: 'down',
    e: 'use', ' ': 'space',
  };

  Z.engine = {
    scene: null, sceneName: '',
    fade: 1, fadeTarget: 0, fadeSpeed: 1.2,
    interlude: null, caption: null,
    time: 0, grainCv: null, shake: 0,

    init(cv, g) {
      this.cv = cv; this.g = g;
      // grain texture
      this.grainCv = document.createElement('canvas');
      this.grainCv.width = 480; this.grainCv.height = 270;
      const gg = this.grainCv.getContext('2d');
      const img = gg.createImageData(480, 270);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 118 + Math.random() * 20 | 0;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
        img.data[i + 3] = 14;
      }
      gg.putImageData(img, 0, 0);
    },

    go(name, opts = {}) {
      this.fadeTarget = 1;
      this.pending = { name, opts };
    },
    goNow(name, opts = {}) {
      Z.audio.stopAmb();
      this.sceneName = name;
      this.scene = Z.scenes[name];
      this.scene.enter?.(opts);
      this.fade = 1; this.fadeTarget = 0;
    },

    // The Demon speaks: black screen, patient serif type.
    // lines: array of strings ('' = beat pause). advance with any key.
    speak(lines, onDone, opts = {}) {
      Z.audio.sfx('demon', { vol: opts.quiet ? 0.4 : 1 });
      this.interlude = {
        lines, onDone, li: 0, chars: 0, t: 0,
        done: false, style: opts.style || 'demon',
      };
    },

    say(text, dur = 3.5) { this.caption = { text, t: 0, dur }; },

    update(dt) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 2);

      // fade + pending scene swap
      this.fade = Z.clamp(this.fade + (this.fadeTarget - this.fade > 0 ? 1 : -1) * this.fadeSpeed * dt, 0, 1);
      if (this.pending && this.fade >= 0.999) {
        const p = this.pending; this.pending = null;
        this.goNow(p.name, p.opts);
      }

      // interlude swallows the world
      if (this.interlude) {
        const it = this.interlude;
        it.t += dt;
        const line = it.lines[it.li] || '';
        if (it.chars < line.length) {
          const speed = 28;
          const before = it.chars;
          it.chars = Math.min(line.length, it.chars + dt * speed);
          if ((it.chars | 0) > (before | 0) && line[it.chars | 0] !== ' ') Z.audio.sfx('type', { vol: 0.5 });
        }
        if (Z.input.anyPressed || Z.input.mclicked) {
          if (it.chars < line.length) it.chars = line.length;
          else if (it.li < it.lines.length - 1) { it.li++; it.chars = 0; it.t = 0; }
          else { this.interlude = null; it.onDone?.(); }
        }
        this.clearPressed();
        return;
      }

      if (this.caption) {
        this.caption.t += dt;
        if (this.caption.t > this.caption.dur) this.caption = null;
      }

      this.scene?.update?.(dt);
      this.clearPressed();
    },

    clearPressed() {
      Z.input.usePressed = Z.input.spacePressed = Z.input.anyPressed = Z.input.mclicked = false;
    },

    draw() {
      const g = this.g;
      g.save();
      if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake * 22, (Math.random() - 0.5) * this.shake * 14);
      this.scene?.draw?.(g);
      g.restore();

      // film dressing
      g.drawImage(this.grainCv, Math.random() * -20, Math.random() * -14, 1000, 568);
      const vig = g.createRadialGradient(480, 270, 260, 480, 270, 640);
      vig.addColorStop(0, 'rgba(0,0,0,0)');
      vig.addColorStop(1, 'rgba(0,0,0,0.42)');
      g.fillStyle = vig; g.fillRect(0, 0, 960, 540);
      g.fillStyle = '#000';
      g.fillRect(0, 0, 960, 26); g.fillRect(0, 514, 960, 26);

      // caption
      if (this.caption) {
        const c = this.caption;
        const a = Math.min(1, c.t * 2.5, (c.dur - c.t) * 1.6);
        g.globalAlpha = Z.clamp(a, 0, 1);
        g.font = 'italic 19px Georgia, serif';
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#000'; g.fillText(c.text, 481, 489);
        g.fillStyle = '#e8e2d4'; g.fillText(c.text, 480, 488);
        g.globalAlpha = 1;
      }

      // interlude over everything
      if (this.interlude) {
        const it = this.interlude;
        g.fillStyle = '#010102'; g.fillRect(0, 0, 960, 540);
        g.textAlign = 'center'; g.textBaseline = 'middle';
        const line = it.lines[it.li] || '';
        const shown = line.slice(0, it.chars | 0);
        const isDemon = it.style === 'demon';
        g.font = isDemon ? '24px Georgia, serif' : 'italic 22px Georgia, serif';
        g.fillStyle = isDemon ? '#cfc6b8' : '#9fb4c8';
        const words = shown.split(' ');
        let lines2 = [''], w = 0;
        for (const word of words) {
          const test = lines2[lines2.length - 1] + (lines2[lines2.length - 1] ? ' ' : '') + word;
          if (g.measureText(test).width > 780) lines2.push(word);
          else lines2[lines2.length - 1] = test;
        }
        lines2.forEach((l, i) => g.fillText(l, 480, 250 + i * 36 - (lines2.length - 1) * 18));
        if (it.chars >= line.length && Math.floor(it.t * 1.6) % 2 === 0) {
          g.font = '13px Georgia, serif';
          g.fillStyle = '#5a5348';
          g.fillText(it.li < it.lines.length - 1 ? '· · ·' : '— any key —', 480, 470);
        }
      }

      // fade curtain
      if (this.fade > 0.002) {
        g.fillStyle = `rgba(1,1,2,${this.fade})`;
        g.fillRect(0, 0, 960, 540);
      }
    },
  };

  Z.go = (name, opts) => Z.engine.go(name, opts);
  Z.speak = (lines, onDone, opts) => Z.engine.speak(lines, onDone, opts);
  Z.say = (t, d) => Z.engine.say(t, d);

  // ---------- input wiring ----------
  window.addEventListener('keydown', (e) => {
    Z.audio.ensure();
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (KEYS[k]) { Z.input[KEYS[k]] = true; e.preventDefault(); }
    if (k === 'e') Z.input.usePressed = true;
    if (k === ' ') Z.input.spacePressed = true;
    Z.input.anyPressed = true;
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (KEYS[k]) Z.input[KEYS[k]] = false;
  });
})();
