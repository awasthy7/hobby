// SOUNDCLASH — shared helpers. Everything hangs off the global S.
window.S = {};

S.TAU = Math.PI * 2;
S.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
S.lerp = (a, b, t) => a + (b - a) * t;
S.damp = (a, b, rate, dt) => S.lerp(a, b, 1 - Math.pow(1 - rate, dt * 60)); // frame-rate independent chase
S.rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
S.pick = arr => arr[Math.floor(Math.random() * arr.length)];
S.sign = v => v < 0 ? -1 : 1;

S.ease = {
  out: t => 1 - Math.pow(1 - t, 3),
  outQuint: t => 1 - Math.pow(1 - t, 5),
  in: t => t * t * t,
  inOut: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outBack: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

S.rectsOverlap = (a, b) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

S.removeDead = (list) => {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
};
