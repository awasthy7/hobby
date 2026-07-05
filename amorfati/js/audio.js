// AMOR FATI — generative score. Every scene has its own weather of sound;
// nothing is sampled, everything is spoken by oscillators.
Z.audio = {
  ctx: null, music: null, ambTimer: null,

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.75;
    this.comp = this.ctx.createDynamicsCompressor();
    this.master.connect(this.comp).connect(this.ctx.destination);
    this.sfxBus = this.ctx.createGain(); this.sfxBus.gain.value = 0.9; this.sfxBus.connect(this.master);
    this.ambBus = this.ctx.createGain(); this.ambBus.gain.value = 0.6; this.ambBus.connect(this.master);
    this.noiseBuf = this.makeNoise();
  },
  now() { return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : performance.now() / 1000; },
  ok() { return this.ctx && this.ctx.state === 'running'; },
  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  },
  env(g, t, a, peak, d, s = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(s, 0.0001), t + a + d);
  },
  osc(type, f0, t, dur, peak, dest, f1) {
    if (!this.ok()) return;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, 0.01, peak, dur);
    o.connect(g).connect(dest || this.sfxBus);
    o.start(t); o.stop(t + dur + 0.15);
  },
  noise(t, dur, peak, type = 'lowpass', freq = 800, q = 0.7, dest = null, freq1 = 0) {
    if (!this.ok()) return;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freq1) f.frequency.exponentialRampToValueAtTime(freq1, t + dur);
    const g = this.ctx.createGain();
    this.env(g, t, Math.min(0.04, dur * 0.2), peak, dur);
    src.connect(f).connect(g).connect(dest || this.sfxBus);
    src.start(t); src.stop(t + dur + 0.15);
  },
  bell(f, t, dur, peak, dest) {
    if (!this.ok()) return;
    for (const [mult, v] of [[1, 1], [2.76, 0.4], [5.4, 0.18]]) {
      this.osc('sine', f * mult, t, dur * (1 - mult * 0.1), peak * v, dest || this.ambBus);
    }
  },
  pad(freqs, t, dur, peak, dest) {
    if (!this.ok()) return;
    for (const f of freqs) {
      for (const det of [-5, 4]) {
        const o = this.ctx.createOscillator();
        o.type = 'triangle'; o.frequency.value = f; o.detune.value = det;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(peak / freqs.length, t + dur * 0.35);
        g.gain.setValueAtTime(peak / freqs.length, t + dur * 0.7);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(dest || this.ambBus);
        o.start(t); o.stop(t + dur + 0.1);
      }
    }
  },

  // ---------- scene ambiences (schedulers) ----------
  startAmb(scene) {
    this.stopAmb();
    if (!this.ctx) return;
    this.amb = { scene, step: 0 };
    this.ambTimer = setInterval(() => this.ambTick(), 700);
    this.ambTick();
  },
  stopAmb() { if (this.ambTimer) clearInterval(this.ambTimer); this.ambTimer = null; this.amb = null; },
  ambTick() {
    if (!this.amb || !this.ok()) return;
    const t = this.now() + 0.05, s = this.amb.step++;
    switch (this.amb.scene) {
      case 'rope':
        if (s % 4 === 0) this.noise(t, 3.2, 0.05, 'bandpass', Z.rand(300, 700), 0.4, this.ambBus, Z.rand(200, 500));
        if (s % 6 === 2) this.osc('sine', Z.pick([660, 784, 880]), t, 2.6, 0.02, this.ambBus);
        if (s % 5 === 1) this.noise(t, 1.8, 0.02, 'lowpass', 350, 0.4, this.ambBus); // crowd below
        break;
      case 'desert':
        if (s % 5 === 0) this.noise(t, 4, 0.045, 'highpass', Z.rand(900, 1600), 0.3, this.ambBus, 600);
        if (s % 8 === 0) this.pad([55, 82.4], t, 5.5, 0.05);
        break;
      case 'dragon':
        if (s % 4 === 0) this.osc('sawtooth', 36.7, t, 2.8, 0.06, this.ambBus, 34);
        if (s % 7 === 3) this.noise(t, 2, 0.05, 'lowpass', 120, 0.6, this.ambBus);
        break;
      case 'market':
        // a music box, slightly flat, playing to no one
        if (s % 2 === 0) {
          const waltz = [523, 659, 784, 659, 523, 784, 622, 494];
          this.osc('triangle', waltz[Math.floor(s / 2) % 8] * 0.985, t, 0.7, 0.035, this.ambBus);
        }
        break;
      case 'churchyard':
        if (s % 6 === 0) this.pad([49, 73.4, 98], t, 4.5, 0.05);
        break;
      case 'abyss':
        if (s % 5 === 0) this.osc('sine', 30.9, t, 4, 0.09, this.ambBus, 28);
        if (s % 9 === 4) this.noise(t, 3, 0.025, 'bandpass', Z.rand(2000, 4500), 3, this.ambBus); // whispers
        break;
      case 'noon':
        if (s % 6 === 0) this.pad([261.6, 329.6, 392, 523.3], t, 4.8, 0.06);
        if (s % 8 === 5) this.bell(Z.pick([1046, 1318, 1568]), t, 2.2, 0.02);
        break;
    }
  },

  // ---------- sfx ----------
  sfx(name, o = {}) {
    this.ensure();
    if (!this.ok()) return;
    const t = this.now() + 0.01, v = o.vol ?? 1;
    switch (name) {
      case 'step': this.noise(t, 0.09, 0.05 * v, 'lowpass', Z.rand(300, 500), 0.5); break;
      case 'sandstep': this.noise(t, 0.14, 0.06 * v, 'lowpass', Z.rand(500, 800), 0.4); break;
      case 'gust': this.noise(t, 1.6, 0.3 * v, 'bandpass', 500, 0.6, null, 1400); break;
      case 'wobble': this.osc('sine', 220, t, 0.3, 0.05 * v, null, 180); break;
      case 'fall': this.noise(t, 1.8, 0.35 * v, 'bandpass', 400, 0.8, null, 2400); this.osc('sine', 400, t, 1.6, 0.12 * v, null, 90); break;
      case 'heartbeat': this.osc('sine', 55, t, 0.14, 0.5 * v, null, 40); this.osc('sine', 50, t + 0.22, 0.12, 0.35 * v, null, 38); break;
      case 'demon': this.osc('sine', 41, t, 2.8, 0.22 * v, null, 38); this.bell(164.8, t, 3, 0.05 * v); break;
      case 'type': this.osc('square', Z.rand(700, 900), t, 0.02, 0.012 * v); break;
      case 'tablet': this.osc('sine', 98, t, 0.6, 0.2 * v, null, 60); this.bell(392, t + 0.05, 1.4, 0.06 * v); break;
      case 'burden': this.noise(t, 0.3, 0.18 * v, 'lowpass', 200, 0.8); this.osc('sine', 82, t, 0.5, 0.2 * v, null, 55); break;
      case 'kneel': this.noise(t, 0.5, 0.22 * v, 'lowpass', 150, 0.6); this.osc('sine', 60, t, 0.7, 0.25 * v, null, 40); break;
      case 'command': this.osc('sawtooth', 87, t, 0.8, 0.14 * v, null, 82); this.osc('sawtooth', 130, t, 0.7, 0.09 * v); break;
      case 'roar': this.noise(t, 1.3, 0.4 * v, 'lowpass', 900, 0.8, null, 250); this.osc('sawtooth', 90, t, 1.2, 0.3 * v, null, 55); break;
      case 'shatter': this.noise(t, 0.7, 0.3 * v, 'highpass', 3000, 1); this.bell(1568, t, 1.5, 0.07 * v); this.bell(1244, t + 0.08, 1.3, 0.05 * v); break;
      case 'collapse': this.noise(t, 2.4, 0.4 * v, 'lowpass', 400, 0.5, null, 60); this.osc('sine', 55, t, 2.2, 0.3 * v, null, 30); break;
      case 'laugh': { const f = Z.rand(180, 260); for (let i = 0; i < 2; i++) this.osc('square', f, t + i * 0.24, 0.12, 0.03 * v, null, f * 0.92); break; }
      case 'lantern': this.osc('sine', 440, t, 0.15, 0.04 * v); this.osc('sine', 660, t + 0.05, 0.2, 0.03 * v); break;
      case 'speak': this.pad([98, 146.8, 196], t, 5, 0.12 * v); this.bell(392, t + 0.4, 3, 0.05 * v); break;
      case 'silence': /* the loudest sound: handled by stopping the ambience */ this.stopAmb(); break;
      case 'crystal': this.bell(Z.pick([784, 880, 1046]), t, 1.1, 0.06 * v); break;
      case 'dissolve': this.noise(t, 0.5, 0.08 * v, 'highpass', 4000, 0.7); break;
      case 'eye': this.osc('sine', 33, t, 2.2, 0.3 * v, null, 30); this.noise(t, 2, 0.12 * v, 'bandpass', 3000, 4); break;
      case 'invert': this.osc('sawtooth', 880, t, 0.6, 0.1 * v, null, 110); break;
      case 'paint': this.bell(Z.pick([523, 587, 659, 784, 880]), t, 0.9, 0.045 * v); break;
      case 'chord': this.pad([261.6, 329.6, 392, 493.9, 587.3], t, 3.5, 0.14 * v); break;
      case 'yes': { const root = 261.6; this.pad([root, root * 1.25, root * 1.5, root * 2, root * 2.25], t, 7, 0.2 * v); this.bell(1046, t + 0.5, 4, 0.08 * v); this.bell(1318, t + 1.1, 4, 0.07 * v); break; }
      case 'crumble': this.noise(t, 2.2, 0.3 * v, 'lowpass', 500, 0.5, null, 80); break;
      case 'bellNoon': this.bell(392, t, 4, 0.12 * v); this.bell(196, t + 0.02, 5, 0.1 * v); break;
    }
  },
};
