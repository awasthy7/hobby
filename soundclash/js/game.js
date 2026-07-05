// SOUNDCLASH — the match: combat resolution, beat judgment, projectiles,
// supers, HUD, rounds. Hits landed within ±95ms of the beat do 1.5x damage
// and feed the groove meter; five segments buys a super.

S.game = {
  groundY: 470,
  world: { left: -120, right: 1080 },

  start(p1Key, p2Key, { cpu = true, level = 0, arcade = null, boss = false } = {}) {
    this.f1 = new S.Fighter(p1Key, 330, 1);
    this.f2 = new S.Fighter(p2Key, 630, -1);
    this.cpu = cpu ? new S.AI(level) : null;
    this.arcade = arcade;
    this.boss = boss;
    this.stage = S.STAGES[S.CHARS[p2Key].genre];
    this.genre = S.CHARS[p2Key].genre;
    this.wins = [0, 0];
    this.round = 0;
    this.projectiles = [];
    this.fx = this.makeFx();
    this.texts = [];
    this.superFx = [];
    this.cam = 0;
    this.timeScale = 1;
    this.slowT = 0;
    this.stats = { hits: 0, onBeat: 0 };
    this.startRound();
    S.audio.startMusic(this.genre, { bpmBoost: boss ? 22 : 0, intensity: boss ? 3 : 0 });
  },

  startRound() {
    this.round++;
    const keep1 = this.f1.groove, keep2 = this.f2.groove;
    const k1 = this.f1.key, k2 = this.f2.key;
    this.f1 = new S.Fighter(k1, 330, 1);
    this.f2 = new S.Fighter(k2, 630, -1);
    this.f1.groove = keep1; this.f2.groove = keep2;
    this.f1.displayHp = 1; this.f2.displayHp = 1;
    this.projectiles = [];
    this.state = 'intro';
    this.stateT = 0;
    this.komboChain = [0, 0];
    S.audio.setIntensity(Math.min(3, (this.boss ? 2 : 0) + this.round - 1));
    S.audio.announce(false);
  },

  makeFx() {
    const parts = new S.Particles(800);
    return {
      parts,
      dust: (x, y, n) => parts.burst(x, y, n, () => ({
        x: x + S.rand(-14, 14), y: y - S.rand(0, 6),
        vx: S.rand(-70, 70), vy: S.rand(-90, -20),
        size: S.rand(2, 4.5), color: 'rgba(200,190,180,0.5)',
        decay: S.rand(1.8, 3), drag: 0.9, additive: false,
      })),
      hitSpark: (x, y, color, big) => {
        parts.burst(x, y, big ? 26 : 14, () => ({
          x, y, vx: S.rand(-320, 320), vy: S.rand(-320, 220),
          size: S.rand(1.5, 3.5), color: Math.random() < 0.5 ? '#fff' : color,
          decay: S.rand(2.4, 4), drag: 0.86, shape: Math.random() < 0.4 ? 'line' : 'dot',
          rot: S.rand(S.TAU), vrot: S.rand(-9, 9),
        }));
      },
      notes: (x, y, color, n) => parts.burst(x, y, n, () => ({
        x: x + S.rand(-10, 10), y: y + S.rand(-10, 10),
        vx: S.rand(-60, 60), vy: S.rand(-160, -60),
        size: S.rand(3, 5), color, decay: S.rand(1, 1.6), drag: 0.97,
        shape: 'note', rot: S.rand(-0.4, 0.4), vrot: S.rand(-2, 2),
      })),
    };
  },

  addText(str, x, y, { color = '#fff', size = 22, life = 0.8 } = {}) {
    this.texts.push({ str, x, y, color, size, t: life, life });
  },

  // ---------------- projectiles ----------------
  spawnProjectile(f) {
    const type = f.char.moves.special.projectile;
    const dir = f.facing;
    const px = f.x + dir * 50, py = this.groundY + f.y - 88;
    const beatMul = f.onBeat ? 1.5 : 1;
    if (type === 'feedback') {
      this.projectiles.push({
        type, x: px, y: py, vx: dir * 460, dmg: 88 * beatMul, kb: 330, hitstun: 0.42,
        owner: f, life: 0.62, w: 56, h: 96, onBeat: f.onBeat, t: 0, knockdown: true,
      });
    } else if (type === 'laser') {
      this.projectiles.push({
        type, x: px, y: py, vx: dir * 760, dmg: 62 * beatMul, kb: 230, hitstun: 0.34,
        owner: f, life: 1.7, w: 46, h: 22, onBeat: f.onBeat, t: 0,
      });
    } else if (type === 'notes') {
      for (let i = 0; i < 3; i++) {
        this.projectiles.push({
          type, x: px - dir * i * 26, y: py + S.rand(-8, 8), vx: dir * 470, dmg: 34 * beatMul, kb: 150, hitstun: 0.3,
          owner: f, life: 1.9, w: 30, h: 30, onBeat: f.onBeat, t: -i * 0.1, phase: i * 1.8,
        });
      }
    }
    S.audio.hit(f.key, { heavy: false, onBeat: f.onBeat, combo: 2 });
  },

  fireSuper(f) {
    const opp = f === this.f1 ? this.f2 : this.f1;
    const sup = f.char.moves.super;
    S.audio.superBlast(f.key);
    S.shake.add(18);
    this.slowmo(0.35, 0.45);
    this.superFx.push({ type: f.key, t: 0, x: f.x, dir: f.facing, owner: f });
    const reachBox = {
      x: f.facing > 0 ? f.x - 20 : f.x + 20 - sup.reach,
      y: this.groundY - 190, w: sup.reach, h: 200,
    };
    if (opp.invuln <= 0 && S.rectsOverlap(reachBox, opp.hurtbox(this.groundY))) {
      const blocked = opp.state === 'block' && (Math.sign(f.x - opp.x) === opp.facing);
      const dmg = blocked ? sup.dmg * 0.35 : sup.dmg;
      opp.takeHit({ dmg, kb: sup.kb, dir: f.facing, hitstun: 0.7, knockdown: true }, this.groundY);
      opp.freeze = 0.2; f.freeze = 0.2;
      this.fx.hitSpark(opp.x, this.groundY - 100, f.char.colors.accent, true);
      this.addText(blocked ? 'BLOCKED!' : f.char.moves.superName + '!', 480, 190, { color: f.char.colors.accent, size: 34, life: 1.2 });
      if (!blocked) this.checkKO(f, opp);
    } else {
      this.addText(f.char.moves.superName + '!', 480, 190, { color: f.char.colors.accent, size: 34, life: 1.2 });
    }
  },

  slowmo(scale, dur) { this.timeScale = scale; this.slowT = dur; },

  // ---------------- combat ----------------
  resolveHits() {
    for (const [atk, def, idx] of [[this.f1, this.f2, 0], [this.f2, this.f1, 1]]) {
      const hb = atk.attackHitbox(this.groundY);
      if (!hb || def.invuln > 0) continue;
      if (!S.rectsOverlap(hb, def.hurtbox(this.groundY))) continue;
      atk.hasHit = true;
      const data = atk.curMove.data;
      const contact = { x: def.x + (atk.facing > 0 ? -14 : 14), y: this.groundY + def.y - 96 + S.rand(-18, 18) };
      const blocked = def.state === 'block' && def.grounded && (Math.sign(atk.x - def.x) === def.facing);
      if (blocked) {
        S.audio.block();
        def.vx = atk.facing * 190;
        atk.vx = -atk.facing * 60;
        this.fx.hitSpark(contact.x, contact.y, '#8899bb', false);
        const chip = data.dmg * (atk.curMove.kind === 'heavy' ? 0.1 : 0);
        if (chip) { def.hp = Math.max(1, def.hp - chip); }
        continue;
      }
      // clean hit
      const onBeat = atk.onBeat;
      const scale = Math.pow(0.92, this.komboChain[idx]);
      const dmg = data.dmg * (onBeat ? 1.5 : 1) * scale;
      def.takeHit({
        dmg, kb: data.kb, dir: atk.facing, hitstun: data.hitstun,
        knockdown: data.knockdown, launch: data.launch,
      }, this.groundY);
      const heavy = atk.curMove.kind === 'heavy';
      atk.freeze = heavy ? 0.13 : 0.085;
      def.freeze = atk.freeze;
      S.shake.add((heavy ? 9 : 4.5) + (onBeat ? 3 : 0));
      S.audio.hit(atk.key, { heavy, onBeat, combo: atk.combo++ });
      this.fx.hitSpark(contact.x, contact.y, atk.char.colors.accent, heavy || onBeat);
      if (onBeat) {
        this.fx.notes(contact.x, contact.y - 10, atk.char.colors.accent, 4);
        atk.groove = Math.min(5, atk.groove + 1);
        this.addText('ON BEAT!', contact.x, contact.y - 60, { color: atk.char.colors.accent, size: 24 });
        if (atk.groove === 5) this.addText('SUPER READY', atk === this.f1 ? 230 : 730, 120, { color: atk.char.colors.accent, size: 26, life: 1.4 });
      }
      this.komboChain[idx]++;
      if (this.komboChain[idx] >= 2) {
        this.addText(this.komboChain[idx] + ' HITS', atk === this.f1 ? 150 : 810, 170, { color: '#fff', size: 30, life: 0.7 });
      }
      this.stats.hits++; if (onBeat) this.stats.onBeat++;
      this.checkKO(atk, def);
    }
    // combo chains reset when the defender recovers
    if (!['hurt', 'launched', 'down'].includes(this.f2.state)) this.komboChain[0] = 0;
    if (!['hurt', 'launched', 'down'].includes(this.f1.state)) this.komboChain[1] = 0;
  },

  updateProjectiles(dt) {
    for (const p of this.projectiles) {
      p.t += dt;
      if (p.t < 0) continue;
      p.x += p.vx * dt;
      if (p.type === 'notes') p.y += Math.sin(p.t * 9 + p.phase) * 36 * dt;
      if (p.type === 'feedback') { p.w += 60 * dt; p.h += 30 * dt; }
      p.life -= dt;
      if (p.life <= 0 || p.x < -80 || p.x > 1240) p.dead = true;
      const def = p.owner === this.f1 ? this.f2 : this.f1;
      if (!p.dead && def.invuln <= 0 && p.t >= 0) {
        const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        if (S.rectsOverlap(box, def.hurtbox(this.groundY))) {
          p.dead = true;
          this.hitByProjectile(p, def);
        }
      }
    }
    S.removeDead(this.projectiles);
  },

  hitByProjectile(p, def) {
    const atk = p.owner;
    const blocked = def.state === 'block' && def.grounded && (Math.sign(atk.x - def.x) === def.facing);
    if (blocked) {
      S.audio.block();
      def.vx = Math.sign(p.vx) * 150;
      def.hp = Math.max(1, def.hp - p.dmg * 0.15);
      this.fx.hitSpark(def.x - Math.sign(p.vx) * 16, p.y, '#8899bb', false);
      return;
    }
    def.takeHit({ dmg: p.dmg, kb: p.kb, dir: Math.sign(p.vx), hitstun: p.hitstun, knockdown: p.knockdown }, this.groundY);
    def.freeze = 0.08;
    S.shake.add(5);
    S.audio.hit(atk.key, { heavy: false, onBeat: p.onBeat, combo: 3 });
    this.fx.hitSpark(def.x, p.y, atk.char.colors.accent, p.onBeat);
    if (p.onBeat) { atk.groove = Math.min(5, atk.groove + 1); this.addText('ON BEAT!', def.x, p.y - 50, { color: atk.char.colors.accent, size: 22 }); }
    this.stats.hits++; if (p.onBeat) this.stats.onBeat++;
    this.checkKO(atk, def);
  },

  checkKO(winner, loser) {
    if (loser.hp > 0 || this.state !== 'fight') return;
    this.state = 'ko';
    this.stateT = 0;
    loser.state = loser.grounded ? 'down' : 'launched';
    loser.hp = 0;
    this.slowmo(0.22, 1.0);
    S.shake.add(16);
    S.audio.koBlast();
    S.audio.duckMusic(0.12, 0.2);
    this.koWinner = winner;
  },

  // ---------------- frame ----------------
  update(rdt) {
    if (this.slowT > 0) { this.slowT -= rdt; if (this.slowT <= 0) this.timeScale = 1; }
    const dt = rdt * this.timeScale;
    S.shake.update(rdt);
    this.stateT += rdt;

    const empty = { left: false, right: false, up: false, down: false, lightPressed: false, heavyPressed: false, specialPressed: false, superPressed: false };
    let in1 = empty, in2 = empty;
    if (this.state === 'fight') {
      in1 = S.input.p1;
      in2 = this.cpu ? this.cpu.input(dt, this.f2, this.f1, this) : S.input.p2;
    }
    this.f1.update(dt, in1, this.f2, this);
    this.f2.update(dt, in2, this.f1, this);

    // keep them from standing inside each other
    const overlap = 44 - Math.abs(this.f1.x - this.f2.x);
    if (overlap > 0 && this.f1.grounded && this.f2.grounded) {
      const push = overlap / 2 * Math.sign(this.f1.x - this.f2.x || 1);
      this.f1.x += push; this.f2.x -= push;
    }

    if (this.state === 'fight') this.resolveHits();
    this.updateProjectiles(dt);
    this.fx.parts.update(dt);
    for (const t of this.texts) { t.t -= rdt; t.y -= 30 * rdt; }
    this.texts = this.texts.filter(t => t.t > 0);
    for (const s of this.superFx) s.t += rdt;
    this.superFx = this.superFx.filter(s => s.t < 1.1);

    // dramatic music when someone is nearly done
    if (this.state === 'fight') {
      const lowHp = Math.min(this.f1.hp / this.f1.maxHp, this.f2.hp / this.f2.maxHp) < 0.3;
      S.audio.setIntensity(Math.min(3, (this.boss ? 2 : this.round - 1) + (lowHp ? 2 : 0)));
    }

    // camera follows the action
    const mid = (this.f1.x + this.f2.x) / 2;
    this.cam = S.damp(this.cam, S.clamp(mid - 480, this.world.left + 0, this.world.right - 960), 0.12, rdt);

    // display hp chase
    for (const f of [this.f1, this.f2]) {
      f.displayHp = f.displayHp === undefined ? 1 : S.damp(f.displayHp, f.hp / f.maxHp, 0.08, rdt);
    }

    // round flow
    if (this.state === 'intro') {
      if (this.stateT > 1.15 && !this.saidFight) { this.saidFight = true; S.audio.announce(true); }
      if (this.stateT > 1.7) { this.state = 'fight'; this.saidFight = false; }
    } else if (this.state === 'ko') {
      if (this.stateT > 2.3) {
        const wIdx = this.koWinner === this.f1 ? 0 : 1;
        this.wins[wIdx]++;
        this.koWinner.state = 'win';
        this.state = 'roundend';
        this.stateT = 0;
        S.audio.winSting(this.koWinner.key);
      }
    } else if (this.state === 'roundend') {
      if (this.stateT > 2.4) {
        if (this.wins[0] >= 2 || this.wins[1] >= 2) {
          this.state = 'matchend';
          this.stateT = 0;
          S.audio.stopMusic(1);
        } else {
          S.audio.duckMusic(1, 0.4);
          this.startRound();
        }
      }
    } else if (this.state === 'matchend') {
      if (this.stateT > 2.6) S.onMatchEnd?.(this.wins[0] > this.wins[1]);
    }
  },

  // ---------------- draw ----------------
  draw(g) {
    g.save();
    g.translate(S.shake.x, S.shake.y);
    this.stage.draw(g, this.cam, performance.now() / 1000);
    const accent = this.f2.char.colors.accent;
    S.drawFloor(g, this.cam, this.groundY, accent);

    g.save();
    g.translate(-this.cam, 0);

    // fighters (loser draws under winner during KO)
    const order = this.f1.state === 'down' || this.f1.state === 'ko' ? [this.f1, this.f2] : [this.f2, this.f1];
    for (const f of order) f.draw(g, this.groundY);

    // projectiles
    for (const p of this.projectiles) {
      if (p.t < 0) continue;
      const c = p.owner.char.colors.accent;
      g.save();
      g.globalCompositeOperation = 'lighter';
      if (p.type === 'feedback') {
        g.strokeStyle = c;
        g.lineWidth = 4;
        for (let k = 0; k < 3; k++) {
          g.globalAlpha = (0.7 - k * 0.2) * S.clamp(p.life * 3, 0, 1);
          g.beginPath();
          g.arc(p.x - Math.sign(p.vx) * k * 14, p.y, p.h / 2 - k * 9, -1.1, 1.1);
          g.stroke();
        }
        S.gfx.glow(g, p.x, p.y, p.h * 0.8, p.owner.char.colors.glow, 0.5);
      } else if (p.type === 'laser') {
        g.fillStyle = c;
        g.globalAlpha = 0.9;
        g.fillRect(p.x - 26, p.y - 3, 52, 6);
        g.fillStyle = '#fff';
        g.fillRect(p.x - 14, p.y - 1.5, 28, 3);
        S.gfx.glow(g, p.x, p.y, 30, p.owner.char.colors.glow, 0.7);
      } else {
        g.fillStyle = c;
        g.font = '26px Georgia, serif';
        g.textAlign = 'center';
        g.fillText('♪', p.x, p.y + 9);
        S.gfx.glow(g, p.x, p.y, 24, p.owner.char.colors.glow, 0.7);
      }
      g.restore();
    }

    this.fx.parts.draw(g);

    // super cinematics
    for (const s of this.superFx) this.drawSuperFx(g, s);
    g.restore();

    this.drawHud(g);
    this.drawOverlays(g);
    g.restore();
  },

  drawSuperFx(g, s) {
    const e = S.ease.out(Math.min(1, s.t / 0.5));
    const fade = 1 - Math.max(0, (s.t - 0.6) / 0.5);
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = fade;
    if (s.type === 'riff') {
      for (let i = 0; i < 4; i++) {
        const r = e * (120 + i * 70);
        g.strokeStyle = `rgba(255,80,50,${0.6 - i * 0.12})`;
        g.lineWidth = 8 - i;
        g.beginPath(); g.arc(s.x + s.dir * 60, this.groundY - 80, r, 0, S.TAU); g.stroke();
      }
    } else if (s.type === 'echo') {
      for (let i = 0; i < 8; i++) {
        const x = s.x + s.dir * (40 + e * (60 + i * 36));
        g.strokeStyle = i % 2 ? '#33e6ff' : '#ff3db8';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(x - 30, this.groundY - 40 - (i * 53) % 120);
        g.lineTo(x + 30, this.groundY - 90 - (i * 31) % 110);
        g.stroke();
      }
    } else {
      for (let i = 0; i < 5; i++) {
        const y = this.groundY - 170 + i * 26;
        g.strokeStyle = `rgba(255,209,102,${0.5})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(s.x - 60, y); g.lineTo(s.x + s.dir * (e * 420 + 60), y); g.stroke();
      }
      g.font = '30px Georgia';
      g.fillStyle = '#ffd166';
      for (let i = 0; i < 6; i++) {
        g.fillText('♪', s.x + s.dir * (e * (80 + i * 60)), this.groundY - 150 + (i * 47) % 110);
      }
    }
    g.restore();
  },

  drawBar(g, x, y, w, h, frac, ghost, rtl, color) {
    const skew = 14;
    const shape = (fx0, fx1) => {
      g.beginPath();
      if (!rtl) {
        g.moveTo(x + fx0 * w + skew, y);
        g.lineTo(x + fx1 * w + skew, y);
        g.lineTo(x + fx1 * w, y + h);
        g.lineTo(x + fx0 * w, y + h);
      } else {
        g.moveTo(x + w - fx0 * w, y);
        g.lineTo(x + w - fx1 * w, y);
        g.lineTo(x + w - fx1 * w - skew, y + h);
        g.lineTo(x + w - fx0 * w - skew, y + h);
      }
      g.closePath();
    };
    g.fillStyle = 'rgba(6,6,12,0.82)';
    shape(0, 1); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.28)';
    g.lineWidth = 2;
    shape(0, 1); g.stroke();
    if (ghost > frac) {
      g.fillStyle = 'rgba(255,255,255,0.45)';
      shape(0, ghost); g.fill();
    }
    const grad = g.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(rtl ? 1 : 0, color);
    grad.addColorStop(rtl ? 0 : 1, '#fff');
    g.fillStyle = grad;
    shape(0, frac); g.fill();
  },

  drawHud(g) {
    const f1 = this.f1, f2 = this.f2;
    this.drawBar(g, 34, 26, 380, 22, S.clamp(f1.hp / f1.maxHp, 0, 1), f1.displayHp, false, f1.char.colors.accent);
    this.drawBar(g, 546, 26, 380, 22, S.clamp(f2.hp / f2.maxHp, 0, 1), f2.displayHp, true, f2.char.colors.accent);
    S.gfx.text(g, f1.char.name, 44, 68, 19, { align: 'left', fill: '#fff', glow: f1.char.colors.glow });
    S.gfx.text(g, (this.boss ? 'REMIX ' : '') + f2.char.name, 916, 68, 19, { align: 'right', fill: '#fff', glow: f2.char.colors.glow });

    // round pips
    for (const [i, wins] of [[0, this.wins[0]], [1, this.wins[1]]]) {
      for (let k = 0; k < 2; k++) {
        const x = i === 0 ? 434 + k * -18 : 526 - k * -18;
        g.fillStyle = k < wins ? '#ffd166' : 'rgba(255,255,255,0.16)';
        g.beginPath(); g.arc(x, 37, 6, 0, S.TAU); g.fill();
      }
    }

    // groove meters
    for (const [f, x0, dir] of [[f1, 34, 1], [f2, 926, -1]]) {
      for (let i = 0; i < 5; i++) {
        const x = x0 + dir * i * 30;
        const filled = f.groove > i;
        const full = f.groove >= 5;
        const pulse = full ? 0.5 + 0.5 * Math.pow(1 - S.audio.state.beatPhase, 2) : 1;
        g.save();
        g.translate(x + dir * 12, 86);
        g.transform(1, 0, -0.24, 1, 0, 0);
        g.fillStyle = filled ? f.char.colors.accent : 'rgba(255,255,255,0.1)';
        g.globalAlpha = filled ? pulse : 1;
        g.fillRect(-11, -7, 22, 14);
        g.strokeStyle = 'rgba(255,255,255,0.3)';
        g.lineWidth = 1.5;
        g.strokeRect(-11, -7, 22, 14);
        g.restore();
      }
      if (f.groove >= 5) {
        S.gfx.text(g, 'SUPER READY [' + (f === f1 ? 'U' : 'M') + ']', x0 + dir * 75, 110, 13, { align: 'center', fill: f.char.colors.accent, glow: f.char.colors.glow });
      }
    }

    // beat track
    const bx = 480, by = 502;
    const b = S.audio.state;
    g.save();
    g.fillStyle = 'rgba(5,5,10,0.6)';
    g.beginPath(); g.roundRect(bx - 150, by - 15, 300, 30, 8); g.fill();
    for (let k = 0; k < 3; k++) {
      const d = (1 - b.beatPhase + k) / 3 * 140;
      for (const side of [-1, 1]) {
        g.fillStyle = `rgba(255,255,255,${0.55 - k * 0.16})`;
        g.beginPath(); g.arc(bx + side * d, by, 4.5 - k, 0, S.TAU); g.fill();
      }
    }
    const flash = Math.pow(1 - b.beatPhase, 4);
    g.save();
    g.translate(bx, by);
    g.rotate(Math.PI / 4);
    g.fillStyle = `rgba(255,255,255,${0.35 + flash * 0.65})`;
    const sz = 8 + flash * 5;
    g.fillRect(-sz / 2, -sz / 2, sz, sz);
    g.restore();
    if (flash > 0.6) {
      g.strokeStyle = 'rgba(255,255,255,0.5)';
      g.lineWidth = 2;
      g.beginPath(); g.arc(bx, by, 14 + (1 - flash) * 30, 0, S.TAU); g.stroke();
    }
    g.restore();

    // floating combat text
    for (const t of this.texts) {
      S.gfx.text(g, t.str, t.x - this.cam, t.y, t.size, {
        fill: t.color, alpha: S.clamp(t.t / t.life * 1.4, 0, 1), glow: t.color, skew: -0.14,
      });
    }
  },

  drawOverlays(g) {
    if (this.state === 'intro') {
      const t = this.stateT;
      g.fillStyle = `rgba(0,0,0,${S.clamp(0.55 - t * 0.5, 0, 0.55)})`;
      g.fillRect(0, 0, 960, 540);
      if (t < 1.15) {
        const e = S.ease.outBack(S.clamp(t / 0.4, 0, 1));
        S.gfx.text(g, 'ROUND ' + this.round, 480, 240, 64 * e, { fill: '#fff', glow: 'rgba(255,209,102,0.8)' });
      } else {
        const e = S.ease.outBack(S.clamp((t - 1.15) / 0.3, 0, 1));
        S.gfx.text(g, 'FIGHT!', 480, 250, 92 * e, { fill: '#ffd166', glow: 'rgba(255,120,40,0.9)' });
      }
    }
    if (this.state === 'ko') {
      const e = S.ease.outBack(S.clamp(this.stateT / 0.35, 0, 1));
      g.fillStyle = `rgba(255,255,255,${S.clamp(0.5 - this.stateT * 1.2, 0, 0.5)})`;
      g.fillRect(0, 0, 960, 540);
      S.gfx.text(g, 'K.O.', 480, 250, 130 * e, { fill: '#ff4d3d', glow: 'rgba(255,80,40,0.9)', strokeW: 0.1 });
    }
    if (this.state === 'roundend' && this.koWinner) {
      S.gfx.text(g, this.koWinner.char.name + ' TAKES THE ROUND', 480, 240, 40, { fill: '#fff', glow: this.koWinner.char.colors.glow });
    }
    if (this.state === 'matchend' && this.koWinner) {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, 960, 540);
      S.gfx.text(g, this.koWinner.char.name + ' WINS', 480, 230, 66, { fill: '#ffd166', glow: this.koWinner.char.colors.glow });
      const pct = this.stats.hits ? Math.round(this.stats.onBeat / this.stats.hits * 100) : 0;
      S.gfx.text(g, 'ON-BEAT HITS: ' + pct + '%', 480, 292, 24, { fill: '#fff', alpha: 0.85 });
    }
  },
};
