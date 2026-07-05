// PALIMPSEST — generative audio. No assets: warm pads, pentatonic chimes,
// breathing sea-noise, all synthesized. Starts on first user gesture.
P.audio = {
  ctx: null,
  master: null,
  muted: false,
  pad: null,
  sea: null,
  sceneCfg: null,

  ensure() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;

    this.master = c.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -22; comp.knee.value = 18; comp.ratio.value = 5;
    this.master.connect(comp); comp.connect(c.destination);

    // Fake reverb: two cross-feeding lowpassed delays, panned wide.
    this.verbIn = c.createGain(); this.verbIn.gain.value = 0.55;
    const mk = (time, panv) => {
      const d = c.createDelay(2); d.delayTime.value = time;
      const fb = c.createGain(); fb.gain.value = 0.42;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1600;
      const pan = c.createStereoPanner(); pan.pan.value = panv;
      d.connect(lp); lp.connect(fb); fb.connect(d);
      const out = c.createGain(); out.gain.value = 0.5;
      lp.connect(pan); pan.connect(out); out.connect(this.master);
      return d;
    };
    const dL = mk(0.293, -0.6), dR = mk(0.421, 0.6);
    this.verbIn.connect(dL); this.verbIn.connect(dR);

    if (this.sceneCfg) this._buildPad(this.sceneCfg);
  },

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.8, this.ctx.currentTime, 0.3);
  },

  // ---- pads ----
  scene(cfg) {
    // cfg: { root: freq, minor: bool, scale: [semitone offsets], sea: 0..1, sparse: bool }
    this.sceneCfg = cfg;
    if (!this.ctx) return;
    this._buildPad(cfg);
    this._setSea(cfg.sea || 0);
  },

  _buildPad(cfg) {
    const c = this.ctx, now = c.currentTime;
    if (this.pad) {
      const old = this.pad;
      old.gain.gain.setTargetAtTime(0, now, 2.2);
      setTimeout(() => old.oscs.forEach(o => { try { o.stop(); } catch (e) {} }), 9000);
    }
    if (cfg.silent) { this.pad = null; return; }
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(cfg.padVol ?? 0.05, now, 4);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 620; lp.Q.value = 0.4;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.05;
    const lfoAmt = c.createGain(); lfoAmt.gain.value = 240;
    lfo.connect(lfoAmt); lfoAmt.connect(lp.frequency); lfo.start();
    gain.connect(lp); lp.connect(this.master);
    const send = c.createGain(); send.gain.value = 0.4; lp.connect(this.verbIn);

    const oscs = [lfo];
    const add = (freq, detune, type, vol) => {
      const o = c.createOscillator(); o.type = type; o.frequency.value = freq; o.detune.value = detune;
      const g = c.createGain(); g.gain.value = vol;
      o.connect(g); g.connect(gain); o.start();
      oscs.push(o);
    };
    const r = cfg.root;
    add(r, -4, 'sine', 0.5);
    add(r, +4, 'triangle', 0.35);
    add(r * (cfg.minor ? 1.189 : 1.26), -3, 'sine', 0.14);   // third, quiet
    add(r * 1.498, +3, 'sine', 0.2);                          // fifth
    if (cfg.shimmer) add(r * 4.04, 6, 'sine', 0.05);
    this.pad = { gain, oscs };
  },

  // ---- sea noise (Folio V) ----
  _setSea(amount) {
    const c = this.ctx;
    if (!amount) {
      if (this.sea) { this.sea.gain.gain.setTargetAtTime(0, c.currentTime, 2); this.sea = null; }
      return;
    }
    if (!this.seaNode) {
      const len = c.sampleRate * 4;
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { // pinkish noise
        const w = Math.random() * 2 - 1;
        last = 0.98 * last + 0.02 * w;
        d[i] = last * 3.2;
      }
      const src = c.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 480; bp.Q.value = 0.35;
      const g = c.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(this.master); g.connect(this.verbIn);
      src.start();
      this.seaNode = { src, bp, g };
    }
    this.sea = { gain: this.seaNode.g, base: amount };
    this.seaNode.g.gain.setTargetAtTime(amount * 0.1, c.currentTime, 3);
  },

  // Called each frame by the tide scene with 0..1 wave energy.
  seaSwell(v) {
    if (!this.ctx || !this.sea) return;
    const target = this.sea.base * (0.05 + 0.13 * v);
    this.seaNode.g.gain.setTargetAtTime(target, this.ctx.currentTime, 0.6);
    this.seaNode.bp.frequency.setTargetAtTime(380 + 500 * v, this.ctx.currentTime, 0.5);
  },

  // ---- chimes ----
  // deg: scale degree (int, can exceed scale length for octaves). x: 0..1 pan position.
  chime(deg = 0, { x = 0.5, vol = 0.16, dur = 2.4, octave = 0 } = {}) {
    if (!this.ctx || this.muted) return;
    const cfg = this.sceneCfg || { root: 220, scale: [0, 2, 4, 7, 9] };
    const scale = cfg.scale || [0, 2, 4, 7, 9];
    const oct = Math.floor(deg / scale.length) + octave;
    const semi = scale[((deg % scale.length) + scale.length) % scale.length];
    const freq = (cfg.chimeRoot || cfg.root * 2) * Math.pow(2, oct + semi / 12);
    const c = this.ctx, now = c.currentTime;

    const pan = c.createStereoPanner(); pan.pan.value = (x - 0.5) * 1.4;
    pan.connect(this.master);
    const send = c.createGain(); send.gain.value = 0.85; pan.connect(send); send.connect(this.verbIn);

    const note = (f, v, decay) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(0, now);
      g.gain.linearRampToValueAtTime(v, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0004, now + decay);
      o.connect(g); g.connect(pan);
      o.start(now); o.stop(now + decay + 0.1);
    };
    note(freq, vol, dur);
    note(freq * 2, vol * 0.28, dur * 0.55);
    note(freq * 2.997, vol * 0.09, dur * 0.32);
  },

  // Soft low thump — footsteps in the night.
  step(vol = 0.1) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, now = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(88, now);
    o.frequency.exponentialRampToValueAtTime(40, now + 0.28);
    const g = c.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(vol, now + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0004, now + 0.5);
    o.connect(g); g.connect(this.master);
    o.start(now); o.stop(now + 0.6);
  },

  // Quill scratch — a filtered noise tick for the finale's writing.
  scratch() {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, now = c.currentTime;
    const len = Math.floor(c.sampleRate * 0.035);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass';
    bp.frequency.value = 2600 + Math.random() * 2200; bp.Q.value = 1.2;
    const g = c.createGain(); g.gain.value = 0.05 + Math.random() * 0.04;
    src.connect(bp); bp.connect(g); g.connect(this.master);
    src.start(now);
  },
};
