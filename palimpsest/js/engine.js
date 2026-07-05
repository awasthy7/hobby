// PALIMPSEST — engine: canvas, loop, pointer, scenes, transitions, UI voice.

P.app = {
  scenes: {},
  scene: null,
  sceneName: null,
  t: 0,
  w: 0, h: 0, dpr: 1,
  pointer: { x: -999, y: -999, down: false, speed: 0, inside: false },
  reducedMotion: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  transitioning: false,

  FOLIOS: [
    { key: 'river',   num: 'I',   name: 'THE RIVER' },
    { key: 'archive', num: 'II',  name: 'THE ARCHIVE' },
    { key: 'shadow',  num: 'III', name: 'THE SHADOW' },
    { key: 'garden',  num: 'IV',  name: 'THE GARDEN' },
    { key: 'tide',    num: 'V',   name: 'THE TIDE' },
    { key: 'night',   num: 'VI',  name: 'THE NIGHT' },
    { key: 'finale',  num: 'VII', name: 'THE MANUSCRIPT' },
  ],

  init() {
    this.canvas = document.getElementById('stage');
    this.g = this.canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());

    const pos = e => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    let lastX = 0, lastY = 0, lastT = performance.now();
    window.addEventListener('pointermove', e => {
      const [x, y] = pos(e);
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const d = P.dist(x, y, lastX, lastY);
      // exponential moving average of cursor speed (px/s) — Folio III reads this
      this.pointer.speed = P.lerp(this.pointer.speed, d / dt * 1000, 0.18);
      lastX = x; lastY = y; lastT = now;
      this.pointer.x = x; this.pointer.y = y; this.pointer.inside = true;
      this.scene?.pointerMove?.(x, y);
    }, { passive: true });
    window.addEventListener('pointerdown', e => {
      if (e.target?.closest?.('button,input,.seed')) return;
      P.audio.ensure();
      const [x, y] = pos(e);
      this.pointer.x = x; this.pointer.y = y; this.pointer.down = true;
      this.scene?.pointerDown?.(x, y);
    });
    window.addEventListener('pointerup', e => {
      const [x, y] = pos(e);
      this.pointer.down = false;
      this.scene?.pointerUp?.(x, y);
    });
    window.addEventListener('pointercancel', () => { this.pointer.down = false; });
    document.addEventListener('visibilitychange', () => { this._last = performance.now(); });

    // audio toggle
    const btnAudio = document.getElementById('btn-audio');
    btnAudio.addEventListener('click', () => {
      P.audio.ensure();
      P.audio.setMuted(!P.audio.muted);
      btnAudio.classList.toggle('off', P.audio.muted);
    });

    // progress numerals
    const prog = document.getElementById('progress');
    this.FOLIOS.forEach(f => {
      const s = document.createElement('span');
      s.textContent = f.num;
      s.dataset.key = f.key;
      prog.appendChild(s);
    });

    this._last = performance.now();
    requestAnimationFrame(ts => this.loop(ts));
  },

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.scene?.resize?.(this.w, this.h);
  },

  loop(ts) {
    const dt = Math.min(0.05, (ts - this._last) / 1000 || 0.016);
    this._last = ts;
    this.t += dt;
    this.pointer.speed *= Math.pow(0.25, dt); // settle to calm when the hand rests
    if (P.profile.data) P.profile.data.playSeconds += dt;
    const g = this.g;
    if (this.scene) {
      this.scene.update?.(dt, this.t);
      this.scene.draw?.(g, this.w, this.h, this.t);
    } else {
      g.fillStyle = '#050408';
      g.fillRect(0, 0, this.w, this.h);
    }
    requestAnimationFrame(t2 => this.loop(t2));
  },

  register(name, scene) { this.scenes[name] = scene; },

  // Raw scene switch (no ceremony) — transitions use this internally.
  _enter(name) {
    this.scene?.exit?.();
    P.ui.clearStacks();
    this.sceneName = name;
    this.scene = this.scenes[name];
    this.scene.enter?.();
    this.updateProgress();
  },

  fadeTo(opaque, ms = 1400) {
    const f = document.getElementById('fade');
    f.style.transitionDuration = ms + 'ms';
    f.style.opacity = opaque ? '1' : '0';
    return P.sleep(ms + 60);
  },

  // The ritual between folios: fade out → title card → fade in.
  async goto(name, { card = true } = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    await this.fadeTo(true, 1500);
    this._enter(name);
    if (card) {
      const meta = this.FOLIOS.find(f => f.key === name);
      if (meta) {
        await this.fadeTo(false, 900);
        await P.ui.titleCard(`FOLIO ${meta.num}`, meta.name);
      } else {
        await this.fadeTo(false, 1200);
      }
    } else {
      await this.fadeTo(false, 1200);
    }
    this.transitioning = false;
    this.scene.begin?.();
  },

  // Scene calls this when its work is done. Threshold line, save, move on.
  async completeFolio(thresholdLines, next) {
    const idx = this.FOLIOS.findIndex(f => f.key === this.sceneName) + 1;
    if (idx > 0) {
      P.profile.data.folio = Math.max(P.profile.data.folio, idx);
      P.profile.save();
    }
    this.updateProgress();
    await P.sleep(600);
    for (const line of thresholdLines) {
      await P.ui.caption(line.text, { hold: line.hold ?? 4200, attrib: line.attrib });
    }
    await this.goto(next);
  },

  updateProgress() {
    const d = P.profile.data;
    const spans = document.querySelectorAll('#progress span');
    spans.forEach((s, i) => {
      s.classList.toggle('done', d && d.folio > i);
      s.classList.toggle('current', this.sceneName === this.FOLIOS[i]?.key);
    });
    document.getElementById('progress').classList.toggle('show',
      !!this.FOLIOS.find(f => f.key === this.sceneName));
  },
};

