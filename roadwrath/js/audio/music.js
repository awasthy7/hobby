// audio/music.js — procedural synthwave-rock sequencer. Internal: only audio.js imports this.
// Lookahead scheduler: setInterval(TICK_MS) schedules ~AHEAD seconds onto ctx.currentTime.
// Theme changes are true crossfades: old session keeps playing under a 1s fade
// while the new one fades in; dead sessions are pruned and disconnected.

const TICK_MS = 80;
const AHEAD = 0.22;            // schedule horizon (s)
const FADE = 1.0;              // theme crossfade (s)
const LAYER_MAX = 0.75;        // intensity layer gain ceiling

const mf = (m) => 440 * Math.pow(2, (m - 69) / 12);

// Per-theme song data. root: MIDI note of the key root (bass register).
// prog: one chord per bar — r = semitones above root, m = 1 minor / 0 major.
// bass: 16-step rhythm (0 rest / 1 root / 2 fifth / 3 octave).
// lead: hand-composed hook as [step, semitone, lenSteps] over 4 bars (64 steps),
// semitones above root+24. kick/snare/ohat: step lists per 16-step bar.
// hat: closed-hat stride in steps (2 = 8ths, 4 = quarters).
const SONGS = {
  title: { // A minor, half-time and moody: Am F C G
    bpm: 96, root: 45, hat: 4, padLvl: 0.5,
    prog: [{ r: 0, m: 1 }, { r: 8, m: 0 }, { r: 3, m: 0 }, { r: 10, m: 0 }],
    kick: [0], snare: [8],
    bass: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0],
    lead: [
      [0, 12, 6], [8, 15, 3], [12, 14, 2],
      [16, 15, 6], [24, 17, 4],
      [32, 19, 6], [40, 15, 4],
      [48, 14, 6], [56, 10, 3], [60, 12, 4],
    ],
  },
  coast: { // E minor, bright and singable: Em C G D
    bpm: 120, root: 40, hat: 2, padLvl: 0.3,
    prog: [{ r: 0, m: 1 }, { r: 8, m: 0 }, { r: 3, m: 0 }, { r: 10, m: 0 }],
    kick: [0, 4, 8, 12], snare: [4, 12],
    bass: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 3, 0, 1, 0],
    lead: [
      [0, 12, 3], [4, 15, 2], [6, 17, 2], [8, 19, 4], [12, 17, 2], [14, 15, 2],
      [16, 12, 3], [20, 10, 2], [22, 12, 2], [24, 15, 5], [30, 12, 2],
      [32, 19, 3], [36, 17, 2], [38, 15, 2], [40, 14, 4], [44, 15, 2], [46, 17, 2],
      [48, 19, 3], [52, 15, 2], [54, 14, 2], [56, 12, 6],
    ],
  },
  desert: { // D minor with phrygian b2 color: Dm Bb C Dm
    bpm: 116, root: 38, hat: 2, padLvl: 0,
    prog: [{ r: 0, m: 1 }, { r: 8, m: 0 }, { r: 10, m: 0 }, { r: 0, m: 1 }],
    kick: [0, 6, 8, 14], snare: [4, 12],
    bass: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 2, 0],
    lead: [
      [0, 12, 2], [2, 13, 2], [4, 12, 2], [8, 7, 4], [12, 10, 2],
      [16, 13, 3], [20, 12, 2], [22, 10, 2], [24, 8, 4], [28, 7, 2],
      [32, 10, 2], [34, 12, 2], [36, 13, 2], [40, 12, 4], [44, 10, 2],
      [48, 7, 6], [56, 13, 4], [60, 12, 4],
    ],
  },
  redwood: { // A minor Andalusian descent: Am G F E
    bpm: 118, root: 45, hat: 2, padLvl: 0,
    prog: [{ r: 0, m: 1 }, { r: 10, m: 0 }, { r: 8, m: 0 }, { r: 7, m: 0 }],
    kick: [0, 7, 8], snare: [4, 12],
    bass: [1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 3, 1],
    lead: [
      [0, 12, 2], [4, 15, 2], [8, 12, 2], [12, 10, 2],
      [16, 10, 2], [20, 14, 2], [24, 10, 2], [28, 7, 2],
      [32, 8, 2], [36, 12, 2], [40, 8, 2], [44, 5, 2],
      [48, 7, 4], [52, 11, 2], [56, 7, 4], [60, 12, 4], // 11 = leading tone over E
    ],
  },
  city: { // F# minor, syncopated neon: F#m D A E
    bpm: 126, root: 42, hat: 2, padLvl: 0.24,
    prog: [{ r: 0, m: 1 }, { r: 8, m: 0 }, { r: 3, m: 0 }, { r: 10, m: 0 }],
    kick: [0, 4, 8, 12], snare: [4, 12], ohat: [2, 6, 10, 14],
    bass: [1, 0, 1, 1, 0, 1, 1, 0, 1, 0, 1, 1, 0, 1, 1, 3],
    lead: [
      [0, 12, 1], [3, 12, 1], [6, 15, 2], [10, 12, 1], [12, 17, 2],
      [16, 15, 1], [19, 15, 1], [22, 12, 2], [26, 10, 1], [28, 12, 2],
      [32, 12, 1], [35, 12, 1], [38, 15, 2], [42, 17, 1], [44, 19, 2],
      [48, 17, 1], [51, 15, 1], [54, 12, 2], [58, 10, 1], [60, 7, 3],
    ],
  },
  storm: { // C minor, relentless: Cm Ab Bb G
    bpm: 128, root: 36, hat: 2, padLvl: 0,
    prog: [{ r: 0, m: 1 }, { r: 8, m: 0 }, { r: 10, m: 0 }, { r: 7, m: 0 }],
    kick: [0, 3, 8, 11], snare: [4, 12],
    bass: [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 1, 3, 1],
    lead: [
      [0, 12, 2], [4, 15, 2], [6, 14, 1], [7, 15, 1], [8, 12, 2], [12, 19, 3],
      [16, 15, 2], [20, 17, 2], [22, 15, 1], [23, 14, 1], [24, 12, 2], [28, 10, 2],
      [32, 8, 2], [36, 12, 2], [38, 14, 1], [39, 15, 1], [40, 14, 2], [44, 12, 2],
      [48, 11, 2], [52, 14, 2], [54, 15, 1], [55, 17, 1], [56, 19, 4], [62, 14, 2],
    ],
  },
};

