// DOOMED — lighting. A static lightmap baked per level (lamps, the exit
// switch, ambient mood) plus a handful of dynamic point lights each frame
// (muzzle flash, fireballs, explosions). Sampled bilinearly by the renderer.
(function () {
  D.light = {
    w: 0, h: 0,
    r: null, g: null, b: null,
    out: [1, 1, 1],

    bake(map, things) {
      const w = this.w = map.w, h = this.h = map.h;
      const amb = map.meta.ambient || [0.6, 0.57, 0.55];
      this.r = new Float32Array(w * h).fill(amb[0]);
      this.g = new Float32Array(w * h).fill(amb[1]);
      this.b = new Float32Array(w * h).fill(amb[2]);

      const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && map.grid[y * w + x] === 0;
      const los = (x0, y0, x1, y1) => {
        const steps = Math.ceil(D.dist(x0, y0, x1, y1) * 2);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
          const cx = Math.floor(x0 + (x1 - x0) * t), cy = Math.floor(y0 + (y1 - y0) * t);
          if (!open(cx, cy) && !(cx === Math.floor(x1) && cy === Math.floor(y1))) return false;
        }
        return true;
      };

      const addSource = (sx, sy, radius, cr, cg, cb) => {
        const R = Math.ceil(radius);
        for (let y = Math.floor(sy) - R; y <= Math.floor(sy) + R; y++) {
          for (let x = Math.floor(sx) - R; x <= Math.floor(sx) + R; x++) {
            if (x < 0 || y < 0 || x >= w || y >= h) continue;
            const cx = x + 0.5, cy = y + 0.5;
            const d = D.dist(sx, sy, cx, cy);
            if (d > radius) continue;
            if (d > 0.9 && !los(sx, sy, cx, cy)) continue;
            const f = 1 / (1 + d * d * 0.55);
            const i = y * w + x;
            this.r[i] += cr * f; this.g[i] += cg * f; this.b[i] += cb * f;
          }
        }
      };

      for (const t of things) {
        if (t.type === 'lamp') addSource(t.x, t.y, 4.5, 1.05, 0.82, 0.45);
      }
      // the exit switch glows arterial red
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (map.grid[y * w + x] === D.tex.EXIT) addSource(x + 0.5, y + 0.5, 3.2, 0.55, 0.12, 0.08);
      }
      // gentle clamp so pools stay warm, not blown out
      for (let i = 0; i < w * h; i++) {
        if (this.r[i] > 1.5) this.r[i] = 1.5;
        if (this.g[i] > 1.5) this.g[i] = 1.5;
        if (this.b[i] > 1.5) this.b[i] = 1.5;
      }
    },

    // bilinear sample + dynamic lights; writes into this.out (no allocation)
    sample(x, y, lights, nLights) {
      const w = this.w, h = this.h;
      let fx = x - 0.5, fy = y - 0.5;
      let x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0;
      let x1 = x0 + 1, y1 = y0 + 1;
      if (x1 >= w) x1 = w - 1; if (y1 >= h) y1 = h - 1;
      if (x0 >= w) x0 = w - 1; if (y0 >= h) y0 = h - 1;
      const i00 = y0 * w + x0, i10 = y0 * w + x1, i01 = y1 * w + x0, i11 = y1 * w + x1;
      const a = (1 - tx) * (1 - ty), bq = tx * (1 - ty), c = (1 - tx) * ty, dq = tx * ty;
      let lr = this.r[i00] * a + this.r[i10] * bq + this.r[i01] * c + this.r[i11] * dq;
      let lg = this.g[i00] * a + this.g[i10] * bq + this.g[i01] * c + this.g[i11] * dq;
      let lb = this.b[i00] * a + this.b[i10] * bq + this.b[i01] * c + this.b[i11] * dq;
      for (let i = 0; i < nLights; i++) {
        const L = lights[i];
        const dx = x - L.x, dy = y - L.y;
        const f = L.s / (1 + (dx * dx + dy * dy) * L.k);
        lr += L.r * f; lg += L.g * f; lb += L.b * f;
      }
      const o = this.out;
      o[0] = lr > 1.7 ? 1.7 : lr;
      o[1] = lg > 1.7 ? 1.7 : lg;
      o[2] = lb > 1.7 ? 1.7 : lb;
      return o;
    },
  };
})();
