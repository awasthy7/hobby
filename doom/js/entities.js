// DOOMED — things that live in the level: monsters, projectiles, pickups,
// barrels, decorations. game.js owns the lists; this file owns the behavior.
(function () {
  const DEFS = {
    grunt: { hp: 30, speed: 1.7, radius: 0.3, sprH: 0.72, ranged: 'hitscan', dmg: [3, 12], windup: 0.5, cd: [1.1, 2.2], pain: 0.7, alert: 'alertGrunt', drops: 'clip', dir: true },
    imp: { hp: 60, speed: 2.1, radius: 0.3, sprH: 0.75, ranged: 'fireball', dmg: [0, 0], windup: 0.6, cd: [1.4, 2.6], pain: 0.55, alert: 'alertImp', dir: true },
    brute: { hp: 150, speed: 3.1, radius: 0.38, sprH: 0.68, melee: [10, 24], windup: 0.45, cd: [0.9, 1.4], pain: 0.35, alert: 'alertBrute', dir: true },
    boss: { hp: 800, speed: 2.3, radius: 0.45, sprH: 1.05, ranged: 'greenball', dmg: [0, 0], windup: 0.7, cd: [1.1, 1.9], pain: 0.1, alert: 'alertBoss', dir: true, phased: true },
    mother: { hp: 2200, speed: 0, radius: 0.55, sprH: 1.3, ranged: 'greenball', dmg: [0, 0], windup: 0.8, cd: [1.3, 2.0], pain: 0.05, alert: 'alertBoss', stationary: true, phased: true },
    flyer: { hp: 45, speed: 2.6, radius: 0.28, sprH: 0.5, ranged: 'fireball', dmg: [0, 0], windup: 0.45, cd: [1.2, 2.2], pain: 0.6, alert: 'alertImp', fly: true },
    turret: { hp: 60, speed: 0, radius: 0.3, sprH: 0.62, ranged: 'hitscan', dmg: [3, 9], windup: 0.75, cd: [0.8, 1.5], pain: 0.2, alert: 'alertGrunt', stationary: true },
    rezzer: { hp: 120, speed: 1.9, radius: 0.32, sprH: 0.95, ranged: 'hitscan', dmg: [3, 7], windup: 0.8, cd: [1.7, 2.8], pain: 0.3, alert: 'alertBoss', rezzes: true },
  };

  // which sprite view of `e` does the player see? '' front, '_b' back, sides
  function dirSprite(w, e, frame) {
    const base = e.etype + '_' + frame;
    const cache = D.sprites;
    if (e.faceA === undefined || !DEFS[e.etype].dir && e.etype !== 'rezzer') return base;
    const viewA = Math.atan2(w.player.y - e.y, w.player.x - e.x);
    let d = viewA - e.faceA;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const a = Math.abs(d);
    let suf = '';
    if (a < 0.79) suf = '';           // enemy faces the viewer
    else if (a > 2.36) suf = '_b';    // enemy faces away
    else suf = d > 0 ? '_sr' : '_sl';
    return cache.get(base + suf) ? base + suf : base;
  }

  const PICKUPS = {
    stim: { sprH: 0.22, msg: 'picked up a stimpack.', snd: 'pickup', apply: (p) => heal(p, 10) },
    medkit: { sprH: 0.3, msg: 'picked up a medikit.', snd: 'pickup', apply: (p) => heal(p, 25) },
    clip: { sprH: 0.18, msg: 'picked up a clip.', snd: 'pickup', apply: (p) => ammo(p, 'bullets', 10) },
    shells: { sprH: 0.18, msg: 'picked up 4 shotgun shells.', snd: 'pickup', apply: (p) => ammo(p, 'shells', 4) },
    armor: { sprH: 0.32, msg: 'picked up the armor!', snd: 'pickup', apply: (p) => { if (p.armor >= 100) return false; p.armor = 100; return true; } },
    soul: { sprH: 0.34, msg: 'SUPERCHARGE!', snd: 'keycard', bob: true, apply: (p) => { p.hp = Math.min(200, p.hp + 100); return true; } },
    keyB: { sprH: 0.3, msg: 'picked up the BLUE keycard.', snd: 'keycard', bob: true, apply: (p) => { p.keys.blue = true; return true; } },
    keyR: { sprH: 0.3, msg: 'picked up the RED keycard.', snd: 'keycard', bob: true, apply: (p) => { p.keys.red = true; return true; } },
    wshotgun: { sprH: 0.24, msg: 'you got the SHOTGUN!', snd: 'weaponUp', apply: (p) => { p.weapons.shotgun = true; ammo(p, 'shells', 8); p.pendingSwitch = 'shotgun'; return true; } },
    wchaingun: { sprH: 0.26, msg: 'you got the CHAINGUN!', snd: 'weaponUp', apply: (p) => { p.weapons.chaingun = true; ammo(p, 'bullets', 20); p.pendingSwitch = 'chaingun'; return true; } },
    wrocket: { sprH: 0.24, msg: 'you got the ROCKET LAUNCHER!', snd: 'weaponUp', apply: (p) => { p.weapons.rocket = true; ammo(p, 'rockets', 4); p.pendingSwitch = 'rocket'; return true; } },
    wplasma: { sprH: 0.24, msg: 'you got the PLASMA RIFLE!', snd: 'weaponUp', apply: (p) => { p.weapons.plasma = true; ammo(p, 'cells', 40); p.pendingSwitch = 'plasma'; return true; } },
    rockets: { sprH: 0.2, msg: 'picked up a pair of rockets.', snd: 'pickup', apply: (p) => ammo(p, 'rockets', 2) },
    cells: { sprH: 0.2, msg: 'picked up an energy cell.', snd: 'pickup', apply: (p) => ammo(p, 'cells', 20) },
    berserk: { sprH: 0.24, msg: 'B E R S E R K', snd: 'weaponUp', apply: (p) => { p.hp = Math.max(p.hp, 100); p.berserkT = 60; p.weapons.fists = true; p.pendingSwitch = 'fists'; return true; } },
  };
  function heal(p, n) { if (p.hp >= 100) return false; p.hp = Math.min(100, p.hp + n); return true; }
  const AMMO_MAX = { bullets: 200, shells: 50, rockets: 30, cells: 200 };
  function ammo(p, kind, n) {
    const max = AMMO_MAX[kind];
    if (p.ammo[kind] >= max) return false;
    p.ammo[kind] = Math.min(max, p.ammo[kind] + n);
    return true;
  }

  D.weapons = {
    fists: { name: 'FISTS', melee: true, dmg: [8, 15], interval: 0.5, snd: 'punch', kick: 5 },
    pistol: { name: 'PISTOL', ammo: 'bullets', use: 1, pellets: 1, dmg: [8, 13], spread: 0.02, interval: 0.42, snd: 'pistol', kick: 3 },
    shotgun: { name: 'SHOTGUN', ammo: 'shells', use: 1, pellets: 7, dmg: [4, 8], spread: 0.09, interval: 1.05, snd: 'shotgun', kick: 9 },
    chaingun: { name: 'CHAINGUN', ammo: 'bullets', use: 1, pellets: 1, dmg: [8, 13], spread: 0.045, interval: 0.11, snd: 'chaingun', auto: true, kick: 2.5 },
    rocket: { name: 'ROCKET LAUNCHER', ammo: 'rockets', use: 1, proj: 'rocket', interval: 0.85, snd: 'rocket', kick: 10 },
    plasma: { name: 'PLASMA RIFLE', ammo: 'cells', use: 1, proj: 'plasma', interval: 0.12, auto: true, snd: 'plasma', kick: 2 },
  };
  D.AMMO_MAX = AMMO_MAX;

  const STEP = 0.3;

  // ---------- world queries ----------
  function solidAt(w, x, y, forEnemy) {
    if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h) return true;
    const idx = (y | 0) * w.map.w + (x | 0);
    const cell = w.map.grid[idx];
    if (!cell) return false;
    const door = w.doors[idx];
    if (door) {
      if (forEnemy && door.kind !== 'secret' && door.open === 0 && door.state === 'closed') {
        door.wantOpen = true; // monsters paw at doors
      }
      return door.open < 0.9;
    }
    return true;
  }

  // for fx placement and surface checks; solid cells act as base floor —
  // they are excluded from standing logic in groundAt instead
  function floorAt(w, x, y) {
    if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h) return 0;
    const idx = (y | 0) * w.map.w + (x | 0);
    return w.map.grid[idx] ? 0 : w.map.floorH[idx];
  }
  function ceilAt(w, x, y) {
    if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h) return 1;
    const idx = (y | 0) * w.map.w + (x | 0);
    return w.map.grid[idx] ? 1 : w.map.ceilH[idx];
  }

  // can `self` occupy the cell at (x,y)? height rules: steps, headroom, drops
  function cellBlocked(w, x, y, self, forEnemy) {
    if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h) return true;
    const idx = (y | 0) * w.map.w + (x | 0);
    const cell = w.map.grid[idx];
    if (cell) {
      const door = w.doors[idx];
      if (door) {
        if (forEnemy && door.kind !== 'secret' && door.open === 0 && door.state === 'closed') door.wantOpen = true;
        return door.open < 0.9;
      }
      return true;
    }
    const fH = w.map.floorH[idx], cH = w.map.ceilH[idx];
    const z = self.z || 0;
    const bodyH = self.crouched ? 0.34 : (self.bodyH || 0.55);
    if (fH - z > STEP && z < fH - 0.001) return true;      // wall of a step too tall (unless airborne above it)
    if (cH - Math.max(fH, z) < bodyH) return true;         // no headroom
    if (forEnemy && z - fH > 0.9) return true;             // monsters refuse big drops
    return false;
  }

  function blockedByEnt(w, self, x, y) {
    for (const e of w.ents) {
      if (e === self || e.gone || !e.solid) continue;
      const r = (e.radius || 0.3) + (self.radius || 0.3);
      if (Math.abs(e.x - x) < r && Math.abs(e.y - y) < r) return true;
    }
    if (self !== w.player) {
      const r = 0.45 + (self.radius || 0.3);
      if (Math.abs(w.player.x - x) < r && Math.abs(w.player.y - y) < r) return true;
    }
    return false;
  }

  function tryMove(w, self, nx, ny, forEnemy) {
    const r = self.radius || 0.3;
    const checks = (xx, yy) =>
      cellBlocked(w, xx - r, yy - r, self, forEnemy) || cellBlocked(w, xx + r, yy - r, self, forEnemy) ||
      cellBlocked(w, xx - r, yy + r, self, forEnemy) || cellBlocked(w, xx + r, yy + r, self, forEnemy);
    let moved = false;
    if (!checks(nx, self.y) && !(forEnemy && blockedByEnt(w, self, nx, self.y))) { self.x = nx; moved = true; }
    if (!checks(self.x, ny) && !(forEnemy && blockedByEnt(w, self, self.x, ny))) { self.y = ny; moved = true; }
    return moved;
  }

  // highest OPEN floor under the body's four corners — walls don't count
  function groundAt(w, self) {
    const r = (self.radius || 0.3) * 0.8;
    let best = -1e9;
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const x = self.x + ox, y = self.y + oy;
      if (x < 0 || y < 0 || x >= w.map.w || y >= w.map.h) continue;
      const idx = (y | 0) * w.map.w + (x | 0);
      if (w.map.grid[idx]) continue;
      if (w.map.floorH[idx] > best) best = w.map.floorH[idx];
    }
    return best > -1e8 ? best : (self.z || 0);
  }

  // height-aware line of sight between two points in space
  function los(w, x1, y1, x2, y2, z1 = 0.55, z2 = 0.55) {
    const dx = x2 - x1, dy = y2 - y1, dz = z2 - z1;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return true;
    const steps = Math.ceil(dist * 3);
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const sx = x1 + dx * t, sy = y1 + dy * t, sz = z1 + dz * t;
      if (solidAt(w, sx, sy)) return false;
      if (sz < floorAt(w, sx, sy) || sz > ceilAt(w, sx, sy)) return false;
    }
    return true;
  }

  // ---------- hitscan ----------
  // Marches the bullet through the world in 3D. `shooter` is 'player' or an
  // enemy entity: bullets hit whatever body crosses the line — including
  // other monsters, which is how grudges begin.
  function hitscan(w, x, y, z0, dx, dy, dmg, shooter, slope = 0) {
    const fromPlayer = shooter === 'player' || shooter === true; // true = legacy arg
    let wallD = 30;
    for (let d = 0.1; d < 30; d += 0.06) {
      const sx = x + dx * d, sy = y + dy * d;
      const bz = z0 + slope * d;
      if (solidAt(w, sx, sy) || bz < floorAt(w, sx, sy) || bz > ceilAt(w, sx, sy)) { wallD = d; break; }
    }
    let best = null, bestD = wallD;
    for (const e of w.ents) {
      if (e === shooter || e.gone || e.dead) continue;
      if (!(e.type === 'enemy' || e.kind === 'barrel' || e.type === 'gplayer')) continue;
      const ex = e.x - x, ey = e.y - y;
      const along = ex * dx + ey * dy;
      if (along < 0.3 || along > bestD) continue;
      const perp = Math.abs(ex * dy - ey * dx);
      if (perp >= (e.radius || 0.45) + (fromPlayer ? 0.24 : 0.1)) continue;
      const bh = z0 + slope * along;
      const ez = e.z || 0;
      if (bh < ez - 0.05 || bh > ez + (e.sprH || 0.7) + 0.1) continue;
      best = e; bestD = along;
    }
    if (!fromPlayer) {
      // the player is also in the line of fire
      const p = w.player;
      const ex = p.x - x, ey = p.y - y;
      const along = ex * dx + ey * dy;
      if (along > 0.3 && along < bestD) {
        const perp = Math.abs(ex * dy - ey * dx);
        const bh = z0 + slope * along;
        if (perp < 0.4 && bh > p.z - 0.05 && bh < p.z + (p.bodyH || 0.55) + 0.15) { best = p; bestD = along; }
      }
    }
    const impactX = x + dx * bestD, impactY = y + dy * bestD;
    const impactZ = D.clamp(z0 + slope * bestD, floorAt(w, impactX, impactY) + 0.05, ceilAt(w, impactX, impactY) - 0.05);
    if (best) {
      if (best === w.player) {
        // co-op marines can't hurt the host by accident
        const friendly = D.net && D.net.role === 'host' && D.net.mpMode === 'coop' && shooter && shooter.type === 'gplayer';
        if (!friendly) w.damagePlayer(dmg, shooter);
      } else if (best.type === 'gplayer') {
        D.net.hurtBody(w, best, dmg, shooter);
      } else {
        w.hurtEnt(best, dmg, dx, dy, shooter);
      }
      w.spawnFx(impactX, impactY, best.type === 'enemy' || best === w.player || best.type === 'gplayer' ? 'blood' : 'puff', 0.5, impactZ - floorAt(w, impactX, impactY));
    } else if (wallD < 30) {
      w.spawnFx(x + dx * (wallD - 0.08), y + dy * (wallD - 0.08), 'puff', 0.45, impactZ - floorAt(w, impactX, impactY));
      if (fromPlayer) {
        if (D.gl && D.gl.ok) D.gl.addDecal(x + dx * wallD, y + dy * wallD, z0 + slope * wallD, 0);
        // shootable secrets: a crack wall opens to gunfire
        const ci = (impactY | 0) * w.map.w + (impactX | 0);
        const door = w.doors[ci];
        if (door && door.kind === 'secret' && (door.state === 'closed' || door.state === 'closing')) w.openDoor(door);
      }
    }
    return best;
  }

  // shared explosion: rockets, barrels
  function explodeAt(w, x, y, z, maxDmg, radius, attacker) {
    D.audio.sfx('boom');
    w.spawnFx(x, y, 'explo', 0.9, Math.max(0.15, z - floorAt(w, x, y)));
    w.boost = Math.min(0.6, w.boost + 0.4);
    w.shake = Math.min(0.5, w.shake + 0.28);
    w.makeNoise(x, y, 14);
    w.addStain(x, y, 0.5);
    for (const t of w.ents) {
      if (t.gone) continue;
      const d = D.dist(x, y, t.x, t.y);
      if (t.kind === 'barrel' && d < radius && t.fuse === undefined) t.fuse = D.rand(0.08, 0.25);
      if (t.type === 'enemy' && !t.dead && d < radius + 0.4 && los(w, x, y, t.x, t.y, z + 0.1, (t.z || 0) + 0.4)) {
        w.hurtEnt(t, Math.round(maxDmg * (1 - d / (radius + 0.6))), (t.x - x) / (d || 1), (t.y - y) / (d || 1), attacker);
      }
    }
    const p = w.player;
    const pd = D.dist(x, y, p.x, p.y);
    if (pd < radius + 0.4) w.damagePlayer(Math.round(maxDmg * 0.7 * (1 - pd / (radius + 0.8))), attacker);
  }

  // ---------- enemy think ----------
  function updateEnemy(e, dt, w) {
    const def = DEFS[e.etype];
    e.flash = Math.max(0, e.flash - dt * 6);
    if (e.dead) {
      e.stateT += dt;
      e.sprite = e.etype + (e.stateT < 0.18 ? '_die0' : e.stateT < 0.36 ? '_die1' : '_corpse');
      if (def.fly && e.z > floorAt(w, e.x, e.y)) e.z = Math.max(floorAt(w, e.x, e.y), e.z - 3.5 * dt);
      return;
    }
    const p = w.player;
    // grudges override; otherwise hunt the nearest living player (co-op)
    if (e.grudge && (e.grudge.dead || e.grudge.gone)) e.grudge = null;
    let tgt = e.grudge || p;
    if (!e.grudge && D.net && D.net.role === 'host') {
      let bd = D.dist(e.x, e.y, p.x, p.y);
      for (const peer of D.net.peers) {
        const b = peer.body;
        if (!b || b.dead) continue;
        const d = D.dist(e.x, e.y, b.x, b.y);
        if (d < bd) { bd = d; tgt = b; }
      }
    }
    const isP = tgt === p;
    const dx = tgt.x - e.x, dy = tgt.y - e.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
    e.stateT += dt;

    switch (e.state) {
      case 'sleep': {
        // wake on sight or on nearby noise (turrets stay shut until then)
        if ((dist < 10 && isP && los(w, e.x, e.y, p.x, p.y, e.z + 0.55, p.z + 0.5)) || (w.noise > 0 && D.dist(e.x, e.y, p.x, p.y) < w.noiseRadius)) {
          e.state = 'wake'; e.stateT = 0;
          D.audio.sfx(def.alert, { vol: D.clamp(1.6 - dist * 0.1, 0.3, 1) });
        }
        e.sprite = e.etype + '_walk0';
        break;
      }
      case 'wake': {
        if (e.stateT > 0.45) { e.state = 'chase'; e.stateT = 0; e.cd = D.rand(0.3, 0.9); }
        e.sprite = e.etype + (def.stationary ? '_walk1' : '_walk0');
        break;
      }
      case 'chase': {
        e.cd -= dt;
        e.walkT += dt;
        const eyeZ = e.z + (def.fly ? 0.2 : 0.55);
        const canSee = los(w, e.x, e.y, tgt.x, tgt.y, eyeZ, (tgt.z || 0) + 0.5);

        // the gravewalker looks for something to raise
        if (def.rezzes && e.rezCd === undefined) e.rezCd = 2;
        if (def.rezzes) {
          e.rezCd -= dt;
          if (e.rezCd <= 0) {
            const corpse = w.ents.find(c => c.type === 'enemy' && c.dead && !c.gone &&
              c.etype !== 'boss' && c.etype !== 'rezzer' &&
              D.dist(e.x, e.y, c.x, c.y) < 7 && los(w, e.x, e.y, c.x, c.y, e.z + 0.6, (c.z || 0) + 0.3));
            if (corpse) {
              e.state = 'rezzing'; e.stateT = 0; e.rezTarget = corpse;
              e.faceA = Math.atan2(corpse.y - e.y, corpse.x - e.x);
              break;
            }
            e.rezCd = 1.2;
          }
        }

        // attack decision
        if (e.cd <= 0 && canSee) {
          if (def.melee && dist < 1.3) { e.state = 'windup'; e.stateT = 0; e.faceA = Math.atan2(dy, dx); break; }
          if (def.ranged && dist < 13 && dist > 1) { e.state = 'windup'; e.stateT = 0; e.faceA = Math.atan2(dy, dx); break; }
        }
        if (def.stationary) {
          e.faceA = Math.atan2(dy, dx);
          e.sprite = e.etype + '_walk1'; // shell open, tracking
          break;
        }
        // movement: straight at the target, detour when bumping
        let mx = dx / dist, my = dy / dist;
        if (e.detourT > 0) { e.detourT -= dt; mx = e.detourX; my = e.detourY; }
        const spd = def.speed * (w.nightmare ? 1.35 : 1);
        if (!tryMove(w, e, e.x + mx * spd * dt, e.y + my * spd * dt, true) && e.detourT <= 0) {
          const s = Math.random() < 0.5 ? 1 : -1;
          e.detourX = -my * s; e.detourY = mx * s; e.detourT = D.rand(0.4, 0.9);
        }
        e.faceA = Math.atan2(my, mx);
        if (def.fly) {
          // hover: seek the target's chest height, respect floor and ceiling
          const want = D.clamp((tgt.z || 0) + 0.4, floorAt(w, e.x, e.y) + 0.25, ceilAt(w, e.x, e.y) - 0.6);
          e.z = D.damp(e.z, want + Math.sin(w.time * 2.1 + e.x) * 0.08, 0.05, dt);
        } else {
          const grnd = groundAt(w, e);
          if (e.z < grnd) e.z = grnd;
          else if (e.z > grnd + 0.01) e.z = Math.max(grnd, e.z - 3.5 * dt);
        }
        e.sprite = dirSprite(w, e, Math.floor(e.walkT * 5) % 2 ? 'walk1' : 'walk0');
        break;
      }
      case 'rezzing': {
        e.sprite = e.etype + '_attack';
        const c = e.rezTarget;
        if (!c || c.gone || !c.dead) { e.state = 'chase'; e.stateT = 0; e.rezCd = 1.5; break; }
        if (e.stateT > 1.1) {
          c.dead = false; c.solid = true; c.hp = Math.round(DEFS[c.etype].hp * 0.6);
          c.state = 'wake'; c.stateT = 0; c.grudge = null; c.flash = 1;
          D.audio.sfx('keycard', { vol: 0.5 });
          D.audio.sfx(DEFS[c.etype].alert, { vol: 0.5 });
          w.message('the gravewalker raises the dead.');
          w.spawnFx(c.x, c.y, 'puff', 0.7, 0.4);
          e.state = 'chase'; e.stateT = 0; e.rezCd = 4; e.rezTarget = null;
        }
        break;
      }
      case 'windup': {
        e.sprite = e.etype + '_attack';
        // boss phase transitions: harder patterns, one-time summons
        if (def.phased && !e.phase2 && e.hp < DEFS[e.etype].hp * (e.etype === 'mother' ? 0.66 : 0.5)) {
          e.phase2 = true;
          D.audio.sfx('alertBoss');
          w.message(e.etype === 'mother' ? 'the machine heart quickens.' : 'the overseer is furious.');
          w.shake = Math.min(0.6, w.shake + 0.4);
          const n = e.etype === 'mother' ? 2 : 2;
          for (let i = 0; i < n; i++) {
            const sp = D.ent.spawn({ x: e.x + Math.cos(i * 2.5) * 2, y: e.y + Math.sin(i * 2.5) * 2, type: e.etype === 'mother' ? 'flyer' : 'imp' });
            if (sp) { sp.z = e.z + (sp.fly ? 0.6 : 0); sp.state = 'wake'; sp.countKill = false; w.ents.push(sp); }
          }
        }
        if (e.etype === 'mother' && !e.phase3 && e.hp < DEFS.mother.hp * 0.33) {
          e.phase3 = true;
          D.audio.sfx('alertBoss');
          w.message('it is dying, and it knows.');
        }
        if (e.stateT >= def.windup) {
          const aim = Math.atan2(tgt.y - e.y, tgt.x - e.x);
          const tgtZ = (tgt.z || 0) + (isP ? 0.45 : (tgt.sprH || 0.7) * 0.55);
          if (def.melee) {
            if (D.dist(e.x, e.y, tgt.x, tgt.y) < 1.5) {
              if (isP) w.damagePlayer(D.randInt(...def.melee), e);
              else if (tgt.type === 'gplayer') D.net.hurtBody(w, tgt, D.randInt(...def.melee), e);
              else w.hurtEnt(tgt, D.randInt(...def.melee), dx / dist, dy / dist, e);
            }
            D.audio.sfx('gib', { vol: 0.5 });
          } else if (def.ranged === 'hitscan') {
            D.audio.sfx('pistol', { vol: D.clamp(1.3 - dist * 0.08, 0.25, 0.9) });
            const wob = (Math.random() - 0.5) * 0.12;
            const eyeZ = e.z + (def.fly ? 0.2 : 0.55);
            const slope = (tgtZ - eyeZ) / dist + (Math.random() - 0.5) * 0.04;
            hitscan(w, e.x, e.y, eyeZ, Math.cos(aim + wob), Math.sin(aim + wob), D.randInt(...def.dmg), e, slope);
          } else {
            const kind = def.ranged;
            let n = e.etype === 'boss' ? (e.phase2 ? 5 : 3) : e.etype === 'mother' ? 3 : 1;
            const speed = kind === 'greenball' ? 8.5 : 7;
            const muzzleZ = e.z + (e.etype === 'boss' ? 0.8 : e.etype === 'mother' ? 0.9 : def.fly ? 0.2 : 0.55);
            const vz = (tgtZ - muzzleZ) * speed / dist;
            for (let i = 0; i < n; i++) {
              const a = aim + (i - (n - 1) / 2) * 0.16;
              w.ents.push(makeProjectile(e.x + Math.cos(a) * 0.5, e.y + Math.sin(a) * 0.5, muzzleZ, a, vz, kind, e));
            }
            // the machine heart's nova: a full ring, phases 2 and 3
            if (e.etype === 'mother' && e.phase2 && (e.novaT = (e.novaT || 0) + 1) % (e.phase3 ? 2 : 3) === 0) {
              const spokes = e.phase3 ? 10 : 8;
              for (let i = 0; i < spokes; i++) {
                const a = i / spokes * D.TAU + (e.novaT * 0.35);
                w.ents.push(makeProjectile(e.x + Math.cos(a) * 0.6, e.y + Math.sin(a) * 0.6, muzzleZ, a, 0, 'fireball', e));
              }
            }
            D.audio.sfx('fireball', { vol: D.clamp(1.2 - dist * 0.07, 0.25, 0.9) });
          }
          e.state = 'chase'; e.stateT = 0;
          e.cd = D.rand(...def.cd) * (w.nightmare ? 0.6 : 1);
        }
        break;
      }
      case 'pain': {
        e.sprite = e.etype + '_pain';
        if (e.stateT > 0.32) { e.state = 'chase'; e.stateT = 0; }
        break;
      }
    }
  }

  const PROJ = {
    fireball: { speed: 7, dmg: 12 },
    greenball: { speed: 8.5, dmg: 20 },
    rocket: { speed: 11, dmg: 45, splash: [80, 1.8] },
    plasma: { speed: 14, dmg: 22 },
  };

  function makeProjectile(x, y, z, angle, vz, kind, from) {
    const cfg = PROJ[kind];
    return {
      type: 'proj', kind, from,
      x, y, z, dx: Math.cos(angle) * cfg.speed, dy: Math.sin(angle) * cfg.speed, vz,
      dmg: cfg.dmg, splash: cfg.splash,
      radius: 0.16, sprH: 0.24, lift: 0, bright: true,
      animT: 0, sprite: kind + '_0', solid: false,
      faceA: angle,
    };
  }

  function projPop(e, w, hitEnt) {
    e.gone = true;
    if (e.splash) {
      explodeAt(w, e.x, e.y, e.z, e.splash[0], e.splash[1], e.from);
    } else if (hitEnt) {
      w.spawnFx(e.x, e.y, 'blood', 0.5, Math.max(0.1, e.z - floorAt(w, e.x, e.y)));
    } else {
      w.spawnFx(e.x, e.y, 'puff', 0.5, Math.max(0.1, e.z - floorAt(w, e.x, e.y)));
    }
  }

  function updateProjectile(e, dt, w) {
    e.animT += dt;
    e.sprite = e.kind + '_' + (Math.floor(e.animT * 10) % 2);
    const nx = e.x + e.dx * dt, ny = e.y + e.dy * dt;
    const nz = e.z + e.vz * dt;
    if (solidAt(w, nx, ny) || nz < floorAt(w, nx, ny) || nz > ceilAt(w, nx, ny)) {
      projPop(e, w, false);
      return;
    }
    e.x = nx; e.y = ny; e.z = nz;
    // bodies: anything except the one who fired it
    for (const t of w.ents) {
      if (t === e.from || t.gone || t.dead) continue;
      if (!(t.type === 'enemy' || t.kind === 'barrel' || t.type === 'gplayer')) continue;
      if (D.dist(e.x, e.y, t.x, t.y) < (t.radius || 0.3) + 0.25 &&
          e.z > (t.z || 0) - 0.15 && e.z < (t.z || 0) + (t.sprH || 0.7) + 0.15) {
        if (t.type === 'gplayer') D.net.hurtBody(w, t, e.dmg, e.from);
        else w.hurtEnt(t, e.dmg, e.dx * 0.06, e.dy * 0.06, e.from);
        projPop(e, w, true);
        return;
      }
    }
    const p = w.player;
    if (e.from !== 'player' && D.dist(e.x, e.y, p.x, p.y) < 0.55 && e.z > p.z - 0.1 && e.z < p.z + (p.bodyH || 0.55) + 0.15) {
      w.damagePlayer(e.dmg, e.from);
      projPop(e, w, true);
    }
  }

  // gibs: physical chunks that fly, bounce once, and stay as gore
  function updateGib(e, dt, w) {
    e.vz -= 8.5 * dt;
    e.x += e.dx * dt; e.y += e.dy * dt; e.z += e.vz * dt;
    e.animT += dt;
    e.sprite = 'gib_' + (Math.floor(e.animT * 12) % 3);
    const fl = floorAt(w, e.x, e.y);
    if (solidAt(w, e.x, e.y)) { e.dx = -e.dx * 0.4; e.dy = -e.dy * 0.4; e.x += e.dx * dt * 2; e.y += e.dy * dt * 2; }
    if (e.z <= fl) {
      e.z = fl;
      if (Math.abs(e.vz) > 1.4) { e.vz = -e.vz * 0.35; e.dx *= 0.5; e.dy *= 0.5; w.addStain(e.x, e.y, 0.12); }
      else { e.type = 'decor'; e.sprite = 'gibrest_0'; e.sprH = 0.06; e.solid = false; w.addStain(e.x, e.y, 0.2); }
    }
  }

  function updateFx(e, dt) {
    e.t += dt;
    const idx = Math.floor(e.t * e.rate);
    if (idx >= e.frames.length) { e.gone = true; return; }
    e.sprite = e.frames[idx];
  }

  function updatePickup(e, dt, w) {
    if (e.bob) { e.bobT = (e.bobT || 0) + dt; e.lift = 0.08 + Math.sin(e.bobT * 3) * 0.05; }
    const p = w.player;
    if (Math.abs(e.x - p.x) < 0.6 && Math.abs(e.y - p.y) < 0.6 && Math.abs((e.z || 0) - p.z) < 0.9) {
      const def = PICKUPS[e.kind];
      if (def.apply(p)) {
        D.audio.sfx(def.snd);
        w.message(def.msg);
        if (e.countItem) w.stats.items++;
        w.bonusFlash = Math.min(0.5, w.bonusFlash + 0.25);
        if (e.kind[0] === 'w' || e.kind === 'soul') w.faceGrin = 1.6;
        e.gone = true;
      }
    }
  }

  function updateBarrel(e, dt, w) {
    e.flash = Math.max(0, (e.flash || 0) - dt * 6);
    if (e.fuse !== undefined) {
      e.fuse -= dt;
      if (e.fuse <= 0) explodeBarrel(e, w);
    }
  }

  function explodeBarrel(e, w) {
    if (e.gone) return;
    e.gone = true;
    explodeAt(w, e.x, e.y, (e.z || 0) + 0.3, 75, 1.9, e.lastAttacker || null);
  }

  // ---------- spawn ----------
  function spawn(thing) {
    const t = thing.type;
    if (DEFS[t]) {
      return {
        type: 'enemy', etype: t, x: thing.x, y: thing.y,
        hp: DEFS[t].hp, radius: DEFS[t].radius, sprH: DEFS[t].sprH,
        bodyH: DEFS[t].sprH * 0.9, fly: !!DEFS[t].fly,
        state: 'sleep', stateT: 0, walkT: 0, cd: 0, detourT: 0,
        faceA: D.rand(0, D.TAU), grudge: null,
        flash: 0, solid: true, sprite: t + '_walk0', countKill: true,
      };
    }
    if (PICKUPS[t]) {
      return {
        type: 'pickup', kind: t, x: thing.x, y: thing.y,
        sprH: PICKUPS[t].sprH, sprite: t + '_0', solid: false,
        bob: !!PICKUPS[t].bob, lift: PICKUPS[t].bob ? 0.1 : 0.02, countItem: true,
      };
    }
    if (t === 'barrel') {
      return { type: 'barrel', kind: 'barrel', x: thing.x, y: thing.y, hp: 20, radius: 0.3, sprH: 0.52, sprite: 'barrel_0', solid: true, flash: 0 };
    }
    if (t === 'lamp') {
      return { type: 'decor', x: thing.x, y: thing.y, radius: 0.2, sprH: 0.78, sprite: 'lamp_0', solid: true, bright: true };
    }
    if (t === 'gore') {
      return { type: 'decor', x: thing.x, y: thing.y, sprH: 0.2, sprite: 'gore_0', solid: false };
    }
    return null;
  }

  function update(e, dt, w) {
    if (e.gone) return;
    switch (e.type) {
      case 'enemy': updateEnemy(e, dt, w); break;
      case 'proj': updateProjectile(e, dt, w); break;
      case 'fx': updateFx(e, dt); break;
      case 'pickup': updatePickup(e, dt, w); break;
      case 'barrel': updateBarrel(e, dt, w); break;
      case 'gib': updateGib(e, dt, w); break;
    }
  }

  D.ent = { DEFS, PICKUPS, PROJ, spawn, update, hitscan, los, tryMove, solidAt, explodeBarrel, explodeAt, makeProjectile, floorAt, ceilAt, groundAt, STEP };
})();
