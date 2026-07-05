// DOOMED — peer-to-peer multiplayer. Host runs the whole world; guests send
// inputs and render snapshots. Signaling is copy-paste (no server; a free
// STUN address helps NATs find each other). Protocol functions are pure so
// the harness can test them without a browser.
(function () {
  const SNAP_HZ = 12;
  const INPUT_HZ = 30;

  D.net = {
    role: 'off',           // 'off' | 'host' | 'guest'
    mpMode: 'coop',        // 'coop' | 'dm'
    peers: [],             // host: [{pc, dc, id, input, body, frags, name}]
    guestConn: null,       // guest: {pc, dc}
    myId: -1,              // guest: my slot in the snapshot player list
    snapTimer: 0, inputTimer: 0,
    lastSnap: null,
    sprNames: null, sprIdx: null,

    ensureTables() {
      if (this.sprNames) return;
      this.sprNames = Object.keys(D.sprites.all);
      this.sprIdx = {};
      this.sprNames.forEach((n, i) => { this.sprIdx[n] = i; });
    },

    // ---------------- guest player bodies (host side) ----------------
    makeBody(id) {
      const G = D.game;
      const start = { x: G.player.x, y: G.player.y };
      return {
        type: 'gplayer', id, x: start.x + 0.6, y: start.y + 0.6,
        z: G.player.z, vz: 0, grounded: true, crouched: false,
        dirX: 1, dirY: 0, pitch: 0,
        hp: 100, armor: 0, dead: false, respawnT: 0,
        radius: 0.28, bodyH: 0.55, sprH: 0.78,
        weapon: 'pistol', cooldown: 0, fireFlash: 0, lastFp: 0,
        walkT: 0, faceA: 0, frags: 0, solid: false,
        sprite: 'marine_walk0', countKill: false,
      };
    },

    applyGuestInput(game, peer, msg) {
      peer.input = msg;
      const b = peer.body;
      if (b && !b.dead) {
        b.dirX = msg.dx; b.dirY = msg.dy; b.pitch = msg.pt || 0;
        if (msg.w && D.weapons[msg.w]) b.weapon = msg.w;
      }
    },

    // host physics for one guest body — mirrors the local player's rules
    stepBody(game, peer, dt) {
      const b = peer.body, inp = peer.input;
      if (!b) return;
      if (b.dead) {
        b.respawnT -= dt;
        b.sprite = b.respawnT > 1.8 ? 'marine_die0' : 'marine_corpse';
        if (b.respawnT <= 0) this.respawnBody(game, b);
        return;
      }
      if (!inp) return;
      const fwd = (inp.f ? 1 : 0) - (inp.b ? 1 : 0);
      const str = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
      const spd = b.crouched ? 1.9 : 3.4;
      let mx = b.dirX * fwd - b.dirY * str;
      let my = b.dirY * fwd + b.dirX * str;
      const ml = Math.hypot(mx, my);
      if (ml > 0.01) {
        mx /= ml; my /= ml;
        D.ent.tryMove(game, b, b.x + mx * spd * dt, b.y + my * spd * dt, false);
        b.walkT += dt;
        b.faceA = Math.atan2(my, mx);
      }
      // gravity + jump
      const ground = D.ent.groundAt(game, b);
      b.vz -= 9.5 * dt;
      b.z += b.vz * dt;
      const ceil = D.ent.ceilAt(game, b.x, b.y);
      if (b.z + b.bodyH > ceil) { b.z = ceil - b.bodyH; b.vz = Math.min(b.vz, 0); }
      if (b.z <= ground) { b.z = ground; b.vz = 0; b.grounded = true; }
      else if (b.z > ground + 0.02) b.grounded = false;
      if (inp.j && b.grounded) { b.vz = 3.2; b.grounded = false; }
      b.crouched = !!inp.c;
      // firing
      b.cooldown = Math.max(0, b.cooldown - dt);
      b.fireFlash = Math.max(0, b.fireFlash - dt);
      const wp = D.weapons[b.weapon] || D.weapons.pistol;
      const wantFire = wp.auto ? inp.fi : (inp.fp || 0) > b.lastFp;
      b.lastFp = inp.fp || 0;
      if (wantFire && b.cooldown <= 0) {
        b.cooldown = wp.interval;
        b.fireFlash = 0.1;
        D.audio.sfx(wp.snd, { vol: 0.5 });
        game.makeNoise(b.x, b.y, 12);
        const aim = Math.atan2(b.dirY, b.dirX);
        const slope = (b.pitch || 0) / 270;
        const mz = b.z + (b.crouched ? 0.22 : 0.46);
        if (wp.melee) {
          for (const e of game.ents) {
            if (e.gone || e.dead || !(e.type === 'enemy' || e.kind === 'barrel')) continue;
            if (D.dist(b.x, b.y, e.x, e.y) < 1.35) { game.hurtEnt(e, D.randInt(...wp.dmg), b.dirX, b.dirY, b); break; }
          }
        } else if (wp.proj) {
          game.ents.push(D.ent.makeProjectile(b.x + b.dirX * 0.4, b.y + b.dirY * 0.4, mz, aim, slope * D.ent.PROJ[wp.proj].speed, wp.proj, b));
        } else {
          for (let i = 0; i < (wp.pellets || 1); i++) {
            const a = aim + (Math.random() - 0.5) * 2 * (wp.spread || 0.02);
            D.ent.hitscan(game, b.x, b.y, mz, Math.cos(a), Math.sin(a), D.randInt(...wp.dmg), b, slope);
          }
        }
      }
      // marine anim for everyone else's eyes
      const frame = b.fireFlash > 0 ? 'attack' : (Math.floor(b.walkT * 5) % 2 ? 'walk1' : 'walk0');
      b.sprite = 'marine_' + frame;
    },

    hurtBody(game, b, dmg, attacker) {
      if (b.dead) return;
      if (this.mpMode === 'coop' && (attacker === 'player' || (attacker && attacker.type === 'gplayer'))) return; // no friendly fire
      b.hp -= dmg;
      if (b.hp <= 0) {
        b.hp = 0; b.dead = true; b.respawnT = 2.5;
        game.addStain(b.x, b.y, 0.5);
        D.audio.sfx('die', { vol: 0.5 });
        const who = attacker === 'player' ? 'the host' : attacker && attacker.type === 'gplayer' ? 'a marine' : 'the base';
        game.message(`marine ${b.id + 1} was slain by ${who}.`);
        if (this.mpMode === 'dm') {
          if (attacker === 'player') game.frags = (game.frags || 0) + 1;
          else if (attacker && attacker.type === 'gplayer') attacker.frags++;
        }
      }
    },

    respawnBody(game, b) {
      const spots = this.spawnSpots(game);
      const s = spots[Math.floor(Math.random() * spots.length)];
      b.x = s.x; b.y = s.y; b.z = D.ent.floorAt(game, s.x, s.y);
      b.hp = 100; b.dead = false; b.vz = 0;
      game.spawnFx(b.x, b.y, 'puff', 0.8, 0.4);
      D.audio.sfx('tele', { vol: 0.5 });
    },

    spawnSpots(game) {
      const spots = [{ x: game.player.x, y: game.player.y }];
      const m = game.map;
      for (let i = 0; i < m.grid.length; i += 17) {
        if (m.grid[i] === 0 && Math.abs(m.floorH[i]) < 0.1) spots.push({ x: (i % m.w) + 0.5, y: ((i / m.w) | 0) + 0.5 });
        if (spots.length > 8) break;
      }
      return spots;
    },

    // ---------------- snapshots (host -> guests) ----------------
    encodeSnapshot(game) {
      this.ensureTables();
      const r2 = (v) => Math.round(v * 50) / 50;
      const pl = [[r2(game.player.x), r2(game.player.y), r2(game.player.z), r2(game.player.dirX), r2(game.player.dirY),
        Math.round(game.player.hp), game.player.fireFlash > 0 ? 1 : 0, game.player.dead ? 1 : 0, game.frags || 0]];
      for (const peer of this.peers) {
        const b = peer.body;
        pl.push(b ? [r2(b.x), r2(b.y), r2(b.z), r2(b.dirX), r2(b.dirY), Math.round(b.hp), b.fireFlash > 0 ? 1 : 0, b.dead ? 1 : 0, b.frags] : null);
      }
      const e = [];
      for (const ent of game.ents) {
        if (ent.gone || ent.type === 'tele') continue;
        const si = this.sprIdx[ent.sprite];
        if (si === undefined) continue;
        e.push([si, r2(ent.x), r2(ent.y), r2((ent.z || 0) + (ent.lift || 0)), ent.sprH || 0.7, ent.flash > 0 ? 1 : 0, ent.bright ? 1 : 0]);
      }
      const d = {};
      for (const [i, door] of Object.entries(game.doors)) if (door.open > 0.001) d[i] = r2(door.open);
      const fh = [];
      for (const mv of game.map.movers) {
        for (const c of mv.cells) fh.push([c, r2(mv.type === 'lift' ? game.map.floorH[c] : game.map.ceilH[c]), mv.type === 'lift' ? 0 : 1]);
      }
      return JSON.stringify({ k: 's', pl, e, d, fh, b: r2(game.boost), hud: game.msgT > 0 ? game.msg : '' });
    },

    applySnapshot(game, snap) {
      this.ensureTables();
      const me = snap.pl[this.myId + 1]; // slot 0 is the host
      const p = game.player;
      if (me) {
        // authoritative position, smoothed; direction stays local-feeling
        p.x = D.lerp(p.x, me[0], 0.5);
        p.y = D.lerp(p.y, me[1], 0.5);
        p.z = D.lerp(p.z, me[2], 0.5);
        p.hp = me[5];
        p.dead = !!me[7];
        game.frags = me[8];
      }
      // rebuild the visible world
      const ents = [];
      snap.e.forEach((row) => {
        ents.push({
          type: 'remote', sprite: this.sprNames[row[0]],
          x: row[1], y: row[2], z: row[3], sprH: row[4],
          flash: row[5] ? 1 : 0, bright: !!row[6], solid: false,
        });
      });
      // other players as marines
      snap.pl.forEach((pd, slot) => {
        if (!pd || slot === this.myId + 1) return;
        ents.push({
          type: 'remote', sprite: pd[7] ? 'marine_corpse' : (pd[6] ? 'marine_attack' : 'marine_walk0'),
          x: pd[0], y: pd[1], z: pd[2], sprH: 0.78, flash: 0, solid: false,
        });
      });
      game.ents = ents;
      for (const [i, open] of Object.entries(snap.d)) {
        if (game.doors[i]) { game.doors[i].open = open; game.doors[i].state = open >= 1 ? 'open' : 'opening'; }
      }
      for (const d of Object.values(game.doors)) if (!(d.x + d.y * game.map.w in snap.d) && snap.d[d.y * game.map.w + d.x] === undefined && d.open > 0 && !snap.d[String(d.y * game.map.w + d.x)]) { /* leave easing to host truth below */ }
      for (const [c, v, isCeil] of snap.fh) {
        if (isCeil) game.map.ceilH[c] = v; else game.map.floorH[c] = v;
      }
      game.boost = snap.b;
      if (snap.hud && snap.hud !== game.msg) { game.msg = snap.hud; game.msgT = 2; }
      this.lastSnap = snap;
    },

    encodeInput(game) {
      const i = D.input, p = game.player;
      this.fpCount = (this.fpCount || 0) + (i.firePressed ? 1 : 0);
      return JSON.stringify({
        k: 'i', f: i.fwd ? 1 : 0, b: i.back ? 1 : 0, l: i.sl ? 1 : 0, r: i.sr ? 1 : 0,
        j: i.jumpPressed ? 1 : 0, c: i.crouch ? 1 : 0, u: i.usePressed ? 1 : 0,
        fi: i.fire ? 1 : 0, fp: this.fpCount,
        dx: Math.round(p.dirX * 100) / 100, dy: Math.round(p.dirY * 100) / 100,
        pt: Math.round(p.pitch), w: p.weapon,
      });
    },

    // ---------------- per-frame hooks ----------------
    hostUpdate(game, dt) {
      for (const peer of this.peers) this.stepBody(game, peer, dt);
      // guests pressing use: open doors near their bodies
      for (const peer of this.peers) {
        if (peer.input && peer.input.u && peer.body && !peer.body.dead) {
          const b = peer.body;
          const tx = b.x + b.dirX, ty = b.y + b.dirY;
          const door = game.doors[(ty | 0) * game.map.w + (tx | 0)];
          if (door && door.kind === 'door' && (door.state === 'closed' || door.state === 'closing')) game.openDoor(door);
          peer.input.u = 0;
        }
      }
      this.snapTimer -= dt;
      if (this.snapTimer <= 0) {
        this.snapTimer = 1 / SNAP_HZ;
        const snap = this.encodeSnapshot(game);
        for (const peer of this.peers) {
          if (peer.dc && peer.dc.readyState === 'open') { try { peer.dc.send(snap); } catch (e) {} }
        }
      }
    },

    guestUpdate(game, dt) {
      this.inputTimer -= dt;
      if (this.inputTimer <= 0 && this.guestConn && this.guestConn.dc && this.guestConn.dc.readyState === 'open') {
        this.inputTimer = 1 / INPUT_HZ;
        try { this.guestConn.dc.send(this.encodeInput(game)); } catch (e) {}
      }
    },

    handleMessage(game, peer, raw) {
      let msg;
      try { msg = JSON.parse(raw); } catch (e) { return; }
      if (this.role === 'host' && msg.k === 'i') this.applyGuestInput(game, peer, msg);
      else if (this.role === 'guest' && msg.k === 's') this.applySnapshot(game, msg);
      else if (this.role === 'guest' && msg.k === 'init') {
        this.myId = msg.id;
        this.mpMode = msg.mode;
        game.diff = msg.diff;
        game.player = null;
        if (msg.custom) game.startLevel(-1, true, D.customCodec.decode(msg.custom));
        else game.startLevel(msg.level, true);
        game.message(`connected — ${msg.mode === 'dm' ? 'DEATHMATCH' : 'CO-OP'} as marine ${msg.id + 1}`);
      }
    },

    // ---------------- WebRTC plumbing (browser only) ----------------
    rtcConfig: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },

    async hostInvite() {
      // one pending invite at a time — a second click must not orphan the pc
      // whose offer the guest is answering (that caused "wrong state: stable")
      if (this.pendingHost && this.pendingHost.pc.signalingState === 'have-local-offer') {
        return this.pendingHost.code;
      }
      const pc = new RTCPeerConnection(this.rtcConfig);
      const dc = pc.createDataChannel('doomed', { ordered: false, maxRetransmits: 0 });
      const peer = { pc, dc, id: this.peers.length, input: null, body: null, frags: 0, accepted: false };
      dc.onmessage = (ev) => this.handleMessage(D.game, peer, ev.data);
      dc.onopen = () => {
        this.role = 'host';
        peer.body = this.makeBody(peer.id);
        D.game.ents.push(peer.body);
        const customCode = D.game.map && D.game.map.meta.custom ? D.game.map.__code || null : null;
        dc.send(JSON.stringify({
          k: 'init', id: peer.id, mode: this.mpMode, diff: D.game.diff,
          level: D.game.levelIdx >= 0 ? D.game.levelIdx : 0,
          custom: customCode,
        }));
        D.game.message(`marine ${peer.id + 1} has entered the base.`);
        this.pendingHost = null;
      };
      this.peers.push(peer);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await this.iceDone(pc);
      const code = btoa(JSON.stringify(pc.localDescription)).replace(/\+/g, '-').replace(/\//g, '_');
      this.pendingHost = { pc, peer, code };
      return code;
    },

    async hostAccept(answerCode) {
      const peer = this.pendingHost ? this.pendingHost.peer : this.peers[this.peers.length - 1];
      if (!peer) throw new Error('no invite is waiting — press HOST first');
      if (peer.accepted || peer.pc.signalingState !== 'have-local-offer') {
        throw new Error('this invite was already answered (state: ' + peer.pc.signalingState + ')');
      }
      let desc;
      try { desc = JSON.parse(atob(answerCode.replace(/-/g, '+').replace(/_/g, '/'))); }
      catch (e) { throw new Error('that is not a valid answer code'); }
      if (desc.type !== 'answer') throw new Error('paste the JOINER\'s answer code, not an offer');
      peer.accepted = true;
      await peer.pc.setRemoteDescription(desc);
    },

    async joinWithOffer(offerCode) {
      // tearing down a stale attempt keeps a re-paste from erroring
      if (this.guestConn && this.guestConn.pc) { try { this.guestConn.pc.close(); } catch (e) {} }
      let desc;
      try { desc = JSON.parse(atob(offerCode.replace(/-/g, '+').replace(/_/g, '/'))); }
      catch (e) { throw new Error('that is not a valid host code'); }
      if (desc.type !== 'offer') throw new Error('paste the HOST\'s code, not your own answer');
      const pc = new RTCPeerConnection(this.rtcConfig);
      this.guestConn = { pc, dc: null };
      pc.ondatachannel = (ev) => {
        this.guestConn.dc = ev.channel;
        this.role = 'guest';
        ev.channel.onmessage = (mev) => this.handleMessage(D.game, null, mev.data);
      };
      await pc.setRemoteDescription(desc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await this.iceDone(pc);
      return btoa(JSON.stringify(pc.localDescription)).replace(/\+/g, '-').replace(/\//g, '_');
    },

    iceDone(pc) {
      return new Promise((res) => {
        if (pc.iceGatheringState === 'complete') return res();
        const check = () => { if (pc.iceGatheringState === 'complete') { pc.removeEventListener('icegatheringstatechange', check); res(); } };
        pc.addEventListener('icegatheringstatechange', check);
        setTimeout(res, 3500); // don't hang on slow ICE
      });
    },
  };
})();
