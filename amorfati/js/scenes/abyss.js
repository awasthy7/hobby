// IV — THE ABYSS. Your gaze is the only mason here: what you look at
// hardens into footing, what you neglect dissolves. But whoever gazes long
// into the abyss — the abyss gazes also into him.
Z.scenes.abyss = {
  DEPTH: 2900,

  enter() {
    this.t = 0;
    this.px = 480; this.py = 60;
    this.vx = 0; this.vy = 0;
    this.grounded = false;
    this.cam = 0;
    this.inverted = 0;        // >0: the abyss is gazing back
    this.stare = 0;           // 0..1 meter
    this.gazeHist = [];
    this.shadow = null;       // the thing at the bottom
    this.shadowGone = 0;
    this.dawn = 0;
    this.platforms = [];
    let y = 210;
    let x = 480;
    while (y < this.DEPTH - 320) {
      x = Z.clamp(x + Z.rand(-260, 260), 150, 810);
      this.platforms.push({ x, y, w: Z.rand(110, 170), charge: 0 });
      y += Z.rand(120, 175);
    }
    // the floor of the abyss is real
    this.platforms.push({ x: 480, y: this.DEPTH - 120, w: 900, charge: 1, floor: true });
    Z.audio.startAmb('abyss');
    const loop = Z.save.data.loop;
    Z.speak(loop === 1 ? [
      'IV — THE ABYSS',
      'Down here nothing is solid until it is seen. Your gaze lays the stones.',
      'But do not stare into the deep too long. It notices.',
    ] : [
      'IV — THE ABYSS',
      'It remembers your eyes. Try not to let it catch them again.',
    ], null, { quiet: true });
    Z.say('look (mouse) at the faint ledges to harden them · A/D walk · W jump', 6);
  },

  update(dt) {
    this.t += dt;
    const inp = Z.input;
    const gx = inp.mx, gy = inp.my + this.cam;

    if (this.dawn > 0) {
      this.dawn += dt;
      if (this.dawn > 3.4) {
        Z.speak([
          'It was your shadow. It was always going to be your shadow.',
          'You did not fight it. That is the only way anyone has ever won.',
          'Above you — noon.',
        ], () => Z.go('noon'));
        this.dawn = -1;
      }
      return;
    }
    if (this.dawn < 0) return;

    // ---- gaze hardens platforms ----
    let gazeNearPlatform = false;
    for (const p of this.platforms) {
      if (p.floor) continue;
      const d = Z.dist(gx, gy, p.x, p.y);
      if (d < 110) {
        p.charge = Math.min(1, p.charge + dt * 2.4);
        gazeNearPlatform = true;
        if (p.charge > 0.98 && !p.rung) { p.rung = true; Z.audio.sfx('crystal', { vol: 0.5 }); }
      } else {
        p.charge = Math.max(0, p.charge - dt * 0.45);
        if (p.charge < 0.2) p.rung = false;
      }
    }

    // ---- the stare meter ----
    this.gazeHist.push({ x: gx, y: gy, t: this.t });
    while (this.gazeHist.length > 40) this.gazeHist.shift();
    const still = this.gazeHist.length > 30 &&
      Z.dist(gx, gy, this.gazeHist[0].x, this.gazeHist[0].y) < 46;
    if (this.inverted <= 0) {
      if ((still && !gazeNearPlatform) || (still && this.gazeHist[0].t < this.t - 2.6)) {
        this.stare = Math.min(1, this.stare + dt * 0.36);
      } else {
        this.stare = Math.max(0, this.stare - dt * 0.5);
      }
      if (this.stare >= 1) {
        this.inverted = 5.5;
        this.eyeX = gx; this.eyeY = gy;
        this.stare = 0;
        Z.audio.sfx('eye');
        Z.audio.sfx('invert');
        Z.say('the abyss gazes also into you.', 4);
      }
    } else {
      this.inverted -= dt;
      if (Math.floor(this.t) !== Math.floor(this.t - dt)) Z.audio.sfx('heartbeat', { vol: 0.7 });
    }

    // ---- the shadow at the bottom ----
    const onFloor = this.py > this.DEPTH - 260;
    if (onFloor && !this.shadow) {
      this.shadow = { x: this.px < 480 ? 720 : 240, size: 1, stillT: 0 };
      Z.say('something stands at the bottom. it has your outline.', 4.5);
    }
    if (this.shadow && !this.shadowGone) {
      const sh = this.shadow;
      // it mirrors your approach
      const toYou = Math.sign(this.px - sh.x);
      const moving = Math.abs(this.vx) > 12;
      if (moving) sh.x += toYou * Math.min(Math.abs(this.vx), 130) * dt; // it closes in when you do
      // aggression feeds it
      if (inp.spacePressed) {
        sh.size = Math.min(2.2, sh.size * 1.14);
        Z.audio.sfx('roar', { vol: 0.4 });
        Z.say(Z.pick(['it roars back, and grows.', 'whoever fights monsters…', 'it drinks the fight you offer.']), 3.4);
      }
      // stillness and averted gaze dissolve it
      const gazeOnIt = Math.abs(gx - sh.x) < 90 && Math.abs(gy - (this.DEPTH - 160)) < 160;
      if (!moving && !gazeOnIt && this.grounded) {
        sh.stillT += dt;
        if (sh.stillT > 3.8) {
          this.shadowGone = 0.01;
          Z.audio.sfx('dissolve');
          Z.audio.stopAmb();
        }
      } else sh.stillT = Math.max(0, sh.stillT - dt * 2);
      // touch = shoved back (it is not a death; it is a mirror)
      if (Math.abs(sh.x - this.px) < 30) {
        this.vx = toYou * 260;
        Z.engine.shake = 0.4;
      }
    }
    if (this.shadowGone > 0) {
      this.shadowGone += dt;
      if (this.shadowGone > 2.4 && this.dawn === 0) this.dawn = 0.01;
    }

    // ---- platformer physics ----
    const mirror = this.inverted > 0 ? -1 : 1;
    const acc = 900;
    if (inp.left) this.vx -= acc * mirror * dt;
    if (inp.right) this.vx += acc * mirror * dt;
    this.vx *= Math.pow(0.002, dt);
    if (inp.up && this.grounded) {
      this.vy = -430;
      this.grounded = false;
      Z.audio.sfx('step', { vol: 0.7 });
    }
    this.vy += 980 * dt;
    this.px = Z.clamp(this.px + this.vx * dt, 60, 900);
    const oldY = this.py;
    this.py += this.vy * dt;
    this.grounded = false;
    for (const p of this.platforms) {
      if (!p.floor && p.charge < 0.25) continue;
      const top = p.y - 8;
      if (oldY <= top && this.py >= top &&
          this.px > p.x - p.w / 2 - 10 && this.px < p.x + p.w / 2 + 10 &&
          this.vy > 0) {
        this.py = top; this.vy = 0; this.grounded = true;
        if (!p.floor) p.charge = Math.max(p.charge, 0.5);
      }
    }
    if (this.py > this.DEPTH - 108) { this.py = this.DEPTH - 108; this.vy = 0; this.grounded = true; }

    this.cam = Z.damp(this.cam, Z.clamp(this.py - 300, 0, this.DEPTH - 540), 0.08, dt);
  },

  draw(g) {
    const inv = this.inverted > 0;
    // darkness with depth
    const deep = Z.clamp(this.cam / this.DEPTH, 0, 1);
    const sky = g.createLinearGradient(0, 0, 0, 540);
    if (!inv) {
      sky.addColorStop(0, `rgb(${14 - deep * 8},${16 - deep * 9},${26 - deep * 12})`);
      sky.addColorStop(1, `rgb(${8 - deep * 5},${8 - deep * 5},${14 - deep * 8})`);
    } else {
      sky.addColorStop(0, '#d8d4c8'); sky.addColorStop(1, '#e8e2d2');
    }
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);

    const ink = inv ? '#e8e2d2' : '#0c0c14';
    const bone = inv ? '#14141e' : '#c8ccdc';

    // cavern walls
    g.fillStyle = inv ? '#c4beae' : '#07070d';
    for (const side of [0, 1]) {
      g.beginPath();
      g.moveTo(side ? 960 : 0, 0);
      for (let y = 0; y <= 540; y += 20) {
        const wy = y + this.cam;
        const wob = Z.noise1(wy * 0.006 + side * 40, 21) * 46;
        g.lineTo(side ? 960 - 60 - wob : 60 + wob, y);
      }
      g.lineTo(side ? 960 : 0, 540);
      g.fill();
    }

    // gaze light
    const gx = Z.input.mx, gy = Z.input.my;
    if (!inv) {
      const gl = g.createRadialGradient(gx, gy, 6, gx, gy, 130);
      gl.addColorStop(0, 'rgba(180,190,230,0.13)');
      gl.addColorStop(1, 'rgba(180,190,230,0)');
      g.fillStyle = gl;
      g.beginPath(); g.arc(gx, gy, 130, 0, Z.TAU); g.fill();
    }

    // platforms
    for (const p of this.platforms) {
      const sy = p.y - this.cam;
      if (sy < -30 || sy > 580) continue;
      if (p.floor) {
        g.fillStyle = inv ? '#b0aa9a' : '#10101a';
        g.fillRect(0, sy, 960, 540 - sy + 40);
        continue;
      }
      const c = p.charge;
      if (c <= 0.02) {
        // the faintest suggestion
        g.strokeStyle = `rgba(${inv ? '20,20,30' : '160,170,210'},0.1)`;
        g.setLineDash([3, 9]);
        g.strokeRect(p.x - p.w / 2, sy - 3, p.w, 6);
        g.setLineDash([]);
        continue;
      }
      g.save();
      g.globalAlpha = Z.clamp(0.15 + c, 0, 1);
      g.fillStyle = c > 0.25 ? (inv ? '#232332' : `rgba(150,168,220,${0.35 + c * 0.5})`) : 'rgba(150,168,220,0.18)';
      g.fillRect(p.x - p.w / 2, sy - 4, p.w, 8);
      if (c > 0.25) {
        g.strokeStyle = inv ? '#0c0c18' : 'rgba(200,214,255,0.75)';
        g.lineWidth = 1.2;
        g.strokeRect(p.x - p.w / 2, sy - 4, p.w, 8);
      }
      // crystallization sparks
      if (c > 0.5 && c < 1) {
        for (let i = 0; i < 3; i++) {
          const sxp = p.x - p.w / 2 + ((this.t * 130 + i * 53) % p.w);
          g.fillStyle = 'rgba(220,230,255,0.7)';
          g.fillRect(sxp, sy - 6 - (i % 2) * 3, 1.6, 1.6);
        }
      }
      g.restore();
    }

    // the shadow at the bottom
    if (this.shadow && this.shadowGone < 2.4) {
      const sh = this.shadow;
      const sy = this.DEPTH - 108 - this.cam;
      const fade = this.shadowGone > 0 ? Z.clamp(1 - this.shadowGone / 2.2, 0, 1) : 1;
      g.save();
      g.translate(sh.x, sy);
      g.scale(sh.size, sh.size);
      g.globalAlpha = fade * 0.92;
      g.strokeStyle = ink; g.fillStyle = ink;
      g.lineWidth = 5.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
      g.beginPath(); g.arc(0, -45, 8, 0, Z.TAU); g.fill();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-6, 12); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(6, 12); g.stroke();
      if (this.shadowGone > 0) {
        for (let i = 0; i < 8; i++) {
          g.globalAlpha = fade * 0.5;
          g.fillRect(-20 + i * 5, -50 - this.shadowGone * 40 - (i % 3) * 20, 2, 8);
        }
      }
      g.restore();
      g.globalAlpha = 1;
    }

    // dawn shaft
    if (this.dawn > 0) {
      const dp = Math.min(1, this.dawn / 2.5);
      g.save();
      g.globalAlpha = dp * 0.8;
      const dg = g.createLinearGradient(0, 0, 0, 540);
      dg.addColorStop(0, 'rgba(255,236,180,0.9)');
      dg.addColorStop(1, 'rgba(255,236,180,0.12)');
      g.fillStyle = dg;
      g.beginPath();
      g.moveTo(430 - dp * 60, 0); g.lineTo(530 + dp * 60, 0);
      g.lineTo(600 + dp * 80, 540); g.lineTo(360 - dp * 80, 540);
      g.fill();
      g.restore();
    }

    // player
    g.save();
    g.translate(this.px, this.py - this.cam);
    g.strokeStyle = ink; g.fillStyle = ink;
    g.lineWidth = 5.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
    g.beginPath(); g.arc(0, -45, 8, 0, Z.TAU); g.fill();
    const run = Math.abs(this.vx) > 12 ? Math.sin(this.t * 12) * 5 : 0;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6 - run, 12); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6 + run, 12); g.stroke();
    g.restore();

    // THE EYE
    if (inv) {
      const openT = Z.clamp((5.5 - this.inverted) * 2, 0, 1);
      const closeT = Z.clamp(this.inverted * 1.4, 0, 1);
      const lid = Math.min(openT, closeT);
      g.save();
      g.translate(this.eyeX, this.eyeY - 0);
      g.fillStyle = '#0a0a12';
      g.beginPath();
      g.ellipse(0, 0, 90, 46 * lid, 0, 0, Z.TAU);
      g.fill();
      g.fillStyle = '#c8ccdc';
      g.beginPath(); g.arc(0, 0, 30 * lid, 0, Z.TAU); g.fill();
      // its pupil follows YOU
      const pa = Math.atan2((this.py - this.cam) - this.eyeY, this.px - this.eyeX);
      g.fillStyle = '#0a0a12';
      g.beginPath(); g.arc(Math.cos(pa) * 12, Math.sin(pa) * 12 * lid, 13 * lid, 0, Z.TAU); g.fill();
      g.restore();
    }

    // stare meter: an iris slowly opening at the gaze point
    if (this.stare > 0.1 && !inv) {
      g.save();
      g.translate(gx, gy);
      g.globalAlpha = this.stare * 0.8;
      g.strokeStyle = '#aab2d0';
      g.lineWidth = 1.5;
      g.beginPath(); g.ellipse(0, 0, 42, 20 * this.stare, 0, 0, Z.TAU); g.stroke();
      if (this.stare > 0.6) {
        g.globalAlpha = (this.stare - 0.6) * 2;
        g.beginPath(); g.arc(0, 0, 8, 0, Z.TAU); g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
    }
  },
};
