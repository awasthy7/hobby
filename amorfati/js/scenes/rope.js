// PROLOGUE — THE ROPE. Man is a rope, tied between beast and overman —
// a rope over an abyss. Everyone falls. That is not the question.
Z.scenes.rope = {
  enter() {
    this.t = 0;
    this.progress = 0.06;      // 0..1 across the rope
    this.theta = 0;            // lean angle
    this.thetaV = 0;
    this.fallen = false;
    this.fallT = 0;
    this.jester = { state: 'wait', t: 0, x: 0, y: 0 };
    this.gustAt = 0.56;
    this.stars = [];
    for (let i = 0; i < 130; i++) this.stars.push({ x: Math.random() * 960, y: Math.random() * 300, s: Math.random() });
    this.crowd = [];
    for (let i = 0; i < 60; i++) this.crowd.push({ x: 80 + Math.random() * 800, y: 486 + Math.random() * 20, run: 0, v: Math.random() });
    this.survivedGust = false;
    Z.audio.startAmb('rope');
    const loop = Z.save.data.loop;
    if (loop === 1) {
      Z.say('lean with A and D. stay upright, and your feet find their own way forward.', 5.5);
    } else {
      Z.say(`the rope again. the ${loop === 2 ? 'second' : loop + 'th'} time.`, 4);
    }
  },

  ropeY(p) { return 292 + Math.sin(p * Math.PI) * 26; },

  update(dt) {
    this.t += dt;
    const inp = Z.input;

    if (this.fallen) {
      this.fallT += dt;
      if (this.fallT > 2.6) {
        this.fallen = 'done';
        const loop = Z.save.data.loop;
        const lines = loop === 1 ? [
          'You fell. Everyone falls. That is not the question.',
          'What if, some night, a demon crept into your loneliest loneliness and said:',
          '“This life, as you now live it and have lived it — you will have to live it once more, and innumerable times more.”',
          '“Nothing new in it. Every pain and every joy, every fall from every rope — all in the same succession and sequence.”',
          'Would you curse the demon? Or have you once experienced a moment when you would answer: “never have I heard anything more divine”?',
          'We shall see. Once more.',
        ] : loop < 4 ? [
          'Again. The same rope, the same wind, the same fall.',
          'The demon does not tire. Do you?',
          'Once more.',
        ] : [
          `The ${loop}th fall. You are becoming graceful at it.`,
          'Once more — you know the way.',
        ];
        Z.speak(lines, () => Z.go('desert'));
      }
      return;
    }

    // balance physics: wind torque + your lean
    const wind = Z.noise1(this.t * 0.5, 7) * 0.55 + Z.noise1(this.t * 2.1, 13) * 0.3;
    let torque = wind * (0.5 + this.progress * 0.9);
    if (inp.left) torque -= 2.1;   // lean against the wind…
    if (inp.right) torque += 2.1;  // …or into it
    this.thetaV += (torque - this.theta * 2.4 - this.thetaV * 0.9) * dt * 2.2;
    this.theta += this.thetaV * dt * 2.2;

    // advance while roughly upright
    if (Math.abs(this.theta) < 0.5) {
      this.progress += dt * 0.035;
      if (Math.floor(this.t * 2.2) !== Math.floor((this.t - dt) * 2.2)) Z.audio.sfx('step', { vol: 0.5 });
    }

    // the jester
    const j = this.jester;
    if (j.state === 'wait' && this.progress >= this.gustAt - 0.13) {
      j.state = 'taunt'; j.t = 0;
      const loop = Z.save.data.loop;
      Z.say(loop === 1
        ? '“Forward, lamefoot! What are you doing between the towers?”'
        : '“You again, lamefoot? The abyss remembers you.”', 3.4);
    }
    if (j.state === 'taunt') {
      j.t += dt;
      if (j.t > 2.6) { j.state = 'leap'; j.t = 0; Z.audio.sfx('gust'); }
    }
    if (j.state === 'leap') {
      j.t += dt;
      const lt = Math.min(1, j.t / 1.1);
      j.x = Z.lerp(this.progress * 760 + 40, this.progress * 760 + 180, lt);
      j.y = this.ropeY(this.progress) - 40 - Math.sin(lt * Math.PI) * 130;
      if (lt >= 0.45 && lt <= 0.55) {
        // the shockwave
        this.thetaV += (Math.abs(this.theta) < 0.12 && Z.save.data.loop > 1 && !this.shoved) ? 5.2 : 8.5;
        this.shoved = true;
      }
      if (lt >= 1) j.state = 'gone';
    }

    // past the limit: the fall
    if (Math.abs(this.theta) > 1.15) {
      this.fallen = true; this.fallT = 0;
      Z.audio.sfx('fall');
      Z.audio.stopAmb();
      for (const c of this.crowd) c.run = (c.x < this.progress * 760 + 100 ? -1 : 1) * (0.5 + c.v);
    }
    if (Math.abs(this.theta) > 0.85 && Math.floor(this.t * 3) !== Math.floor((this.t - dt) * 3)) Z.audio.sfx('wobble', { vol: 0.5 });

    for (const c of this.crowd) c.x += c.run * dt * 120;
  },

  draw(g) {
    // night sky
    const sky = g.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#05060f'); sky.addColorStop(0.6, '#0c1024'); sky.addColorStop(1, '#1a1626');
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);
    for (const s of this.stars) {
      g.globalAlpha = 0.25 + 0.6 * Math.abs(Z.noise1(this.t * 0.7 + s.x, 3)) * s.s;
      g.fillStyle = '#cfd6ea';
      g.fillRect(s.x, s.y, s.s > 0.8 ? 2 : 1, s.s > 0.8 ? 2 : 1);
    }
    g.globalAlpha = 1;
    // the moon, enormous and patient
    const mg = g.createRadialGradient(700, 130, 10, 700, 130, 150);
    mg.addColorStop(0, 'rgba(235,238,248,0.95)');
    mg.addColorStop(0.5, 'rgba(220,226,244,0.28)');
    mg.addColorStop(1, 'rgba(210,220,244,0)');
    g.fillStyle = mg; g.beginPath(); g.arc(700, 130, 150, 0, Z.TAU); g.fill();
    g.fillStyle = '#e8ecf8'; g.beginPath(); g.arc(700, 130, 62, 0, Z.TAU); g.fill();
    g.fillStyle = 'rgba(180,190,215,0.5)';
    g.beginPath(); g.arc(682, 118, 12, 0, Z.TAU); g.arc(716, 146, 8, 0, Z.TAU); g.fill();

    // towers
    g.fillStyle = '#07070d';
    g.fillRect(0, 150, 90, 390);
    g.fillRect(870, 150, 90, 390);
    g.fillStyle = '#0d0d16';
    g.fillRect(20, 120, 50, 40); g.fillRect(890, 120, 50, 40);
    // tower windows
    g.fillStyle = 'rgba(240,200,120,0.5)';
    g.fillRect(34, 210, 8, 12); g.fillRect(52, 300, 8, 12); g.fillRect(906, 250, 8, 12);

    // town below
    g.fillStyle = '#0a0a12';
    g.fillRect(0, 470, 960, 70);
    for (let i = 0; i < 12; i++) {
      g.fillRect(60 + i * 78, 440 - (i % 3) * 14, 52, 100);
    }
    // crowd
    for (const c of this.crowd) {
      g.fillStyle = '#050508';
      g.beginPath(); g.arc(c.x, c.y, 5, 0, Z.TAU); g.fill();
      g.fillRect(c.x - 4, c.y, 8, 12);
    }
    // scattered lanterns
    for (let i = 0; i < 6; i++) {
      const lx = 140 + i * 140, ly = 476;
      const lg = g.createRadialGradient(lx, ly, 1, lx, ly, 26);
      lg.addColorStop(0, 'rgba(250,200,110,0.5)'); lg.addColorStop(1, 'rgba(250,200,110,0)');
      g.fillStyle = lg; g.beginPath(); g.arc(lx, ly, 26, 0, Z.TAU); g.fill();
    }

    // the rope
    g.strokeStyle = '#3a3a46';
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(90, 292);
    g.quadraticCurveTo(480, 292 + 54, 870, 292);
    g.stroke();

    // walker
    const px = 90 + this.progress * 780;
    const py = this.ropeY(this.progress);
    g.save();
    g.translate(px, py);
    if (this.fallen) {
      const f = this.fallT;
      g.translate(0, f * f * 190);
      g.rotate(this.theta + f * 3.2);
    } else {
      g.rotate(this.theta * 0.55);
    }
    // moon rim-lit silhouette
    g.strokeStyle = '#0b0b12';
    g.fillStyle = '#0b0b12';
    g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -12); g.lineTo(0, -46); g.stroke();      // body
    g.beginPath(); g.arc(0, -56, 9, 0, Z.TAU); g.fill();                 // head
    g.beginPath(); g.moveTo(0, -12); g.lineTo(-7, 0); g.stroke();        // legs
    g.beginPath(); g.moveTo(0, -12); g.lineTo(7, 0); g.stroke();
    // balance pole
    g.strokeStyle = '#1c1c28';
    g.lineWidth = 3;
    g.save(); g.rotate(this.theta * 0.35);
    g.beginPath(); g.moveTo(-58, -38); g.lineTo(58, -38); g.stroke();
    g.restore();
    // rim light
    g.strokeStyle = 'rgba(220,228,250,0.35)';
    g.lineWidth = 1.5;
    g.beginPath(); g.arc(2, -56, 9, -1.2, 0.9); g.stroke();
    g.restore();

    // the jester
    const j = this.jester;
    if (j.state === 'taunt' || j.state === 'leap') {
      const jx = j.state === 'taunt' ? px - 90 : j.x;
      const jy = j.state === 'taunt' ? this.ropeY(this.progress - 0.11) - 2 : j.y + 40;
      g.save();
      g.translate(jx, jy);
      g.fillStyle = '#160c14';
      g.beginPath(); g.arc(0, -52, 8, 0, Z.TAU); g.fill();
      g.strokeStyle = '#160c14'; g.lineWidth = 4.5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(0, -46); g.lineTo(0, -14); g.stroke();
      const wave = Math.sin(this.t * 9) * 0.6;
      g.beginPath(); g.moveTo(0, -38); g.lineTo(-12, -26 + wave * 6); g.stroke();
      g.beginPath(); g.moveTo(0, -38); g.lineTo(12, -30 - wave * 6); g.stroke();
      g.beginPath(); g.moveTo(0, -14); g.lineTo(-8, 0); g.stroke();
      g.beginPath(); g.moveTo(0, -14); g.lineTo(8, 0); g.stroke();
      // cap bells
      g.fillStyle = '#7a2438';
      g.beginPath(); g.moveTo(-8, -56); g.lineTo(-14, -66); g.lineTo(-4, -58); g.fill();
      g.beginPath(); g.moveTo(8, -56); g.lineTo(14, -66); g.lineTo(4, -58); g.fill();
      g.restore();
    }

    // title on first seconds
    if (this.t < 4 && Z.save.data.loop === 1) {
      g.globalAlpha = Z.clamp(1 - (this.t - 2.6) / 1.2, 0, 1);
      g.font = '13px Georgia, serif';
      g.textAlign = 'center';
      g.fillStyle = '#8a8fa8';
      g.fillText('man is a rope, tied between beast and overman — a rope over an abyss', 480, 66);
      g.globalAlpha = 1;
    }
  },
};
