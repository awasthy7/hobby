// I — THE CAMEL. What is heavy? asks the spirit that would bear much,
// and kneels down like a camel wanting to be well loaded.
Z.scenes.desert = {
  WORLD: 5200,

  enter() {
    this.t = 0;
    this.x = 120;
    this.walkT = 0;
    this.burdens = [];       // words on your back
    this.kneelT = 0;         // interaction kneel animation
    this.endKneel = 0;       // the final, scripted kneel
    this.cam = 0;
    const loop = Z.save.data.loop;
    this.tablets = [
      { x: 700, word: 'GUILT', taken: false },
      { x: 1500, word: 'DUTY', taken: false },
      { x: 2200, word: 'SHAME', taken: false },
      { x: 3100, word: 'MEEKNESS', taken: false },
      { x: 3900, word: 'THE PAST', taken: false },
      { x: 4500, word: 'GOD', taken: false },
    ];
    this.refuseTablet = { x: 2650, word: loop >= 3 ? 'AGAIN?' : 'REFUSE' };
    this.gates = [
      { x: 1900, need: 2 },
      { x: 3500, need: 4 },
      { x: 4800, need: 6 },
    ];
    Z.audio.startAmb('desert');
    Z.speak(loop === 1 ? [
      'I — THE CAMEL',
      'What is heavy? asks the spirit that would bear much. The desert answers with stone.',
      'Kneel where you are told. Carry what you are given. This is called virtue here.',
    ] : [
      'I — THE CAMEL',
      'The same stones. You already know their names by heart.',
    ], null, { quiet: true });
    Z.say('walk with A / D · kneel and take with E', 5);
  },

  speed() { return 170 * (1 - Math.min(0.66, this.burdens.length * 0.11)); },

  update(dt) {
    this.t += dt;
    const inp = Z.input;

    if (this.endKneel > 0) {
      this.endKneel += dt;
      if (this.endKneel > 3.4) {
        this.endKneel = -1;
        Z.speak([
          'And the great dragon said: all values have already been created — and all created value, that am I.',
          '“Thou shalt” lies in your path, scale upon golden scale.',
          'The camel has carried enough. Something else is needed now.',
        ], () => Z.go('dragon', { burdens: this.burdens.slice() }));
      }
      return;
    }
    if (this.endKneel < 0) return;

    if (this.kneelT > 0) { this.kneelT -= dt; return; }

    let vx = 0;
    if (inp.right) vx = this.speed();
    if (inp.left) vx = -this.speed() * 0.8;
    // gates refuse the unladen
    for (const gate of this.gates) {
      if (this.burdens.length < gate.need &&
          this.x < gate.x && this.x + vx * dt > gate.x - 70) {
        vx = 0;
        if (!gate.warned || this.t - gate.warned > 3) {
          gate.warned = this.t;
          Z.say(`the arch is shut. it reads: ONLY THE LADEN MAY PASS — you carry ${this.burdens.length} of ${gate.need}.`, 3.6);
          Z.audio.sfx('kneel', { vol: 0.4 });
        }
      }
    }
    this.x = Z.clamp(this.x + vx * dt, 60, this.WORLD - 40);
    if (vx !== 0) {
      this.walkT += dt;
      if (Math.floor(this.walkT * 3.2) !== Math.floor((this.walkT - dt) * 3.2)) Z.audio.sfx('sandstep', { vol: 0.6 });
    }

    // tablets
    if (inp.usePressed) {
      const near = this.tablets.find(tb => !tb.taken && Math.abs(tb.x - this.x) < 60);
      if (near) {
        near.taken = true;
        this.burdens.push(near.word);
        this.kneelT = 1.1;
        Z.audio.sfx('tablet');
        Z.audio.sfx('burden');
        Z.say(near.word === 'GOD' ? 'you take GOD onto your back. it is the heaviest.' : `you kneel. you take ${near.word}.`, 3);
      } else if (Math.abs(this.refuseTablet.x - this.x) < 60) {
        Z.audio.sfx('kneel', { vol: 0.3 });
        Z.say(Z.save.data.loop === 1
          ? 'nothing happens. not yet. the lion has not come.'
          : 'you remember this stone. soon.', 3.4);
      }
    }

    // the end: the dragon's shadow
    if (this.x > this.WORLD - 260 && this.burdens.length >= 6) {
      this.endKneel = 0.01;
      Z.audio.sfx('kneel');
      Z.audio.stopAmb();
    }

    this.cam = Z.clamp(this.x - 380, 0, this.WORLD - 960);
  },

  draw(g) {
    const t = this.t;
    // sky: heat in bands
    const sky = g.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#c96f2e'); sky.addColorStop(0.45, '#e0a04c');
    sky.addColorStop(0.72, '#e8bc72'); sky.addColorStop(1, '#caa060');
    g.fillStyle = sky; g.fillRect(0, 0, 960, 540);
    // sun — a white, watching disc
    g.fillStyle = 'rgba(255,246,224,0.92)';
    g.beginPath(); g.arc(660 - this.cam * 0.02, 150, 46, 0, Z.TAU); g.fill();
    const sg = g.createRadialGradient(660 - this.cam * 0.02, 150, 40, 660 - this.cam * 0.02, 150, 190);
    sg.addColorStop(0, 'rgba(255,240,210,0.5)'); sg.addColorStop(1, 'rgba(255,240,210,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(660 - this.cam * 0.02, 150, 190, 0, Z.TAU); g.fill();

    // dunes: three parallax silhouettes
    const dune = (par, base, color) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(0, 540);
      for (let sx = 0; sx <= 960; sx += 16) {
        const wx = sx + this.cam * par;
        g.lineTo(sx, base + Z.noise1(wx * 0.004, par * 100) * 34 + Z.noise1(wx * 0.013, par * 55) * 10);
      }
      g.lineTo(960, 540);
      g.fill();
    };
    dune(0.25, 330, '#d99a4e');
    dune(0.55, 388, '#c37f3c');
    dune(1, 446, '#a5602c');

    // heat shimmer
    for (let i = 0; i < 3; i++) {
      g.globalAlpha = 0.05;
      g.fillStyle = '#fff';
      const yy = 330 + i * 24 + Math.sin(t * 2 + i) * 3;
      g.fillRect(0, yy, 960, 2);
    }
    g.globalAlpha = 1;

    const groundY = 470;

    // gates
    for (const gate of this.gates) {
      const gx = gate.x - this.cam;
      if (gx < -120 || gx > 1080) continue;
      const open = this.burdens.length >= gate.need;
      g.fillStyle = '#6a4326';
      g.fillRect(gx - 64, groundY - 170, 22, 170);
      g.fillRect(gx + 42, groundY - 170, 22, 170);
      if (!open) {
        g.fillRect(gx - 64, groundY - 190, 128, 26);
        g.font = '10px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = '#f0d8a8';
        g.fillText('ONLY THE LADEN MAY PASS', gx, groundY - 174);
      } else {
        g.fillStyle = 'rgba(106,67,38,0.45)';
        g.fillRect(gx - 64, groundY - 190, 128, 26);
      }
    }

    // tablets
    const drawTablet = (tb, taken, special) => {
      const tx = tb.x - this.cam;
      if (tx < -80 || tx > 1040) return;
      g.fillStyle = taken ? '#7a5c38' : '#8a683e';
      g.fillRect(tx - 26, groundY - 64, 52, 64);
      g.fillStyle = taken ? '#6a4e30' : '#795a34';
      g.fillRect(tx - 26, groundY - 64, 52, 8);
      if (!taken) {
        const glow = 0.55 + Math.sin(t * 2 + tb.x) * 0.2;
        g.font = 'bold 11px Georgia, serif'; g.textAlign = 'center';
        g.fillStyle = special ? `rgba(150,190,255,${glow})` : `rgba(255,226,150,${glow})`;
        g.fillText(tb.word, tx, groundY - 34);
        if (Math.abs(tb.x - this.x) < 60) {
          g.font = '12px Georgia, serif';
          g.fillStyle = 'rgba(30,20,12,0.85)';
          g.fillText('E', tx, groundY - 76);
        }
      }
    };
    for (const tb of this.tablets) drawTablet(tb, tb.taken, false);
    drawTablet(this.refuseTablet, false, true);

    // the dragon on the horizon, at the end
    const endX = this.WORLD - 120 - this.cam;
    if (endX < 1200) {
      g.save();
      g.globalAlpha = 0.85;
      g.fillStyle = '#3a2410';
      g.beginPath();
      g.ellipse(endX + 60, groundY - 60, 150, 90, 0, Math.PI, 0);
      g.fill();
      // neck + head
      g.beginPath();
      g.moveTo(endX - 60, groundY - 90);
      g.quadraticCurveTo(endX - 130, groundY - 220, endX - 40, groundY - 250);
      g.quadraticCurveTo(endX + 8, groundY - 262, endX + 6, groundY - 228);
      g.quadraticCurveTo(endX - 60, groundY - 170, endX - 10, groundY - 80);
      g.fill();
      // golden glints
      g.fillStyle = `rgba(240,200,90,${0.4 + Math.sin(t * 1.4) * 0.2})`;
      for (let i = 0; i < 8; i++) {
        g.fillRect(endX - 30 + (i % 4) * 34, groundY - 130 + Math.floor(i / 4) * 30, 5, 5);
      }
      g.restore();
    }

    // ground line
    g.fillStyle = '#8a4e24';
    g.fillRect(0, groundY, 960, 70);
    g.fillStyle = 'rgba(60,32,14,0.35)';
    for (let sx = 0; sx < 960; sx += 24) {
      g.fillRect(sx + ((this.cam * 0.7) % 24), groundY + 8 + (sx % 3) * 14, 10, 2);
    }

    // ------- the player, bent by weight -------
    const px = this.x - this.cam;
    const kneeling = this.kneelT > 0 || this.endKneel !== 0;
    const bend = Math.min(0.85, this.burdens.length * 0.13) + (kneeling ? 0.5 : 0);
    const bob = Math.sin(this.walkT * 6.4) * 2;
    g.save();
    g.translate(px, groundY + (kneeling ? 8 : 0) + bob * 0.4);
    // long shadow, longer with every burden
    g.fillStyle = 'rgba(60,30,10,0.3)';
    g.beginPath();
    g.ellipse(-26 - this.burdens.length * 9, 4, 30 + this.burdens.length * 12, 6, 0, 0, Z.TAU);
    g.fill();
    g.rotate(-bend * 0.4);
    g.strokeStyle = '#2a1a10'; g.fillStyle = '#2a1a10';
    g.lineWidth = 5.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -34 + bend * 10); g.stroke();
    g.beginPath(); g.arc(3 + bend * 8, -42 + bend * 14, 8, 0, Z.TAU); g.fill();
    if (!kneeling) {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-6 - bob, 12); g.stroke();
      g.beginPath(); g.moveTo(0, 0); g.lineTo(6 + bob, 12); g.stroke();
    } else {
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-8, 10); g.stroke();
      g.beginPath(); g.moveTo(0, 2); g.lineTo(8, 8); g.stroke();
    }
    // the stack of burdens
    this.burdens.forEach((word, i) => {
      const by = -46 - i * 15 + bend * 16 + Math.sin(t * 1.8 + i) * 1;
      g.fillStyle = '#4a3018';
      g.fillRect(-16, by - 6, 34, 13);
      g.font = 'bold 8px Georgia, serif'; g.textAlign = 'center';
      g.fillStyle = '#e8c078';
      g.fillText(word, 1, by + 3);
    });
    g.restore();

    // burden counter
    g.font = '13px Georgia, serif'; g.textAlign = 'left';
    g.fillStyle = 'rgba(40,22,10,0.75)';
    g.fillText(`carried: ${this.burdens.length} / 6`, 26, 52);
  },
};
