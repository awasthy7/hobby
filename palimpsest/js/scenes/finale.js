// FOLIO VII — THE MANUSCRIPT. The desk again. The pen moves by itself:
// the game writes a poem about the player, assembled from everything it
// watched them do. Then the room opens into everything they walked through.

P.app.register('finale', {
  enter() {
    P.audio.scene({ root: 73.42, scale: [0, 2, 4, 7, 9], chimeRoot: 587.33, padVol: 0.06, shimmer: true });
    this.alive = true;
    this.galaxy = null;
    this.arpT = 3;
    this.darken = 0;
    this.pages = [];
    this.orbitWords = [];
    this.lampGlow = 1;
  },

  exit() {
    this.alive = false;
    document.getElementById('pagewrap')?.remove();
  },

  begin() { this.run(); },

  async run() {
    const d = P.profile.data;
    const poem = P.poem.compose(d);
    this.poemText = P.poem.asText(poem);
    this.poemTitle = poem.title;

    await P.ui.caption('the desk. the lamp. the page.', { hold: 3600 });
    await P.ui.caption('but the pen is already moving —', { hold: 3400 });

    const wrap = document.createElement('div');
    wrap.id = 'pagewrap';
    document.body.appendChild(wrap);
    const page = document.createElement('div');
    page.id = 'page';
    page.style.opacity = '0';
    wrap.appendChild(page);
    const titleEl = document.createElement('div');
    titleEl.className = 'poem-title';
    const subEl = document.createElement('div');
    subEl.className = 'poem-sub';
    subEl.textContent = poem.sub;
    const bodyEl = document.createElement('div');
    bodyEl.className = 'poem-body';
    const caret = document.createElement('span');
    caret.className = 'caret';
    page.append(titleEl, subEl, bodyEl, caret);
    this.page = page;
    await P.sleep(80);
    page.style.transition = 'opacity 2.5s ease';
    page.style.opacity = '1';
    await P.sleep(2400);

    // hint that the impatient may lean on the pen
    P.ui.caption('(hold anywhere to lean on the pen)', { hold: 3000, fade: 800 });

    await this.type(titleEl, poem.title, caret, 46);
    await this.typeLines(bodyEl, poem.lines, caret);
    await P.sleep(700);
    const colo = document.createElement('div');
    colo.className = 'colophon';
    page.insertBefore(colo, caret);
    await this.type(colo, '— ' + poem.colophon.replace(/\*/g, ''), caret, 9);
    caret.remove();
    if (!this.alive) return;

    await P.sleep(2400);
    this.openTheRoom();
  },

  async type(el, text, caret, base = 24) {
    let lastScratch = 0;
    for (const ch of text) {
      if (!this.alive) return;
      el.textContent += ch;
      caret.parentNode?.insertBefore(caret, null);
      this.page.scrollTop = this.page.scrollHeight;
      const now = performance.now();
      if (ch !== ' ' && now - lastScratch > 42) { P.audio.scratch(); lastScratch = now; }
      const boost = P.app.pointer.down ? 0.18 : 1;
      await P.sleep((ch === ',' ? base + 130 : ch === '.' ? base + 200 : base) * boost);
    }
  },

  async typeLines(bodyEl, lines, caret) {
    for (let li = 0; li < lines.length; li++) {
      if (!this.alive) return;
      const line = lines[li];
      const boost = () => (P.app.pointer.down ? 0.18 : 1);
      if (line === '') {
        bodyEl.appendChild(document.createTextNode('\n\n'));
        P.audio.chime(Math.floor(P.rand(0, 5)), { vol: 0.05, dur: 2.5 });
        await P.sleep(620 * boost());
        continue;
      }
      // segments split on *emphasis*
      const segs = line.split(/\*/g);
      for (let si = 0; si < segs.length; si++) {
        const em = si % 2 === 1;
        const node = em ? document.createElement('em') : document.createTextNode('');
        if (em) bodyEl.appendChild(node); else bodyEl.appendChild(node);
        let lastScratch = 0;
        for (const ch of segs[si]) {
          if (!this.alive) return;
          node.textContent += ch;
          this.page.scrollTop = this.page.scrollHeight;
          const now = performance.now();
          if (ch !== ' ' && now - lastScratch > 42) { P.audio.scratch(); lastScratch = now; }
          await P.sleep((ch === ',' ? 150 : ch === '.' ? 210 : 23) * boost());
        }
      }
      bodyEl.appendChild(document.createTextNode('\n'));
      await P.sleep(230 * boost());
    }
  },

  openTheRoom() {
    // the pull-back: page shrinks, the dark fills with everything you touched
    this.galaxy = [];
    this.galaxyMax = P.app.reducedMotion ? 240 : 620;
    this.palette = ['#9fd4ff', '#ffe2ae', '#d6dae6', '#9be8b8', '#ffc2a8', '#fff6d8', '#c9a0ff'];
    for (let i = 0; i < 9; i++) {
      this.pages.push({
        x: P.rand(P.app.w), y: P.rand(P.app.h), w: P.rand(70, 150),
        r: P.rand(-0.4, 0.4), vr: P.rand(-0.02, 0.02),
        vx: P.rand(-6, 6), vy: P.rand(-10, -3), depth: P.rand(0.15, 0.6),
      });
    }
    const collected = P.profile.data.collected;
    this.orbitWords = collected.slice(0, 24).map((text, i) => ({
      word: new P.Word(text, { size: 11, color: '#eef2ff', glow: '#aab8ff' }),
      r: 150 + i * 16, a: P.rand(P.TAU), va: 0.05 + 6 / (150 + i * 16),
    }));

    this.page.style.transition = 'transform 8s cubic-bezier(0.22,1,0.36,1)';
    this.page.style.transform = 'scale(0.52) translateY(-6%) rotateX(4deg)';

    (async () => {
      await P.sleep(3500);
      if (!this.alive) return;
      await P.ui.caption('you were the manuscript all along.', { hold: 5000 });
      await P.ui.caption('the mind you walked through was yours.<br>it always is.', { hold: 5600 });
      if (!this.alive) return;
      const stack = P.ui.stack(80);
      stack.append(
        P.ui.button('keep this page', () => this.download(), { delay: 200 }),
        P.ui.button('begin again — the river will be different', () => {
          P.profile.clear();
          location.reload();
        }, { small: true, delay: 700 }),
      );
      P.profile.data.folio = 7;
      P.profile.clear(); // the walk is complete; a new visit starts clean
    })();
  },

  download() {
    const blob = new Blob([this.poemText], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const who = (this.poemTitle || 'the reader').toLowerCase().replace(/[^a-z0-9]+/gi, '-');
    a.download = `palimpsest — ${who}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    P.ui.caption('kept.', { hold: 2200 });
  },

  update(dt, t) {
    if (this.galaxy) {
      this.darken = Math.min(0.82, this.darken + dt * 0.12);
      this.lampGlow = Math.max(0.35, this.lampGlow - dt * 0.1);
      while (this.galaxy.length < this.galaxyMax) {
        const R = Math.max(P.app.w, P.app.h) * 0.62;
        this.galaxy.push({
          r: P.rand(30, R), a: P.rand(P.TAU),
          size: P.rand(0.5, 1.9),
          color: P.pick(this.palette),
          tw: P.rand(100),
        });
      }
      const R = Math.max(P.app.w, P.app.h) * 0.62;
      for (const p of this.galaxy) {
        p.a += (26 / (40 + p.r)) * dt;
        p.r -= 3.2 * dt;
        if (p.r < 26) { p.r = P.rand(R * 0.5, R); p.a = P.rand(P.TAU); }
      }
      for (const ow of this.orbitWords) ow.a += ow.va * dt * 0.35;
      for (const pg of this.pages) {
        pg.x += pg.vx * dt; pg.y += pg.vy * dt; pg.r += pg.vr * dt;
        if (pg.y < -140) { pg.y = P.app.h + 120; pg.x = P.rand(P.app.w); }
        if (pg.x < -140) pg.x = P.app.w + 120;
        if (pg.x > P.app.w + 140) pg.x = -120;
      }
      this.arpT -= dt;
      if (this.arpT <= 0) {
        this.arpT = P.rand(1.2, 2.2);
        P.audio.chime(Math.floor(P.rand(0, 8)), { x: P.rand(0.2, 0.8), vol: 0.07, dur: 3.5 });
      }
    }
  },

  draw(g, w, h, t) {
    P.drawDesk(g, w, h, t, { paper: false, lampGlow: this.lampGlow });

    if (!this.galaxy) return;
    g.fillStyle = `rgba(2,2,8,${this.darken})`;
    g.fillRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;

    // drifting ghost pages — older leaves of the same manuscript
    for (const pg of this.pages) {
      g.save();
      g.translate(pg.x, pg.y);
      g.rotate(pg.r);
      g.globalAlpha = 0.018 + 0.04 * pg.depth * this.darken;
      g.fillStyle = '#e8dcc0';
      g.fillRect(-pg.w / 2, -pg.w * 0.66, pg.w, pg.w * 1.32);
      g.strokeStyle = 'rgba(90,75,45,0.6)';
      g.lineWidth = 0.8;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(-pg.w / 2 + 8, -pg.w * 0.66 + i * pg.w * 0.21);
        g.lineTo(pg.w / 2 - 8, -pg.w * 0.66 + i * pg.w * 0.21);
        g.stroke();
      }
      g.restore();
    }

    // the galaxy of everything
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const p of this.galaxy) {
      const tw = 0.5 + 0.5 * Math.sin(t * 1.3 + p.tw);
      const x = cx + Math.cos(p.a) * p.r;
      const y = cy + Math.sin(p.a) * p.r * 0.62;
      g.globalAlpha = 0.2 + 0.55 * tw * this.darken;
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(x, y, p.size, 0, P.TAU);
      g.fill();
    }
    g.restore();
    g.globalAlpha = 1;

    // your words, in orbit
    for (const ow of this.orbitWords) {
      ow.word.x = cx + Math.cos(ow.a) * ow.r * 1.15;
      ow.word.y = cy + Math.sin(ow.a) * ow.r * 0.6;
      ow.word.alpha = 0.3 * this.darken * (0.6 + 0.4 * Math.sin(t + ow.r));
      ow.word.draw(g);
    }
  },
});
