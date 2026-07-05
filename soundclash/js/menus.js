// SOUNDCLASH — title, character select, vs splash, victory/defeat.

S.makeRemix = function (baseKey) {
  const base = S.CHARS[baseKey];
  S.CHARS.remix = {
    ...base, key: 'remix', name: base.name,
    colors: { ...base.colors, suit: '#26262e', suitDark: '#17171d', accent: '#ff2244', glow: 'rgba(255,40,70,0.6)', trim: '#e8e8f0' },
    hp: base.hp * 1.1,
  };
  S.charArt.remix = S.charArt[baseKey];
  return 'remix';
};

// small helper: an idle fighter standing on a menu card
S.previewFighter = function (key, x) {
  const f = new S.Fighter(key, x, 1);
  f.preview = true;
  return f;
};

S.scenes = {};

S.scenes.title = {
  enter() { this.t = 0; },
  update(dt) {
    this.t += dt;
    if (S.input.p1.lightPressed || S.input.enterPressed) {
      S.audio.uiConfirm();
      S.setScene('select');
    }
  },
  draw(g) {
    const a = S.audio.state;
    const bg = g.createLinearGradient(0, 0, 0, 540);
    bg.addColorStop(0, '#0a0714');
    bg.addColorStop(0.7, '#1c0f2e');
    bg.addColorStop(1, '#0a0714');
    g.fillStyle = bg;
    g.fillRect(0, 0, 960, 540);

    // equalizer skyline
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 48; i++) {
      const x = i * 20 + 2;
      const env = [a.kick, a.bass, a.snare, a.accent][i % 4];
      const h = 12 + env * (30 + (i * 29) % 70) + Math.sin(this.t * 2 + i) * 6;
      const grad = g.createLinearGradient(0, 540 - h, 0, 540);
      grad.addColorStop(0, ['#33e6ff', '#ff3db8', '#ffd166', '#ff4d3d'][i % 4]);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5;
      g.fillStyle = grad;
      g.fillRect(x, 540 - h, 14, h);
    }
    g.restore();

    const pulse = 1 + Math.pow(1 - a.beatPhase, 3) * 0.04;
    g.save();
    g.translate(480, 200);
    g.scale(pulse, pulse);
    S.gfx.text(g, 'SOUND', 0, -44, 96, { fill: '#fff', glow: 'rgba(51,230,255,0.9)', skew: -0.16 });
    S.gfx.text(g, 'CLASH', 0, 44, 96, { fill: '#ffd166', glow: 'rgba(255,77,166,0.9)', skew: -0.16 });
    g.restore();
    S.gfx.text(g, 'A  RHYTHM  FIGHTING  GAME', 480, 300, 17, { fill: '#9ba6c8', skew: 0 });

    const flash = 0.5 + Math.pow(1 - a.beatPhase, 2) * 0.5;
    S.gfx.text(g, 'PRESS  ENTER', 480, 386, 26, { fill: `rgba(255,255,255,${flash})`, glow: 'rgba(255,255,255,0.4)' });
    S.gfx.text(g, 'P1: A D move · W jump · S block · J light · K heavy · L special · U super', 480, 480, 13, { fill: '#6b7494', skew: 0, stroke: null });
    S.gfx.text(g, 'P2: arrows · , light · . heavy · / special · M super  —  hit ON THE BEAT for 1.5x and groove', 480, 502, 13, { fill: '#6b7494', skew: 0, stroke: null });
  },
};

