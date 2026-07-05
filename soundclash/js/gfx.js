// SOUNDCLASH — drawing helpers: outlined capsule limbs, glow, sparks,
// particles, screen shake, arcade text. The comic-outline pass is what makes
// procedural fighters read as designed characters instead of programmer art.

S.gfx = {
  // limb as a round-capped stroke; outline pass first, then fill color
  capsule(g, x1, y1, x2, y2, w, color, outline = '#0a0a12', outlineW = 5) {
    g.lineCap = 'round';
    if (outline) {
      g.strokeStyle = outline;
      g.lineWidth = w + outlineW;
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    }
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  },

  circle(g, x, y, r, color, outline = '#0a0a12', outlineW = 5) {
    if (outline) {
      g.fillStyle = outline;
      g.beginPath(); g.arc(x, y, r + outlineW / 2, 0, S.TAU); g.fill();
    }
    g.fillStyle = color;
    g.beginPath(); g.arc(x, y, r, 0, S.TAU); g.fill();
  },

  poly(g, pts, color, outline = '#0a0a12', outlineW = 5) {
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    g.closePath();
    if (outline) { g.strokeStyle = outline; g.lineWidth = outlineW; g.stroke(); }
    g.fillStyle = color;
    g.fill();
  },

  glow(g, x, y, r, color, alpha = 0.5) {
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = alpha;
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
    g.restore();
  },

  // impact star: white core + colored spikes
  spark(g, x, y, r, color, rot = 0) {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = color;
    g.beginPath();
    const spikes = 6;
    for (let i = 0; i < spikes * 2; i++) {
      const rr = i % 2 === 0 ? r : r * 0.34;
      const a = (i / (spikes * 2)) * S.TAU;
      i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(rr, 0);
    }
    g.closePath();
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(0, 0, r * 0.3, 0, S.TAU); g.fill();
    g.restore();
  },

  // big display text with outline + optional glow; skew for arcade energy
  text(g, str, x, y, size, { fill = '#fff', stroke = '#0a0a12', strokeW = 0.14, align = 'center', skew = -0.12, glow = null, alpha = 1, spacing = 0 } = {}) {
    g.save();
    g.globalAlpha = alpha;
    g.translate(x, y);
    g.transform(1, 0, skew, 1, 0, 0);
    g.font = `${size}px Impact, "Arial Black", sans-serif`;
    g.textAlign = align;
    g.textBaseline = 'middle';
    if (spacing) g.canvas.style.letterSpacing = spacing + 'px';
    if (glow) { g.shadowColor = glow; g.shadowBlur = size * 0.45; }
    if (stroke) {
      g.strokeStyle = stroke;
      g.lineWidth = Math.max(2, size * strokeW);
      g.lineJoin = 'round';
      g.strokeText(str, 0, 0);
    }
    g.fillStyle = fill;
    g.fillText(str, 0, 0);
    g.restore();
  },
};

// ---- particles ----
S.Particles = class {
  constructor(max = 700) { this.list = []; this.max = max; }
  spawn(o) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, life: 1, decay: 1.6, size: 3,
      color: '#fff', grav: 0, drag: 1, additive: true, shape: 'dot', rot: 0, vrot: 0,
    }, o));
  }
  burst(x, y, n, fn) { for (let i = 0; i < n; i++) this.spawn(fn(i)); }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= p.decay * dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy = p.vy * Math.pow(p.drag, dt * 60) + p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vrot * dt;
    }
  }
  draw(g) {
    for (const p of this.list) {
      g.globalCompositeOperation = p.additive ? 'lighter' : 'source-over';
      g.globalAlpha = S.clamp(p.life, 0, 1);
      g.fillStyle = p.color;
      if (p.shape === 'dot') {
        g.beginPath(); g.arc(p.x, p.y, p.size * (0.4 + 0.6 * p.life), 0, S.TAU); g.fill();
      } else if (p.shape === 'line') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.fillRect(-p.size, -1, p.size * 2, 2);
        g.restore();
      } else if (p.shape === 'note') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot);
        g.font = `${p.size * 4}px Georgia, serif`;
        g.textAlign = 'center';
        g.fillText('♪', 0, 0);
        g.restore();
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
};

// ---- screen shake ----
S.shake = {
  power: 0, x: 0, y: 0,
  add(p) { this.power = Math.min(22, this.power + p); },
  update(dt) {
    this.power = Math.max(0, this.power - dt * 34);
    this.x = S.rand(-1, 1) * this.power;
    this.y = S.rand(-1, 1) * this.power * 0.7;
  },
};
