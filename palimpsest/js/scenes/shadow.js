// FOLIO III — THE SHADOW. Jung. Five unsaid words hide in the dark.
// They flee a hurried light; they come to a patient one. Which you greet
// first says more than you think — the game remembers.

P.app.register('shadow', {
  SHADOWS: ['envy', 'fear', 'grief', 'anger', 'want'],

  enter() {
    P.audio.scene({ root: 65.41, minor: true, scale: [0, 3, 5, 7, 10], chimeRoot: 261.63, padVol: 0.05 });
    this.DWELL = P.FAST ? 0.4 : 1.3;
    P.profile.data.shadows = []; // this folio owns the shadow order
    P.profile.data.patienceSamples = [];
    this.particles = new P.Particles(300);
    this.words = this.SHADOWS.map((text, i) => {
      const w = new P.Word(text, {
        size: 23, color: '#3d4152', glow: '#1c2030',
        x: P.rand(P.app.w * 0.15, P.app.w * 0.85),
        y: P.rand(P.app.h * 0.2, P.app.h * 0.8),
        alpha: 0.9, additive: false,
      });
      w.data.seed = i * 17.3;
      w.data.dwell = 0;
      w.data.accepted = false;
      w.data.orbitR = 58 + i * 14;
      w.data.orbitPhase = i * (P.TAU / 5);
      w.data.speedSum = 0; w.data.speedN = 0;
      return w;
    });
    this.acceptedCount = 0;
    this.finishing = false;
  },

  begin() {
    P.ui.caption('the dark here is not empty.', { hold: 3400 });
    P.ui.caption('five words you do not say are hiding in it.<br>they flee a hurried light. move slowly, and stay.', { hold: 6000 });
  },

  accept(w) {
    w.data.accepted = true;
    this.acceptedCount++;
    const silver = new P.Word(w.text, { size: 20, color: '#d6dae6', glow: '#8b93ad' });
    w.sprite = silver.sprite;
    w.additive = true;
    P.profile.data.shadows.push(w.text);
    P.profile.collect(w.text);
    if (w.data.speedN > 0) P.profile.data.patienceSamples.push(w.data.speedSum / w.data.speedN);
    P.audio.chime(this.acceptedCount, { x: w.x / P.app.w, vol: 0.14, dur: 3.2 });
    this.particles.burst(w.x, w.y, 22, () => ({
      x: w.x + P.rand(-24, 24), y: w.y + P.rand(-10, 10),
      vx: P.rand(-18, 18), vy: P.rand(-24, -4),
      size: P.rand(0.6, 1.8), color: '#c9cede', decay: P.rand(0.3, 0.6), drag: 0.985,
    }));
    const firstNames = { envy: 'admiration that hasn’t forgiven itself', fear: 'imagination facing the wrong way',
      grief: 'love with nowhere to put its hands', anger: 'a boundary finding its voice',
      want: 'the one that was never ashamed of you' };
    if (this.acceptedCount === 1) {
      P.ui.caption(`<em>${w.text}</em> — ${firstNames[w.text]}.<br>it will walk with you now.`, { hold: 4600 });
    }
    if (this.acceptedCount >= this.SHADOWS.length && !this.finishing) {
      this.finishing = true;
      this.finish();
    }
  },

  async finish() {
    await P.sleep(1600);
    await P.ui.caption('what you refuse to look at does not vanish.<br>it waits. and it grows patient.', { attrib: 'after Jung', hold: 5200 });
    await P.ui.caption('you looked.<br>that is the whole of the work.', { hold: 4200 });
    P.profile.data.expectedSeconds += 140;
    P.app.completeFolio([
      { text: 'the lantern was never for finding the way.<br>it was for letting the dark see you.', hold: 4800 },
    ], 'garden');
  },

  update(dt, t) {
    const px = P.app.pointer.x, py = P.app.pointer.y;
    const speed = P.app.pointer.speed;
    for (const w of this.words) {
      if (w.data.accepted) {
        // orbit the lantern
        w.data.orbitPhase += dt * 0.5;
        const tx = px + Math.cos(w.data.orbitPhase) * w.data.orbitR;
        const ty = py + Math.sin(w.data.orbitPhase) * w.data.orbitR * 0.7;
        w.x = P.lerp(w.x, tx, 1 - Math.pow(0.05, dt));
        w.y = P.lerp(w.y, ty, 1 - Math.pow(0.05, dt));
        w.alpha = 0.55 + 0.2 * Math.sin(t * 1.3 + w.data.seed);
        continue;
      }
      // wandering
      const a = P.noise.fbm(w.x * 0.002 + w.data.seed, w.y * 0.002 + t * 0.04, 2) * P.TAU * 2;
      w.x += Math.cos(a) * 14 * dt;
      w.y += Math.sin(a) * 14 * dt;
      w.x = P.clamp(w.x, 60, P.app.w - 60);
      w.y = P.clamp(w.y, 80, P.app.h - 80);

      const d = P.dist(px, py, w.x, w.y);
      // flee a hurried light
      if (speed > 320 && d < 300) {
        const ang = Math.atan2(w.y - py, w.x - px);
        w.x += Math.cos(ang) * 220 * dt;
        w.y += Math.sin(ang) * 220 * dt;
        w.data.dwell = Math.max(0, w.data.dwell - dt * 2);
      }
      // a patient approach
      if (d < 60 && speed < 120) {
        w.data.dwell += dt;
        w.data.speedSum += speed; w.data.speedN++;
        if (w.data.dwell > this.DWELL) this.accept(w);
      } else {
        w.data.dwell = Math.max(0, w.data.dwell - dt * 0.8);
      }
      // visible only near the lantern
      const vis = P.clamp(1.25 - d / 340, 0, 1);
      w.alpha = vis * 0.95;
    }
    this.particles.update(dt);
  },

  draw(g, w, h, t) {
    g.fillStyle = '#030308';
    g.fillRect(0, 0, w, h);
    const fg = g.createLinearGradient(0, h * 0.7, 0, h);
    fg.addColorStop(0, 'rgba(10,10,18,0)');
    fg.addColorStop(1, 'rgba(16,16,26,0.8)');
    g.fillStyle = fg;
    g.fillRect(0, h * 0.7, w, h * 0.3);

    // the lantern
    const px = P.app.pointer.x, py = P.app.pointer.y;
    if (P.app.pointer.inside) {
      const r = 150 + 10 * Math.sin(t * P.TAU / 10);
      const lg = g.createRadialGradient(px, py, 2, px, py, r);
      lg.addColorStop(0, 'rgba(255,214,150,0.30)');
      lg.addColorStop(0.35, 'rgba(255,190,120,0.10)');
      lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = lg;
      g.fillRect(px - r, py - r, r * 2, r * 2);
      g.fillStyle = 'rgba(255,240,210,0.9)';
      g.beginPath(); g.arc(px, py, 2.2, 0, P.TAU); g.fill();
      g.restore();
    }

    for (const word of this.words) {
      word.draw(g);
      // dwell progress ring
      if (!word.data.accepted && word.data.dwell > 0.08) {
        const frac = Math.min(1, word.data.dwell / this.DWELL);
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = `rgba(214,218,230,${0.5 * frac + 0.15})`;
        g.lineWidth = 1.2;
        g.beginPath();
        g.arc(word.x, word.y, 40, -Math.PI / 2, -Math.PI / 2 + P.TAU * frac);
        g.stroke();
        g.restore();
      }
    }
    this.particles.draw(g);
  },
});