S.scenes.select = {
  enter() {
    this.keys = ['riff', 'echo', 'maestro'];
    this.i1 = 0; this.i2 = 2;
    this.lock1 = false; this.lock2 = false;
    this.p2Joined = false;
    this.t = 0;
    this.previews = this.keys.map((k, i) => S.previewFighter(k, 0));
  },
  update(dt) {
    this.t += dt;
    const p1 = S.input.p1, p2 = S.input.p2;
    if (!this.lock1) {
      if (p1.leftPressed) { this.i1 = (this.i1 + 2) % 3; S.audio.uiMove(); }
      if (p1.rightPressed) { this.i1 = (this.i1 + 1) % 3; S.audio.uiMove(); }
      if (p1.lightPressed || S.input.enterPressed) { this.lock1 = true; S.audio.uiConfirm(); }
    }
    if (this.p2Joined && !this.lock2) {
      if (p2.leftPressed) { this.i2 = (this.i2 + 2) % 3; S.audio.uiMove(); }
      if (p2.rightPressed) { this.i2 = (this.i2 + 1) % 3; S.audio.uiMove(); }
      if (p2.lightPressed) { this.lock2 = true; S.audio.uiConfirm(); }
    } else if (!this.p2Joined && (p2.lightPressed || p2.leftPressed || p2.rightPressed)) {
      this.p2Joined = true;
      S.audio.uiConfirm();
    }
    // previews groove in place
    for (const [i, f] of this.previews.entries()) {
      f.animT += dt;
      f.state = (this.lock1 && i === this.i1) || (this.lock2 && i === this.i2) ? 'win' : 'idle';
      f.updatePose(dt);
    }

    if (this.lock1 && (!this.p2Joined || this.lock2)) {
      this.doneT = (this.doneT || 0) + dt;
      if (this.doneT > 0.7) {
        const p1Key = this.keys[this.i1];
        if (this.p2Joined) {
          S.startVs(p1Key, this.keys[this.i2], { cpu: false });
        } else {
          const others = this.keys.filter(k => k !== p1Key).sort(() => Math.random() - 0.5);
          S.arcade = {
            playerKey: p1Key,
            queue: [
              { key: others[0], level: 0 },
              { key: others[1], level: 1 },
              { key: S.makeRemix(p1Key), level: 3, boss: true },
            ],
            idx: 0,
          };
          S.startVs(p1Key, S.arcade.queue[0].key, { cpu: true, level: 0 });
        }
      }
    }
  },
  draw(g) {
    const a = S.audio.state;
    g.fillStyle = '#0b0813';
    g.fillRect(0, 0, 960, 540);
    S.gfx.text(g, 'CHOOSE YOUR SOUND', 480, 58, 40, { fill: '#fff', glow: 'rgba(255,209,102,0.6)' });

    for (let i = 0; i < 3; i++) {
      const key = this.keys[i];
      const char = S.CHARS[key];
      const x = 180 + i * 300, y = 300;
      const sel1 = this.i1 === i, sel2 = this.p2Joined && this.i2 === i;
      const pulse = Math.pow(1 - a.beatPhase, 2);

      // card
      g.save();
      g.fillStyle = '#131022';
      g.strokeStyle = sel1 || sel2 ? char.colors.accent : 'rgba(255,255,255,0.12)';
      g.lineWidth = sel1 || sel2 ? 3 + pulse * 2 : 2;
      g.beginPath();
      g.roundRect(x - 110, y - 160, 220, 320, 14);
      g.fill(); g.stroke();
      if (sel1 || sel2) S.gfx.glow(g, x, y, 180, char.colors.glow, 0.16 + pulse * 0.1);
      g.restore();

      // live fighter
      const f = this.previews[i];
      f.x = x;
      f.facing = 1;
      g.save();
      g.translate(x, y + 90);
      g.scale(0.92, 0.92);
      g.translate(-x, -(y + 90));
      f.draw(g, y + 90);
      g.restore();

      S.gfx.text(g, char.name, x, y - 120, 30, { fill: '#fff', glow: char.colors.glow });
      S.gfx.text(g, char.genre.toUpperCase() + ' · ' + S.audio.GENRES[char.genre].bpm + ' BPM', x, y - 92, 13, { fill: char.colors.accent, stroke: null, skew: 0 });
      S.gfx.text(g, char.tagline, x, y + 126, 14, { fill: '#9ba6c8', stroke: null, skew: 0 });

      if (sel1) S.gfx.text(g, this.lock1 ? 'P1 ✓' : 'P1', x - 78, y - 132, 18, { fill: '#33e6ff', stroke: '#0a0a12' });
      if (sel2) S.gfx.text(g, this.lock2 ? 'P2 ✓' : 'P2', x + 78, y - 132, 18, { fill: '#ff4d3d', stroke: '#0a0a12' });
    }

    const hint = this.p2Joined
      ? 'TWO PLAYERS — lock in with J / ,'
      : 'J to lock in · arcade tour begins    (P2: press , to join)';
    S.gfx.text(g, hint, 480, 512, 15, { fill: '#8891ac', stroke: null, skew: 0 });
  },
};

