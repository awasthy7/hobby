// AMOR FATI — helpers. Global namespace: Z (for the one who spoke).
window.Z = {
  TAU: Math.PI * 2,
  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  damp(a, b, rate, dt) { return Z.lerp(a, b, 1 - Math.pow(1 - rate, dt * 60)); },
  ease(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; },
  easeOut(t) { return 1 - Math.pow(1 - t, 3); },
  rand(a, b) { return a + Math.random() * (b - a); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },

  // 1D value noise for wind, wobble, shimmer
  noise1(x, seed = 0) {
    const xi = Math.floor(x), xf = x - xi;
    const h = (n) => {
      let v = (n * 374761393 + seed * 668265263) | 0;
      v = (v ^ (v >> 13)) | 0;
      v = Math.imul(v, 1274126177);
      return (((v ^ (v >> 16)) >>> 0) / 4294967296) * 2 - 1;
    };
    const u = xf * xf * (3 - 2 * xf);
    return h(xi) + (h(xi + 1) - h(xi)) * u;
  },

  // persistence across recurrences — the whole point
  save: {
    key: 'amorfati',
    data: null,
    load() {
      try { this.data = JSON.parse(localStorage.getItem(this.key)) || {}; }
      catch (e) { this.data = {}; }
      this.data.loop = this.data.loop || 1;
      this.data.yes = this.data.yes || 0;
      this.data.flags = this.data.flags || {};
      return this.data;
    },
    write() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {} },
    flag(name, val) {
      if (val === undefined) return this.data.flags[name];
      this.data.flags[name] = val; this.write();
    },
    newLoop() { this.data.loop++; this.write(); },
  },
};
