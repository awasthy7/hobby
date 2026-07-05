// FOLIO V — THE TIDE. Impermanence. Your own gathered words lie on the sand
// and the sea is coming for them. Drag them to safety, or open your hands —
// both are answers, and the manuscript records yours. Nothing is destroyed:
// every taken word rises to the sky and waits there for the night.

P.app.register('tide', {
  CYCLE: 15,

  enter() {
    P.audio.scene({ root: 87.31, scale: [0, 2, 4, 7, 9], chimeRoot: 349.23, padVol: 0.04, sea: 1 });
    this.CYCLE = P.FAST ? 6 : 15;
    this.SWEEP_AT = P.FAST ? 2 : 7;
    P.profile.data.graspCount = 0; // this folio owns grasp/release
    P.profile.data.releasedCount = 0;
    P.profile.data.savedWord = null;
    this.particles = new P.Particles(600);
    this.started = false;
    this.t0 = P.app.t;
    this.cycle = 0;
    this.stars = [];
    this.dragging = null;
    this.finishing = false;
    this.midCaptionDone = false;
    this.wetLine = P.app.h * 0.8;

    const pool = P.profile.data.collected.length ? P.profile.data.collected : ['ember', 'north', 'hush'];
    const chosen = [...pool].sort(() => Math.random() - 0.5).slice(0, 7);
    this.words = chosen.map((text, i) => {
      const w = new P.Word(text, {
        size: 20, color: '#f2e2b8', glow: '#c9a86a',
        x: P.app.w * (0.14 + 0.72 * ((i + 0.5) / 7) + P.rand(-0.03, 0.03)),
        y: P.rand(P.app.h * 0.56, P.app.h * 0.68),
        alpha: 0.9, additive: false,
      });
      w.data.dragCount = 0;
      w.data.submerged = 0;
      w.data.state = 'sand';
      return w;
    });
  },

  begin() {
    P.ui.caption('these are yours — the words you gathered on the way.', { hold: 4400 });
    P.ui.caption('the tide is coming for them.<br>you may pull them up the beach. you may let them go.<br>both are answers.', { hold: 6400 });
    this.started = true;
    this.t0 = P.app.t + (P.FAST ? 2 : 9); // the sea waits for the reader to read
  },

  shoreBase() { return P.app.h * 0.80; },
  reachY() {
    // the sea climbs the beach a little further with every cycle
    const rise = Math.min(1, this.cycle / (P.FAST ? 1.2 : 6));
    return P.lerp(P.app.h * 0.74, P.app.h * 0.44, rise);
  },

  waveEnv(p) {
    if (p < 0.2) return P.ease.out(p / 0.2);
    if (p < 0.32) return 1;
    return 1 - P.ease.inOut((p - 0.32) / 0.68);
  },

  waterlineAt(x, t, env) {
    const base = this.shoreBase();
    const y = base - (base - this.reachY()) * env;
    return y + Math.sin(x * 0.018 + t * 1.6) * 4 + (P.noise.at(x * 0.01, t * 0.5) - 0.5) * 10 * env;
  },

  pointerDown(x, y) {
    for (const w of this.words) {
      if (w.data.state === 'sand' && w.hit(x, y, 42)) {
        this.dragging = w;
        w.data.dragCount++;
        P.profile.data.graspCount++;
        return;
      }
    }
  },
  pointerMove(x, y) {
    if (this.dragging) {
      this.dragging.x = P.clamp(x, 50, P.app.w - 50);
      this.dragging.y = P.clamp(y, P.app.h * 0.4, P.app.h * 0.9);
    }
  },
  pointerUp() { this.dragging = null; },

  takeWord(w) {
    w.data.state = 'taken';
    this.dragging === w && (this.dragging = null);
    P.profile.data.releasedCount++;
    this.particles.burst(w.x, w.y, 24, () => ({
      x: w.x + P.rand(-26, 26), y: w.y + P.rand(-6, 6),
      vx: P.rand(-20, 8), vy: P.rand(-10, 4),
      size: P.rand(0.8, 2.2), color: '#e8f4ff', decay: P.rand(0.5, 0.9), drag: 0.98,
    }));
    // ...and rises again as a star
    const star = {
      x: w.x, y: w.y, tx: P.rand(P.app.w * 0.1, P.app.w * 0.9), ty: P.rand(P.app.h * 0.06, P.app.h * 0.3),
      word: new P.Word(w.text, { size: 11, color: '#fff6d8', glow: '#ffe9a0' }),
      p: 0, twinkle: P.rand(100),
    };
    this.stars.push(star);
    P.audio.chime(Math.floor(P.rand(3, 8)), { x: w.x / P.app.w, vol: 0.1, dur: 3 });

    const left = this.words.filter(x => x.data.state === 'sand').length;
    if (!this.midCaptionDone && this.words.length - left >= 2) {
      this.midCaptionDone = true;
      P.ui.caption('look up.', { hold: 3200 });
      P.ui.caption('the sea is not taking them from you.<br>she is carrying them where you cannot lose them.', { hold: 5600 });
    }
    if (left === 0 && !this.finishing) {
      this.finishing = true;
      this.finish();
    }
  },

  async finish() {
    // remember what they fought hardest to keep
    let most = null;
    for (const w of this.words) if (w.data.dragCount > 1 && (!most || w.data.dragCount > most.data.dragCount)) most = w;
    P.profile.data.savedWord = most ? most.text : null;
    await P.sleep(2200);
    if (P.profile.data.graspCount === 0) {
      await P.ui.caption('you never once pulled against her.<br>the sea will remember that.', { hold: 4800 });
    } else if (most) {
      await P.ui.caption(`you fought hardest for <em>${most.text}</em>.<br>the sea took it anyway. the sky kept it anyway.`, { hold: 5400 });
    }
    P.profile.data.expectedSeconds += 180;
    P.app.completeFolio([
      { text: '“you can hold nothing.<br>you can only hold it well.”', attrib: 'after Marcus Aurelius', hold: 5000 },
    ], 'night');
  },

  update(dt, t) {
    const elapsed = this.started ? t - this.t0 : -1;
    const p = elapsed < 0 ? 0 : (elapsed % this.CYCLE) / this.CYCLE;
    this.cycle = Math.max(0, Math.floor(elapsed / this.CYCLE));
    const env = elapsed < 0 ? 0 : this.waveEnv(p);
    this.env = env;
    P.audio.seaSwell(env);

    // final tide takes whatever is left
    const finalSweep = this.cycle >= this.SWEEP_AT;

    const base = this.shoreBase();
    const avgWater = base - (base - this.reachY()) * env;
    this.wetLine = Math.min(this.wetLine, avgWater);
    this.wetLine = P.lerp(this.wetLine, base, dt * 0.01);

    for (const w of this.words) {
      if (w.data.state === 'taken') {
        w.alpha = Math.max(0, w.alpha - dt * 0.8);
        w.x -= 26 * dt;
        w.y += 10 * dt;
        continue;
      }
      const wl = this.waterlineAt(w.x, t, env);
      const under = w.y > wl - 4 || finalSweep;
      if (under) {
        w.data.submerged += dt;
        // the water tugs seaward
        if (this.dragging !== w) { w.y += 14 * dt; w.x += Math.sin(t * 2 + w.y) * 8 * dt; }
        if (w.data.submerged > 0.9) this.takeWord(w);
      } else {
        w.data.submerged = Math.max(0, w.data.submerged - dt * 2);
      }
      // foam kisses at the waterline
      if (Math.abs(w.y - wl) < 14 && Math.random() < 0.3) {
        this.particles.spawn({
          x: w.x + P.rand(-20, 20), y: wl + P.rand(-3, 3),
          vx: P.rand(-8, 8), vy: P.rand(-6, 2),
          size: P.rand(0.6, 1.6), color: '#e8f2ff', alpha: 0.5,
          decay: P.rand(0.8, 1.4), drag: 0.98,
        });
      }
    }

    // stars rise
    for (const s of this.stars) {
      if (s.p < 1) {
        s.p = Math.min(1, s.p + dt / 5);
        const e = P.ease.inOut(s.p);
        s.cx = P.lerp(s.x, s.tx, e);
        s.cy = P.lerp(s.y, s.ty, e) - Math.sin(e * Math.PI) * 40;
      }
    }
    this.particles.update(dt);
  },

  draw(g, w, h, t) {
    // dusk sky, breathing faintly
    const br = P.breath(t);
    const sky = g.createLinearGradient(0, 0, 0, h * 0.62);
    sky.addColorStop(0, '#150c26');
    sky.addColorStop(0.55, P.mix('#3d1f42', '#4a2548', br * 0.5));
    sky.addColorStop(1, P.mix('#b05a4e', '#c96f5e', br));
    g.fillStyle = sky;
    g.fillRect(0, 0, w, h * 0.62);

    // sand
    const sand = g.createLinearGradient(0, h * 0.55, 0, h);
    sand.addColorStop(0, '#4a3a33');
    sand.addColorStop(1, '#241a16');
    g.fillStyle = sand;
    g.fillRect(0, h * 0.55, w, h * 0.45);

    // wet sand band
    const base = this.shoreBase();
    if (this.wetLine < base) {
      const wet = g.createLinearGradient(0, this.wetLine, 0, base + 30);
      wet.addColorStop(0, 'rgba(30,24,26,0.0)');
      wet.addColorStop(0.4, 'rgba(28,22,26,0.45)');
      wet.addColorStop(1, 'rgba(28,22,26,0.0)');
      g.fillStyle = wet;
      g.fillRect(0, this.wetLine, w, base + 30 - this.wetLine);
    }

    // sky-words: what the sea has carried up
    g.save();
    for (const s of this.stars) {
      if (s.cx === undefined) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 1.6 + s.twinkle);
      s.word.x = s.cx; s.word.y = s.cy;
      s.word.alpha = (s.p < 1 ? 0.9 : 0.55) * tw;
      s.word.draw(g);
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = `rgba(255,244,214,${0.5 * tw})`;
      g.beginPath(); g.arc(s.cx, s.cy + 10, 1.2, 0, P.TAU); g.fill();
    }
    g.restore();

    // words on the sand (under the sea drawing so the water covers them)
    for (const word of this.words) word.draw(g);

    // the sea
    const env = this.env || 0;
    g.save();
    const seaTopMin = Math.min(this.waterlineAt(0, t, env), this.waterlineAt(w, t, env)) - 20;
    const sg = g.createLinearGradient(0, seaTopMin, 0, h);
    sg.addColorStop(0, 'rgba(76,102,155,0.92)');
    sg.addColorStop(0.35, 'rgba(32,50,86,0.95)');
    sg.addColorStop(1, 'rgba(10,16,30,1)');
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(0, h);
    g.lineTo(0, this.waterlineAt(0, t, env));
    for (let x = 0; x <= w; x += 14) g.lineTo(x, this.waterlineAt(x, t, env));
    g.lineTo(w, h);
    g.closePath();
    g.fill();

    // moon-glint on the water
    g.globalCompositeOperation = 'lighter';
    const glint = g.createLinearGradient(0, seaTopMin, 0, h);
    glint.addColorStop(0, `rgba(255,190,150,${0.05 + 0.04 * env})`);
    glint.addColorStop(0.5, 'rgba(255,190,150,0)');
    g.fillStyle = glint;
    g.beginPath();
    g.moveTo(w * 0.38, h);
    g.lineTo(w * 0.47, this.waterlineAt(w * 0.47, t, env));
    g.lineTo(w * 0.56, this.waterlineAt(w * 0.56, t, env));
    g.lineTo(w * 0.70, h);
    g.closePath();
    g.fill();

    // surface ripples trailing the foam line
    for (let k = 1; k <= 3; k++) {
      g.strokeStyle = `rgba(170,200,245,${0.07 - k * 0.016})`;
      g.lineWidth = 1;
      g.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = this.waterlineAt(x, t, env) + k * 22 + Math.sin(x * 0.03 + t * 1.2 + k * 2) * 3;
        x === 0 ? g.moveTo(x, y) : g.lineTo(x, y);
      }
      g.stroke();
    }

    // foam edge
    g.strokeStyle = `rgba(240,248,255,${0.35 + 0.3 * env})`;
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(0, this.waterlineAt(0, t, env));
    for (let x = 0; x <= w; x += 10) g.lineTo(x, this.waterlineAt(x, t, env));
    g.stroke();
    g.restore();

    this.particles.draw(g);
  },
});
