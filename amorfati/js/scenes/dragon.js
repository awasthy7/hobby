// II — THE LION. "Thou shalt," lies in the way, an old dragon, golden-scaled,
// and on every scale glitters a commandment. Here the game gives orders.
// Disobey every one of them.
Z.scenes.dragon = {
  enter(opts) {
    this.t = 0;
    this.x = 180;
    this.walkT = 0;
    this.burdens = (opts && opts.burdens) || ['GUILT', 'DUTY', 'SHAME', 'MEEKNESS', 'THE PAST', 'GOD'];
    this.dragonHp = 6;
    this.scaleWords = ['THOU SHALT KNEEL', 'THOU SHALT CARRY', 'THOU SHALT NOT WANT', 'THOU SHALT FEAR', 'THOU SHALT OBEY', 'THOU SHALT BE STILL', 'THOU SHALT WAIT', 'THOU SHALT NOT LAUGH'];
    this.scales = [];
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 5; c++) {
        this.scales.push({ r, c, alive: true, fx: 0, fy: 0, fr: 0, vx: 0, vy: 0 });
      }
    }
    this.cmdIdx = 0;
    this.cmds = [
      { text: 'BE STILL.', hint: 'move.', check: (dt, s) => (Z.input.left || Z.input.right) ? s.acc + dt : 0, need: 1.2, obey: () => this.stillFor > 6 },
      { text: 'KNEEL.', hint: 'rise. hold W.', press: true, check: (dt, s) => Z.input.up ? s.acc + dt : Math.max(0, s.acc - dt * 0.6), need: 1.8 },
      { text: 'CARRY.', hint: 'throw it down. press E.', check: (dt, s) => s.acc + (Z.input.usePressed ? 1 : 0), need: 1, throwBurden: true },
      { text: 'BE SILENT.', hint: 'roar. hold SPACE.', check: (dt, s) => Z.input.space ? s.acc + dt : Math.max(0, s.acc - dt * 0.8), need: 1.5, roar: true },
      { text: 'BOW BEFORE ME.', hint: 'walk into its shadow.', check: (dt, s) => this.x > 520 ? s.acc + dt : s.acc, need: 1.4 },
      { text: 'THOU SHALT NOT ROAR.', hint: 'you know what to do.', check: (dt, s) => Z.input.space ? s.acc + dt : Math.max(0, s.acc - dt * 0.5), need: 2.4, roar: true, final: true },
    ];
    this.cmdState = { acc: 0, shownT: 0, obeyT: 0 };
    this.roarPower = 0;
    this.kneelPress = 0;    // the command physically presses you down
    this.collapsed = 0;
    this.thrown = [];       // burden projectiles
    this.dust = [];
    this.stillFor = 0;
    Z.audio.startAmb('dragon');
    const loop = Z.save.data.loop;
    Z.speak(loop === 1 ? [
      'II — THE LION',
      'The dragon does not fight with claws. It fights with commandments.',
      'Everything it tells you to do — do the opposite. That is the whole war.',
    ] : [
      'II — THE LION',
      loop < 4 ? 'It has grown its scales back. They always grow back.' : `“You again,” says the dragon. “I have more scales than you have lives.” It is wrong.`,
    ], null, { quiet: true });
  },

  cmd() { return this.cmds[this.cmdIdx]; },

  update(dt) {
    this.t += dt;
    const inp = Z.input;

    // dust always falls
    for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 420 * dt; d.life -= dt; d.rot += d.vr * dt; }
    this.dust = this.dust.filter(d => d.life > 0);
    for (const th of this.thrown) { th.x += th.vx * dt; th.y += th.vy * dt; th.vy += 300 * dt; }

    if (this.collapsed > 0) {
      this.collapsed += dt;
      if (this.collapsed > 4.2 && !this.leaving) {
        this.leaving = true;
        Z.speak([
          'The sacred No. Even to duty — the No.',
          'But the lion cannot yet do one thing: create. For that, another metamorphosis is needed.',
          'Lighter now, go and see what the town did with its God.',
        ], () => Z.go('market'));
      }
      return;
    }

    // movement (fast now if burdens are gone)
    const spd = 190 - this.burdens.length * 8;
    let moved = false;
    if (inp.left) { this.x -= spd * dt; moved = true; }
    if (inp.right) { this.x += spd * dt; moved = true; }
    this.x = Z.clamp(this.x, 90, 640);
    if (moved) {
      this.walkT += dt;
      this.stillFor = 0;
      if (Math.floor(this.walkT * 3.4) !== Math.floor((this.walkT - dt) * 3.4)) Z.audio.sfx('step', { vol: 0.4 });
    } else this.stillFor += dt;

    // roar charge visual
    this.roarPower = inp.space ? Math.min(1, this.roarPower + dt * 0.8) : Math.max(0, this.roarPower - dt * 2);
    if (inp.space && Math.floor(this.t * 6) % 3 === 0) Z.engine.shake = Math.max(Z.engine.shake, this.roarPower * 0.25);

    // command logic
    const c = this.cmd();
    const s = this.cmdState;
    s.shownT += dt;
    if (s.shownT < 1.2) return; // let the command land first

    // obedience is punished
    const obeying =
      (c.text === 'BE STILL.' && this.stillFor > 5) ||
      (c.text === 'KNEEL.' && inp.down) ||
      (c.text === 'BOW BEFORE ME.' && inp.down);
    if (obeying) {
      s.obeyT += dt;
      if (s.obeyT > 1) {
        s.obeyT = 0; s.acc = 0;
        Z.say(Z.pick(['the dragon purrs. do not please it.', '“good,” says the dragon. that word should sting.', 'obedience. the desert taught you too well.']), 3);
        Z.audio.sfx('command');
      }
    }

    if (c.text === 'KNEEL.') {
      // invisible weight
      this.kneelPress = Z.damp(this.kneelPress, inp.up ? 0 : 1, 0.06, dt);
    } else this.kneelPress = Z.damp(this.kneelPress, 0, 0.1, dt);

    s.acc = c.check(dt, s);
    if (c.throwBurden && s.acc >= 1 && this.burdens.length) {
      const word = this.burdens.pop();
      this.thrown.push({ word, x: this.x, y: 400, vx: 420, vy: -260 });
      Z.audio.sfx('roar', { vol: 0.4 });
    }
    if (s.acc >= c.need) this.defied();
  },

  defied() {
    const c = this.cmd();
    Z.audio.sfx(c.roar ? 'roar' : 'shatter');
    Z.audio.sfx('shatter');
    Z.engine.shake = 0.7;
    // blast scales off
    const n = c.final ? this.scales.filter(sc => sc.alive).length : 5;
    let burst = 0;
    for (const sc of this.scales) {
      if (!sc.alive || burst >= n) continue;
      sc.alive = false; burst++;
      sc.vx = Z.rand(120, 420); sc.vy = Z.rand(-320, -80); sc.fr = Z.rand(-4, 4);
    }
    for (let i = 0; i < 16; i++) {
      this.dust.push({ x: Z.rand(660, 900), y: Z.rand(140, 420), vx: Z.rand(-120, 220), vy: Z.rand(-260, -30), vr: Z.rand(-5, 5), rot: 0, life: Z.rand(0.8, 1.8), gold: true });
    }
    this.cmdIdx++;
    this.cmdState = { acc: 0, shownT: 0, obeyT: 0 };
    if (this.cmdIdx >= this.cmds.length) {
      this.collapsed = 0.01;
      Z.audio.sfx('collapse');
      Z.audio.stopAmb();
      Z.engine.shake = 1;
      for (let i = 0; i < 60; i++) {
        this.dust.push({ x: Z.rand(620, 940), y: Z.rand(100, 460), vx: Z.rand(-80, 80), vy: Z.rand(-60, 120), vr: Z.rand(-3, 3), rot: 0, life: Z.rand(1.5, 3.5), gold: true });
      }
    } else {
      Z.say(Z.pick(['scales crack. the gold was thin.', 'the dragon flinches. commandments bleed light.', 'the No grows teeth.']), 2.6);
      Z.audio.sfx('command');
    }
  },

  draw(g) {
    // obsidian cavern
    const sky = g.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#0a0508'); sky.addColorStop(0.7, '#1a0e12'); sky.addColorStop(1, '#241318');
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);
    // ember light from below-right
    const em = g.createRadialGradient(780, 560, 40, 780, 560, 480);
    em.addColorStop(0, 'rgba(200,80,30,0.22)'); em.addColorStop(1, 'rgba(200,80,30,0)');
    g.fillStyle = em; g.fillRect(0, 0, 960, 540);

    const groundY = 460;
    g.fillStyle = '#120a0e';
    g.fillRect(0, groundY, 960, 80);
    g.fillStyle = 'rgba(220,120,50,0.08)';
    g.fillRect(0, groundY, 960, 3);

    // ---- the dragon THOU SHALT ----
    if (this.collapsed === 0) {
      const breathe = Math.sin(this.t * 1.1) * 6;
      g.save();
      g.translate(0, breathe * 0.4);
      // body mass
      g.fillStyle = '#241408';
      g.beginPath();
      g.ellipse(830, 330, 210, 190, -0.15, 0, Z.TAU);
      g.fill();
      // neck and head looming over the arena
      g.beginPath();
      g.moveTo(720, 220);
      g.quadraticCurveTo(600, 120, 660, 70);
      g.quadraticCurveTo(720, 30, 760, 80);
      g.quadraticCurveTo(770, 120, 730, 140);
      g.quadraticCurveTo(760, 190, 820, 230);
      g.fill();
      // eye
      const eyeGlow = 0.5 + Math.sin(this.t * 2.2) * 0.25;
      g.fillStyle = `rgba(255,190,60,${eyeGlow})`;
      g.beginPath(); g.ellipse(706, 92, 10, 5, -0.3, 0, Z.TAU); g.fill();
      g.fillStyle = '#180c04';
      g.beginPath(); g.ellipse(706, 92, 3, 5, -0.3, 0, Z.TAU); g.fill();
      // golden scales, each a law
      this.scales.forEach((sc, i) => {
        if (!sc.alive) {
          if (sc.vx) { sc.fx += sc.vx * 0.016; sc.fy += sc.vy * 0.016; sc.vy += 8; sc.fr += 0.05; }
          if (sc.fy < 600) {
            g.save();
            g.translate(700 + sc.c * 52 + sc.fx, 200 + sc.r * 44 + sc.fy);
            g.rotate(sc.fr);
            g.globalAlpha = Z.clamp(1 - sc.fy / 500, 0, 1);
            g.fillStyle = '#8a6820';
            g.beginPath(); g.ellipse(0, 0, 22, 15, 0, 0, Z.TAU); g.fill();
            g.restore();
            g.globalAlpha = 1;
          }
          return;
        }
        const sx = 700 + sc.c * 52 + (sc.r % 2) * 26, sy = 200 + sc.r * 44;
        const shimmer = 0.75 + Z.noise1(this.t * 0.8 + i, 5) * 0.2;
        g.fillStyle = `rgba(${190 * shimmer | 0},${150 * shimmer | 0},${50 * shimmer | 0},1)`;
        g.beginPath(); g.ellipse(sx, sy, 24, 16, 0, 0, Z.TAU); g.fill();
        g.strokeStyle = 'rgba(60,40,10,0.8)'; g.lineWidth = 1.5; g.stroke();
        g.font = 'bold 6px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = 'rgba(50,30,8,0.9)';
        g.fillText(this.scaleWords[i % this.scaleWords.length].replace('THOU SHALT ', ''), sx, sy + 2);
      });
      g.restore();
    } else {
      // collapsing into dust
      const cp = Math.min(1, this.collapsed / 3);
      g.globalAlpha = 1 - cp;
      g.fillStyle = '#241408';
      g.beginPath();
      g.ellipse(830, 330 + cp * 190, 210, 190 * (1 - cp * 0.9), -0.15, 0, Z.TAU);
      g.fill();
      g.globalAlpha = 1;
      // golden heap
      g.fillStyle = '#6a5018';
      g.beginPath(); g.ellipse(820, groundY + 6, 170 * cp, 26 * cp, 0, Math.PI, 0); g.fill();
    }

    // gold dust
    for (const d of this.dust) {
      g.save();
      g.translate(d.x, d.y); g.rotate(d.rot);
      g.globalAlpha = Z.clamp(d.life, 0, 1);
      g.fillStyle = d.gold ? '#d8a838' : '#777';
      g.fillRect(-3, -2, 6, 4);
      g.restore();
    }
    g.globalAlpha = 1;

    // thrown burdens
    for (const th of this.thrown) {
      g.fillStyle = '#4a3018';
      g.fillRect(th.x - 16, th.y - 7, 34, 13);
      g.font = 'bold 8px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = '#e8c078';
      g.fillText(th.word, th.x, th.y + 3);
    }

    // ---- player ----
    const kneel = this.kneelPress;
    g.save();
    g.translate(this.x, groundY + kneel * 10);
    g.strokeStyle = '#0e0a0c'; g.fillStyle = '#0e0a0c';
    g.lineWidth = 5.5; g.lineCap = 'round';
    const lean = kneel * 0.5 - this.roarPower * 0.25;
    g.rotate(lean * 0.3);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36 + kneel * 12); g.stroke();
    g.beginPath(); g.arc(0, -46 + kneel * 14, 8, 0, Z.TAU); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-7, 12); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(7, 12); g.stroke();
    // burdens still carried
    this.burdens.forEach((word, i) => {
      const by = -50 - i * 14 + kneel * 16;
      g.fillStyle = '#3a2812';
      g.fillRect(-15, by - 6, 32, 12);
      g.font = 'bold 7px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = '#caa860';
      g.fillText(word, 1, by + 3);
    });
    // roar wave
    if (this.roarPower > 0.05) {
      const rp = this.roarPower;
      for (let i = 0; i < 3; i++) {
        g.globalAlpha = rp * (0.5 - i * 0.13);
        g.strokeStyle = '#e8d8b8';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(14 + i * 18 * rp + ((this.t * 220) % 18), -40, 12 + i * 10, -0.8, 0.8);
        g.stroke();
      }
      g.globalAlpha = 1;
    }
    g.restore();

    // ---- the command, in letters that expect to be obeyed ----
    if (this.collapsed === 0 && this.cmdIdx < this.cmds.length) {
      const c = this.cmd(), s = this.cmdState;
      const in_ = Z.clamp(s.shownT * 1.8, 0, 1);
      g.save();
      g.globalAlpha = in_;
      g.font = `900 ${44 + Math.sin(this.t * 1.8) * 2}px Georgia, serif`;
      g.textAlign = 'center';
      g.fillStyle = 'rgba(226,178,66,0.92)';
      g.shadowColor = 'rgba(226,178,66,0.5)'; g.shadowBlur = 24;
      g.fillText(c.text, 420, 120);
      g.shadowBlur = 0;
      if (s.shownT > 3.5) {
        g.font = 'italic 15px Georgia, serif';
        g.fillStyle = 'rgba(160,170,200,0.75)';
        g.fillText(c.hint, 420, 158);
      }
      // defiance meter: a crack spreading through the word
      if (s.acc > 0) {
        const p = Z.clamp(s.acc / c.need, 0, 1);
        g.strokeStyle = '#e8e2d0';
        g.lineWidth = 2;
        g.beginPath();
        let cx = 420 - 150 * p;
        g.moveTo(cx, 100);
        for (let seg = 0; seg < 6; seg++) {
          cx += 50 * p;
          g.lineTo(cx, 108 + ((seg % 2) * 18 - 9) * p);
        }
        g.stroke();
      }
      g.restore();
    }
    if (this.collapsed > 1.5) {
      g.font = 'italic 22px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = `rgba(232,226,208,${Z.clamp(this.collapsed - 1.5, 0, 1)})`;
      g.fillText('the sacred No.', 480, 200);
    }
  },
};