export function createMusic(ctx, dest) {
  const out = ctx.createGain();
  out.gain.value = 1;
  out.connect(dest);

  const noiseBuf = (() => {
    const b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.6), ctx.sampleRate);
    const ch = b.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    return b;
  })();

  let sessions = [];
  let current = null;   // active theme key
  let intensity = 0;
  let disposed = false;

  function env(p, t, peak, a, hold, rel) {
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    if (hold > 0) p.setValueAtTime(peak, t + a + hold);
    p.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  // -- per-note voices (all bounded one-shots, stopped + reaped by the graph) --
  function noiseHit(s, t, bus, fq, ftype, q, peak, a, hold, rel) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = ftype; f.frequency.value = fq; f.Q.value = q;
    const g = ctx.createGain();
    env(g.gain, t, peak, a, hold, rel);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(t); src.stop(t + a + hold + rel + 0.05);
  }
  function kick(s, t) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
    const g = ctx.createGain();
    env(g.gain, t, 1.0, 0.003, 0, 0.22);
    o.connect(g); g.connect(s.drums);
    o.start(t); o.stop(t + 0.3);
  }
  function snare(s, t, mul) {
    noiseHit(s, t, s.drums, 1800, 'bandpass', 0.8, 0.5 * mul, 0.003, 0, 0.12);
    const o = ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = 180;
    const g = ctx.createGain();
    env(g.gain, t, 0.35 * mul, 0.003, 0, 0.08);
    o.connect(g); g.connect(s.drums);
    o.start(t); o.stop(t + 0.15);
  }
  function hat(s, t, open, bus) {
    noiseHit(s, t, bus, 6800, 'highpass', 1, open ? 0.14 : 0.16, 0.002, 0, open ? 0.16 : 0.035);
  }
  function crash(s, t) {
    noiseHit(s, t, s.drums, 4200, 'highpass', 0.7, 0.2, 0.004, 0, 0.9);
  }
  function bassNote(s, t, midi, dur, accent) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth'; o.frequency.value = mf(midi);
    const g = ctx.createGain();
    env(g.gain, t, accent ? 0.55 : 0.42, 0.005, dur * 0.55, 0.1);
    o.connect(g); g.connect(s.bassLP);
    s.bassLP.frequency.setTargetAtTime(accent ? 920 : 480, t, 0.05);
    o.start(t); o.stop(t + dur + 0.25);
  }
  function leadNote(s, t, midi, dur, bus, mul) {
    const g = ctx.createGain();
    env(g.gain, t, 0.3 * (mul || 1), 0.008, dur * 0.85, 0.12);
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = mf(midi);
      o.detune.value = i ? 8 : -8;
      o.connect(g);
      o.start(t); o.stop(t + dur + 0.3);
    }
    g.connect(bus || s.leadLP);
  }
  function arpNote(s, t, midi, dur) {
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = mf(midi);
    const g = ctx.createGain();
    env(g.gain, t, 0.12, 0.003, dur * 0.5, 0.05);
    o.connect(g); g.connect(s.layer);
    o.start(t); o.stop(t + dur + 0.15);
  }
  function padChord(s, t, ch, dur) {
    const tones = [0, ch.m ? 3 : 4, 7];
    for (const semi of tones) {
      const g = ctx.createGain();
      env(g.gain, t, 0.09, 0.35, dur * 0.85, 0.5);
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth'; o.frequency.value = mf(s.data.root + 12 + ch.r + semi);
        o.detune.value = i ? 6 : -6;
        o.connect(g);
        o.start(t); o.stop(t + 0.35 + dur + 0.6);
      }
      g.connect(s.pad);
    }
  }

  function scheduleStep(s, step, t) {
    const d = s.data;
    const bar = (step >> 4) % d.prog.length;
    const sub = step & 15;
    const ch = d.prog[bar];
    const fill = bar === d.prog.length - 1;

    if (d.kick.indexOf(sub) >= 0) kick(s, t);
    if (d.snare.indexOf(sub) >= 0) snare(s, t, 1);
    if (fill && sub >= 14) snare(s, t, 0.4);
    if (sub % d.hat === 0) hat(s, t, false, s.drums);
    if (d.ohat && d.ohat.indexOf(sub) >= 0) hat(s, t, true, s.drums);
    if (sub % 2 === 1) hat(s, t, false, s.layer);              // 16th hats: intensity only
    if (bar === 0 && sub === 0 && step > 0) crash(s, t);

    const bv = d.bass[sub];
    if (bv) bassNote(s, t, d.root + ch.r + (bv === 2 ? 7 : bv === 3 ? 12 : 0), s.stepDur * 1.7, sub % 4 === 0);

    const ln = s.leadMap[step % 64];
    if (ln) {
      leadNote(s, t, d.root + 24 + ln[0], ln[1] * s.stepDur);
      leadNote(s, t, d.root + 36 + ln[0], ln[1] * s.stepDur, s.layer, 0.4); // octave-up layer
    }

    const an = [0, 7, 12, ch.m ? 15 : 16][sub % 4];
    arpNote(s, t, d.root + 24 + ch.r + an, s.stepDur * 0.85);

    if (d.padLvl && sub === 0) padChord(s, t, ch, 16 * s.stepDur);
  }

  function makeSession(key, now) {
    const d = SONGS[key];
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(1, now + FADE);
    g.connect(out);

    const drums = ctx.createGain(); drums.gain.value = 0.9; drums.connect(g);

    const bassGain = ctx.createGain(); bassGain.gain.value = 0.5; bassGain.connect(g);
    const bassLP = ctx.createBiquadFilter();
    bassLP.type = 'lowpass'; bassLP.frequency.value = 600; bassLP.Q.value = 8;
    bassLP.connect(bassGain);

    const leadGain = ctx.createGain(); leadGain.gain.value = 0.5; leadGain.connect(g);
    const leadLP = ctx.createBiquadFilter();
    leadLP.type = 'lowpass'; leadLP.frequency.value = 2600; leadLP.Q.value = 1;
    leadLP.connect(leadGain);
    const stepDur = 60 / d.bpm / 4;
    const delay = ctx.createDelay(1.5);
    delay.delayTime.value = stepDur * 3;                       // dotted 8th
    const fb = ctx.createGain(); fb.gain.value = 0.35;
    const wet = ctx.createGain(); wet.gain.value = 0.26;
    leadGain.connect(delay); delay.connect(fb); fb.connect(delay);
    delay.connect(wet); wet.connect(g);

    const layer = ctx.createGain(); layer.gain.value = 0; layer.connect(g);

    const pad = ctx.createGain(); pad.gain.value = d.padLvl || 0;
    const padLP = ctx.createBiquadFilter();
    padLP.type = 'lowpass'; padLP.frequency.value = 900;
    pad.connect(padLP); padLP.connect(g);

    const leadMap = Object.create(null);
    for (const n of d.lead) leadMap[n[0]] = [n[1], n[2]];

    return {
      key, data: d, g, drums, bassLP, leadLP, layer, pad, leadMap, stepDur,
      nextStep: 0, nextTime: now + 0.06, killAt: 0,
    };
  }

  function pump() {
    if (disposed) return;
    const now = ctx.currentTime;
    const until = now + AHEAD;
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      if (s.killAt && now > s.killAt + 0.1) {
        try { s.g.disconnect(); } catch (e) { /* ok */ }
        sessions.splice(i, 1);
        continue;
      }
      // realign after tab throttling instead of burst-scheduling the gap
      if (s.nextTime < now - 0.05) {
        const skip = Math.ceil((now - s.nextTime) / s.stepDur);
        s.nextStep += skip; s.nextTime += skip * s.stepDur;
      }
      s.layer.gain.setTargetAtTime(intensity * LAYER_MAX, now, 0.3);
      const horizon = s.killAt ? Math.min(until, s.killAt) : until;
      while (s.nextTime < horizon) {
        scheduleStep(s, s.nextStep, s.nextTime);
        s.nextStep++; s.nextTime += s.stepDur;
      }
    }
  }
  const timer = setInterval(pump, TICK_MS);

  return {
    setTheme(key) {
      if (disposed || key === current) return;
      current = SONGS[key] ? key : null;
      const now = ctx.currentTime;
      for (const s of sessions) {
        if (s.killAt) continue;
        s.killAt = now + FADE;
        s.g.gain.cancelScheduledValues(now);
        s.g.gain.setValueAtTime(Math.max(0.0001, s.g.gain.value), now);
        s.g.gain.linearRampToValueAtTime(0.0001, now + FADE);
      }
      if (current) sessions.push(makeSession(current, now));
    },
    setIntensity(v) { intensity = v < 0 ? 0 : v > 1 ? 1 : v; },
    dispose() {
      disposed = true;
      clearInterval(timer);
      try { out.disconnect(); } catch (e) { /* ok */ }
      sessions = [];
    },
  };
}