S.scenes.vs = {
  enter(p1Key, p2Key, opts) {
    this.p1 = S.CHARS[p1Key]; this.p2 = S.CHARS[p2Key];
    this.opts = opts; this.p1Key = p1Key; this.p2Key = p2Key;
    this.t = 0;
    S.audio.announce(true);
  },
  update(dt) {
    this.t += dt;
    if (this.t > 1.7) {
      S.game.start(this.p1Key, this.p2Key, this.opts);
      S.setScene('match');
    }
  },
  draw(g) {
    g.fillStyle = '#07050d';
    g.fillRect(0, 0, 960, 540);
    const e = S.ease.outQuint(Math.min(1, this.t / 0.5));
    g.save();
    g.translate(0, 0);
    S.gfx.text(g, this.p1.name, -300 + e * 560, 210, 72, { fill: '#fff', glow: this.p1.colors.glow, align: 'center' });
    S.gfx.text(g, this.opts.boss ? 'REMIX ' + this.p2.name : this.p2.name, 1260 - e * 560, 330, 72, { fill: '#fff', glow: this.p2.colors.glow, align: 'center' });
    g.restore();
    S.gfx.text(g, 'VS', 480, 270, 54 + Math.sin(this.t * 12) * 4, { fill: '#ffd166', glow: 'rgba(255,120,40,0.8)' });
    S.gfx.text(g, S.STAGES[S.CHARS[this.p2Key].genre].name, 480, 458, 20, { fill: '#8891ac', stroke: null });
  },
};

S.scenes.match = {
  enter() {},
  update(dt) { S.game.update(dt); },
  draw(g) { S.game.draw(g); },
};

S.scenes.victory = {
  enter(won, stats) { this.won = won; this.stats = stats; this.t = 0; },
  update(dt) {
    this.t += dt;
    if (this.t > 1 && (S.input.p1.lightPressed || S.input.enterPressed)) {
      S.audio.uiConfirm();
      S.audio.stopMusic(0.5);
      S.setScene('title');
    }
  },
  draw(g) {
    g.fillStyle = '#0a0714';
    g.fillRect(0, 0, 960, 540);
    const a = S.audio.state;
    if (this.won) {
      S.gfx.glow(g, 480, 230, 260 + a.kick * 40, 'rgba(255,209,102,0.5)', 0.3);
      S.gfx.text(g, 'YOU ARE THE HEADLINER', 480, 200, 52, { fill: '#ffd166', glow: 'rgba(255,180,60,0.9)' });
      S.gfx.text(g, 'the venue is yours. the crowd knows your name.', 480, 262, 18, { fill: '#c8cfe8', stroke: null, skew: 0 });
    } else {
      S.gfx.text(g, 'THE CROWD GOES QUIET', 480, 210, 46, { fill: '#8891ac', glow: 'rgba(120,130,170,0.5)' });
      S.gfx.text(g, 'every legend bombed a set once. run it back.', 480, 268, 18, { fill: '#8891ac', stroke: null, skew: 0 });
    }
    if (this.stats?.hits) {
      S.gfx.text(g, 'ON-BEAT: ' + Math.round(this.stats.onBeat / this.stats.hits * 100) + '%  ·  HITS: ' + this.stats.hits, 480, 330, 20, { fill: '#fff' });
    }
    S.gfx.text(g, 'ENTER — BACK TO THE MARQUEE', 480, 430, 18, { fill: `rgba(255,255,255,${0.4 + Math.pow(1 - a.beatPhase, 2) * 0.6})` });
  },
};

// ---- flow glue ----
S.startVs = function (p1Key, p2Key, opts) {
  S.setScene('vs', p1Key, p2Key, opts);
};

S.onMatchEnd = function (playerWon) {
  const stats = S.game.stats;
  if (!S.arcade) { // versus mode
    S.audio.stopMusic(0.5);
    S.setScene('select');
    return;
  }
  if (!playerWon) {
    S.arcade = null;
    S.setScene('victory', false, stats);
    return;
  }
  S.arcade.idx++;
  if (S.arcade.idx >= S.arcade.queue.length) {
    S.arcade = null;
    S.setScene('victory', true, stats);
  } else {
    const next = S.arcade.queue[S.arcade.idx];
    S.startVs(S.arcade.playerKey, next.key, { cpu: true, level: next.level, boss: !!next.boss });
  }
};
