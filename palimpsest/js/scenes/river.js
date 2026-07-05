// FOLIO I — THE RIVER. Heraclitus. Flux. Gather what the current brings;
// three times it will ask what kind of soul you are.

P.app.register('river', {
  NEEDED: 10,
  LEXICON: ['current', 'glimmer', 'undertow', 'threshold', 'elsewhere', 'almost',
    'ember', 'sooner', 'north', 'lantern', 'hush', 'vessel', 'tributary', 'meander',
    'confluence', 'silt', 'reeds', 'ford', 'eddy', 'downstream'],
  PAIRS: [
    { a: 'stone', b: 'current' },
    { a: 'hold', b: 'release' },
    { a: 'remain', b: 'become' },
  ],

  enter() {
    P.audio.scene({ root: 73.42, scale: [0, 2, 4, 7, 9], chimeRoot: 293.66, padVol: 0.05 });
    this.NEEDED = P.FAST ? 4 : 10;
    this.PAIR_AT = P.FAST ? [1, 2, 3] : [3, 6, 9];
    P.profile.data.flux = []; // this folio owns the river choices
    this.particles = new P.Particles(700);
    this.streams = [];
    this.words = [];
    this.pair = null;
    this.captured = 0;
    this.pairsDone = 0;
    this.spawnTimer = 2;
    this.finishing = false;
    this.ringPulse = 0;
    this.bg = null;
    const n = P.app.reducedMotion ? 160 : 420;
    for (let i = 0; i < n; i++) {
      this.streams.push({
        x: P.rand(P.app.w), y: P.rand(P.app.h),
        depth: P.rand(0.25, 1), age: P.rand(100),
      });
    }
  },

  begin() {
    P.ui.caption('the river brings words downstream.<br>touch the ones that glow — gather ten.', { hold: 5200 });
  },

  resize() { this.bg = null; },

  bgGrad(g, w, h) {
    if (!this.bg) {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#040812');
      grad.addColorStop(0.45, '#0a1730');
      grad.addColorStop(1, '#12283f');
      this.bg = grad;
    }
    return this.bg;
  },

  flowAngle(x, y, t) {
    return (P.noise.fbm(x * 0.0011 + t * 0.008, y * 0.0016, 2) - 0.5) * 2.6;
  },

  spawnWord() {
    const free = this.LEXICON.filter(w => !P.profile.data.collected.includes(w) &&
      !this.words.find(o => o.text === w));
    if (!free.length) return;
    const word = new P.Word(P.pick(free), {
      size: P.rand(19, 25), color: '#bfe3ff', glow: '#5fb4ff',
      x: -80, y: P.rand(P.app.h * 0.22, P.app.h * 0.78),
      alpha: 0,
    });
    word.data.speed = P.rand(26, 44);
    this.words.push(word);
  },

  spawnPair() {
    const def = this.PAIRS[this.pairsDone];
    const flip = Math.random() < 0.5;
    const mk = (text) => new P.Word(text, {
      size: 26, color: '#e8f4ff', glow: '#9fd4ff',
      x: -120, y: 0, alpha: 0,
    });
    this.pair = {
      def,
      left: mk(flip ? def.b : def.a),
      right: mk(flip ? def.a : def.b),
      y: P.rand(P.app.h * 0.3, P.app.h * 0.6),
      x: -140,
      chosen: false,
    };
    P.ui.caption('the river asks. keep one.', { hold: 3000 });
  },

  capture(word, isChoice) {
    P.profile.collect(word.text);
    this.captured++;
    this.ringPulse = 1;
    P.audio.chime(this.captured + (isChoice ? 4 : 0), { x: word.x / P.app.w, vol: 0.15 });
    word.data.captured = true;
    word.data.tx = P.app.w / 2;
    word.data.ty = P.app.h - 64;
    this.particles.burst(word.x, word.y, 16, () => ({
      x: word.x + P.rand(-20, 20), y: word.y + P.rand(-8, 8),
      vx: P.rand(-20, 20), vy: P.rand(-30, -6),
      size: P.rand(0.8, 2), color: '#aee0ff', decay: P.rand(0.4, 0.8), drag: 0.98,
    }));
    this.maybeAdvance();
  },

  maybeAdvance() {
    if (this.finishing) return;
    if (!this.pair && this.pairsDone < 3 && this.captured >= this.PAIR_AT[this.pairsDone]) {
      setTimeout(() => { if (!this.pair && !this.finishing) this.spawnPair(); }, 1600);
    }
    if (this.captured >= this.NEEDED && this.pairsDone >= 3) {
      this.finishing = true;
      this.finish();
    }
  },

  async finish() {
    await P.sleep(1400);
    await P.ui.caption('“no one steps in the same river twice”', { attrib: 'after Heraclitus', hold: 4600 });
    P.profile.data.expectedSeconds += 150;
    P.app.completeFolio([
      { text: 'what you kept is not what you caught.<br>the river taught you that.', hold: 4400 },
    ], 'archive');
  },

  pointerDown(x, y) {
    if (this.pair && !this.pair.chosen) {
      for (const [word, other] of [[this.pair.left, this.pair.right], [this.pair.right, this.pair.left]]) {
        if (word.hit(x, y, 42)) {
          this.pair.chosen = true;
          this.pairsDone++;
          P.profile.data.flux.push({ chose: word.text, over: other.text });
          P.dissolveWord(this.particles, other, '#7fb8e8');
          other.alpha = 0;
          this.capture(word, true);
          const pair = this.pair;
          setTimeout(() => { if (this.pair === pair) this.pair = null; this.maybeAdvance(); }, 900);
          return;
        }
      }
    }
    for (const word of this.words) {
      if (!word.data.captured && word.hit(x, y, 40)) { this.capture(word, false); return; }
    }
  },

  update(dt, t) {
    // drifting streaks
    for (const s of this.streams) {
      const a = this.flowAngle(s.x, s.y, t);
      const sp = (18 + 60 * s.depth);
      s.px = s.x; s.py = s.y;
      s.x += (Math.cos(a) * 0.35 + 1) * sp * dt;
      s.y += Math.sin(a) * sp * 0.34 * dt;
      s.age += dt;
      if (s.x > P.app.w + 20) { s.x = -10; s.y = P.rand(P.app.h); s.px = s.x; s.py = s.y; }
      if (s.y < -20) s.y = P.app.h + 10;
      if (s.y > P.app.h + 20) s.y = -10;
    }

    // word drift + capture animation
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.words.filter(w => !w.data.captured).length < 3 &&
        !this.finishing && this.captured < this.NEEDED) {
      this.spawnWord();
      this.spawnTimer = P.rand(2.6, 4.6);
    }
    const px = P.app.pointer.x, py = P.app.pointer.y;
    for (let i = this.words.length - 1; i >= 0; i--) {
      const w = this.words[i];
      if (w.data.captured) {
        w.x = P.lerp(w.x, w.data.tx, 1 - Math.pow(0.02, dt));
        w.y = P.lerp(w.y, w.data.ty, 1 - Math.pow(0.02, dt));
        w.scale = P.lerp(w.scale, 0.2, 1 - Math.pow(0.06, dt));
        w.alpha = P.lerp(w.alpha, 0, 1 - Math.pow(0.12, dt));
        if (w.alpha < 0.02) this.words.splice(i, 1);
        continue;
      }
      const a = this.flowAngle(w.x, w.y, t);
      w.x += (Math.cos(a) * 0.3 + 1) * w.data.speed * dt;
      w.y += Math.sin(a) * w.data.speed * 0.45 * dt;
      const near = P.dist(px, py, w.x, w.y) < 70;
      w.data.hot = P.lerp(w.data.hot || 0, near ? 1 : 0, 1 - Math.pow(0.01, dt));
      w.alpha = P.lerp(w.alpha, 0.55 + 0.45 * w.data.hot, 1 - Math.pow(0.05, dt));
      w.scale = 1 + 0.18 * w.data.hot;
      if (w.x > P.app.w + 100) this.words.splice(i, 1);
    }

    // choice pair glides in and holds mid-river
    if (this.pair && !this.pair.chosen) {
      this.pair.x = P.lerp(this.pair.x, P.app.w * 0.45, 1 - Math.pow(0.55, dt));
      const gap = Math.min(150, P.app.w * 0.16);
      const cx = this.pair.x;
      this.pair.left.x = cx - gap; this.pair.right.x = cx + gap;
      this.pair.left.y = this.pair.y + Math.sin(t * 0.9) * 6;
      this.pair.right.y = this.pair.y + Math.sin(t * 0.9 + 1.2) * 6;
      for (const w of [this.pair.left, this.pair.right]) {
        const near = P.dist(px, py, w.x, w.y) < 70;
        w.alpha = P.lerp(w.alpha, near ? 1 : 0.75, 0.1);
        w.scale = P.lerp(w.scale, near ? 1.15 : 1, 0.1);
      }
    }
    this.ringPulse = Math.max(0, this.ringPulse - dt * 1.4);
    this.particles.update(dt);
  },

  draw(g, w, h, t) {
    g.fillStyle = this.bgGrad(g, w, h);
    g.fillRect(0, 0, w, h);

    // moon
    const mx = w * 0.79, my = h * 0.16;
    const mg = g.createRadialGradient(mx, my, 4, mx, my, 180);
    mg.addColorStop(0, 'rgba(215,235,255,0.55)');
    mg.addColorStop(0.12, 'rgba(190,220,255,0.18)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = mg;
    g.fillRect(mx - 200, my - 200, 400, 400);

    // current streaks — tails stretched along velocity so the water reads as flow
    g.lineCap = 'round';
    for (const s of this.streams) {
      if (s.px === undefined) continue;
      const dx = s.x - s.px, dy = s.y - s.py;
      if (Math.abs(dx) > 30 || Math.abs(dy) > 30) continue; // skip wrap jumps
      const glow = 0.05 + 0.3 * s.depth * (0.6 + 0.4 * Math.sin(s.age * 2 + s.depth * 9));
      g.strokeStyle = `rgba(${90 + 110 * s.depth},${150 + 70 * s.depth},255,${glow})`;
      g.lineWidth = 0.6 + 1.6 * s.depth;
      g.beginPath();
      g.moveTo(s.x - dx * 14, s.y - dy * 14);
      g.lineTo(s.x, s.y);
      g.stroke();
    }
    g.restore();

    this.particles.draw(g);
    for (const word of this.words) word.draw(g);
    if (this.pair) {
      // a dim "or" between the two offered words
      if (!this.pair.chosen && this.pair.left.x > -60) {
        g.save();
        g.globalAlpha = 0.4;
        g.fillStyle = '#8fb4d8';
        g.font = 'italic 15px Georgia, serif';
        g.textAlign = 'center';
        g.fillText('or', (this.pair.left.x + this.pair.right.x) / 2, this.pair.y + 5);
        g.restore();
      }
      this.pair.left.draw(g);
      this.pair.right.draw(g);
    }

    // gathering ring
    const rx = w / 2, ry = h - 64, R = 24;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(140,200,255,0.25)';
    g.lineWidth = 1;
    g.beginPath(); g.arc(rx, ry, R, 0, P.TAU); g.stroke();
    const frac = this.captured / this.NEEDED;
    if (frac > 0) {
      g.strokeStyle = `rgba(190,230,255,${0.7 + 0.3 * this.ringPulse})`;
      g.lineWidth = 2;
      g.beginPath(); g.arc(rx, ry, R, -Math.PI / 2, -Math.PI / 2 + P.TAU * frac); g.stroke();
    }
    if (this.ringPulse > 0) {
      g.strokeStyle = `rgba(190,230,255,${this.ringPulse * 0.5})`;
      g.beginPath(); g.arc(rx, ry, R + (1 - this.ringPulse) * 26, 0, P.TAU); g.stroke();
    }
    g.restore();
  },
});
