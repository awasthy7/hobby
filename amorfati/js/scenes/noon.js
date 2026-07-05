// V — NOON. The child: innocence and forgetting, a new beginning, a game,
// a self-rolling wheel, a sacred Yes. Then the demon asks its question.
Z.scenes.noon = {
  enter() {
    this.t = 0;
    this.x = 200;
    this.walkT = 0;
    this.jumpY = 0; this.jumpV = 0;
    this.paint = [];          // blooms left by walking
    this.petals = [];
    this.paintScore = 0;
    this.phase = 'play';      // play -> bell -> question -> choice -> yes/no
    this.bellT = 0;
    this.choice = null;
    this.choiceT = 0;
    this.yesT = 0;
    this.wheelX = -100;
    this.hue = Math.random();
    Z.audio.startAmb('noon');
    const loop = Z.save.data.loop;
    Z.speak(loop === 1 ? [
      'V — NOON',
      'No commandments here. No burdens, no lantern, no ledges to believe in.',
      'There is nothing to win. There is only the meadow. Walk, and see what walking does.',
    ] : [
      'V — NOON',
      'The meadow again. It kept none of your old colors. It is not sentimental.',
    ], null, { quiet: true });
  },

  update(dt) {
    this.t += dt;
    const inp = Z.input;

    // the wheel rolls from itself
    this.wheelX += dt * 46;
    if (this.wheelX > 1100) this.wheelX = -140;

    for (const p of this.petals) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 60 * dt;
      p.rot += p.vr * dt; p.life -= dt;
    }
    this.petals = this.petals.filter(p => p.life > 0);

    if (this.phase === 'yes') {
      this.yesT += dt;
      if (this.yesT > 9) {
        Z.save.data.yes++;
        Z.save.newLoop();
        Z.go('title', { afterYes: true });
        this.phase = 'gone';
      }
      return;
    }
    if (this.phase === 'gone') return;

    if (this.phase === 'bell') {
      this.bellT += dt;
      if (this.bellT > 3) {
        this.phase = 'question';
        const loop = Z.save.data.loop;
        Z.speak([
          'The demon returns. It kept its appointment.',
          '“This life, as you have now lived it — the rope, the stones, the dragon, the tomb, the abyss, this meadow —”',
          '“— you will have to live it once more, and innumerable times more. Nothing new in it.”',
          '“Every pain and every joy, everything unutterably small and great, all in the same succession — even this moment, even this question.”',
          loop === 1
            ? '“Would you have it so? Would you have it all — again?”'
            : `“You have lived it ${loop} times now. I ask what I always ask: again?”`,
          'The demon gestures at the meadow. Two words are growing on the hills. Walk to your answer.',
        ], () => { this.phase = 'choice'; });
      }
      return;
    }

    // movement (play + choice phases)
    let vx = 0;
    if (inp.right) vx = 175;
    if (inp.left) vx = -175;
    this.x = Z.clamp(this.x + vx * dt, 60, 900);
    if (vx) this.walkT += dt;

    // jump scatter
    if (inp.up && this.jumpY === 0) { this.jumpV = -300; this.jumpY = -0.01; }
    if (this.jumpY < 0 || this.jumpV < 0) {
      this.jumpY += this.jumpV * dt; this.jumpV += 900 * dt;
      if (this.jumpY >= 0) {
        this.jumpY = 0; this.jumpV = 0;
        for (let i = 0; i < 10; i++) this.spawnPetal(this.x, 470);
        Z.audio.sfx('paint', { vol: 0.6 });
      }
    }

    if (this.phase === 'play') {
      // walking paints
      if (vx !== 0 && this.jumpY === 0 && Math.floor(this.walkT * 7) !== Math.floor((this.walkT - dt) * 7)) {
        this.hue = (this.hue + 0.013) % 1;
        this.paint.push({ x: this.x + Z.rand(-8, 8), y: 470 + Z.rand(-4, 10), r: Z.rand(4, 11), hue: this.hue, born: this.t });
        this.paintScore++;
        if (this.paintScore % 6 === 0) Z.audio.sfx('paint', { vol: 0.35 });
      }
      // chord
      if (inp.spacePressed) {
        Z.audio.sfx('chord');
        for (let i = 0; i < 16; i++) this.spawnPetal(this.x, 430 - Math.random() * 60);
        this.hue = (this.hue + 0.09) % 1;
      }
      // the bell tolls when the meadow has been played with
      if (this.paintScore > 120 && this.t > 40) {
        this.phase = 'bell';
        this.bellT = 0;
        Z.audio.sfx('bellNoon');
        Z.audio.stopAmb();
      }
    }

    if (this.phase === 'choice') {
      const nearNo = this.x < 170;
      const nearYes = this.x > 790;
      if (nearNo || nearYes) {
        this.choiceT += dt;
        if (this.choiceT > 2) {
          if (nearYes) {
            this.phase = 'yes';
            this.yesT = 0;
            Z.audio.sfx('yes');
          } else {
            this.phase = 'gone';
            Z.audio.sfx('crumble');
            Z.speak([
              'An honest No. The demon nods; it is not offended. It has time.',
              'The rope is where you left it. It is always where you left it.',
              'Once more.',
            ], () => { Z.save.newLoop(); Z.go('rope'); });
          }
        }
      } else this.choiceT = 0;
    }
  },

  spawnPetal(x, y) {
    this.petals.push({
      x, y: y - 20, vx: Z.rand(-90, 90), vy: Z.rand(-160, -40),
      vr: Z.rand(-4, 4), rot: Math.random() * Z.TAU,
      hue: (this.hue + Z.rand(-0.08, 0.08) + 1) % 1, life: Z.rand(1.4, 2.8),
    });
  },

  hsl(h, s, l, a = 1) { return `hsla(${h * 360 | 0},${s}%,${l}%,${a})`; },

  draw(g) {
    const t = this.t;
    const yesGold = this.phase === 'yes' ? Math.min(1, this.yesT / 3) : 0;
    // white-gold sky
    const sky = g.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, this.phase === 'bell' || this.phase === 'question' ? '#efe9da' : '#f6f0e0');
    sky.addColorStop(0.72, '#efe0bc');
    sky.addColorStop(1, '#e6d3a6');
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);
    // the sun at its highest — no shadows at noon
    const sg = g.createRadialGradient(480, 90, 8, 480, 90, 220);
    sg.addColorStop(0, 'rgba(255,250,230,1)');
    sg.addColorStop(0.25, 'rgba(255,244,200,0.7)');
    sg.addColorStop(1, 'rgba(255,244,200,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(480, 90, 220, 0, Z.TAU); g.fill();
    g.fillStyle = '#fffaf0';
    g.beginPath(); g.arc(480, 90, 42, 0, Z.TAU); g.fill();

    // hills
    g.fillStyle = '#e0c98e';
    g.beginPath();
    g.moveTo(0, 540);
    for (let x = 0; x <= 960; x += 16) {
      g.lineTo(x, 430 + Z.noise1(x * 0.005, 31) * 26 - Math.sin(x * 0.004) * 12);
    }
    g.lineTo(960, 540); g.fill();
    g.fillStyle = '#d9bd7e';
    g.fillRect(0, 470, 960, 70);

    // the paint you have walked into the world
    for (const p of this.paint) {
      const age = t - p.born;
      const bloom = Math.min(1, age * 1.4);
      g.globalAlpha = 0.75;
      g.fillStyle = this.hsl(p.hue, 62, 58);
      g.beginPath(); g.arc(p.x, p.y, p.r * bloom, 0, Z.TAU); g.fill();
      if (age > 0.5) {
        // it grows a stem and becomes a flower
        g.strokeStyle = this.hsl(0.32, 40, 42, 0.8);
        g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x, p.y - 8 - p.r * 0.8); g.stroke();
        g.fillStyle = this.hsl(p.hue, 70, 66);
        for (let k = 0; k < 5; k++) {
          const a = k / 5 * Z.TAU + p.hue * 9;
          g.beginPath();
          g.ellipse(p.x + Math.cos(a) * 4, p.y - 8 - p.r * 0.8 + Math.sin(a) * 4, 3, 1.8, a, 0, Z.TAU);
          g.fill();
        }
      }
    }
    g.globalAlpha = 1;

    // petals in the air
    for (const p of this.petals) {
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.rot);
      g.globalAlpha = Z.clamp(p.life, 0, 1) * 0.85;
      g.fillStyle = this.hsl(p.hue, 68, 64);
      g.beginPath(); g.ellipse(0, 0, 5, 2.6, 0, 0, Z.TAU); g.fill();
      g.restore();
    }
    g.globalAlpha = 1;

    // the self-rolling wheel
    g.save();
    g.translate(this.wheelX, 452);
    g.rotate(this.wheelX * 0.04);
    g.strokeStyle = 'rgba(120,90,40,0.85)';
    g.lineWidth = 3;
    g.beginPath(); g.arc(0, 0, 20, 0, Z.TAU); g.stroke();
    for (let i = 0; i < 4; i++) {
      g.beginPath(); g.moveTo(0, 0);
      g.lineTo(Math.cos(i * Math.PI / 2) * 20, Math.sin(i * Math.PI / 2) * 20);
      g.stroke();
    }
    g.restore();
    // the child, far off, playing at nothing in particular
    const chx = 700 + Math.sin(t * 0.5) * 60;
    g.save();
    g.translate(chx, 440);
    g.scale(0.6, 0.6);
    g.strokeStyle = 'rgba(90,70,40,0.75)'; g.fillStyle = 'rgba(90,70,40,0.75)';
    g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -30); g.stroke();
    g.beginPath(); g.arc(0, -39, 8, 0, Z.TAU); g.fill();
    const skip = Math.abs(Math.sin(t * 3.2)) * 8;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, 12 - skip); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(7, 12 - (8 - skip)); g.stroke();
    g.restore();

    // choice words on the hills
    if (this.phase === 'choice') {
      const pulse = 0.75 + Math.sin(t * 2) * 0.2;
      g.font = '900 44px Georgia, serif';
      g.textAlign = 'center';
      g.fillStyle = `rgba(90,74,52,${pulse})`;
      g.fillText('NO', 110, 400);
      g.fillStyle = `rgba(178,132,32,${pulse})`;
      g.fillText('YES', 850, 396);
      if (this.choiceT > 0) {
        g.strokeStyle = 'rgba(120,96,48,0.8)';
        g.lineWidth = 3;
        const cx2 = this.x < 480 ? 110 : 850;
        g.beginPath();
        g.arc(cx2, this.x < 480 ? 386 : 382, 46, -Math.PI / 2, -Math.PI / 2 + this.choiceT / 2 * Z.TAU);
        g.stroke();
      }
      g.font = 'italic 14px Georgia, serif';
      g.fillStyle = 'rgba(100,84,56,0.8)';
      g.fillText('stand with your answer', 480, 500);
    }

    // player
    const bob = Math.sin(this.walkT * 6.4) * 1.8;
    g.save();
    g.translate(this.x, 470 + this.jumpY + bob * 0.3);
    g.strokeStyle = '#3a2c18'; g.fillStyle = '#3a2c18';
    g.lineWidth = 5.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
    g.beginPath(); g.arc(0, -45, 8, 0, Z.TAU); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6 - bob, 12); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6 + bob, 12); g.stroke();
    g.restore();

    // noon bell stillness
    if (this.phase === 'bell') {
      g.fillStyle = `rgba(246,240,224,${Math.min(0.5, this.bellT * 0.2)})`;
      g.fillRect(0, 0, 960, 540);
    }

    // THE YES
    if (this.phase === 'yes') {
      const y1 = Z.clamp(this.yesT / 2.5, 0, 1);
      const gold = g.createRadialGradient(480, 270, 20, 480, 270, 700 * y1 + 60);
      gold.addColorStop(0, `rgba(255,242,200,${0.9 * y1})`);
      gold.addColorStop(0.7, `rgba(240,196,90,${0.55 * y1})`);
      gold.addColorStop(1, 'rgba(240,196,90,0)');
      g.fillStyle = gold;
      g.fillRect(0, 0, 960, 540);
      if (this.yesT > 2.2) {
        const a = Z.clamp((this.yesT - 2.2) / 1.5, 0, 1);
        g.globalAlpha = a;
        g.font = '900 54px Georgia, serif';
        g.textAlign = 'center';
        g.fillStyle = '#5a4416';
        g.fillText('BECOME WHO YOU ARE', 480, 240);
        g.font = 'italic 20px Georgia, serif';
        g.fillStyle = '#7a5c22';
        const loop = Z.save.data.loop;
        g.fillText(`you lived this life ${loop === 1 ? 'once' : loop + ' times'} — and you said yes to all of it`, 480, 300);
        g.font = 'italic 16px Georgia, serif';
        g.fillText('amor fati', 480, 348);
        g.globalAlpha = 1;
      }
    }
  },
};
