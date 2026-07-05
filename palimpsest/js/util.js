// PALIMPSEST — small math + helpers. Everything hangs off the global P.
window.P = {};

P.TAU = Math.PI * 2;
P.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
P.lerp = (a, b, t) => a + (b - a) * t;
P.rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
P.pick = arr => arr[Math.floor(Math.random() * arr.length)];
P.dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
P.smoothstep = t => t * t * (3 - 2 * t);

P.ease = {
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  out: t => 1 - Math.pow(1 - t, 3),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  in: t => t * t * t,
};

P.sleep = ms => new Promise(r => setTimeout(r, ms));

// Deterministic PRNG (mulberry32) — used so a given playthrough's poem is stable.
P.seededRandom = function (seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
P.hashString = function (s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

// ---- 2D value noise with fBm — drives rivers, dust, gardens, seas ----
P.Noise = class {
  constructor(seed = 1337) {
    const rnd = P.seededRandom(seed);
    this.perm = new Uint8Array(512);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  val(ix, iy) { return this.perm[(ix & 255) + this.perm[iy & 255]] / 255; }
  at(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = P.smoothstep(x - ix), fy = P.smoothstep(y - iy);
    const a = this.val(ix, iy), b = this.val(ix + 1, iy);
    const c = this.val(ix, iy + 1), d = this.val(ix + 1, iy + 1);
    return P.lerp(P.lerp(a, b, fx), P.lerp(c, d, fx), fy);
  }
  fbm(x, y, oct = 3) {
    let v = 0, amp = 0.5, f = 1;
    for (let i = 0; i < oct; i++) { v += amp * this.at(x * f, y * f); amp *= 0.5; f *= 2.03; }
    return v;
  }
};
P.noise = new P.Noise(20260703);

// Global breath: one full cycle every 10 seconds (~6 breaths/min — a calming rate).
P.breath = t => 0.5 + 0.5 * Math.sin(t * P.TAU / 10);

P.hexToRgb = function (hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
P.rgba = function (hex, a) {
  const [r, g, b] = P.hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
P.mix = function (hexA, hexB, t) {
  const a = P.hexToRgb(hexA), b = P.hexToRgb(hexB);
  return `rgb(${Math.round(P.lerp(a[0], b[0], t))},${Math.round(P.lerp(a[1], b[1], t))},${Math.round(P.lerp(a[2], b[2], t))})`;
};
