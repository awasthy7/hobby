// FOLIO VI — THE NIGHT. The absurd. Hold to walk toward a light that does not
// get closer, until the dark asks you the only question it has. After you
// answer, every step you take plants a star — and the stars are your words.

P.app.register('night', {
  enter() {
    P.audio.scene({ root: 65.41, scale: [0, 7, 12], chimeRoot: 587.33, padVol: 0.018, minor: true });
    this.MARKS = P.FAST ? [2, 4, 6] : [7, 15, 23];
    this.GROW = P.FAST ? 5 : 16;
    P.profile.data.why = null; // this folio owns the answer
    this.walked = 0;
    this.phase = 'walk1';        // walk1 -> question -> walk2 -> done
    this.stepT = 0;
    this.bob = 0;
    this.stars = [];
    this.starTimer = 0;
    this.lightGrow = 0;
    this.saidMarks = new Set();
    this.wordPool = [...P.profile.data.collected];
    this.finishing = false;
  },

  begin() {
    P.ui.caption('there is a light on the horizon.<br>it may be a door. it may be a lie.', { hold: 4800 });
    P.ui.caption('hold — anywhere — and walk.', { hold: 4200 });
  },

  say(mark, text, opts) {
    if (this.saidMarks.has(mark)) return;
    this.saidMarks.add(mark);
    P.ui.caption(text, opts);
  },

  askWhy() {
    this.phase = 'question';
    const stack = P.ui.stack(30);
    const q = document.createElement('div');
    q.className = 'game-sub fadein';
    q.style.fontSize = 'clamp(18px, 2.6vw, 24px)';
    q.textContent = 'why do you keep going?';
    stack.append(q);
    const answers = [
      ['because the light might be real', 'light'],
      ['because walking is what I am', 'walking'],
      ['because someone once walked for me', 'someone'],
      ['I don’t know', 'unknown'],
    ];
    answers.forEach(([label, key], i) => {
      stack.append(P.ui.button(label, async () => {
        P.profile.data.why = key;
        P.ui.clearStacks();
        P.audio.chime(2, { vol: 0.12, dur: 3.5 });
        const replies = {
          light: '<em>might</em> is enough. it has always been enough.',
          walking: 'then the road is lucky to be under you.',
          someone: 'they knew you would say that.',
          unknown: 'the only answer that has never once been a lie.',
        };
        await P.ui.caption(replies[key], { hold: 4600 });
        this.phase = 'walk2';
        P.ui.caption('keep walking.', { hold: 3000 });
      }, { delay: 800 + i * 350 }));
    });
  },

  spawnStar() {
    const useWord = this.wordPool.length && Math.random() < 0.45;
    const star = {
      x: P.rand(P.app.w * 0.05, P.app.w * 0.95),
      y: P.rand(P.app.h * 0.04, P.app.h * 0.52),
      born: P.app.t, twinkle: P.rand(100),
      word: null,
    };
    if (useWord) {
      const text = this.wordPool.splice(Math.floor(Math.random() * this.wordPool.length), 1)[0];
      star.word = new P.Word(text, { size: 10, color: '#e8ecff', glow: '#aab8ff' });
    }
    this.stars.push(star);
    if (Math.random() < 0.3) P.audio.chime(Math.floor(P.rand(0, 3)), { x: star.x / P.app.w, vol: 0.05, dur: 2.5 });
  },

  update(dt, t) {
    const walking = P.app.pointer.down && (this.phase === 'walk1' || this.phase === 'walk2');
    if (walking) {
      this.walked += dt;
      this.stepT -= dt;
      this.bob = Math.sin(this.walked * 4.2) * 3;
      if (this.stepT <= 0) {
        this.stepT = 0.82;
        P.audio.step(0.07);
      }
    } else {
      this.bob = P.lerp(this.bob, 0, dt * 4);
    }

    if (this.phase === 'walk1') {
      if (this.walked > this.MARKS[0]) this.say('a', 'you have been walking a while now.<br>the light is no nearer.', { hold: 4600 });
      if (this.walked > this.MARKS[1]) this.say('b', 'there is no proof it ever will be.', { attrib: 'after Camus — the absurd does not ask you to stop', hold: 5400 });
      if (this.walked > this.MARKS[2]) { this.askWhy(); }
    }

    if (this.phase === 'walk2') {
      this.lightGrow = Math.min(1, this.lightGrow + (walking ? dt / this.GROW : 0));
      this.starTimer -= walking ? dt : 0;
      if (this.starTimer <= 0 && this.stars.length < 140) {
        this.starTimer = P.rand(0.25, 0.7);
        this.spawnStar();
      }
      if (this.lightGrow >= 1 && !this.finishing) {
        this.finishing = true;
        this.finish();
      }
    }
  },

  async finish() {
    await P.sleep(600);
    await P.ui.caption('wait — you know this light.', { hold: 4000 });
    P.profile.data.expectedSeconds += 150;
    P.app.completeFolio([
      { text: 'it was never a star. it is a lamp on a desk.<br>you are arriving where you began.', hold: 5200 },
    ], 'finale');
  },

  draw(g, w, h, t) {
    g.fillStyle = '#020206';
    g.fillRect(0, 0, w, h);

    const horizonY = h * 0.62 + this.bob;

    // stars (after the answer)
    for (const s of this.stars) {
      const age = P.clamp((t - s.born) / 2, 0, 1);
      const tw = 0.5 + 0.5 * Math.sin(t * 1.4 + s.twinkle);
      if (s.word) {
        s.word.x = s.x; s.word.y = s.y + this.bob * 0.4;
        s.word.alpha = 0.5 * age * tw;
        s.word.draw(g);
      } else {
        g.globalAlpha = age * (0.3 + 0.6 * tw);
        g.fillStyle = '#dfe6ff';
        g.beginPath(); g.arc(s.x, s.y + this.bob * 0.4, P.rand(0.6, 1) + 0.4, 0, P.TAU); g.fill();
      }
    }
    g.globalAlpha = 1;

    // faint constellation threads
    if (this.stars.length > 5) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(150,170,255,0.05)';
      g.lineWidth = 0.6;
      for (let i = 0; i + 1 < this.stars.length; i += 2) {
        const a = this.stars[i], b = this.stars[i + 1];
        if (P.dist(a.x, a.y, b.x, b.y) < 200) {
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      }
      g.restore();
    }

    // horizon
    const hg = g.createLinearGradient(0, horizonY - 40, 0, horizonY + 60);
    hg.addColorStop(0, 'rgba(0,0,0,0)');
    hg.addColorStop(0.5, 'rgba(24,24,40,0.5)');
    hg.addColorStop(1, 'rgba(6,6,12,0.9)');
    g.fillStyle = hg;
    g.fillRect(0, horizonY - 40, w, 120);
    g.fillStyle = '#04040a';
    g.fillRect(0, horizonY + 20, w, h - horizonY - 20);

    // the light
    const grow = this.lightGrow;
    const lx = w / 2, ly = horizonY - 6 - grow * h * 0.1;
    const baseR = 2.5 + grow * grow * Math.min(w, h) * 0.5;
    const lg = g.createRadialGradient(lx, ly, 0, lx, ly, Math.max(60, baseR * 3));
    const warm = 0.75 + 0.25 * Math.sin(t * 0.9);
    lg.addColorStop(0, `rgba(255,244,214,${0.85 * warm})`);
    lg.addColorStop(0.12, `rgba(255,220,160,${0.30 + grow * 0.4})`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = lg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = `rgba(255,248,225,${0.9})`;
    g.beginPath(); g.arc(lx, ly, 1.6 + grow * 26, 0, P.TAU); g.fill();
    g.restore();

    // walking hint: a soft pulse at the bottom while idle at the start
    if (this.walked < 2 && this.phase === 'walk1') {
      const pulse = 0.5 + 0.5 * Math.sin(t * 2);
      g.fillStyle = `rgba(233,223,201,${0.12 + 0.1 * pulse})`;
      g.font = 'italic 14px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('hold to walk', w / 2, h * 0.88);
    }
  },
});
