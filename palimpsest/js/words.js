// PALIMPSEST — words as physical objects, plus shared particle helpers.

// Pre-render a glowing word to an offscreen canvas (cheap to draw every frame).
P.renderWord = function (text, { size = 22, color = '#cfe8ff', glow = null, italic = true, weight = 400 } = {}) {
  const key = [text, size, color, glow, italic, weight].join('|');
  P._wordCache = P._wordCache || new Map();
  if (P._wordCache.has(key)) return P._wordCache.get(key);
  const font = `${italic ? 'italic ' : ''}${weight} ${size}px Georgia, "Iowan Old Style", serif`;
  const m = document.createElement('canvas').getContext('2d');
  m.font = font;
  const tw = m.measureText(text).width;
  const pad = Math.ceil(size * 1.3);
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(tw + pad * 2);
  cv.height = Math.ceil(size * 1.6 + pad * 2);
  const g = cv.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = glow || color;
  g.shadowBlur = size * 0.75;
  g.fillStyle = color;
  g.fillText(text, cv.width / 2, cv.height / 2);
  g.fillText(text, cv.width / 2, cv.height / 2); // second pass thickens the glow
  const out = { canvas: cv, w: cv.width, h: cv.height };
  P._wordCache.set(key, out);
  return out;
};

P.Word = class {
  constructor(text, opts = {}) {
    this.text = text;
    this.sprite = P.renderWord(text, opts);
    this.x = opts.x || 0; this.y = opts.y || 0;
    this.vx = opts.vx || 0; this.vy = opts.vy || 0;
    this.alpha = opts.alpha ?? 1;
    this.scale = opts.scale ?? 1;
    this.rot = opts.rot || 0;
    this.additive = opts.additive ?? true;
    this.data = {};
  }
  draw(g) {
    if (this.alpha <= 0.003) return;
    g.save();
    if (this.additive) g.globalCompositeOperation = 'lighter';
    g.globalAlpha = P.clamp(this.alpha, 0, 1);
    g.translate(this.x, this.y);
    if (this.rot) g.rotate(this.rot);
    g.scale(this.scale, this.scale);
    g.drawImage(this.sprite.canvas, -this.sprite.w / 2, -this.sprite.h / 2);
    g.restore();
  }
  hit(px, py, r = 46) {
    return P.dist(px, py, this.x, this.y) < r + this.sprite.w * this.scale * 0.22;
  }
};

// ---- generic particle pool ----
P.Particles = class {
  constructor(max = 900) { this.list = []; this.max = max; }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, life: 1, decay: 0.4,
      size: 2, color: '#ffffff', alpha: 1, drag: 1, grav: 0, additive: true,
    }, o));
  }
  burst(x, y, n, fn) { for (let i = 0; i < n; i++) this.spawn(fn(i)); }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.tick) p.tick(p, dt);
    }
  }
  draw(g) {
    for (const p of this.list) {
      g.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      g.globalAlpha = P.clamp(p.alpha * Math.min(1, p.life * 2), 0, 1);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life), 0, P.TAU);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
};

// Dissolve a word into drifting motes of its own color.
P.dissolveWord = function (particles, word, color, n = 26) {
  const w = word.sprite.w * word.scale * 0.4;
  particles.burst(word.x, word.y, n, () => ({
    x: word.x + P.rand(-w, w), y: word.y + P.rand(-10, 10),
    vx: P.rand(-14, 14), vy: P.rand(-26, -6),
    size: P.rand(0.8, 2.2), color, decay: P.rand(0.25, 0.5), drag: 0.985,
  }));
};
