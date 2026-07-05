// FOLIO II — THE ARCHIVE. Memory. Run your light along the faded lines
// and re-ink them. At the end: two books, and only one leaves with you.

P.app.register('archive', {
  LINES: [
    'the house is gone, but the doorway is still in your hand',
    'every remembered summer is two summers — the one that happened, and the one you needed',
    'a voice calling you in at dusk: the word was your name; the meaning was you are not lost',
    'the friend you lost is still mid-sentence somewhere, and you are still listening',
    'childhood — the one country that never revokes your passport',
    'what you call your past is the part of the sea the light happens to reach',
  ],

  enter() {
    P.audio.scene({ root: 98.0, scale: [0, 2, 4, 7, 9], chimeRoot: 392, padVol: 0.045 });
    this.lines = P.FAST ? this.LINES.slice(0, 2) : this.LINES;
    P.profile.data.book = null; // this folio owns the book choice
    this.motes = new P.Particles(300);
    this.lineIdx = -1;
    this.chars = null;
    this.lineAlpha = 0;
    this.done = [];       // {text, y, size, alpha}
    this.books = null;
    this.chimeMark = 0;
    this.pages = [];
    for (let i = 0; i < 4; i++) {
      this.pages.push({
        x: P.rand(P.app.w), y: P.rand(P.app.h),
        w: P.rand(60, 115), r: P.rand(-0.3, 0.3),
        depth: P.rand(0.2, 0.7), vy: P.rand(-3, -1),
      });
    }
  },

  begin() {
    P.ui.caption('six lines have faded here.<br>move your light slowly along each one, and re-ink it.', { hold: 5200 })
      .then(() => this.nextLine());
  },

  layoutLine(text) {
    const g = P.app.g;
    let size = Math.min(21, P.app.w * 0.026);
    g.font = `italic ${size}px Georgia, serif`;
    let total = g.measureText(text).width;
    const maxW = P.app.w * 0.86;
    if (total > maxW) { size *= maxW / total; g.font = `italic ${size}px Georgia, serif`; total = g.measureText(text).width; }
    const chars = [];
    let x = (P.app.w - total) / 2;
    for (const ch of text) {
      const w = g.measureText(ch).width;
      chars.push({ ch, x: x + w / 2, w, ink: 0 });
      x += w;
    }
    this.charSize = size;
    return chars;
  },

  nextLine() {
    this.lineIdx++;
    if (this.lineIdx >= this.lines.length) { this.offerBooks(); return; }
    this.chars = this.layoutLine(this.lines[this.lineIdx]);
    this.lineAlpha = 0;
    this.chimeMark = 0;
  },

  offerBooks() {
    this.chars = null;
    P.ui.caption('the shelf keeps two books of the same life.<br>you may take one.', { hold: 4600 });
    const y = P.app.h * 0.56;
    const mk = (x, key, label, hue) => ({
      x, y, key, hue, chosen: false, hot: 0,
      label: new P.Word(label, { size: 17, color: '#ffe2ae', glow: '#c8965a', x, y: y + 118 }),
    });
    this.books = [
      mk(P.app.w * 0.29, 'happened', 'what happened', '#6b4a2c'),
      mk(P.app.w * 0.71, 'should', 'what should have happened', '#2c3d6b'),
    ];
  },

  async chooseBook(book) {
    P.profile.data.book = book.key;
    book.chosen = true;
    P.audio.chime(7, { x: book.x / P.app.w, vol: 0.16, dur: 3.5 });
    this.motes.burst(book.x, book.y, 40, () => ({
      x: book.x + P.rand(-30, 30), y: book.y + P.rand(-70, 70),
      vx: P.rand(-16, 16), vy: P.rand(-34, -8),
      size: P.rand(0.8, 2.4), color: '#ffd9a0', decay: P.rand(0.25, 0.5), drag: 0.985,
    }));
    await P.sleep(1800);
    P.profile.data.expectedSeconds += 160;
    P.app.completeFolio([
      { text: 'memory is a draft.<br>you have been revising it all your life.', hold: 4600 },
    ], 'shadow');
  },

  pointerDown(x, y) {
    if (this.books && !this.books.some(b => b.chosen)) {
      for (const b of this.books) {
        if (Math.abs(x - b.x) < 55 && Math.abs(y - b.y) < 95) { this.chooseBook(b); return; }
      }
    }
  },

  update(dt, t) {
    // ambient dust in the light shafts
    if (Math.random() < 0.6) {
      this.motes.spawn({
        x: P.rand(P.app.w), y: P.rand(P.app.h),
        vx: P.rand(-3, 5), vy: P.rand(-6, -2),
        size: P.rand(0.4, 1.4), color: '#ffd9a0',
        alpha: P.rand(0.08, 0.3), decay: P.rand(0.06, 0.14), drag: 0.998,
      });
    }
    this.motes.update(dt);
    for (const pg of this.pages) {
      pg.y += pg.vy * dt;
      if (pg.y < -160) { pg.y = P.app.h + 100; pg.x = P.rand(P.app.w); }
    }

    if (this.chars) {
      this.lineAlpha = Math.min(1, this.lineAlpha + dt * 0.7);
      const px = P.app.pointer.x, py = P.app.pointer.y;
      const ly = P.app.h * 0.44;
      let sum = 0;
      for (let i = 0; i < this.chars.length; i++) {
        const c = this.chars[i];
        if (P.dist(px, py, c.x, ly) < 30) c.ink = Math.min(1, c.ink + dt * 2.4);
        // ink wicks into neighbours
        if (c.ink > 0.85) {
          if (this.chars[i - 1]) this.chars[i - 1].ink = Math.min(1, this.chars[i - 1].ink + dt * 0.55);
          if (this.chars[i + 1]) this.chars[i + 1].ink = Math.min(1, this.chars[i + 1].ink + dt * 0.55);
        }
        sum += c.ink;
      }
      const frac = sum / this.chars.length;
      if (frac > this.chimeMark + 0.24) {
        this.chimeMark = frac;
        P.audio.chime(2 + Math.round(frac * 5), { x: px / P.app.w, vol: 0.1 });
      }
      if (frac > 0.98) {
        const text = this.lines[this.lineIdx];
        this.done.push({ text, y: ly, targetY: 44 + this.done.length * 26, size: this.charSize, alpha: 1 });
        P.audio.chime(9, { vol: 0.13, dur: 3 });
        this.chars = null;
        setTimeout(() => this.nextLine(), 1100);
      }
    }

    for (const d of this.done) {
      d.y = P.lerp(d.y, d.targetY, 1 - Math.pow(0.25, dt));
      d.alpha = P.lerp(d.alpha, 0.42, 1 - Math.pow(0.3, dt));
    }

    if (this.books) {
      const px = P.app.pointer.x, py = P.app.pointer.y;
      for (const b of this.books) {
        const near = Math.abs(px - b.x) < 60 && Math.abs(py - b.y) < 100;
        b.hot = P.lerp(b.hot, near || b.chosen ? 1 : 0, 1 - Math.pow(0.02, dt));
      }
    }
  },

  draw(g, w, h, t) {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#150d06');
    bg.addColorStop(1, '#24170c');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // drifting ghost pages
    for (const pg of this.pages) {
      g.save();
      g.translate(pg.x, pg.y);
      g.rotate(pg.r);
      g.globalAlpha = 0.025 + 0.035 * pg.depth;
      g.fillStyle = '#c9b085';
      g.fillRect(-pg.w / 2, -pg.w * 0.65, pg.w, pg.w * 1.3);
      g.strokeStyle = 'rgba(90,70,40,0.5)';
      g.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        g.beginPath();
        g.moveTo(-pg.w / 2 + 10, -pg.w * 0.65 + i * pg.w * 0.2);
        g.lineTo(pg.w / 2 - 10, -pg.w * 0.65 + i * pg.w * 0.2);
        g.stroke();
      }
      g.restore();
    }

    // god rays — three shafts, each built from nested wedges for soft edges
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const bx = w * (0.22 + i * 0.28);
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.22 + i * 2.1);
      const drift = w * 0.08;
      for (let layer = 0; layer < 3; layer++) {
        const tw = 20 + layer * 24;
        const bw2 = 46 + layer * 56;
        const a = (0.020 - layer * 0.005) * (0.6 + 0.6 * breathe);
        const grad = g.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, `rgba(255,196,120,${a})`);
        grad.addColorStop(1, 'rgba(255,196,120,0)');
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(bx - tw, -10);
        g.lineTo(bx + tw, -10);
        g.lineTo(bx + drift + bw2, h);
        g.lineTo(bx + drift - bw2, h);
        g.closePath();
        g.fill();
      }
    }
    g.restore();

    this.motes.draw(g);

    // restored lines resting at the top
    g.textAlign = 'center';
    for (const d of this.done) {
      g.font = `italic ${d.size * 0.72}px Georgia, serif`;
      g.fillStyle = `rgba(255,226,174,${d.alpha})`;
      g.fillText(d.text, w / 2, d.y);
    }

    // the line being traced
    if (this.chars) {
      const ly = h * 0.44;
      g.textAlign = 'center';
      g.font = `italic ${this.charSize}px Georgia, serif`;
      for (const c of this.chars) {
        g.fillStyle = `rgba(140,110,70,${0.28 * this.lineAlpha})`;
        g.fillText(c.ch, c.x, ly);
        if (c.ink > 0.01) {
          g.save();
          g.globalCompositeOperation = 'lighter';
          g.shadowColor = 'rgba(255,200,120,0.8)';
          g.shadowBlur = 14 * c.ink;
          g.fillStyle = `rgba(255,233,196,${0.9 * c.ink})`;
          g.fillText(c.ch, c.x, ly);
          g.restore();
        }
      }
      // a faint underline showing where the finger has been
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(255,210,140,0.12)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(this.chars[0].x - 10, ly + this.charSize * 0.8);
      g.lineTo(this.chars[this.chars.length - 1].x + 10, ly + this.charSize * 0.8);
      g.stroke();
      g.restore();
    }

    // the two books
    if (this.books) {
      for (const b of this.books) {
        if (b.chosen === false && this.books.some(x => x.chosen)) {
          g.globalAlpha = 0.18;
        }
        g.save();
        g.translate(b.x, b.y);
        g.rotate(b === this.books[0] ? -0.02 : 0.02);
        g.shadowColor = 'rgba(0,0,0,0.6)';
        g.shadowBlur = 24;
        const bw = 74, bh = 168;
        const grad = g.createLinearGradient(-bw / 2, 0, bw / 2, 0);
        grad.addColorStop(0, b.hue);
        grad.addColorStop(0.5, P.mix(b.hue, '#ffdca0', 0.25 + 0.3 * b.hot));
        grad.addColorStop(1, b.hue);
        g.fillStyle = grad;
        g.fillRect(-bw / 2, -bh / 2, bw, bh);
        g.shadowColor = 'transparent';
        g.strokeStyle = `rgba(255,220,160,${0.25 + 0.55 * b.hot})`;
        g.lineWidth = 1;
        g.strokeRect(-bw / 2 + 5, -bh / 2 + 5, bw - 10, bh - 10);
        g.restore();
        b.label.alpha = 0.5 + 0.5 * b.hot;
        b.label.draw(g);
        g.globalAlpha = 1;
      }
    }
  },
});
