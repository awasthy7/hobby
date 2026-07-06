// logic/tracks.js — deterministic track geometry: centerline spline, props, cop zones.
// Pure + headless. See config.js Track typedef.

import {
  TRACKS, THEMES, LEVELS, RACE_LENGTH_STEP, TRACK_SAMPLE_STEP, PROP_MIN_X,
  CURVE_GRIP, GRAVITY,
} from '../config.js';
import { makeRng, clamp, lerp, smoothstep, wrapDelta, pick, TAU } from '../util.js';

const CTL_LEN = 210;          // m between spline control points
const FINE_SUBS = 160;        // fine subdivisions per segment for arc-length walk
const NO_COLLIDE = { fern: true, umbrella: true, cone: true, grandstand: true, loopprop: true };
const BANK_GAIN = 34;         // curvature → bank radians scale (before per-theme bankFactor)
const MAX_BANK = 0.6;         // ~34° cap
const BOOST_LEN = 60;         // m length of a boost pad zone
const RAMP_LEN = 110;         // m footprint of a jump ramp: long rise → lip → eased descent to grade
const BOOST_SAFE_V = 38;      // m/s a boosted rider must be able to carry past a pad

// Catmull-Rom (uniform) for one component.
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t
    + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
    + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

function buildControls(rng, needLen, curviness, hilliness) {
  const pts = [];
  let heading = 0, slope = 0, x = 0, y = 0, z = -CTL_LEN;
  pts.push([0, 0, z]);                       // phantom head for CR
  for (let i = 0; i < 3; i++) { z += CTL_LEN; pts.push([0, 0, z]); } // straight grid run-up
  const yCap = 26 * hilliness + 4;
  let walked = 0;
  while (walked < needLen * 1.2 + CTL_LEN * 4) {
    heading += (rng() * 2 - 1) * curviness * 1.1;
    heading = clamp(heading, -1.05, 1.05);   // bounded drift → always advances +z, no self-crossing
    slope += (rng() * 2 - 1) * hilliness * 0.09;
    slope = clamp(slope, -(0.075 * hilliness + 0.01), 0.075 * hilliness + 0.01);
    y += slope * CTL_LEN;
    if (y < 0) { y = 0; slope = Math.abs(slope) * 0.5; }
    if (y > yCap) { y = yCap; slope = -Math.abs(slope) * 0.5; }
    x += Math.sin(heading) * CTL_LEN;
    z += Math.cos(heading) * CTL_LEN;
    pts.push([x, y, z]);
    walked += CTL_LEN;
  }
  return pts;
}

