// util.js — tiny shared helpers. Pure, no DOM, safe to import headless.

/** Deterministic PRNG (mulberry32). Returns fn () => float in [0,1). */
export function makeRng(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);

/** Exponential damping toward target; frame-rate independent. */
export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Signed shortest difference a→b wrapped to [-range/2, range/2). */
export function wrapDelta(a, b, range) {
  let d = (b - a) % range;
  if (d < -range / 2) d += range;
  if (d >= range / 2) d -= range;
  return d;
}

/** Pick a random element using rng(). */
export const pick = (rng, arr) => arr[(rng() * arr.length) | 0];

export const TAU = Math.PI * 2;
