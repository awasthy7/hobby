// DOOMED — shared helpers. Global namespace: D
window.D = {
  TAU: Math.PI * 2,
  CEIL: 1.4,   // standard room height; body is 0.55 — DOOM-ish proportions

  clamp(v, a, b) { return v < a ? a : v > b ? b : v; },
  lerp(a, b, t) { return a + (b - a) * t; },
  damp(a, b, rate, dt) { return a + (b - a) * (1 - Math.pow(1 - rate, dt * 60)); },
  rand(a, b) { return a + Math.random() * (b - a); },
  randInt(a, b) { return Math.floor(D.rand(a, b + 1)); },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  dist(ax, ay, bx, by) { const dx = bx - ax, dy = by - ay; return Math.sqrt(dx * dx + dy * dy); },

  // Deterministic hash noise for texture generation (no Math.random so
  // textures are identical every boot).
  hash(x, y, seed = 0) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = (h ^ (h >> 13)) | 0;
    h = Math.imul(h, 1274126177);
    return ((h ^ (h >> 16)) >>> 0) / 4294967296;
  },

  // Smooth value noise built on hash.
  vnoise(x, y, seed = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = D.hash(xi, yi, seed), b = D.hash(xi + 1, yi, seed);
    const c = D.hash(xi, yi + 1, seed), d = D.hash(xi + 1, yi + 1, seed);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  },

  fbm(x, y, seed = 0, oct = 4) {
    let sum = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) {
      sum += D.vnoise(x * f, y * f, seed + i * 31) * amp;
      amp *= 0.5; f *= 2;
    }
    return sum;
  },

  hexRGB(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  },
};
