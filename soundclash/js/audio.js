// SOUNDCLASH — music engine. Everything is synthesized live: drums, bass,
// leads, hit sounds. A lookahead scheduler keeps the groove sample-accurate,
// and beat times are pure math (startTime + n*secPerBeat) so gameplay can
// judge "on beat" without touching the scheduler.

S.audio = {
  ctx: null, master: null, musicBus: null, sfxBus: null,
  events: [],            // scheduled visual bumps: {time, type}
  state: { kick: 0, snare: 0, bass: 0, accent: 0, beatPhase: 0, beat: 0, bar: 0 },

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.85;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 6; comp.release.value = 0.16;
    this.master.connect(comp); comp.connect(c.destination);
    this.musicBus = c.createGain(); this.musicBus.gain.value = 1; this.musicBus.connect(this.master);
    this.sfxBus = c.createGain(); this.sfxBus.gain.value = 1; this.sfxBus.connect(this.master);
    // short slap-verb for sfx sweetening
    const d = c.createDelay(1); d.delayTime.value = 0.11;
    const fb = c.createGain(); fb.gain.value = 0.24;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    d.connect(lp); lp.connect(fb); fb.connect(d);
    const wet = c.createGain(); wet.gain.value = 0.18;
    lp.connect(wet); wet.connect(this.master);
    this.verb = d;
  },

  // A suspended AudioContext freezes currentTime, so fall back to the perf
  // clock until audio is actually running (keeps beat math alive headless).
  now() { return this.ctx && this.ctx.state === 'running' ? this.ctx.currentTime : performance.now() / 1000; },

  _dist(k = 24) {
    this._distCache = this._distCache || {};
    if (!this._distCache[k]) {
      const n = 512, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * k) / Math.tanh(k * 0.6);
      }
      this._distCache[k] = curve;
    }
    const ws = this.ctx.createWaveShaper();
    ws.curve = this._distCache[k];
    return ws;
  },

  _noiseBuf() {
    if (!this._nb) {
      const c = this.ctx, len = c.sampleRate;
      this._nb = c.createBuffer(1, len, c.sampleRate);
      const d = this._nb.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this._nb;
  },

  // ---------------- low-level voices ----------------
  _env(t, vol, a, dec, node, bus) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0004, t + a + dec);
    node.connect(g); g.connect(bus || this.musicBus);
    return g;
  },
  _osc(t, type, freq, stop) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.start(t); o.stop(t + stop);
    return o;
  },
  _noise(t, stop) {
    const s = this.ctx.createBufferSource();
    s.buffer = this._noiseBuf(); s.loop = true;
    s.start(t); s.stop(t + stop);
    return s;
  },

  kick(t, vol = 0.9) {
    const o = this._osc(t, 'sine', 150, 0.4);
    o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
    this._env(t, vol, 0.002, 0.3, o);
    const click = this._noise(t, 0.03);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    click.connect(hp);
    this._env(t, vol * 0.25, 0.001, 0.028, hp);
    this.events.push({ time: t, type: 'kick' });
  },
  snare(t, vol = 0.5) {
    const n = this._noise(t, 0.22);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.7;
    n.connect(bp);
    this._env(t, vol, 0.001, 0.19, bp);
    const o = this._osc(t, 'triangle', 196, 0.14);
    this._env(t, vol * 0.5, 0.001, 0.1, o);
    this.events.push({ time: t, type: 'snare' });
  },
  hat(t, open = false, vol = 0.13) {
    const n = this._noise(t, open ? 0.3 : 0.05);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7600;
    n.connect(hp);
    this._env(t, vol, 0.001, open ? 0.26 : 0.04, hp);
  },
  bassNote(t, freq, len, vol = 0.3, type = 'sawtooth', cutoff = 700) {
    const o = this._osc(t, type, freq, len + 0.1);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff; lp.Q.value = 2;
    o.connect(lp);
    this._env(t, vol, 0.008, len, lp);
    this.events.push({ time: t, type: 'bass' });
  },
  chug(t, freq, len = 0.13, vol = 0.34) {
    const c = this.ctx;
    const g = c.createGain();
    for (const det of [-7, 6]) {
      const o = this._osc(t, 'sawtooth', freq, len + 0.1);
      o.detune.value = det;
      o.connect(g);
    }
    const ws = this._dist(30);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 1;
    g.connect(ws); ws.connect(lp);
    this._env(t, vol, 0.004, len, lp);
    this.events.push({ time: t, type: 'bass' });
  },
  pluck(t, freq, vol = 0.13, type = 'square', dec = 0.12) {
    const o = this._osc(t, type, freq, dec + 0.1);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    o.connect(lp);
    this._env(t, vol, 0.002, dec, lp);
  },
  pizz(t, freq, vol = 0.16) {
    const o = this._osc(t, 'triangle', freq, 0.25);
    this._env(t, vol, 0.002, 0.18, o);
  },
  timp(t, freq = 88, vol = 0.6) {
    const o = this._osc(t, 'sine', freq, 0.5);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + 0.3);
    this._env(t, vol, 0.003, 0.42, o);
    const n = this._noise(t, 0.05);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    n.connect(lp);
    this._env(t, vol * 0.3, 0.001, 0.04, lp);
    this.events.push({ time: t, type: 'kick' });
  },
  strings(t, freq, len, vol = 0.11) {
    const g = this.ctx.createGain();
    for (const det of [-6, 5]) {
      const o = this._osc(t, 'sawtooth', freq, len + 0.2);
      o.detune.value = det;
      o.connect(g);
    }
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1300;
    g.connect(lp);
    this._env(t, vol, Math.min(0.09, len * 0.3), len, lp);
    this.events.push({ time: t, type: 'bass' });
  },
  crash(t, vol = 0.24) {
    const n = this._noise(t, 1.2);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    n.connect(hp);
    this._env(t, vol, 0.002, 1.0, hp);
    this.events.push({ time: t, type: 'accent' });
  },
  lead(t, freq, len, vol = 0.15, type = 'sawtooth') {
    const o = this._osc(t, type, freq, len + 0.1);
    const vib = this._osc(t, 'sine', 5.6, len + 0.1);
    const vg = this.ctx.createGain(); vg.gain.value = freq * 0.006;
    vib.connect(vg); vg.connect(o.frequency);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    const ws = this._dist(8);
    o.connect(ws); ws.connect(lp);
    this._env(t, vol, 0.01, len, lp);
  },
  pad(t, freqs, len, vol = 0.07) {
    for (const f of freqs) {
      const o = this._osc(t, 'sawtooth', f, len + 0.3);
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      o.connect(lp);
      this._env(t, vol, len * 0.35, len, lp);
    }
  },

  // ---------------- genres ----------------
  GENRES: {
    metal: {
      bpm: 138, hue: 0,
      schedule(a, step, t, bar, intensity) {
        const s = step % 16;
        if ([0, 2, 3, 8, 10, 11].includes(s)) a.kick(t, 0.85);
        if ([4, 12].includes(s)) a.snare(t, 0.55);
        if (s % 2 === 0) a.hat(t, s === 14, 0.1);
        const chugNote = (bar % 2 === 1 && s >= 8) ? 98 : 82.4;
        if ([0, 2, 3, 8, 10, 11].includes(s)) a.chug(t, chugNote);
        if (s === 0 && intensity >= 1) a.crash(t, 0.18);
        if (intensity >= 2) {
          const riff = [329.6, 392, 329.6, 293.7, 246.9, 293.7, 329.6, 196];
          if (s % 4 === 2) a.lead(t, riff[(bar * 4 + (s >> 2)) % 8], 0.22, 0.13);
        }
        if (intensity >= 3 && s % 2 === 1) a.hat(t, false, 0.08);
      },
    },
    synthwave: {
      bpm: 116, hue: 195,
      schedule(a, step, t, bar, intensity) {
        const s = step % 16;
        const roots = [55, 43.65, 65.41, 49];
        const root = roots[bar % 4];
        if ([0, 4, 8, 12].includes(s)) a.kick(t, 0.8);
        if ([4, 12].includes(s)) a.snare(t, 0.5);
        if ([2, 6, 10, 14].includes(s)) a.hat(t, s === 14 && bar % 2 === 1, 0.14);
        if (s % 2 === 0) a.bassNote(t, root * (s % 4 === 2 ? 2 : 1), 0.16, 0.3, 'sawtooth', 620);
        if (intensity >= 1) {
          const pent = [1, 1.189, 1.335, 1.498, 1.782];
          a.pluck(t, root * 4 * pent[(step * 3) % 5], 0.09, 'square', 0.09);
        }
        if (intensity >= 2 && s === 0) a.pad(t, [root * 4, root * 4 * 1.189, root * 4 * 1.498], (60 / 116) * 4 * 0.9);
        if (intensity >= 3 && s % 4 === 3) a.hat(t, false, 0.1);
      },
    },
    orchestral: {
      bpm: 100, hue: 45,
      schedule(a, step, t, bar, intensity) {
        const s = step % 16;
        const roots = [73.42, 58.27, 49, 55];
        const root = roots[bar % 4];
        if ([0, 8].includes(s)) a.timp(t, root > 60 ? 73 : 65, 0.55);
        if ([4, 12].includes(s)) a.snare(t, 0.32);
        if (s % 2 === 0) a.pizz(t, root * 4 * (s % 8 === 6 ? 1.498 : 1), 0.08);
        if (s === 0) a.strings(t, root, (60 / 100) * 2 * 0.95, 0.12);
        if (s === 8) a.strings(t, root * 1.498, (60 / 100) * 1.6, 0.09);
        if (intensity >= 2) {
          const mel = [293.7, 349.2, 440, 349.2, 392, 293.7, 261.6, 293.7];
          if (s % 4 === 0) a.strings(t, mel[(bar * 4 + (s >> 2)) % 8], 0.5, 0.1);
        }
        if (intensity >= 1 && s === 12 && bar % 4 === 3) a.crash(t + 0.3, 0.14);
        if (intensity >= 3 && s % 4 === 2) a.pizz(t, root * 8, 0.07);
      },
    },
  },

  // ---------------- transport ----------------
  music: null,
  startMusic(genreKey, { bpmBoost = 0, intensity = 0, volume = 1 } = {}) {
    this.ensure();
    this.stopMusic();
    const genre = this.GENRES[genreKey];
    const bpm = genre.bpm + bpmBoost;
    const spb = 60 / bpm;
    const startTime = this.now() + 0.1;
    this.music = {
      genreKey, genre, bpm, spb, startTime,
      step: 0, nextTime: startTime, intensity,
      timer: this.ctx ? setInterval(() => this._schedulerTick(), 25) : null,
    };
    if (!this.ctx) return; // beat math still works without audio output
    this.musicBus.gain.cancelScheduledValues(this.now());
    this.musicBus.gain.setValueAtTime(0.0001, this.now());
    this.musicBus.gain.exponentialRampToValueAtTime(volume, this.now() + 0.4);
  },
  _schedulerTick() {
    const m = this.music;
    if (!m) return;
    while (m.nextTime < this.now() + 0.14) {
      const bar = Math.floor(m.step / 16);
      m.genre.schedule(this, m.step, m.nextTime, bar, m.intensity);
      m.nextTime += m.spb / 4;
      m.step++;
    }
  },
  stopMusic(fade = 0) {
    if (this.music) {
      clearInterval(this.music.timer);
      this.music = null;
    }
    if (this.ctx && fade > 0) {
      this.musicBus.gain.cancelScheduledValues(this.now());
      this.musicBus.gain.setTargetAtTime(0.0001, this.now(), fade / 3);
    }
  },
  setIntensity(n) { if (this.music) this.music.intensity = n; },
  duckMusic(level, ramp = 0.15) {
    if (!this.ctx) return;
    this.musicBus.gain.cancelScheduledValues(this.now());
    this.musicBus.gain.setTargetAtTime(level, this.now(), ramp);
  },

  // Beat math for gameplay + visuals. delta: seconds from the nearest beat.
  beatInfo(t = this.now()) {
    if (!this.music) return { phase: 0, delta: 999, beat: 0, spb: 0.5, next: t + 0.5 };
    const m = this.music;
    const pos = (t - m.startTime) / m.spb;
    const nearest = Math.round(pos);
    return {
      phase: pos - Math.floor(pos),
      beat: Math.floor(pos),
      delta: (pos - nearest) * m.spb,
      spb: m.spb,
      next: m.startTime + Math.ceil(pos) * m.spb,
    };
  },

  update(dt) {
    const s = this.state, now = this.now();
    for (const k of ['kick', 'snare', 'bass', 'accent']) s[k] = Math.max(0, s[k] - dt * (k === 'kick' ? 5 : 3.4));
    for (let i = this.events.length - 1; i >= 0; i--) {
      if (this.events[i].time <= now) {
        const e = this.events.splice(i, 1)[0];
        s[e.type] = 1;
      }
    }
    if (this.events.length > 90) this.events.length = 60;
    const b = this.beatInfo(now);
    s.beatPhase = b.phase; s.beat = b.beat; s.bar = b.beat >> 2;
  },

  // ---------------- fight SFX ----------------
  sfxGainCheck() { this.ensure(); return !!this.ctx; },

  hit(charKey, { heavy = false, onBeat = false, combo = 0 } = {}) {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    if (charKey === 'riff') {
      if (heavy) {
        const g = this.ctx.createGain();
        for (const f of [82.4, 123.5]) for (const det of [-8, 7]) {
          const o = this._osc(t, 'sawtooth', f, 0.5); o.detune.value = det;
          o.frequency.exponentialRampToValueAtTime(f * 0.8, t + 0.4);
          o.connect(g);
        }
        const ws = this._dist(34);
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
        g.connect(ws); ws.connect(lp);
        this._env(t, 0.5, 0.004, 0.42, lp, this.sfxBus);
      } else this.chug(t, 116 + (combo % 5) * 12, 0.11, 0.4);
    } else if (charKey === 'echo') {
      if (heavy) {
        const o = this._osc(t, 'square', 840, 0.24);
        o.frequency.exponentialRampToValueAtTime(140, t + 0.2);
        this._env(t, 0.3, 0.002, 0.2, o, this.sfxBus);
      } else {
        const pent = [0, 3, 5, 7, 10];
        const f = 440 * Math.pow(2, pent[combo % 5] / 12 + (combo >= 5 ? 1 : 0));
        this.pluck(t, f, 0.26, 'square', 0.13);
        this.pluck(t, f * 2, 0.1, 'square', 0.07);
      }
    } else {
      if (heavy) {
        const g = this.ctx.createGain();
        for (const f of [220, 277.2, 329.6]) { const o = this._osc(t, 'sawtooth', f, 0.4); o.connect(g); }
        const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2100;
        g.connect(lp);
        this._env(t, 0.34, 0.008, 0.34, lp, this.sfxBus);
        this.timp(t, 80, 0.5);
      } else { this.pizz(t, 587.3 + (combo % 5) * 60, 0.3); this.timp(t, 95, 0.28); }
    }
    // impact body
    const th = this._osc(t, 'sine', heavy ? 90 : 130, 0.16);
    th.frequency.exponentialRampToValueAtTime(50, t + 0.12);
    this._env(t, heavy ? 0.5 : 0.34, 0.001, 0.13, th, this.sfxBus);
    if (onBeat) {
      const ping = this._osc(t, 'sine', 1568, 0.4);
      this._env(t, 0.16, 0.001, 0.34, ping, this.sfxBus);
      this.crash(t, 0.1);
    }
  },
  block() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const o = this._osc(t, 'sine', 74, 0.14);
    this._env(t, 0.3, 0.001, 0.1, o, this.sfxBus);
    const n = this._noise(t, 0.05);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900;
    n.connect(bp);
    this._env(t, 0.14, 0.001, 0.045, bp, this.sfxBus);
  },
  whiff() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const n = this._noise(t, 0.14);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(2600, t);
    bp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
    n.connect(bp);
    this._env(t, 0.12, 0.004, 0.11, bp, this.sfxBus);
  },
  jump() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const n = this._noise(t, 0.1);
    const bp = this.ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400;
    n.connect(bp);
    this._env(t, 0.08, 0.002, 0.09, bp, this.sfxBus);
  },
  land() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const o = this._osc(t, 'sine', 96, 0.12);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    this._env(t, 0.2, 0.001, 0.1, o, this.sfxBus);
  },
  announce(big = false) {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const g = this.ctx.createGain();
    for (const f of big ? [110, 130.8, 164.8, 220] : [146.8, 174.6, 220]) {
      for (const det of [-6, 5]) { const o = this._osc(t, 'sawtooth', f, 0.8); o.detune.value = det; o.connect(g); }
    }
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
    g.connect(lp);
    this._env(t, big ? 0.4 : 0.3, 0.006, big ? 0.8 : 0.55, lp, this.sfxBus);
    this.crash(t, big ? 0.26 : 0.16);
  },
  koBlast() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const o = this._osc(t, 'sine', 70, 0.9);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    this._env(t, 0.7, 0.002, 0.8, o, this.sfxBus);
    this.crash(t, 0.4);
    this.announce(true);
  },
  superRiser() {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    const o = this._osc(t, 'sawtooth', 180, 0.85);
    o.frequency.exponentialRampToValueAtTime(1400, t + 0.8);
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
    o.connect(lp);
    this._env(t, 0.16, 0.05, 0.78, lp, this.sfxBus);
    const n = this._noise(t, 0.85);
    const hp = this.ctx.createBiquadFilter(); hp.type = 'highpass';
    hp.frequency.setValueAtTime(400, t);
    hp.frequency.exponentialRampToValueAtTime(6000, t + 0.8);
    n.connect(hp);
    this._env(t, 0.1, 0.05, 0.78, hp, this.sfxBus);
  },
  superBlast(charKey) {
    if (!this.sfxGainCheck()) return;
    const t = this.now();
    this.koBlast();
    if (charKey === 'riff') for (let i = 0; i < 4; i++) this.chug(t + i * 0.1, 82.4 * (i % 2 ? 1.5 : 1), 0.09, 0.4);
    if (charKey === 'echo') for (let i = 0; i < 8; i++) this.pluck(t + i * 0.05, 440 * Math.pow(2, [0, 3, 5, 7, 10, 12, 15, 17][i] / 12), 0.2, 'square', 0.09);
    if (charKey === 'maestro') for (let i = 0; i < 3; i++) this.timp(t + i * 0.14, 80 - i * 8, 0.5);
  },
  winSting(charKey) {
    if (!this.sfxGainCheck()) return;
    const t = this.now() + 0.1;
    const seqs = {
      riff: [[82.4, 0], [98, 0.16], [110, 0.32], [164.8, 0.5]],
      echo: [[220, 0], [261.6, 0.12], [329.6, 0.24], [440, 0.4]],
      maestro: [[293.7, 0], [370, 0.18], [440, 0.36], [587.3, 0.56]],
    };
    for (const [f, dt] of seqs[charKey] || seqs.riff) {
      if (charKey === 'riff') this.chug(t + dt, f, 0.14, 0.4);
      else if (charKey === 'echo') this.pluck(t + dt, f * 2, 0.24, 'square', 0.16);
      else this.strings(t + dt, f, 0.4, 0.2);
    }
    this.crash(t + 0.56, 0.2);
  },
  uiMove() { if (this.sfxGainCheck()) this.pluck(this.now(), 660, 0.14, 'square', 0.05); },
  uiConfirm() {
    if (!this.sfxGainCheck()) return;
    this.pluck(this.now(), 523.3, 0.2, 'square', 0.09);
    this.pluck(this.now() + 0.07, 784, 0.2, 'square', 0.14);
  },
};
