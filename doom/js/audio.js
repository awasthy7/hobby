// DOOMED — all audio synthesized with WebAudio. Heavy riff loop for combat,
// dread drone for the menu, chunky SFX for guns/doors/demons.
D.audio = {
  ctx: null, sfxBus: null, musicBus: null, music: null,

  ensure() {
    if (this.ctx) {
      // stay silent while the game is deliberately paused
      if (this.ctx.state === 'suspended' && !(D.game && D.game.paused)) this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.8;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(this.master);
    this.musicBus = this.ctx.createGain();
    this.musicBus.gain.value = 0.5;
    this.musicBus.connect(this.master);
    this.noiseBuf = this.makeNoise();
    // guitar chain: detuned saws -> tanh waveshaper -> tone filter. This is
    // where the crunch comes from; single oscillators sound like doorbells.
    this.gtrBus = this.ctx.createGain();
    this.gtrBus.gain.value = 0.5;
    const shaper = this.ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = i / 255.5 - 1;
      // gentler drive: crunch without the fizzy top end
      curve[i] = Math.tanh(x * 3.2) / Math.tanh(3.2);
    }
    shaper.curve = curve;
    shaper.oversample = '2x';
    const tone = this.ctx.createBiquadFilter();
    tone.type = 'lowpass'; tone.frequency.value = 3600; tone.Q.value = 0.4;
    const body = this.ctx.createBiquadFilter();
    body.type = 'highpass'; body.frequency.value = 62; body.Q.value = 0.5;
    this.gtrBus.connect(shaper).connect(tone).connect(body).connect(this.musicBus);
    // lead echo
    this.leadBus = this.ctx.createGain();
    this.leadBus.gain.value = 0.9;
    const delay = this.ctx.createDelay(0.6);
    delay.delayTime.value = 0.24;
    const fb = this.ctx.createGain(); fb.gain.value = 0.32;
    delay.connect(fb).connect(delay);
    this.leadBus.connect(this.musicBus);
    this.leadBus.connect(delay).connect(this.musicBus);
  },

  now() { return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : performance.now() / 1000; },

  makeNoise() {
    const len = this.ctx.sampleRate * 1.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },

  env(gainNode, t, a, peak, d, sustain = 0.0001) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  },

  osc(type, freq, t, dur, peak, dest, bend = null) {
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(bend, 1), t + dur);
    this.env(g, t, 0.005, peak, dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.1);
    return o;
  },

  noise(t, dur, peak, filterType = 'lowpass', freq = 800, q = 0.8, dest = null) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    const g = this.ctx.createGain();
    this.env(g, t, 0.003, peak, dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.1);
    return f;
  },

  // ---------------- SFX ----------------
  sfx(name, opt = {}) {
    this.ensure();
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.now() + 0.001;
    const v = opt.vol ?? 1;
    switch (name) {
      case 'pistol': {
        this.noise(t, 0.11, 0.5 * v, 'bandpass', 1600, 1.2);
        this.osc('square', 220, t, 0.07, 0.3 * v, null, 60);
        break;
      }
      case 'shotgun': {
        this.noise(t, 0.28, 0.8 * v, 'lowpass', 900, 0.6);
        this.noise(t, 0.1, 0.5 * v, 'highpass', 2200, 0.8);
        this.osc('square', 130, t, 0.16, 0.5 * v, null, 40);
        // pump-action clack-clack
        this.noise(t + 0.42, 0.05, 0.25 * v, 'bandpass', 2600, 3);
        this.noise(t + 0.56, 0.06, 0.3 * v, 'bandpass', 1900, 3);
        break;
      }
      case 'chaingun': {
        this.noise(t, 0.08, 0.45 * v, 'bandpass', 1400, 1);
        this.osc('square', 180, t, 0.05, 0.28 * v, null, 70);
        break;
      }
      case 'fireball': {
        this.noise(t, 0.35, 0.3 * v, 'bandpass', 500, 1.5);
        this.osc('sawtooth', 160, t, 0.3, 0.2 * v, null, 60);
        break;
      }
      case 'boom': {
        this.noise(t, 0.5, 0.9 * v, 'lowpass', 500, 0.5);
        this.osc('sine', 90, t, 0.45, 0.7 * v, null, 30);
        this.osc('square', 60, t, 0.3, 0.3 * v, null, 25);
        break;
      }
      case 'door': {
        this.noise(t, 0.5, 0.18 * v, 'bandpass', 300, 2);
        this.osc('sawtooth', 70, t, 0.5, 0.12 * v, null, 90);
        break;
      }
      case 'doorLocked': {
        this.osc('square', 120, t, 0.1, 0.25 * v);
        this.osc('square', 90, t + 0.13, 0.15, 0.25 * v);
        break;
      }
      case 'pickup': {
        this.osc('square', 660, t, 0.06, 0.22 * v);
        this.osc('square', 990, t + 0.07, 0.09, 0.22 * v);
        break;
      }
      case 'keycard': {
        [523, 659, 784, 1046].forEach((f, i) => this.osc('triangle', f, t + i * 0.07, 0.12, 0.25 * v));
        break;
      }
      case 'weaponUp': {
        [180, 240, 320].forEach((f, i) => this.osc('square', f, t + i * 0.05, 0.1, 0.3 * v));
        this.noise(t, 0.12, 0.2 * v, 'bandpass', 2000, 2);
        break;
      }
      case 'hurt': {
        this.osc('sawtooth', 240, t, 0.18, 0.4 * v, null, 110);
        this.noise(t, 0.12, 0.2 * v, 'bandpass', 700, 1);
        break;
      }
      case 'die': {
        this.osc('sawtooth', 220, t, 0.9, 0.45 * v, null, 40);
        this.noise(t, 0.7, 0.3 * v, 'lowpass', 600, 0.7);
        break;
      }
      case 'alertGrunt': this.growl(t, 160, 0.35, v); break;
      case 'alertImp': this.growl(t, 110, 0.5, v); break;
      case 'alertBrute': this.growl(t, 70, 0.6, v); break;
      case 'alertBoss': { this.growl(t, 50, 0.9, v); this.growl(t + 0.1, 75, 0.8, v * 0.7); break; }
      case 'enemyPain': this.osc('sawtooth', D.rand(280, 380), t, 0.12, 0.25 * v, null, 150); break;
      case 'enemyDie': {
        this.osc('sawtooth', D.rand(140, 200), t, 0.5, 0.35 * v, null, 35);
        this.noise(t, 0.4, 0.25 * v, 'lowpass', 900, 0.8);
        break;
      }
      case 'gib': {
        this.noise(t, 0.3, 0.4 * v, 'lowpass', 400, 0.6);
        this.noise(t + 0.05, 0.2, 0.3 * v, 'bandpass', 250, 1.5);
        break;
      }
      case 'menu': this.osc('square', 440, t, 0.05, 0.15 * v); break;
      case 'menuGo': { this.osc('square', 330, t, 0.07, 0.2 * v); this.osc('square', 440, t + 0.08, 0.1, 0.2 * v); break; }
      case 'secret': {
        [392, 523, 659, 784].forEach((f, i) => this.osc('square', f, t + i * 0.09, 0.14, 0.2 * v));
        break;
      }
      case 'switch': {
        this.noise(t, 0.08, 0.3 * v, 'bandpass', 1200, 2);
        this.osc('square', 150, t, 0.12, 0.3 * v, null, 80);
        break;
      }
      case 'noway': this.osc('sawtooth', 100, t, 0.15, 0.3 * v, null, 70); break;
      case 'punch': {
        this.noise(t, 0.09, 0.3 * v, 'lowpass', 500, 0.7);
        this.osc('sine', 140, t, 0.08, 0.25 * v, null, 70);
        break;
      }
      case 'rocket': {
        this.noise(t, 0.6, 0.5 * v, 'lowpass', 1200, 0.6, null, 300);
        this.osc('sawtooth', 110, t, 0.5, 0.25 * v, null, 60);
        break;
      }
      case 'plasma': {
        this.osc('square', 880, t, 0.09, 0.18 * v, null, 320);
        this.noise(t, 0.07, 0.15 * v, 'highpass', 3800, 2);
        break;
      }
      case 'tele': {
        this.osc('sine', 220, t, 0.4, 0.3 * v, null, 880);
        this.osc('sine', 180, t + 0.05, 0.35, 0.2 * v, null, 720);
        this.noise(t, 0.3, 0.15 * v, 'bandpass', 2000, 2, null, 4000);
        break;
      }
    }
  },

  growl(t, base, dur, v = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.4, t + dur * 0.4);
    o.frequency.exponentialRampToValueAtTime(base * 0.6, t + dur);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 26;
    const vibG = this.ctx.createGain(); vibG.gain.value = base * 0.25;
    vib.connect(vibG).connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = base * 6; f.Q.value = 2;
    const g = this.ctx.createGain();
    this.env(g, t, 0.02, 0.4 * v, dur);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t); o.stop(t + dur + 0.1);
    vib.start(t); vib.stop(t + dur + 0.1);
  },

  // ================= MUSIC: instruments =================
  // All note lengths arrive in seconds. Guitars go through the shared
  // distortion chain; everything else straight to the music bus.
  gtrNote(freq, t, dur, vol = 1) {
    const out = this.ctx.createGain();
    this.env(out, t, 0.006, 0.24 * vol, Math.max(dur - 0.02, 0.03));
    out.connect(this.gtrBus);
    for (const [mult, det, v] of [[1, -4, 1], [1, 4, 1], [1.5, 0, 0.55], [0.5, 0, 0.6]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * mult;
      o.detune.value = det;
      const g = this.ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(out);
      o.start(t); o.stop(t + dur + 0.1);
    }
  },
  // palm-muted chug: fast bite, quick choke, darkened before the distortion
  gtrChug(freq, t, dur, vol = 1) {
    const out = this.ctx.createGain();
    const choke = D.clamp(dur * 0.8, 0.08, 0.45);
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.32 * vol, t + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, t + choke);
    const mute = this.ctx.createBiquadFilter();
    mute.type = 'lowpass';
    mute.frequency.setValueAtTime(1500, t);
    mute.frequency.exponentialRampToValueAtTime(420, t + choke);
    out.connect(mute).connect(this.gtrBus);
    for (const [mult, det, v] of [[1, -3, 1], [1, 3, 1], [0.5, 0, 0.85]]) {
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = freq * mult;
      o.detune.value = det;
      const g = this.ctx.createGain(); g.gain.value = v;
      o.connect(g).connect(out);
      o.start(t); o.stop(t + choke + 0.1);
    }
    // pick attack
    this.noise(t, 0.02, 0.06 * vol, 'highpass', 3200, 1, this.musicBus);
  },

  pluck(freq, t, dur, vol = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'triangle'; o.frequency.value = freq;
    const o2 = this.ctx.createOscillator();
    o2.type = 'square'; o2.frequency.value = freq; o2.detune.value = 3;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.setValueAtTime(freq * 6, t);
    f.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.004, 0.16 * vol, dur);
    const g2 = this.ctx.createGain(); g2.gain.value = 0.25;
    o.connect(f); o2.connect(g2).connect(f); f.connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.1); o2.start(t); o2.stop(t + dur + 0.1);
  },
  bassNote(freq, t, dur, vol = 1) {
    const o = this.ctx.createOscillator();
    o.type = 'square'; o.frequency.value = freq;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    const g = this.ctx.createGain();
    this.env(g, t, 0.008, 0.3 * vol, Math.max(dur - 0.02, 0.05));
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t); o.stop(t + dur + 0.1);
  },
  leadNote(freq, t, dur, vol = 1, slideTo = 0) {
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur * 0.7);
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibG = this.ctx.createGain(); vibG.gain.value = freq * 0.012;
    vib.connect(vibG).connect(o.frequency);
    const g = this.ctx.createGain();
    this.env(g, t, 0.03, 0.13 * vol, Math.max(dur - 0.05, 0.08));
    o.connect(g).connect(this.leadBus);
    o.start(t); o.stop(t + dur + 0.3);
    vib.start(t); vib.stop(t + dur + 0.3);
  },
  choirChord(freqs, t, dur, vol = 1) {
    for (const freq of freqs) {
      for (const det of [-6, 6]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = freq; o.detune.value = det;
        const g = this.ctx.createGain();
        const peak = 0.05 * vol;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak, t + dur * 0.3);
        g.gain.setValueAtTime(peak, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(this.musicBus);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  },
  drum(kind, t, vol = 1) {
    switch (kind) {
      case 'kick':
        this.osc('sine', 140, t, 0.13, 0.8 * vol, this.musicBus, 38);
        this.noise(t, 0.015, 0.25 * vol, 'highpass', 1500, 0.8, this.musicBus);
        break;
      case 'snare':
        this.noise(t, 0.15, 0.4 * vol, 'bandpass', 1900, 0.9, this.musicBus);
        this.osc('triangle', 200, t, 0.07, 0.22 * vol, this.musicBus, 130);
        break;
      case 'hat':
        this.noise(t, 0.03, 0.11 * vol, 'highpass', 8000, 1, this.musicBus);
        break;
      case 'ohat':
        this.noise(t, 0.14, 0.1 * vol, 'highpass', 7500, 1, this.musicBus);
        break;
      case 'tom':
        this.osc('sine', 110, t, 0.24, 0.5 * vol, this.musicBus, 62);
        break;
      case 'crash':
        this.noise(t, 1.1, 0.22 * vol, 'highpass', 4500, 0.6, this.musicBus);
        break;
    }
  },

  // ================= MUSIC: the score =================
  // Tracker-style: 16 sixteenth-steps per bar. Drum tracks are pattern
  // strings; melodic tracks are [step, note(s), lengthInSteps] events.
  // A track wrapped as {minInt, ...} only plays at that intensity or above —
  // the game feeds intensity from how hot the fight is.
  intensity: 1,

  SONGS: {
    // E1: HANGAR ASSAULT — E minor, 16-bar arrangement:
    // intro build → gallop verse → climbing turn → open-chord chorus with a
    // harmonized lead → half-time breakdown → fill, and round again.
    e1: {
      bpm: 150,
      arrange: ['I', 'I', 'A', 'A', 'B', 'A', 'F', 'C', 'C', 'A', 'A', 'B', 'D', 'D', 'F', 'C'],
      bars: {
        I: {
          kick: '1...1...1...1...',
          hat: 'x...x...x...x.x.',
          chug: [[0, 'E2', 1], [2, 'E2', 1], [4, 'E2', 1], [6, 'E2', 1], [8, 'E2', 1], [10, 'E2', 1], [12, 'E2', 1], [14, 'E2', 1]],
          bass: [[0, 'E1', 8], [8, 'E1', 8]],
        },
        A: {
          kick: '1...1...1...1..1', snare: '....1.......1...',
          hat: 'x.x.x.x.x.x.x.x.',
          chug: [[0, 'E2', 1], [1, 'E2', 1], [2, 'E2', 1], [4, 'E2', 1], [5, 'E2', 1], [6, 'E2', 1], [8, 'E2', 1], [9, 'E2', 1], [10, 'G2', 2], [12, 'E2', 1], [13, 'E2', 1], [14, 'A2', 1], [15, 'Bb2', 1]],
          bass: [[0, 'E1', 4], [4, 'E1', 4], [8, 'G1', 4], [12, 'A1', 4]],
        },
        B: {
          kick: '1...1..1..1.1...', snare: '....1.......1...',
          hat: 'x.x.x.x.x.x.x.x.',
          chug: [[0, 'G2', 2], [2, 'G2', 1], [3, 'G2', 1], [4, 'A2', 2], [6, 'A2', 1], [7, 'A2', 1], [8, 'Bb2', 2], [10, 'Bb2', 1], [11, 'Bb2', 1], [12, 'B2', 2], [14, 'D3', 2]],
          bass: [[0, 'G1', 4], [4, 'A1', 4], [8, 'Bb1', 4], [12, 'B1', 4]],
        },
        C: {
          crash: '1...............',
          kick: '1...1...1...1...', snare: '....1.......1...',
          hat: { minInt: 1, p: 'x.x.x.x.x.x.x.x.' },
          gtr: [[0, 'E3', 4], [4, 'D3', 4], [8, 'C3', 4], [12, 'B2', 4]],
          gtr2: { minInt: 1, n: [[0, 'B3', 4], [4, 'A3', 4], [8, 'G3', 4], [12, 'F#3', 4]] },
          lead: [[0, 'E4', 3], [3, 'G4', 1], [4, 'F#4', 3], [7, 'A4', 1], [8, 'G4', 3], [11, 'B4', 1], [12, 'D5', 4]],
          bass: [[0, 'E1', 4], [4, 'D1', 4], [8, 'C1', 4], [12, 'B0', 4]],
        },
        D: {
          kick: '1.....1.1.......', snare: '........1.......',
          tom: '............1.1.',
          chug: [[0, 'E2', 3], [4, 'E2', 1], [6, 'E2', 3], [10, 'E2', 1], [12, 'Bb2', 4]],
          bass: [[0, 'E1', 8], [8, 'Bb1', 8]],
          choir: { minInt: 1, n: [[0, ['E2', 'Bb2'], 16]] },
        },
        F: {
          kick: '1.......1.......', snare: '....1..1.1.11111',
          tom: '......1.1.......',
          chug: [[0, 'E2', 2], [8, 'E2', 2]],
          bass: [[0, 'E1', 16]],
        },
      },
    },
    // E2: WASTE — crawling sludge in D, tritone leaning
    e2: {
      bpm: 104,
      arrange: ['A', 'B', 'A', 'C'],
      bars: {
        A: {
          kick: '1.....1.1.......', snare: '........1.......',
          hat: { minInt: 1, p: 'x...x...x...x...' },
          gtr: [[0, 'D2', 7], [8, 'Ab2', 4], [12, 'G2', 4]],
          bass: [[0, 'D1', 8], [8, 'Ab1', 4], [12, 'G1', 4]],
          choir: { minInt: 1, n: [[0, ['D3', 'F3', 'A3'], 16]] },
        },
        B: {
          kick: '1.....1.1.....1.', snare: '........1.......',
          hat: { minInt: 1, p: 'x...x...x...x.x.' },
          gtr: [[0, 'D2', 4], [4, 'F2', 4], [8, 'E2', 4], [12, 'Eb2', 4]],
          bass: [[0, 'D1', 4], [4, 'F1', 4], [8, 'E1', 4], [12, 'Eb1', 4]],
        },
        C: {
          kick: '1.....1.1.......', snare: '........1......1',
          hat: { minInt: 1, p: 'x...x...x...x...' },
          gtr: [[0, 'D2', 7], [8, 'Ab2', 7]],
          lead: { minInt: 1, n: [[0, 'D4', 4], [4, 'F4', 3], [8, 'E4', 4], [12, 'C4', 4]] },
          bass: [[0, 'D1', 8], [8, 'Ab1', 8]],
          choir: { minInt: 2, n: [[0, ['D3', 'Ab3'], 16]] },
        },
      },
    },
    // E3: THE OVERSEER — martial, choir-backed, opens up when the boss wakes
    e3: {
      bpm: 132,
      arrange: ['A', 'A', 'B', 'C'],
      bars: {
        A: {
          kick: '1...1...1...1...', snare: '....1.......1...',
          hat: { minInt: 1, p: 'x.x.x.x.x.x.x.x.' },
          dkick: { minInt: 3, p: '..1...1...1...1.' },
          gtr: [[0, 'E2', 2], [2, 'E2', 2], [4, 'G2', 2], [6, 'E2', 2], [8, 'E2', 2], [10, 'Bb2', 2], [12, 'A2', 2], [14, 'G2', 2]],
          bass: [[0, 'E1', 8], [8, 'A1', 8]],
          choir: { minInt: 1, n: [[0, ['E3', 'G3', 'B3'], 16]] },
        },
        B: {
          kick: '1.......1.......', snare: '............1...', crash: '1...............',
          gtr: [[0, 'E2', 6], [8, 'C3', 6]],
          bass: [[0, 'E1', 8], [8, 'C2', 8]],
          choir: { minInt: 1, n: [[0, ['E3', 'G3', 'B3'], 8], [8, ['C3', 'E3', 'G3'], 8]] },
          lead: { minInt: 2, n: [[0, 'B4', 4], [4, 'A4', 3], [8, 'G4', 4], [12, 'E4', 4]] },
        },
        C: {
          kick: '1...1...1...1...', snare: '....1...1...1..1',
          dkick: { minInt: 3, p: '.1.1.1.1.1.1.1.1' },
          hat: { minInt: 1, p: 'xxxxxxxxxxxxxxxx' },
          gtr: [[0, 'E2', 1], [1, 'E2', 1], [2, 'E2', 1], [4, 'D3', 2], [6, 'C3', 2], [8, 'Bb2', 2], [10, 'B2', 2], [12, 'E2', 3]],
          bass: [[0, 'E1', 4], [4, 'D2', 4], [8, 'Bb1', 4], [12, 'E1', 4]],
          lead: { minInt: 3, n: [[0, 'E5', 6, 'G5'], [8, 'D5', 8, 'E5']] },
        },
      },
    },
    // TITLE: dread — slow swells, distant toms
    title: {
      bpm: 66,
      arrange: ['A', 'B'],
      bars: {
        A: {
          tom: '1.......1...1...',
          gtr: [[0, 'E2', 3]],
          choir: [[0, ['E3', 'G3', 'B3'], 16]],
          bass: [[0, 'E1', 12]],
        },
        B: {
          tom: '1.......1.....1.',
          choir: [[0, ['C3', 'E3', 'G3'], 8], [8, ['B2', 'D3', 'F#3'], 8]],
          lead: [[4, 'B3', 8, 'E4']],
          bass: [[0, 'C1', 8], [8, 'B0', 8]],
        },
      },
    },
    // INTERMISSION: tally groove — cleaner, almost upbeat
    inter: {
      bpm: 126,
      arrange: ['A', 'B'],
      bars: {
        A: {
          kick: '1...1...1...1...', snare: '....1.......1...', hat: 'x.x.x.x.x.x.x.x.',
          arp: [[0, 'E3', 2], [2, 'G3', 2], [4, 'B3', 2], [6, 'E4', 2], [8, 'B3', 2], [10, 'G3', 2], [12, 'B3', 2], [14, 'E4', 2]],
          bass: [[0, 'E1', 4], [4, 'E1', 4], [8, 'G1', 4], [12, 'A1', 4]],
        },
        B: {
          kick: '1...1...1...1...', snare: '....1.......1...', hat: 'x.x.x.x.x.x.xxx.',
          arp: [[0, 'C3', 2], [2, 'E3', 2], [4, 'G3', 2], [6, 'C4', 2], [8, 'D3', 2], [10, 'F#3', 2], [12, 'A3', 2], [14, 'D4', 2]],
          bass: [[0, 'C1', 8], [8, 'D1', 8]],
        },
      },
    },
    // VICTORY: the sun comes up over the corpse pile
    victory: {
      bpm: 92,
      arrange: ['A', 'B'],
      bars: {
        A: {
          kick: '1.......1.......',
          arp: [[0, 'C3', 3], [4, 'E3', 3], [8, 'G3', 3], [12, 'E3', 3]],
          choir: [[0, ['C3', 'E3', 'G3'], 16]],
          bass: [[0, 'C1', 12]],
        },
        B: {
          kick: '1.......1.......',
          arp: [[0, 'A2', 3], [4, 'C3', 3], [8, 'E3', 3], [12, 'G3', 3]],
          choir: [[0, ['A2', 'C3', 'E3'], 8], [8, ['G2', 'B2', 'D3'], 8]],
          lead: [[8, 'E4', 6]],
          bass: [[0, 'A0', 8], [8, 'G0', 8]],
        },
      },
    },
  },

  // note name -> frequency ('Bb2', 'F#4', ...)
  noteFreq(name) {
    const ST = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };
    const m = /^([A-G][#b]?)(\d)$/.exec(name);
    const midi = ST[m[1]] + 12 * (+m[2] + 1);
    return 440 * Math.pow(2, (midi - 69) / 12);
  },

  startMusic(songKey) {
    this.ensure();
    this.stopMusic();
    const song = this.SONGS[songKey];
    if (!song) return;
    this.music = {
      songKey, song, spb: 60 / song.bpm,
      step: 0, nextTime: this.now() + 0.1,
      timer: this.ctx && this.ctx.state === 'running' ? setInterval(() => this.tick(), 30) : null,
    };
  },

  stopMusic() {
    if (this.music?.timer) clearInterval(this.music.timer);
    this.music = null;
  },

  // unwrap {minInt, p/n} gating against current intensity
  gate(track) {
    if (!track) return null;
    if (track.minInt !== undefined) {
      if (this.intensity < track.minInt) return null;
      return track.p ?? track.n;
    }
    return track;
  },

  tick() {
    const m = this.music;
    if (!m || !this.ctx) return;
    const ahead = this.now() + 0.2;
    const stepDur = m.spb / 4;
    while (m.nextTime < ahead) {
      const t = m.nextTime;
      const s = m.step % 16;
      const bar = m.song.bars[m.song.arrange[Math.floor(m.step / 16) % m.song.arrange.length]];
      const hit = (p, ch = '1') => p && p[s] === ch;
      const drums = [['kick', 'kick'], ['snare', 'snare'], ['tom', 'tom'], ['crash', 'crash'], ['dkick', 'kick']];
      for (const [track, sound] of drums) {
        if (hit(this.gate(bar[track]))) this.drum(sound, t, track === 'dkick' ? 0.55 : 1);
      }
      const hatP = this.gate(bar.hat);
      if (hatP && hatP[s] === 'x') this.drum('hat', t);
      if (hatP && hatP[s] === 'o') this.drum('ohat', t);
      for (const [name, fn] of [['gtr', 'gtrNote'], ['chug', 'gtrChug'], ['gtr2', 'gtrNote'], ['bass', 'bassNote'], ['arp', 'pluck']]) {
        const evs = this.gate(bar[name]);
        if (evs) for (const [st, note, len] of evs) {
          if (st === s) this[fn](this.noteFreq(note), t, len * stepDur);
        }
      }
      const leadEvs = this.gate(bar.lead);
      if (leadEvs) for (const [st, note, len, slide] of leadEvs) {
        if (st === s) this.leadNote(this.noteFreq(note), t, len * stepDur, 1, slide ? this.noteFreq(slide) : 0);
      }
      const choirEvs = this.gate(bar.choir);
      if (choirEvs) for (const [st, notes, len] of choirEvs) {
        if (st === s) this.choirChord(notes.map(n => this.noteFreq(n)), t, len * stepDur);
      }
      m.nextTime += stepDur;
      m.step++;
    }
  },
};
