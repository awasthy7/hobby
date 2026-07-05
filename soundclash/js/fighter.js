// SOUNDCLASH — Fighter: skeleton, pose blending, combat state machine.
// Angle convention: 0 = limb hanging straight down; positive swings toward
// the direction the fighter faces. Fighters are authored facing right and
// mirrored with a scale transform.

S.FLAT_KEYS = ['rx', 'ry', 'torso', 'head', 'aF0', 'aF1', 'aB0', 'aB1', 'lF0', 'lF1', 'lB0', 'lB1'];

S.normPose = function (p) {
  return {
    rx: p.rx || 0, ry: p.ry || 0, torso: p.torso || 0, head: p.head || 0,
    aF0: p.armF ? p.armF[0] : 0.9, aF1: p.armF ? p.armF[1] : 1.5,
    aB0: p.armB ? p.armB[0] : 0.6, aB1: p.armB ? p.armB[1] : 1.7,
    lF0: p.legF ? p.legF[0] : 0.3, lF1: p.legF ? p.legF[1] : -0.2,
    lB0: p.legB ? p.legB[0] : -0.3, lB1: p.legB ? p.legB[1] : 0.3,
  };
};

S.Fighter = class {
  constructor(charKey, x, facing) {
    this.char = S.CHARS[charKey];
    this.key = charKey;
    this.x = x; this.y = 0; // y = feet offset above ground (0 = grounded)
    this.vx = 0; this.vy = 0;
    this.facing = facing;
    this.hp = this.char.hp;
    this.maxHp = this.char.hp;
    this.groove = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.walkPhase = 0;
    this.animT = Math.random() * 10;
    this.pose = S.normPose({});
    this.freeze = 0;
    this.flash = 0;
    this.hitstun = 0;
    this.specialCd = 0;
    this.invuln = 0;
    this.combo = 0;          // hits landed in current string (for sfx pitch)
    this.curMove = null;
    this.phaseIdx = 0;
    this.phaseT = 0;
    this.chainQueued = false;
    this.chainCount = 0;
    this.smear = [];
    this.knockdownPending = false;
    this.controller = null;  // set by game: 'p1' | 'p2' | ai instance
  }

  get grounded() { return this.y >= -0.5; }

  // ---------------- combat helpers ----------------
  hurtbox(groundY) {
    const b = this.char.body;
    const top = groundY + this.y - (b.legU + b.legL + b.torso + b.headR * 2 + 6);
    const h = this.state === 'down' || this.state === 'getup' ? 46 : (b.legU + b.legL + b.torso + b.headR * 2);
    return { x: this.x - 24, y: this.state === 'down' ? groundY - 40 : top, w: 48, h };
  }

  attackHitbox(groundY) {
    if (!this.curMove || !this.curMove.anim[this.phaseIdx]?.hit || this.hasHit) return null;
    const reach = this.curMove.data.reach;
    const x = this.facing > 0 ? this.x + 14 : this.x - 14 - reach;
    return { x, y: groundY + this.y - 128, w: reach + 26, h: 108 };
  }

  startAttack(kind, beatDelta) {
    const m = this.char.moves;
    let anim, data;
    if (kind === 'light') {
      anim = m.lights[this.chainCount % m.lights.length];
      data = m.light;
    } else if (kind === 'heavy') { anim = m.heavyAnim; data = m.heavy; }
    else if (kind === 'special') { anim = m.specialAnim; data = { ...m.light, dmg: 0, reach: 0 }; this.specialCd = m.special.cooldown; }
    this.curMove = { kind, anim, data };
    this.onBeat = Math.abs(beatDelta) < 0.095;
    this.state = 'attack';
    this.phaseIdx = 0;
    this.phaseT = 0;
    this.hasHit = false;
    this.chainQueued = false;
    this.smear = [];
  }

  startSuper() {
    this.groove = 0;
    this.state = 'super';
    this.stateT = 0;
    this.invuln = 1.4;
    this.superFired = false;
    S.audio.superRiser();
  }

  takeHit(info, groundY) {
    this.hp = Math.max(0, this.hp - info.dmg);
    this.flash = 0.12;
    this.hitstun = info.hitstun;
    this.vx = info.kb * info.dir;
    this.combo = 0;
    this.curMove = null;
    if (info.launch) {
      this.vy = info.launch;
      this.y = Math.min(this.y, -2);
      this.state = 'launched';
    } else {
      this.state = 'hurt';
      this.knockdownPending = !!info.knockdown;
    }
    this.stateT = 0;
  }

  // ---------------- update ----------------
  update(dt, input, opp, world) {
    this.flash = Math.max(0, this.flash - dt);
    if (this.freeze > 0) { this.freeze -= dt; return; }
    this.animT += dt;
    this.stateT += dt;
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.invuln = Math.max(0, this.invuln - dt);

    const G = 2300, floorDrag = 0.82;
    const canAct = ['idle', 'walk', 'block'].includes(this.state);

    // face the opponent when neutral
    if (canAct && this.grounded) this.facing = opp.x >= this.x ? 1 : -1;

    if (canAct) {
      const beat = S.audio.beatInfo();
      if (input.superPressed && this.groove >= 5) { this.startSuper(); }
      else if (input.lightPressed) { this.chainCount = 0; this.startAttack('light', beat.delta); }
      else if (input.heavyPressed) { this.startAttack('heavy', beat.delta); }
      else if (input.specialPressed && this.specialCd <= 0) { this.startAttack('special', beat.delta); }
      else if (input.up && this.grounded) {
        this.vy = this.char.jumpV;
        this.y = -1;
        this.state = 'jump';
        S.audio.jump();
        world?.fx.dust(this.x, world.groundY, 6);
      } else if (input.down && this.grounded) {
        this.state = 'block';
      } else if (input.left || input.right) {
        this.state = 'walk';
        const dir = input.right ? 1 : -1;
        this.vx = dir * this.char.walk;
        this.walkPhase += dt * (this.char.walk / 26) * dir * this.facing;
      } else {
        this.state = 'idle';
        this.vx *= Math.pow(0.0001, dt);
      }
      if (this.state === 'block' && !input.down) this.state = 'idle';
    }

    if (this.state === 'attack' && this.curMove) {
      const phase = this.curMove.anim[this.phaseIdx];
      if (phase.lungeV) this.vx = phase.lungeV * this.facing;
      else this.vx *= Math.pow(0.001, dt);
      // chain lights
      if (this.curMove.kind === 'light' && input.lightPressed && this.phaseIdx >= 1 && this.chainCount < 2) {
        this.chainQueued = true;
      }
      this.phaseT += dt;
      if (this.phaseT >= phase.dur) {
        this.phaseT = 0;
        this.phaseIdx++;
        if (phase.spawn) world?.spawnProjectile(this);
        if (this.phaseIdx >= this.curMove.anim.length) {
          if (this.chainQueued) {
            this.chainCount++;
            const beat = S.audio.beatInfo();
            this.startAttack('light', beat.delta);
          } else {
            this.state = 'idle';
            this.curMove = null;
            this.chainCount = 0;
          }
        } else if (this.curMove.anim[this.phaseIdx].hit && !phase.hit) {
          this.hasHit = false; // fresh active window
        }
      }
    }

    if (this.state === 'super') {
      this.vx = 0;
      if (this.stateT >= 0.6 && !this.superFired) {
        this.superFired = true;
        world?.fireSuper(this);
      }
      if (this.stateT >= 1.35) { this.state = 'idle'; }
    }

    if (this.state === 'hurt') {
      this.vx *= Math.pow(0.012, dt);
      if (this.stateT >= this.hitstun) {
        if (this.knockdownPending) { this.state = 'down'; this.stateT = 0; this.knockdownPending = false; world?.fx.dust(this.x, world.groundY, 10); }
        else this.state = 'idle';
      }
    }
    if (this.state === 'launched') {
      // air physics below; lands into knockdown
    }
    if (this.state === 'down') {
      this.vx *= Math.pow(0.005, dt);
      if (this.stateT >= 0.62 && this.hp > 0) { this.state = 'getup'; this.stateT = 0; this.invuln = 0.5; }
    }
    if (this.state === 'getup' && this.stateT >= 0.34) this.state = 'idle';

    // physics
    if (!this.grounded || this.state === 'jump' || this.state === 'launched') {
      this.vy += G * dt;
      this.y += this.vy * dt;
      if (this.state === 'jump') {
        if (input.left) this.vx = -this.char.walk * 0.85;
        else if (input.right) this.vx = this.char.walk * 0.85;
      }
      if (this.y >= 0) {
        this.y = 0; this.vy = 0;
        S.audio.land();
        world?.fx.dust(this.x, world.groundY, 8);
        if (this.state === 'launched') { this.state = 'down'; this.stateT = 0; }
        else if (this.state === 'jump') this.state = 'idle';
      }
    }
    this.x += this.vx * dt;
    if (['hurt', 'down', 'launched'].includes(this.state)) { /* knockback keeps vx */ }
    else if (!['walk', 'attack'].includes(this.state)) this.vx *= Math.pow(0.0002, dt);
    const W = world?.world || { left: 0, right: 1200 };
    this.x = S.clamp(this.x, W.left + 30, W.right - 30);

    this.updatePose(dt);
  }

  // ---------------- posing ----------------
  targetPose() {
    const beat = S.audio.state.beatPhase;
    const pulse = Math.pow(1 - beat, 3);
    const b = { ...S.normPose({}) };
    switch (this.state) {
      case 'idle': {
        b.ry = 3 + pulse * -4.5;
        b.torso = 0.08 + pulse * 0.03;
        b.head = pulse * 0.14;
        b.aF0 = 0.95; b.aF1 = 1.55; b.aB0 = 0.65; b.aB1 = 1.75;
        b.lF0 = 0.3; b.lF1 = -0.22; b.lB0 = -0.3; b.lB1 = 0.32;
        break;
      }
      case 'walk': {
        const s = Math.sin(this.walkPhase), c = Math.cos(this.walkPhase);
        b.ry = 2 + Math.abs(c) * -2.5 + pulse * -2;
        b.torso = 0.12;
        b.lF0 = 0.3 + s * 0.5; b.lF1 = -0.2 - Math.max(0, -s) * 0.5;
        b.lB0 = -0.3 - s * 0.5; b.lB1 = 0.3 + Math.max(0, s) * 0.5;
        b.aF0 = 0.95 - s * 0.18; b.aF1 = 1.5;
        b.aB0 = 0.65 + s * 0.18; b.aB1 = 1.7;
        break;
      }
      case 'jump': case 'launched': {
        const up = this.vy < 0;
        b.torso = up ? 0.18 : -0.12;
        b.aF0 = up ? 2.1 : 1.4; b.aF1 = 0.5;
        b.aB0 = up ? 1.6 : 0.9; b.aB1 = 0.7;
        b.lF0 = 0.8; b.lF1 = -1.5; b.lB0 = -0.2; b.lB1 = -1.1;
        if (this.state === 'launched') { b.torso = -0.5; b.head = -0.5; b.aF0 = -0.4; b.aB0 = 2.2; b.lF0 = 0.5; b.lB0 = -0.7; }
        break;
      }
      case 'block': {
        b.ry = 7; b.torso = 0.16;
        b.aF0 = 1.35; b.aF1 = 1.95; b.aB0 = 1.15; b.aB1 = 2.15;
        b.lF0 = 0.42; b.lF1 = -0.34; b.lB0 = -0.38; b.lB1 = 0.42;
        break;
      }
      case 'hurt': {
        b.torso = -0.42; b.head = -0.55; b.ry = 4;
        b.aF0 = -0.5; b.aF1 = 0.7; b.aB0 = 1.9; b.aB1 = 0.4;
        b.lF0 = 0.55; b.lF1 = -0.3; b.lB0 = -0.5; b.lB1 = 0.5;
        break;
      }
      case 'down': {
        b.ry = 60; b.torso = -1.35; b.head = -0.4;
        b.aF0 = 2.4; b.aF1 = 0.3; b.aB0 = -0.6; b.aB1 = 0.3;
        b.lF0 = 1.5; b.lF1 = -0.3; b.lB0 = 1.2; b.lB1 = -0.2;
        break;
      }
      case 'getup': {
        b.ry = 24; b.torso = -0.4;
        b.lF0 = 1.0; b.lF1 = -1.2; b.lB0 = -0.4; b.lB1 = 0.6;
        break;
      }
      case 'attack': {
        if (this.curMove) return S.normPose(this.curMove.anim[this.phaseIdx].p);
        break;
      }
      case 'super': {
        if (this.stateT < 0.6) { // gather
          b.ry = 10; b.torso = -0.2; b.head = -0.2;
          b.aF0 = 0.3; b.aF1 = 2.4; b.aB0 = 0.1; b.aB1 = 2.5;
          b.lF0 = 0.5; b.lF1 = -0.5; b.lB0 = -0.5; b.lB1 = 0.55;
        } else { // release
          b.ry = -2; b.torso = 0.3;
          b.aF0 = 2.6; b.aF1 = 0.2; b.aB0 = 2.4; b.aB1 = 0.3;
          b.lF0 = 0.6; b.lF1 = -0.3; b.lB0 = -0.6; b.lB1 = 0.5;
        }
        break;
      }
      case 'win': {
        const bop = Math.sin(this.animT * 6) > 0 ? 1 : 0;
        b.ry = 2 - bop * 4;
        b.aF0 = 2.9; b.aF1 = 0.25; b.aB0 = 2.7; b.aB1 = 0.35;
        b.head = 0.15;
        break;
      }
      case 'ko': {
        b.ry = 60; b.torso = -1.4; b.head = -0.6;
        b.aF0 = 2.5; b.aF1 = 0.2; b.aB0 = -0.7; b.aB1 = 0.2;
        b.lF0 = 1.4; b.lF1 = -0.2; b.lB0 = 1.1; b.lB1 = -0.3;
        break;
      }
    }
    return b;
  }

  updatePose(dt) {
    const target = this.targetPose();
    const rate = this.state === 'attack' || this.state === 'super' ? 0.38 : 0.2;
    for (const k of S.FLAT_KEYS) this.pose[k] = S.damp(this.pose[k], target[k], rate, dt);
  }

  joints(groundY) {
    const b = this.char.body, p = this.pose;
    const standH = b.legU + b.legL;
    const hip = { x: p.rx, y: -standH * 0.96 + p.ry };
    const dir = (a) => ({ x: Math.sin(a), y: Math.cos(a) });
    const seg = (from, a, len) => ({ x: from.x + Math.sin(a) * len, y: from.y + Math.cos(a) * len });
    const neck = seg(hip, Math.PI - p.torso, b.torso);
    const shoulder = { x: S.lerp(hip.x, neck.x, 0.9), y: S.lerp(hip.y, neck.y, 0.9) };
    const head = seg(neck, Math.PI - p.torso - p.head, 10 + b.headR);
    const elbowF = seg(shoulder, p.aF0, b.armU);
    const handF = seg(elbowF, p.aF0 + p.aF1, b.armL);
    const elbowB = seg(shoulder, p.aB0, b.armU);
    const handB = seg(elbowB, p.aB0 + p.aB1, b.armL);
    const kneeF = seg(hip, p.lF0, b.legU);
    const footF = seg(kneeF, p.lF0 + p.lF1, b.legL);
    const kneeB = seg(hip, p.lB0, b.legU);
    const footB = seg(kneeB, p.lB0 + p.lB1, b.legL);
    return { hip, neck, shoulder, head, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };
  }

  draw(g, groundY) {
    const c = this.char.colors, b = this.char.body;
    const j = this.joints(groundY);

    // shadow
    g.save();
    g.globalAlpha = 0.4 * S.clamp(1 + this.y / 300, 0.25, 1);
    g.fillStyle = '#000';
    g.beginPath();
    g.ellipse(this.x, groundY + 4, 34 * S.clamp(1 + this.y / 500, 0.5, 1), 7, 0, 0, S.TAU);
    g.fill();
    g.restore();

    g.save();
    g.translate(this.x, groundY + this.y);
    g.scale(this.facing, 1);

    const art = S.charArt[this.key];
    art.back?.(g, this, j);

    const dark = c.suitDark;
    // back limbs
    S.gfx.capsule(g, j.shoulder.x, j.shoulder.y, j.elbowB.x, j.elbowB.y, b.limbW - 1, dark);
    S.gfx.capsule(g, j.elbowB.x, j.elbowB.y, j.handB.x, j.handB.y, b.limbW - 2, dark);
    S.gfx.circle(g, j.handB.x, j.handB.y, 5.5, c.skin, '#0a0a12', 3);
    S.gfx.capsule(g, j.hip.x, j.hip.y, j.kneeB.x, j.kneeB.y, b.limbW, dark);
    S.gfx.capsule(g, j.kneeB.x, j.kneeB.y, j.footB.x, j.footB.y, b.limbW - 2, dark);
    S.gfx.capsule(g, j.footB.x, j.footB.y, j.footB.x + 11, j.footB.y + 2, 7, '#14141e');

    // torso
    S.gfx.capsule(g, j.hip.x, j.hip.y, j.neck.x, j.neck.y, b.torsoW, c.suit);
    art.torsoDecor?.(g, this, j);

    // front leg
    S.gfx.capsule(g, j.hip.x, j.hip.y, j.kneeF.x, j.kneeF.y, b.limbW, c.suit);
    S.gfx.capsule(g, j.kneeF.x, j.kneeF.y, j.footF.x, j.footF.y, b.limbW - 2, c.suit);
    S.gfx.capsule(g, j.footF.x, j.footF.y, j.footF.x + 12, j.footF.y + 2, 7, '#1c1c28');

    // head
    art.head(g, this, j);

    // front arm
    S.gfx.capsule(g, j.shoulder.x, j.shoulder.y, j.elbowF.x, j.elbowF.y, b.limbW - 1, c.suit);
    S.gfx.capsule(g, j.elbowF.x, j.elbowF.y, j.handF.x, j.handF.y, b.limbW - 2, c.suit);
    S.gfx.circle(g, j.handF.x, j.handF.y, 6, c.skin, '#0a0a12', 3);

    this.elbowF = j.elbowF; // for prop orientation
    art.prop?.(g, this, { ...j, elbowF: j.elbowF });

    // hit flash: white silhouette
    if (this.flash > 0) {
      g.globalAlpha = Math.min(1, this.flash * 9);
      g.globalCompositeOperation = 'lighter';
      const w = '#ffffff';
      for (const [a, bb, ww] of [
        [j.shoulder, j.elbowF, b.limbW], [j.elbowF, j.handF, b.limbW - 2],
        [j.shoulder, j.elbowB, b.limbW], [j.elbowB, j.handB, b.limbW - 2],
        [j.hip, j.kneeF, b.limbW], [j.kneeF, j.footF, b.limbW - 2],
        [j.hip, j.kneeB, b.limbW], [j.kneeB, j.footB, b.limbW - 2],
        [j.hip, j.neck, b.torsoW],
      ]) S.gfx.capsule(g, a.x, a.y, bb.x, bb.y, ww, w, null);
      S.gfx.circle(g, j.head.x, j.head.y, b.headR, w, null);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();

    // smear trail (world space)
    if (this.state === 'attack' && this.curMove?.anim[this.phaseIdx]?.hit) {
      const joint = this.curMove.kind === 'heavy' && this.key === 'echo' ? j.footF : j.handF;
      this.smear.push({ x: this.x + joint.x * this.facing, y: groundY + this.y + joint.y, t: 1 });
      if (this.smear.length > 5) this.smear.shift();
    }
    if (this.smear.length > 1) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      for (let i = 1; i < this.smear.length; i++) {
        const s0 = this.smear[i - 1], s1 = this.smear[i];
        g.globalAlpha = (i / this.smear.length) * 0.8;
        g.strokeStyle = this.char.smearColor;
        g.lineWidth = 13 + i * 3;
        g.beginPath(); g.moveTo(s0.x, s0.y); g.lineTo(s1.x, s1.y); g.stroke();
      }
      g.restore();
      for (const s of this.smear) s.t -= 0.2;
      if (this.state !== 'attack') this.smear.length = 0;
    }

    // groove-ready aura
    if (this.groove >= 5) {
      const ph = S.audio.state.beatPhase;
      S.gfx.glow(g, this.x, groundY + this.y - 70, 70 + (1 - ph) * 20, this.char.colors.accent, 0.22);
    }
  }
};
