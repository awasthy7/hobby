// audio/audio.js — Web Audio engine: 100% synthesized SFX + engine voice + music host.
// Lazy AudioContext: nothing is constructed until unlock() (first user gesture);
// every public method is a safe no-op before that. Master bus runs through a
// DynamicsCompressor limiter so stacked crashes never clip.

import { clamp } from '../util.js';
import { createMusic } from './music.js';

// local tunables (mix + engine model — audio-only, not shared sim constants)
const GEARS = [0, 9, 17, 26, 38, 72]; // gear speed bounds m/s → 5 gears
const MAX_ONESHOTS = 28;              // concurrent one-shot voice cap
const MUSIC_LVL = 0.45;               // music sits under sfx
const SFX_LVL = 0.9;
const ENGINE_LVL = 0.5;
const UI_LVL = 0.6;
const DUCK_LVL = 0.62;                // ≈ −4dB music duck while cop chase
const WHOOSH_R = 25;                  // proximity whoosh range (m)

export function createAudioSys(settings) {
  const st = {
    volume: typeof settings.volume === 'number' ? clamp(settings.volume, 0, 1) : 0.8,
    muted: !!settings.muted,
    musicOn: true,
    theme: null,
  };
  let ctx = null;
  let N = null;          // node graph, built at unlock
  let music = null;
  let live = 0;          // active one-shot count
  let raceLive = false;  // race voices currently audible

  // ---------------------------------------------------------------------
  // graph
  // ---------------------------------------------------------------------
  function build() {
    const mkGain = (v, to) => {
      const n = ctx.createGain(); n.gain.value = v; if (to) n.connect(to); return n;
    };
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 14;
    limiter.attack.value = 0.003; limiter.release.value = 0.24;
    limiter.connect(ctx.destination);

    const master = mkGain(st.muted ? 0 : st.volume, limiter);
    const sfx = mkGain(SFX_LVL, master);
    const ui = mkGain(UI_LVL, master);
    const engineBus = mkGain(ENGINE_LVL, master);
    const musicBus = mkGain(MUSIC_LVL, master);
    const duck = mkGain(1, musicBus);

    const noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.2), ctx.sampleRate);
    {
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    }
    const noiseLoop = (dest) => {
      const s = ctx.createBufferSource();
      s.buffer = noiseBuf; s.loop = true; s.connect(dest); s.start();
      return s;
    };

    // engine: saw + square + sub sine → tracking lowpass → gated gain
    const engFilter = ctx.createBiquadFilter();
    engFilter.type = 'lowpass'; engFilter.frequency.value = 300; engFilter.Q.value = 2;
    const engGain = mkGain(0, engineBus);
    engFilter.connect(engGain);
    const eSaw = ctx.createOscillator();
    eSaw.type = 'sawtooth'; eSaw.frequency.value = 64; eSaw.detune.value = 4;
    const eSq = ctx.createOscillator();
    eSq.type = 'square'; eSq.frequency.value = 32;
    const eSqG = mkGain(0.5, engFilter); eSq.connect(eSqG);
    const eSub = ctx.createOscillator();
    eSub.type = 'sine'; eSub.frequency.value = 32;
    const eSubG = mkGain(0.7, engGain); eSub.connect(eSubG); // sub bypasses the filter
    eSaw.connect(engFilter);
    const grit = ctx.createOscillator();                     // amplitude LFO = putter/grit
    grit.type = 'sawtooth'; grit.frequency.value = 9;
    const gritDepth = mkGain(0, null); grit.connect(gritDepth); gritDepth.connect(engGain.gain);
    eSaw.start(); eSq.start(); eSub.start(); grit.start();

    // skid loop
    const skidBP = ctx.createBiquadFilter();
    skidBP.type = 'bandpass'; skidBP.frequency.value = 1000; skidBP.Q.value = 5;
    const skidGain = mkGain(0, sfx); skidBP.connect(skidGain);
    noiseLoop(skidBP);

    // offroad rumble
    const rumLP = ctx.createBiquadFilter();
    rumLP.type = 'lowpass'; rumLP.frequency.value = 150; rumLP.Q.value = 1;
    const rumGain = mkGain(0, sfx); rumLP.connect(rumGain);
    noiseLoop(rumLP);

    // wind + footstep-scuff LFO while running back to the bike
    const windLP = ctx.createBiquadFilter();
    windLP.type = 'lowpass'; windLP.frequency.value = 480;
    const windGain = mkGain(0, sfx); windLP.connect(windGain);
    noiseLoop(windLP);
    const stepOsc = ctx.createOscillator();
    stepOsc.type = 'square'; stepOsc.frequency.value = 3.3;
    const stepDepth = mkGain(0, null); stepOsc.connect(stepDepth); stepDepth.connect(windGain.gain);
    stepOsc.start();

    // siren: triangle two-toned by a square LFO, panned by cop position
    const sirOsc = ctx.createOscillator();
    sirOsc.type = 'triangle'; sirOsc.frequency.value = 690;
    const sirLfo = ctx.createOscillator();
    sirLfo.type = 'square'; sirLfo.frequency.value = 2.7;
    const sirDev = mkGain(115, null); sirLfo.connect(sirDev); sirDev.connect(sirOsc.frequency);
    const sirPan = makePan(0);
    const sirGain = mkGain(0, null); sirOsc.connect(sirGain); sirGain.connect(sirPan); sirPan.connect(sfx);
    sirOsc.start(); sirLfo.start();

    // two shared proximity-whoosh voices (riders / traffic), retargeted per frame
    const mkWhoosh = () => {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 500; bp.Q.value = 0.8;
      const pan = makePan(0);
      const gn = mkGain(0, null); bp.connect(gn); gn.connect(pan); pan.connect(sfx);
      noiseLoop(bp);
      return { bp, pan, gn };
    };

    N = {
      master, limiter, sfx, ui, engineBus, musicBus, duck, noiseBuf,
      engFilter, engGain, eSaw, eSq, eSub, grit, gritDepth,
      skidBP, skidGain, rumGain, windGain, stepDepth,
      sirOsc, sirGain, sirPan,
      wA: mkWhoosh(), wB: mkWhoosh(),
    };
  }

  function makePan(v) {
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p;
    }
    return ctx.createGain(); // mono fallback: setPan() no-ops
  }
  function setPan(node, v, t) {
    if (node.pan) node.pan.setTargetAtTime(clamp(v, -1, 1), t, 0.04);
  }

  // ---------------------------------------------------------------------
  // one-shot helpers — every voice enveloped (5ms attacks, exp releases),
  // pooled via a live-count cap so event storms stay bounded
  // ---------------------------------------------------------------------
  function env(p, t, peak, a, hold, rel) {
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(Math.max(0.0001, peak), t + a);
    if (hold > 0) p.setValueAtTime(Math.max(0.0001, peak), t + a + hold);
    p.exponentialRampToValueAtTime(0.0008, t + a + hold + rel);
  }
  function reap(src) {
    live++;
    src.onended = () => { live--; };
  }
  function route(g, pan, out) {
    const dest = out || N.sfx;
    if (pan) { const pn = makePan(pan); g.connect(pn); pn.connect(dest); }
    else g.connect(dest);
  }
  // o: {type,f0,f1,peak,a,hold,rel,pan,out,detune,curve:[...freq stops]}
  function tone(t, o) {
    if (live >= MAX_ONESHOTS) return;
    const a = o.a || 0.005, hold = o.hold || 0, rel = o.rel || 0.1;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.curve) {
      const dur = a + hold + rel;
      for (let i = 0; i < o.curve.length; i++) {
        osc.frequency.exponentialRampToValueAtTime(
          Math.max(1, o.curve[i]), t + dur * ((i + 1) / o.curve.length));
      }
    } else if (o.f1) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t + a + hold + rel);
    }
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain();
    env(g.gain, t, o.peak, a, hold, rel);
    osc.connect(g);
    route(g, o.pan, o.out);
    osc.start(t); osc.stop(t + a + hold + rel + 0.08);
    reap(osc);
  }
  // o: {fq,fq1,q,ftype,peak,a,hold,rel,pan,rate,out}
  function burst(t, o) {
    if (live >= MAX_ONESHOTS) return;
    const a = o.a || 0.004, hold = o.hold || 0, rel = o.rel || 0.1;
    const src = ctx.createBufferSource();
    src.buffer = N.noiseBuf; src.loop = true;
    if (o.rate) src.playbackRate.value = o.rate;
    const f = ctx.createBiquadFilter();
    f.type = o.ftype || 'bandpass';
    f.frequency.setValueAtTime(o.fq, t);
    if (o.fq1) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.fq1), t + a + hold + rel);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    env(g.gain, t, o.peak, a, hold, rel);
    src.connect(f); f.connect(g);
    route(g, o.pan, o.out);
    src.start(t); src.stop(t + a + hold + rel + 0.05);
    reap(src);
  }

  // ---------------------------------------------------------------------
  // compound sfx
  // ---------------------------------------------------------------------
  function punchHit(t, g, pan) {
    tone(t, { type: 'sine', f0: 160, f1: 60, peak: 0.5 * g, rel: 0.12, pan });
    burst(t, { fq: 1000, q: 0.8, peak: 0.3 * g, rel: 0.07, pan });
  }
  function kickHit(t, g, pan) {
    tone(t, { type: 'sine', f0: 110, f1: 42, peak: 0.55 * g, rel: 0.16, pan });
    burst(t, { fq: 500, ftype: 'lowpass', peak: 0.32 * g, rel: 0.1, pan });
  }
  function clang(t, g, pan) {
    const partials = [210, 316, 508, 741];
    for (let i = 0; i < partials.length; i++) {
      tone(t, { type: 'triangle', f0: partials[i], peak: 0.16 * g, rel: 0.35 + i * 0.05, detune: (Math.random() - 0.5) * 30, pan });
    }
    burst(t, { fq: 3200, ftype: 'highpass', peak: 0.2 * g, rel: 0.05, pan });
  }
  function chainHit(t, g, pan) {
    for (let i = 0; i < 3; i++) {
      burst(t + i * 0.03, { fq: 2800, ftype: 'highpass', peak: 0.15 * g, rel: 0.04, pan });
    }
    tone(t, { type: 'triangle', f0: 880, peak: 0.12 * g, rel: 0.3, detune: 15, pan });
  }
  function crashSfx(t, k, pan) {
    tone(t, { type: 'sine', f0: 130, f1: 32, peak: 0.8 * k, rel: 0.45, pan });
    burst(t, { fq: 700, ftype: 'lowpass', peak: 0.7 * k, a: 0.003, rel: 0.4, pan });
    burst(t, { fq: 2400, ftype: 'highpass', peak: 0.25 * k, rel: 0.3, pan });
    const rings = [520, 733, 918]; // metal debris ring-out
    for (let i = 0; i < rings.length; i++) {
      tone(t + 0.04 + i * 0.05, {
        type: 'triangle', f0: rings[i], peak: 0.15 * k, rel: 0.5 + i * 0.2,
        detune: (Math.random() - 0.5) * 40, pan,
      });
    }
  }
  function revSfx(t, g) {
    for (const type of ['sawtooth', 'square']) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(75, t);
      o.frequency.exponentialRampToValueAtTime(240, t + 0.28);
      o.frequency.exponentialRampToValueAtTime(120, t + 0.5);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(300, t);
      f.frequency.exponentialRampToValueAtTime(1600, t + 0.28);
      f.frequency.exponentialRampToValueAtTime(500, t + 0.5);
      const gn = ctx.createGain();
      env(gn.gain, t, 0.3 * g, 0.01, 0.4, 0.15);
      o.connect(f); f.connect(gn); gn.connect(N.sfx);
      o.start(t); o.stop(t + 0.65);
      reap(o);
    }
  }
  function whoop(t, g) { // quick siren whoop (chase start / busted)
    tone(t, { type: 'sine', f0: 550, curve: [1150, 560, 1150, 560], peak: 0.3 * g, hold: 0.9, rel: 0.15 });
  }
  function stingWin(t) {
    const notes = [220, 277.2, 329.6, 440]; // A C# E A — major lift
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * 0.13;
      const last = i === notes.length - 1;
      tone(tt, { type: 'sawtooth', f0: notes[i], peak: 0.22, hold: last ? 0.6 : 0.1, rel: last ? 0.5 : 0.15, detune: -7 });
      tone(tt, { type: 'sawtooth', f0: notes[i], peak: 0.22, hold: last ? 0.6 : 0.1, rel: last ? 0.5 : 0.15, detune: 7 });
    }
    tone(t + 0.39, { type: 'square', f0: 880, peak: 0.1, hold: 0.5, rel: 0.4 });
  }
  function stingLose(t) {
    const notes = [220, 196, 164.8, 110]; // descending, ends on low A
    for (let i = 0; i < notes.length; i++) {
      const tt = t + i * 0.2;
      const last = i === notes.length - 1;
      tone(tt, { type: 'sawtooth', f0: notes[i], peak: 0.2, hold: last ? 0.7 : 0.12, rel: last ? 0.6 : 0.18, detune: 8 });
      tone(tt, { type: 'triangle', f0: notes[i] / 2, peak: 0.18, hold: last ? 0.7 : 0.12, rel: last ? 0.6 : 0.18 });
    }
  }
  function goChord(t) {
    for (const f of [220, 277.2, 329.6, 440]) {
      tone(t, { type: 'sawtooth', f0: f, peak: 0.2, hold: 0.35, rel: 0.3, detune: -6 });
      tone(t, { type: 'sawtooth', f0: f, peak: 0.2, hold: 0.35, rel: 0.3, detune: 6 });
    }
  }

  // gain/pan for an event by where its rider is relative to the player
  function evGP(r, p) {
    if (!r || r.isPlayer) return { g: 1, pan: 0 };
    return {
      g: clamp(1 - Math.abs(r.s - p.s) / 90, 0.12, 1),
      pan: clamp((r.x - p.x) * 0.2, -0.8, 0.8),
    };
  }

  function onEvent(ev, p, t) {
    switch (ev.type) {
      case 'countdown':
        if (ev.n > 0) tone(t, { type: 'square', f0: 660, peak: 0.25, hold: 0.1, rel: 0.06, out: N.ui });
        else goChord(t);
        break;
      case 'attack': {
        const gp = evGP(ev.rider, p);
        if (!ev.hit) {
          burst(t, { fq: 1400, fq1: 450, q: 1.2, peak: 0.18 * gp.g, rel: 0.13, pan: gp.pan });
        } else if (ev.kind === 'club') clang(t, gp.g, gp.pan);
        else if (ev.kind === 'chain') chainHit(t, gp.g, gp.pan);
        else if (ev.kind === 'kick') kickHit(t, gp.g, gp.pan);
        else punchHit(t, gp.g, gp.pan);
        break;
      }
      case 'steal': {
        const gp = evGP(ev.rider, p);
        tone(t, { type: 'square', f0: 280, f1: 1500, peak: 0.25 * gp.g, rel: 0.12, pan: gp.pan });
        burst(t, { fq: 2200, ftype: 'highpass', peak: 0.12 * gp.g, rel: 0.05, pan: gp.pan });
        break;
      }
      case 'down': {
        const gp = evGP(ev.rider, p);
        crashSfx(t, ev.rider && ev.rider.isPlayer ? 1 : gp.g * 0.8, gp.pan);
        break;
      }
      case 'remount': {
        const gp = evGP(ev.rider, p);
        revSfx(t, gp.g);
        break;
      }
      case 'scrape': {
        const gp = evGP(ev.rider, p);
        const pan = ev.rider && ev.rider.isPlayer ? ev.side * 0.55 : gp.pan;
        burst(t, { fq: 620, q: 2, peak: 0.3 * gp.g, rel: 0.2, rate: 0.9, pan });
        burst(t, { fq: 3400, ftype: 'highpass', peak: 0.14 * gp.g, rel: 0.1, pan });
        break;
      }
      case 'combo': {
        const f = 420 * Math.pow(2, (ev.mult - 1) / 3);
        tone(t, { type: 'square', f0: f, f1: f * 1.3, peak: 0.16, hold: 0.04, rel: 0.07, out: N.ui });
        break;
      }
      case 'combo_break':
        tone(t, { type: 'square', f0: 300, f1: 140, peak: 0.18, rel: 0.22, out: N.ui });
        break;
      case 'overtake':
        if ((ev.rider && ev.rider.isPlayer) || (ev.target && ev.target.isPlayer)) {
          burst(t, { fq: 900, fq1: 380, q: 1, peak: 0.12, rel: 0.18 });
        }
        break;
      case 'cop':
        if (ev.on) whoop(t, 0.9);
        break;
      case 'busted':
        whoop(t, 1);
        tone(t + 0.15, { type: 'sawtooth', f0: 380, f1: 170, peak: 0.35, hold: 0.25, rel: 0.4, detune: -9 });
        tone(t + 0.15, { type: 'sawtooth', f0: 380, f1: 170, peak: 0.35, hold: 0.25, rel: 0.4, detune: 9 });
        tone(t + 0.15, { type: 'sine', f0: 95, f1: 40, peak: 0.5, rel: 0.5 });
        break;
      case 'wrecked':
        crashSfx(t, 1, 0);
        for (let i = 0; i < 3; i++) { // engine sputters out
          tone(t + 0.3 + i * 0.14, { type: 'square', f0: 90 - i * 18, peak: 0.2, rel: 0.09 });
        }
        break;
      case 'race_over':
        if (ev.cause === 'finish') (ev.place <= 3 ? stingWin : stingLose)(t);
        break;
      default: break; // 'hit' covered by attack, 'finish'/'taunt' silent
    }
  }

  // ---------------------------------------------------------------------
  // continuous voices — param retargeting only, zero node creation per frame
  // ---------------------------------------------------------------------
  function updateEngine(p, now) {
    const riding = p.state === 'riding' || p.state === 'grid' || p.state === 'finished';
    if (!riding) {
      N.engGain.gain.setTargetAtTime(0, now, 0.06);
      N.gritDepth.gain.setTargetAtTime(0, now, 0.1);
    } else {
      const v = Math.max(0, p.speed);
      let gear = 0;
      for (let i = 1; i < 5; i++) if (v >= GEARS[i]) gear = i;
      const t = clamp((v - GEARS[gear]) / (GEARS[gear + 1] - GEARS[gear]), 0, 1);
      const f = 64 + gear * 8 + t * 95; // RPM climbs in-gear, drops on upshift
      N.eSaw.frequency.setTargetAtTime(f, now, 0.04);
      N.eSq.frequency.setTargetAtTime(f * 0.5, now, 0.04);
      N.eSub.frequency.setTargetAtTime(f * 0.5, now, 0.05);
      N.engFilter.frequency.setTargetAtTime(240 + gear * 130 + t * 1900, now, 0.06);
      const idle = v < 1.5;
      N.engGain.gain.setTargetAtTime(idle ? 0.3 : 0.42 + t * 0.2, now, 0.08);
      N.grit.frequency.setTargetAtTime(idle ? 9 : f / 6, now, 0.1);
      N.gritDepth.gain.setTargetAtTime(idle ? 0.14 : 0.05, now, 0.1);
    }
    const running = p.state === 'running';
    N.windGain.gain.setTargetAtTime(running ? 0.32 : 0, now, 0.12);
    N.stepDepth.gain.setTargetAtTime(running ? 0.15 : 0, now, 0.12);

    const v = Math.max(0, p.speed);
    N.skidGain.gain.setTargetAtTime(riding && p.skidding ? clamp(0.25 + v / 70, 0, 0.6) : 0, now, 0.05);
    N.skidBP.frequency.setTargetAtTime(700 + v * 16, now, 0.08);
    N.rumGain.gain.setTargetAtTime(riding && p.offroad && v > 2 ? clamp(v / 50, 0, 0.5) : 0, now, 0.1);
  }

  function updateSiren(race, p, now) {
    let g = 0, pan = 0;
    if (race.copChase) {
      let best = null, bd = 1e9;
      for (const c of race.cops) {
        if (c.state !== 'chase') continue;
        const d = Math.abs(c.s - p.s);
        if (d < bd) { bd = d; best = c; }
      }
      if (best) {
        g = clamp(1 - bd / 260, 0, 1) * 0.5;
        pan = (best.x - p.x) * 0.25;
      }
    }
    N.sirGain.gain.setTargetAtTime(g, now, 0.15);
    setPan(N.sirPan, pan, now);
  }

  function retargetWhoosh(w, other, p, now) {
    if (!other) { w.gn.gain.setTargetAtTime(0, now, 0.08); return; }
    const ds = Math.abs(other.s - p.s);
    const closing = other.dir === -1 ? p.speed + other.speed : Math.abs(p.speed - other.speed);
    const g = (1 - ds / WHOOSH_R) * clamp(closing / 30, 0.15, 1) * 0.4;
    w.gn.gain.setTargetAtTime(clamp(g, 0, 0.4), now, 0.06);
    w.bp.frequency.setTargetAtTime(clamp(250 + closing * 22, 250, 1800), now, 0.06);
    setPan(w.pan, (other.x - p.x) * 0.3, now);
  }

  function updateWhooshes(race, p, now) {
    let nr = null, nrd = WHOOSH_R;
    for (let i = 1; i < race.riders.length; i++) {
      const r = race.riders[i];
      if (r.state !== 'riding') continue;
      const d = Math.abs(r.s - p.s);
      if (d < nrd) { nrd = d; nr = r; }
    }
    let nc = null, ncd = WHOOSH_R;
    for (const c of race.traffic) {
      const d = Math.abs(c.s - p.s);
      if (d < ncd) { ncd = d; nc = c; }
    }
    retargetWhoosh(N.wA, nr, p, now);
    retargetWhoosh(N.wB, nc, p, now);
  }

  function quiet(now) {
    N.engGain.gain.setTargetAtTime(0, now, 0.08);
    N.gritDepth.gain.setTargetAtTime(0, now, 0.1);
    N.skidGain.gain.setTargetAtTime(0, now, 0.08);
    N.rumGain.gain.setTargetAtTime(0, now, 0.08);
    N.windGain.gain.setTargetAtTime(0, now, 0.08);
    N.stepDepth.gain.setTargetAtTime(0, now, 0.08);
    N.sirGain.gain.setTargetAtTime(0, now, 0.1);
    N.wA.gn.gain.setTargetAtTime(0, now, 0.08);
    N.wB.gn.gain.setTargetAtTime(0, now, 0.08);
    N.duck.gain.setTargetAtTime(1, now, 0.3);
    if (music) music.setIntensity(0);
  }

  function applyMaster() {
    if (!N) return;
    N.master.gain.setTargetAtTime(st.muted ? 0 : st.volume, ctx.currentTime, 0.04);
  }

  // ---------------------------------------------------------------------
  // public contract
  // ---------------------------------------------------------------------
  return {
    unlock() {
      if (ctx) {
        if (ctx.state === 'suspended') ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC(); } catch (e) { ctx = null; return; }
      if (ctx.state === 'suspended') ctx.resume();
      build();
      music = createMusic(ctx, N.duck);
      if (st.musicOn && st.theme) music.setTheme(st.theme);
      applyMaster();
    },

    update(race, dtReal, events) {
      if (!ctx || !N) return;
      const now = ctx.currentTime;
      if (!race) {
        if (raceLive) { quiet(now); raceLive = false; }
        return;
      }
      raceLive = true;
      const p = race.riders[0];
      updateEngine(p, now);
      updateSiren(race, p, now);
      updateWhooshes(race, p, now);
      N.duck.gain.setTargetAtTime(race.copChase ? DUCK_LVL : 1, now, 0.25);
      if (music) music.setIntensity(race.intensity);
      if (events) for (const ev of events) onEvent(ev, p, now);
    },

    setMusicTheme(key) {
      st.theme = key;
      if (music && st.musicOn) music.setTheme(key);
    },
    setMusicEnabled(b) {
      st.musicOn = !!b;
      if (music) music.setTheme(st.musicOn ? st.theme : null);
    },
    setMuted(b) { st.muted = !!b; applyMaster(); },
    setVolume(v) { st.volume = clamp(v, 0, 1); applyMaster(); },

    playUI(kind) {
      if (!ctx || !N) return;
      const t = ctx.currentTime;
      if (kind === 'move') {
        tone(t, { type: 'square', f0: 640, peak: 0.12, hold: 0.02, rel: 0.05, out: N.ui });
      } else if (kind === 'confirm') {
        tone(t, { type: 'square', f0: 520, peak: 0.16, hold: 0.03, rel: 0.06, out: N.ui });
        tone(t + 0.07, { type: 'square', f0: 780, peak: 0.16, hold: 0.04, rel: 0.1, out: N.ui });
      } else if (kind === 'buy') {
        tone(t, { type: 'sine', f0: 880, peak: 0.2, hold: 0.04, rel: 0.1, out: N.ui });
        tone(t + 0.09, { type: 'sine', f0: 1318.5, peak: 0.2, hold: 0.06, rel: 0.18, out: N.ui });
      } else if (kind === 'deny') {
        tone(t, { type: 'square', f0: 130, f1: 95, peak: 0.22, hold: 0.08, rel: 0.1, out: N.ui });
      }
    },

    dispose() {
      if (music) { music.dispose(); music = null; }
      if (ctx) { try { ctx.close(); } catch (e) { /* ok */ } ctx = null; }
      N = null;
      raceLive = false;
    },
  };
}