export function getTrack(level, raceIndex, opts) {
  const def = TRACKS[clamp(level, 1, TRACKS.length) - 1];
  const theme = THEMES[def.theme];
  let length = def.lengthBase + raceIndex * RACE_LENGTH_STEP;
  if (opts && opts.fast) length = Math.max(900, Math.round(length / 4));
  length = Math.round(length / TRACK_SAMPLE_STEP) * TRACK_SAMPLE_STEP;

  const rng = makeRng((def.seed + raceIndex * 7717) >>> 0);
  const pts = buildControls(rng, length, def.curviness, def.hilliness);

  // Arc-length resample: walk the spline finely, emit a sample every step.
  const step = TRACK_SAMPLE_STEP;
  const n = length / step + 1;
  let px = new Float32Array(n), py = new Float32Array(n), pz = new Float32Array(n);
  let tx = new Float32Array(n), tz = new Float32Array(n);
  let curv = new Float32Array(n);

  let out = 0, dist = 0, nextS = 0;
  let lx = pts[1][0], ly = pts[1][1], lz = pts[1][2];
  for (let seg = 1; seg < pts.length - 2 && out < n; seg++) {
    const p0 = pts[seg - 1], p1 = pts[seg], p2 = pts[seg + 1], p3 = pts[seg + 2];
    for (let k = 1; k <= FINE_SUBS && out < n; k++) {
      const t = k / FINE_SUBS;
      const cx = cr(p0[0], p1[0], p2[0], p3[0], t);
      const cy = cr(p0[1], p1[1], p2[1], p3[1], t);
      const cz = cr(p0[2], p1[2], p2[2], p3[2], t);
      const dx = cx - lx, dy = cy - ly, dz = cz - lz;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      while (out < n && dist + d >= nextS) {
        const f = d > 1e-9 ? (nextS - dist) / d : 0;
        px[out] = lx + dx * f; py[out] = ly + dy * f; pz[out] = lz + dz * f;
        out++; nextS = out * step;
      }
      dist += d; lx = cx; ly = cy; lz = cz;
    }
  }
  for (; out < n; out++) { // safety: extend straight if spline ran short
    px[out] = px[out - 1];
    py[out] = py[out - 1]; pz[out] = pz[out - 1] + step;
  }

  // Tangents (horizontal, normalized) from central differences.
  for (let i = 0; i < n; i++) {
    const a = i > 0 ? i - 1 : i, b = i < n - 1 ? i + 1 : i;
    let dx = px[b] - px[a], dz = pz[b] - pz[a];
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    tx[i] = dx / len; tz[i] = dz / len;
  }
  // Signed curvature from heading delta (+ = curving right, toward +x).
  for (let i = 1; i < n - 1; i++) {
    const h0 = Math.atan2(tx[i - 1], tz[i - 1]);
    const h1 = Math.atan2(tx[i + 1], tz[i + 1]);
    curv[i] = wrapDelta(h0, h1, TAU) / (2 * step);
  }
  if (n > 2) { curv[0] = curv[1]; curv[n - 1] = curv[n - 2]; }

  // Banking: roll the road into corners, scaled by theme. Raw from curvature,
  // then box-smoothed so banks ease in/out instead of tracking curvature noise.
  let bank = new Float32Array(n);
  const bankFactor = theme.bankFactor || 0;
  if (bankFactor > 0) {
    const raw = new Float32Array(n);
    // NEGATED curv: curv>0 turns toward +x (the inside), and the render
    // convention lifts the +x edge for bank>0 — so proper superelevation
    // (outer edge up) needs the opposite sign of curvature.
    for (let i = 0; i < n; i++) raw[i] = clamp(-curv[i] * BANK_GAIN * bankFactor, -MAX_BANK, MAX_BANK);
    const R = 4;                          // box-filter half-width (~16m each side)
    for (let i = 0; i < n; i++) {
      let sum = 0, cnt = 0;
      for (let k = -R; k <= R; k++) { const j = i + k; if (j >= 0 && j < n) { sum += raw[j]; cnt++; } }
      bank[i] = sum / cnt;
    }
  }

  // Authored stunt features → ramp py bumps, boost zones, loop triggers.
  const boostZones = [];
  const loops = [];
  const features = (def.features || []).map((f) => ({ ...f, s: clamp(f.at ?? 0, 0.05, 0.95) * length }));

  // A boost is only fair if the ~180m after the pad can be taken at boosted
  // speed — a pad that slingshots you into a hairpin is a guaranteed low-side.
  // Deterministically shift unsafe pads (authored fractions don't know the
  // seed-generated corners); drop the pad if no safe spot exists nearby.
  const midMaxLat = CURVE_GRIP * GRAVITY * 1.35 * 1.7;    // mid-tier bike grip (mirrors sim)
  const carrySafeV = (center) => {
    const iA = Math.max(0, Math.round((center + BOOST_LEN / 2) / step));
    const iB = Math.min(curv.length - 1, Math.round((center + BOOST_LEN / 2 + 180) / step));
    let v = Infinity;
    for (let i = iA; i <= iB; i++) {
      const k = Math.abs(curv[i]);
      if (k > 1e-5) v = Math.min(v, Math.sqrt(midMaxLat / k));
    }
    return v;
  };
  const placeBoost = (s) => {
    if (carrySafeV(s) >= BOOST_SAFE_V) return s;
    for (let d = 20; d <= 400; d += 20) {
      for (const c of [s - d, s + d]) {
        if (c < length * 0.05 || c > length * 0.92) continue;
        if (carrySafeV(c) >= BOOST_SAFE_V) return c;
      }
    }
    return null;
  };

  for (const f of features) {
    if (f.kind === 'boost') {
      const c = placeBoost(f.s);
      if (c !== null) boostZones.push({ s0: Math.max(0, c - BOOST_LEN / 2), s1: Math.min(length, c + BOOST_LEN / 2) });
    } else if (f.kind === 'loop') {
      loops.push({ s: f.s, radius: f.radius || 9 });
    } else if (f.kind === 'ramp') {
      // Long gentle rise to a lip, then an eased descent back to GRADE (no
      // below-grade apron — deep drops made every landing eat the hard-landing
      // speed penalty). Shaped so per-sample Δpy stays under the arc-length
      // tolerance and lip launch speed lands at survivable vy.
      const h = Math.min(3.2, f.height || 2.8);
      const i0 = Math.round((f.s - RAMP_LEN * 0.55) / step);
      const iLip = Math.round(f.s / step);
      const iEnd = Math.round((f.s + RAMP_LEN * 0.45) / step);
      for (let i = Math.max(0, i0); i <= Math.min(n - 1, iEnd); i++) {
        let add;
        if (i <= iLip) {
          const t = (i - i0) / Math.max(1, iLip - i0);   // 0→1 rise
          add = h * t * t;
        } else {
          const t = (i - iLip) / Math.max(1, iEnd - iLip); // lip→grade, eased
          add = h * (1 - smoothstep(t));
        }
        py[i] += add;
      }
    }
  }
  boostZones.sort((a, b) => a.s0 - b.s0);   // sim's boostI cursor walks in order

  // Props: theme-driven roadside scatter, thin near the grid, sorted by s.
  const props = [];
  const want = Math.round(theme.propPerKm * length / 1000);
  for (let i = 0; i < want; i++) {
    const s = rng() * length;
    if (s < 100 && rng() < 0.75) continue;
    const kind = pick(rng, theme.props);
    const side = rng() < 0.5 ? -1 : 1;
    props.push({
      kind,
      s,
      x: side * (PROP_MIN_X + rng() * 26),
      scale: 0.8 + rng() * 0.7,
      collide: !NO_COLLIDE[kind],
    });
  }
  props.sort((a, b) => a.s - b.s);

  // Cop zones: ~400m each, spread through the middle 60%.
  const copZones = [];
  const copCount = LEVELS[level - 1].copCount;
  for (let i = 0; i < copCount; i++) {
    const c = length * (0.2 + 0.6 * (i + 1) / (copCount + 1));
    copZones.push({ s0: Math.max(0, c - 200), s1: Math.min(length, c + 200) });
  }

  // Extend the sampled geometry BACKWARD past the start line so the grid
  // (riders start at negative s) resolves to real road. Without this,
  // sampleAt clamped negative s to 0 and the whole grid rendered collapsed
  // onto the start line — pairs of bikes perfectly stacked ("2 bikes visible,
  // then all appear at GO"). The run-up is straight, so extrapolate along the
  // initial tangent, flat, with curv/bank of sample 0.
  const PRE = 12;                              // 12 × 4m = 48m behind the line
  {
    const n0 = px.length, n2 = n0 + PRE;
    const ex = new Float32Array(n2), ey = new Float32Array(n2), ez = new Float32Array(n2);
    const etx = new Float32Array(n2), etz = new Float32Array(n2);
    const ec = new Float32Array(n2), eb = new Float32Array(n2);
    for (let k = 0; k < PRE; k++) {
      const back = (PRE - k) * step;
      ex[k] = px[0] - tx[0] * back; ey[k] = py[0]; ez[k] = pz[0] - tz[0] * back;
      etx[k] = tx[0]; etz[k] = tz[0]; ec[k] = curv[0]; eb[k] = bank[0];
    }
    ex.set(px, PRE); ey.set(py, PRE); ez.set(pz, PRE);
    etx.set(tx, PRE); etz.set(tz, PRE); ec.set(curv, PRE); eb.set(bank, PRE);
    px = ex; py = ey; pz = ez; tx = etx; tz = etz; curv = ec; bank = eb;
  }

  return {
    id: def.id, name: theme.name, theme: def.theme,
    length, sampleStep: step,
    s0: -PRE * step,                           // arrays cover [s0, length]
    px, py, pz, tx, tz, curv, bank,
    props, barriers: !!theme.barriers, copZones, boostZones, loops,
  };
}

/** Write interpolated {x,y,z,tx,tz,curv,bank} at arc position s into out. No alloc. */
export function sampleAt(track, s, out) {
  const step = track.sampleStep;
  const n = track.px.length;
  let f = (s - (track.s0 || 0)) / step;
  if (!(f > 0)) f = 0;                      // also catches NaN
  if (f > n - 1) f = n - 1;
  const i = f | 0;
  const j = i < n - 1 ? i + 1 : i;
  const t = f - i;
  out.x = track.px[i] + (track.px[j] - track.px[i]) * t;
  out.y = track.py[i] + (track.py[j] - track.py[i]) * t;
  out.z = track.pz[i] + (track.pz[j] - track.pz[i]) * t;
  let vx = track.tx[i] + (track.tx[j] - track.tx[i]) * t;
  let vz = track.tz[i] + (track.tz[j] - track.tz[i]) * t;
  const len = Math.sqrt(vx * vx + vz * vz) || 1;
  out.tx = vx / len; out.tz = vz / len;
  out.curv = track.curv[i] + (track.curv[j] - track.curv[i]) * t;
  out.bank = track.bank ? track.bank[i] + (track.bank[j] - track.bank[i]) * t : 0;
  return out;
}
