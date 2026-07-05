// PROLOGUE — a desk, a lamp, one sheet of paper. The game begins and ends here.

// Shared desk renderer (the finale returns to this room).
P.drawDesk = function (g, w, h, t, { paper = true, lampGlow = 1 } = {}) {
  g.fillStyle = '#070503';
  g.fillRect(0, 0, w, h);

  // desk surface
  const deskY = h * 0.66;
  const dg = g.createLinearGradient(0, deskY, 0, h);
  dg.addColorStop(0, '#231409');
  dg.addColorStop(1, '#0c0703');
  g.fillStyle = dg;
  g.fillRect(0, deskY, w, h - deskY);

  // lamplight pool
  const cx = w / 2, cy = h * 0.42;
  const r = Math.min(w, h) * (0.62 + 0.02 * Math.sin(t * 0.7));
  const lg = g.createRadialGradient(cx, cy, 10, cx, cy, r);
  lg.addColorStop(0, `rgba(255,196,120,${0.20 * lampGlow})`);
  lg.addColorStop(0.5, `rgba(255,170,90,${0.07 * lampGlow})`);
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = lg;
  g.fillRect(0, 0, w, h);
  g.restore();

  if (paper) {
    const pw = Math.min(340, w * 0.4, h * 0.24), ph = pw * 1.32;
    g.save();
    g.translate(cx, h * 1.02);
    g.rotate(-0.03);
    g.shadowColor = 'rgba(0,0,0,0.6)';
    g.shadowBlur = 30;
    g.shadowOffsetY = 12;
    const pg = g.createLinearGradient(0, -ph, 0, 0);
    pg.addColorStop(0, '#efe3c8');
    pg.addColorStop(1, '#d9c8a4');
    g.fillStyle = pg;
    g.fillRect(-pw / 2, -ph, pw, ph);
    g.shadowColor = 'transparent';
    // ghost of older writing — the palimpsest itself
    g.strokeStyle = 'rgba(122,100,64,0.16)';
    g.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const y = -ph + 26 + i * (ph - 50) / 12;
      g.beginPath();
      g.moveTo(-pw / 2 + 22, y);
      g.lineTo(-pw / 2 + 22 + (pw - 44) * (0.55 + 0.45 * P.noise.at(i * 3.7, t * 0.02)), y);
      g.stroke();
    }
    g.restore();
  }
};

P.app.register('prologue', {
  motes: new P.Particles(200),

  enter() {
    P.audio.scene({ root: 73.42, scale: [0, 2, 4, 7, 9], chimeRoot: 293.66, padVol: 0.045 });
    this.t0 = P.app.t;
    this.built = false;
  },

  begin() { this.buildMenu(); },

  buildMenu() {
    if (this.built) return;
    this.built = true;
    const saved = P.profile.load();
    const stack = P.ui.stack(16);

    const title = document.createElement('div');
    title.className = 'game-title fadein';
    title.textContent = 'PALIMPSEST';
    const sub = document.createElement('div');
    sub.className = 'game-sub fadein';
    sub.style.animationDelay = '1200ms';
    sub.textContent = 'an excavation of one mind — yours';
    stack.append(title, sub);

    const spacer = document.createElement('div');
    spacer.style.height = '4vh';
    stack.append(spacer);

    if (saved) {
      const meta = P.app.FOLIOS[saved.folio];
      stack.append(P.ui.button(`resume — folio ${meta.num.toLowerCase()}, ${meta.name.toLowerCase()}`, () => {
        P.ui.clearStacks();
        P.app.goto(meta.key);
      }, { delay: 2200 }));
      stack.append(P.ui.button('begin again (the page will be scraped clean)', () => {
        P.profile.clear();
        P.profile.fresh();
        P.ui.clearStacks();
        this.askName();
      }, { small: true, delay: 2700 }));
    } else {
      P.profile.fresh();
      stack.append(P.ui.button('begin', () => {
        P.ui.clearStacks();
        this.askName();
      }, { delay: 2400 }));
    }
  },

  askName() {
    const stack = P.ui.stack(34);
    const q = document.createElement('div');
    q.className = 'game-sub fadein';
    q.textContent = 'the manuscript keeps a ledger of its readers.';
    const q2 = document.createElement('div');
    q2.className = 'game-sub fadein';
    q2.style.animationDelay = '900ms';
    q2.textContent = 'you may sign it, or you may not. both are recorded.';
    const input = document.createElement('input');
    input.className = 'nameinput fadein';
    input.style.animationDelay = '1600ms';
    input.placeholder = 'a name, if you keep one';
    input.maxLength = 24;
    input.autocomplete = 'off';
    input.spellcheck = false;

    const go = (name) => {
      P.profile.data.name = name || null;
      P.ui.clearStacks();
      P.app.goto('river');
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') go(input.value.trim().replace(/[<>&]/g, ''));
    });
    const sign = P.ui.button('sign', () => go(input.value.trim().replace(/[<>&]/g, '')), { delay: 2200 });
    const skip = P.ui.button('remain unsigned', () => go(null), { small: true, delay: 2600 });
    stack.append(q, q2, input, sign, skip);
    setTimeout(() => input.focus(), 1700);
  },

  update(dt, t) {
    if (Math.random() < 0.5) {
      const cx = P.app.w / 2;
      this.motes.spawn({
        x: cx + P.rand(-P.app.w * 0.28, P.app.w * 0.28),
        y: P.rand(P.app.h * 0.25, P.app.h * 0.85),
        vx: P.rand(-4, 4), vy: P.rand(-9, -3),
        size: P.rand(0.5, 1.6), color: '#ffd9a0',
        alpha: P.rand(0.12, 0.4), decay: P.rand(0.08, 0.16), drag: 0.995,
      });
    }
    this.motes.update(dt);
  },

  draw(g, w, h, t) {
    P.drawDesk(g, w, h, t);
    this.motes.draw(g);
  },
});
