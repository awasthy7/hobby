// III — THE MARKET. "Have you not heard of that madman who lit a lantern in
// the bright morning hours and cried incessantly: I seek God!" Inside the
// lantern's light, things are what they are. Outside, they smile.
Z.scenes.market = {
  WORLD: 3400,

  enter() {
    this.t = 0;
    this.x = 140;
    this.walkT = 0;
    this.cam = 0;
    this.inChurch = false;
    this.churchX = 2950;
    this.spokeT = 0;         // the proclamation
    this.spoken = Z.save.flag('spoken') && false; // resets each loop within run
    this.saidIt = false;
    this.lanternOut = false;
    this.leaveT = 0;
    this.crowd = [];
    for (let i = 0; i < 26; i++) {
      this.crowd.push({
        x: 400 + Math.random() * 2300,
        sway: Math.random() * 10,
        h: Z.rand(0.9, 1.1),
        hue: Z.pick(['#d8a8b8', '#a8c8d8', '#d8d0a0', '#b8d8a8']),
        laughT: Z.rand(2, 14),
        stare: false,
      });
    }
    this.lastManLines = [
      '“we have invented happiness,” they say, and blink.',
      '“one still works — for work is a form of entertainment.”',
      '“a little poison now and then: that makes pleasant dreams.”',
      '“what is love? what is creation? what is a star?” they ask, and blink.',
    ];
    this.lineT = 6;
    Z.audio.startAmb('market');
    const loop = Z.save.data.loop;
    Z.speak(loop === 1 ? [
      'III — THE MARKET',
      'A town where everyone is happy. Look at them being happy.',
      'You carry a lantern in the bright morning. It shows what light is for.',
    ] : [
      'III — THE MARKET',
      'The smiles are freshly painted. They remember nothing. You remember everything.',
    ], null, { quiet: true });
  },

  update(dt) {
    this.t += dt;
    const inp = Z.input;

    if (this.leaveT > 0) {
      this.leaveT += dt;
      if (this.leaveT > 3) {
        Z.speak([
          '“I have come too early,” you say. “My time is not yet.”',
          'Lightning and thunder need time. The light of the stars needs time. Deeds need time, even after they are done, to be seen and heard.',
          'Behind the church, where its shadow ends, the ground has opened.',
        ], () => Z.go('abyss'));
      }
      return;
    }

    if (this.spokeT > 0) {
      this.spokeT += dt;
      if (this.spokeT > 6.5 && !this.saidIt) {
        this.saidIt = true;
        this.spoken = true;
        for (const c of this.crowd) c.stare = true;
        Z.audio.sfx('silence');
      }
      if (this.spokeT > 8) {
        this.spokeT = 0;
        this.inChurch = false;
        this.lanternOut = true;
        Z.say('the lantern goes out. it is morning, and dark anyway.', 4);
      }
      return;
    }

    // walking
    let vx = 0;
    if (inp.right) vx = 165;
    if (inp.left) vx = -165;
    this.x = Z.clamp(this.x + vx * dt, 80, this.WORLD - 60);
    if (vx) {
      this.walkT += dt;
      if (Math.floor(this.walkT * 3.2) !== Math.floor((this.walkT - dt) * 3.2)) Z.audio.sfx('step', { vol: 0.35 });
    }

    if (!this.inChurch) {
      // crowd
      this.lineT -= dt;
      if (this.lineT <= 0 && !this.saidIt) {
        this.lineT = Z.rand(7, 12);
        Z.say(Z.pick(this.lastManLines), 4);
      }
      for (const c of this.crowd) {
        c.laughT -= dt;
        if (c.laughT <= 0 && !this.saidIt) {
          c.laughT = Z.rand(6, 18);
          if (Math.abs(c.x - this.x) < 500) Z.audio.sfx('laugh', { vol: Z.clamp(1 - Math.abs(c.x - this.x) / 500, 0.1, 0.6) });
          c.laughing = 1;
        }
        c.laughing = Math.max(0, (c.laughing || 0) - dt * 0.7);
      }
      // church door
      if (Math.abs(this.x - this.churchX) < 50 && inp.usePressed) {
        this.inChurch = true;
        this.x = 200;
        Z.audio.startAmb('churchyard');
        Z.say('it is colder in here than outside.', 3.5);
      }
      // after speaking: leave the square
      if (this.saidIt && this.x < 400) {
        this.leaveT = 0.01;
        Z.audio.stopAmb();
      }
    } else {
      // inside the church
      this.x = Z.clamp(this.x, 120, 840);
      const atAltar = Math.abs(this.x - 700) < 60;
      if (atAltar && inp.use && !this.saidIt) {
        this.spokeT += dt;
        if (this.spokeT > 0.9 && !this.speaking) {
          this.speaking = true;
          this.spokeT = 1;
          Z.audio.sfx('speak');
          Z.audio.stopAmb();
        }
      } else if (!this.speaking) this.spokeT = 0;
      // exit door
      if (this.x < 140 && inp.usePressed) {
        this.inChurch = false;
        this.x = this.churchX - 80;
        Z.audio.startAmb('market');
      }
    }
    this.cam = this.inChurch ? 0 : Z.clamp(this.x - 420, 0, this.WORLD - 960);
  },

  // Two-pass rendering: the painted world, then the true world inside the
  // lantern circle.
  draw(g) {
    if (this.inChurch) { this.drawChurch(g); return; }
    this.drawTown(g, false);
    if (!this.lanternOut && !this.saidIt) {
      const px = this.x - this.cam;
      g.save();
      g.beginPath();
      g.arc(px, 360, 130 + Math.sin(this.t * 2.4) * 5, 0, Z.TAU);
      g.clip();
      this.drawTown(g, true);
      g.restore();
      // lantern glow rim
      const lg = g.createRadialGradient(px, 360, 90, px, 360, 150);
      lg.addColorStop(0, 'rgba(255,220,140,0)');
      lg.addColorStop(0.85, 'rgba(255,220,140,0.12)');
      lg.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = lg;
      g.beginPath(); g.arc(px, 360, 150, 0, Z.TAU); g.fill();
    } else if (this.saidIt) {
      // truth everywhere now
      this.drawTown(g, true);
    }
    this.drawPlayer(g);
  },

  drawTown(g, truth) {
    const cam = this.cam;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, 540);
    if (truth) { sky.addColorStop(0, '#2e3138'); sky.addColorStop(1, '#3c3e44'); }
    else { sky.addColorStop(0, '#a8b4c4'); sky.addColorStop(1, '#c8c4b4'); }
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);
    // pale sun
    g.fillStyle = truth ? 'rgba(200,204,214,0.25)' : 'rgba(255,252,240,0.8)';
    g.beginPath(); g.arc(220 - cam * 0.02, 110, 34, 0, Z.TAU); g.fill();

    const groundY = 452;
    // houses
    for (let i = 0; i < 14; i++) {
      const hx = i * 260 - cam * 0.8;
      if (hx < -240 || hx > 1100) continue;
      const hh = 130 + (i % 3) * 40;
      g.fillStyle = truth ? '#34343c' : ['#c8a8a0', '#a8b8c0', '#c0bca0', '#b0a8c0'][i % 4];
      g.fillRect(hx, groundY - hh - 60, 200, hh);
      g.fillStyle = truth ? '#26262e' : '#8a7468';
      g.beginPath();
      g.moveTo(hx - 10, groundY - hh - 60);
      g.lineTo(hx + 100, groundY - hh - 118);
      g.lineTo(hx + 210, groundY - hh - 60);
      g.fill();
      // windows: lit vs hollow
      for (let wgi = 0; wgi < 3; wgi++) {
        g.fillStyle = truth ? '#111116' : 'rgba(255,236,170,0.85)';
        g.fillRect(hx + 30 + wgi * 55, groundY - hh - 20, 26, 34);
      }
      // bunting between houses
      if (!truth) {
        g.strokeStyle = 'rgba(160,120,120,0.6)';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(hx + 200, groundY - hh - 40);
        g.quadraticCurveTo(hx + 230, groundY - hh + 4, hx + 260, groundY - hh - 44);
        g.stroke();
        for (let b = 0; b < 4; b++) {
          g.fillStyle = ['#d86a6a', '#6ad8b0', '#e8d86a'][b % 3];
          g.beginPath();
          g.moveTo(hx + 208 + b * 14, groundY - hh - 32 + b * 4);
          g.lineTo(hx + 214 + b * 14, groundY - hh - 20 + b * 4);
          g.lineTo(hx + 220 + b * 14, groundY - hh - 34 + b * 4);
          g.fill();
        }
      } else {
        // the bunting is rags
        g.strokeStyle = 'rgba(70,66,66,0.7)';
        g.beginPath();
        g.moveTo(hx + 200, groundY - hh - 40);
        g.quadraticCurveTo(hx + 230, groundY - hh + 12, hx + 260, groundY - hh - 44);
        g.stroke();
      }
    }

    // the church at the end
    const chx = this.churchX - cam;
    if (chx > -300 && chx < 1200) {
      g.fillStyle = truth ? '#222228' : '#b8b4ac';
      g.fillRect(chx - 90, groundY - 240, 180, 240);
      g.beginPath();
      g.moveTo(chx - 100, groundY - 240);
      g.lineTo(chx, groundY - 330);
      g.lineTo(chx + 100, groundY - 240);
      g.fill();
      g.fillRect(chx - 16, groundY - 380, 32, 60);
      // the cross atop: in truth-light, it tilts
      g.save();
      g.translate(chx, groundY - 388);
      if (truth) g.rotate(0.35);
      g.fillRect(-4, -34, 8, 34);
      g.fillRect(-15, -24, 30, 8);
      g.restore();
      // door
      g.fillStyle = truth ? '#0c0c10' : '#5a4838';
      g.beginPath();
      g.moveTo(chx - 26, groundY);
      g.lineTo(chx - 26, groundY - 60);
      g.quadraticCurveTo(chx, groundY - 88, chx + 26, groundY - 60);
      g.lineTo(chx + 26, groundY);
      g.fill();
      if (Math.abs(this.x - this.churchX) < 50 && !this.saidIt) {
        g.font = '13px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = truth ? '#c8ccd8' : '#3a3630';
        g.fillText('E — enter', chx, groundY - 100);
      }
      if (truth) {
        g.font = 'italic 11px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = 'rgba(150,150,160,0.7)';
        g.fillText('what are these churches now, if not tombs?', chx, groundY - 250);
      }
    }

    // ground
    g.fillStyle = truth ? '#2a2a30' : '#a89c84';
    g.fillRect(0, groundY, 960, 90);

    // crowd
    for (const c of this.crowd) {
      const cx = c.x - cam;
      if (cx < -40 || cx > 1000) continue;
      const sway = Math.sin(this.t * 1.2 + c.sway) * 3;
      const bounce = (c.laughing || 0) * Math.abs(Math.sin(this.t * 10)) * 4;
      g.save();
      g.translate(cx + sway, groundY - bounce);
      const bodyC = truth ? '#3c3c44' : c.hue;
      g.fillStyle = bodyC;
      g.fillRect(-9, -46 * c.h, 18, 46 * c.h);
      // head
      g.fillStyle = truth ? '#4a4a52' : '#e8d4bc';
      g.beginPath(); g.arc(0, -52 * c.h, 9, 0, Z.TAU); g.fill();
      if (truth) {
        // hollow: the smile is a mask, slightly ajar
        g.fillStyle = '#e8d4bc';
        g.beginPath(); g.arc(4, -50 * c.h, 8, -0.4, 1.9); g.fill();
        g.fillStyle = '#0e0e12';
        g.beginPath(); g.arc(-2, -54 * c.h, 2.4, 0, Z.TAU); g.fill();
        if (c.stare) {
          g.fillStyle = '#0e0e12';
          g.fillRect(-5, -55 * c.h, 3, 4); g.fillRect(2, -55 * c.h, 3, 4);
        }
      } else {
        // painted smile
        g.strokeStyle = '#a04848'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(0, -52 * c.h, 5, 0.25, Math.PI - 0.25); g.stroke();
        g.fillStyle = '#404048';
        g.fillRect(-4, -55 * c.h, 2, 2.4); g.fillRect(2, -55 * c.h, 2, 2.4);
      }
      g.restore();
    }
  },

  drawChurch(g) {
    // nave interior: one shaft of light, dust, a tomb
    g.fillStyle = '#0b0a0e'; g.fillRect(0, 0, 960, 540);
    const groundY = 470;
    // columns
    for (let i = 0; i < 5; i++) {
      g.fillStyle = '#16141c';
      g.fillRect(90 + i * 190, 80, 34, groundY - 80);
    }
    // light shaft on the altar
    g.save();
    g.globalAlpha = 0.16 + Math.sin(this.t * 0.8) * 0.02;
    g.fillStyle = '#cdd4e8';
    g.beginPath();
    g.moveTo(640, 0); g.lineTo(560, groundY); g.lineTo(830, groundY); g.lineTo(760, 0);
    g.fill();
    g.restore();
    // dust motes
    for (let i = 0; i < 24; i++) {
      const mx = 600 + Z.noise1(this.t * 0.14 + i * 3.7, 9) * 120;
      const my = (this.t * 9 + i * 61) % 470;
      g.fillStyle = 'rgba(210,216,232,0.35)';
      g.fillRect(mx, my, 1.6, 1.6);
    }
    // the altar-tomb
    g.fillStyle = '#211e28';
    g.fillRect(620, groundY - 78, 170, 78);
    g.fillStyle = '#2c2836';
    g.fillRect(620, groundY - 78, 170, 10);
    g.font = 'italic 15px Georgia, serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(190,196,214,0.7)';
    g.fillText('H E R E   L I E S —', 705, groundY - 44);
    // fallen cross against the wall
    g.save();
    g.translate(860, groundY - 12);
    g.rotate(1.15);
    g.fillStyle = '#302c3a';
    g.fillRect(-6, -70, 12, 70);
    g.fillRect(-24, -52, 48, 12);
    g.restore();
    // exit door glow
    g.fillStyle = 'rgba(200,190,160,0.14)';
    g.beginPath();
    g.moveTo(96, groundY); g.lineTo(96, groundY - 70);
    g.quadraticCurveTo(124, groundY - 96, 152, groundY - 70);
    g.lineTo(152, groundY); g.fill();
    g.fillStyle = '#0b0a0e';
    g.font = '11px Georgia, serif';
    g.fillText('E — leave', 124, groundY - 30);

    g.fillStyle = '#131118';
    g.fillRect(0, groundY, 960, 70);

    this.drawPlayer(g, true);

    // the proclamation
    const atAltar = Math.abs(this.x - 700) < 60;
    if (atAltar && !this.saidIt && this.spokeT === 0) {
      g.font = '13px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = 'rgba(200,206,224,0.85)';
      g.fillText('hold E — say what you came to say', 700, groundY - 110);
    }
    if (this.spokeT > 1) {
      const text = 'God is dead. God remains dead. And we have killed him — you and I.';
      const shown = text.slice(0, Math.floor((this.spokeT - 1) * 14));
      g.font = '26px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = '#dfe2ee';
      const words = shown.split(' ');
      let lines = [''];
      for (const w of words) {
        const t2 = lines[lines.length - 1] + (lines[lines.length - 1] ? ' ' : '') + w;
        if (g.measureText(t2).width > 700) lines.push(w);
        else lines[lines.length - 1] = t2;
      }
      lines.forEach((l, i) => g.fillText(l, 480, 200 + i * 40));
    }
  },

  drawPlayer(g, inChurch) {
    const px = inChurch ? this.x : this.x - this.cam;
    const groundY = inChurch ? 470 : 452;
    const bob = Math.sin(this.walkT * 6.4) * 1.6;
    g.save();
    g.translate(px, groundY + bob * 0.3);
    g.strokeStyle = '#101014'; g.fillStyle = '#101014';
    g.lineWidth = 5.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -36); g.stroke();
    g.beginPath(); g.arc(0, -45, 8, 0, Z.TAU); g.fill();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(-6 - bob, 12); g.stroke();
    g.beginPath(); g.moveTo(0, 0); g.lineTo(6 + bob, 12); g.stroke();
    // the lantern arm
    if (!this.lanternOut) {
      g.beginPath(); g.moveTo(0, -30); g.lineTo(15, -20); g.stroke();
      g.strokeStyle = '#3c3222'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(15, -20); g.lineTo(15, -12); g.stroke();
      const flick = 0.8 + Z.noise1(this.t * 6, 11) * 0.15;
      g.fillStyle = `rgba(255,214,120,${flick})`;
      g.fillRect(11, -12, 8, 11);
      g.strokeStyle = '#2a241c';
      g.strokeRect(10.5, -12.5, 9, 12);
    } else {
      g.beginPath(); g.moveTo(0, -30); g.lineTo(13, -16); g.stroke();
      g.fillStyle = '#1c1a18';
      g.fillRect(9, -14, 8, 11);
    }
    g.restore();
  },
};