// ---------------------------------------------------------------------------
// UI voice: captions, title cards, stacked menus.
// ---------------------------------------------------------------------------
P.ui = {
  captionBusy: Promise.resolve(),

  caption(text, { hold = 4000, attrib = null, fade = 1100 } = {}) {
    // queue captions so they never overlap
    this.captionBusy = this.captionBusy.then(async () => {
      const box = document.getElementById('captions');
      const el = document.createElement('div');
      el.className = 'caption';
      el.innerHTML = text + (attrib ? `<span class="attrib">${attrib}</span>` : '');
      box.appendChild(el);
      await P.sleep(30);
      el.classList.add('show');
      await P.sleep(fade + hold);
      el.classList.remove('show');
      await P.sleep(fade);
      el.remove();
    });
    return this.captionBusy;
  },

  async titleCard(num, name, hold = 2600) {
    const tc = document.getElementById('titlecard');
    tc.innerHTML = `<div class="folio-num">${num}</div><div class="folio-name">${name}</div><div class="rule"></div>`;
    tc.classList.add('show');
    P.audio.chime(0, { vol: 0.1, dur: 4, octave: -1 });
    await P.sleep(1200 + hold);
    tc.classList.remove('show');
    await P.sleep(1200);
    tc.innerHTML = '';
  },

  // A vertical stack of DOM elements (title screens, questions). Returns the container.
  stack(topPercent = 30) {
    const el = document.createElement('div');
    el.className = 'stack';
    el.style.top = topPercent + '%';
    document.getElementById('ui').appendChild(el);
    return el;
  },

  button(label, onClick, { small = false, delay = 0 } = {}) {
    const b = document.createElement('button');
    b.className = 'textbtn fadein' + (small ? ' small' : '');
    b.style.animationDelay = delay + 'ms';
    b.textContent = label;
    b.addEventListener('click', () => { P.audio.ensure(); onClick(b); });
    return b;
  },

  clearStacks() {
    document.querySelectorAll('#ui .stack').forEach(s => s.remove());
  },

  async fadeRemove(el, ms = 900) {
    el.style.transition = `opacity ${ms}ms ease`;
    el.style.opacity = '0';
    await P.sleep(ms);
    el.remove();
  },
};
