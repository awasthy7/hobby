// DOOMED — game state machine, player, doors, HUD, and all the ceremony:
// fire title, screen melt, intermission tallies, the face that watches you.
(function () {
  const DIFFS = [
    { name: "I'M TOO YOUNG TO DIE", mult: 0.5 },
    { name: 'HURT ME PLENTY', mult: 1 },
    { name: 'ULTRA-VIOLENCE', mult: 1.3 },
    { name: 'NIGHTMARE!', mult: 1.6, nightmare: true },
  ];

  // ---------------- DOOM fire (title backdrop) ----------------
  const fire = {
    W: 192, H: 90, buf: null, cv: null,
    palette: [],
    init() {
      this.buf = new Uint8Array(this.W * this.H).fill(0);
      for (let x = 0; x < this.W; x++) this.buf[(this.H - 1) * this.W + x] = 36;
      this.cv = document.createElement('canvas');
      this.cv.width = this.W; this.cv.height = this.H;
      this.g = this.cv.getContext('2d');
      this.img = this.g.createImageData(this.W, this.H);
      const stops = [[7,7,7],[31,7,7],[47,15,7],[71,15,7],[87,23,7],[103,31,7],[119,31,7],[143,39,7],[159,47,7],[175,63,7],[191,71,7],[199,71,7],[223,79,7],[223,87,7],[223,87,7],[215,95,7],[215,103,15],[207,111,15],[207,119,15],[207,127,15],[207,135,23],[199,135,23],[199,143,23],[199,151,31],[191,159,31],[191,159,31],[191,167,39],[191,167,39],[191,175,47],[183,175,47],[183,183,47],[183,183,55],[207,207,111],[223,223,159],[239,239,199],[255,255,255],[255,255,255]];
      this.palette = stops;
    },
    update() {
      const { W, H, buf } = this;
      for (let x = 0; x < W; x++) {
        for (let y = 1; y < H; y++) {
          const src = y * W + x;
          const v = buf[src];
          if (v === 0) { buf[src - W] = 0; continue; }
          const rnd = (Math.random() * 3) | 0;
          const dst = src - W - rnd + 1;
          buf[Math.max(0, dst)] = v - (rnd & 1);
        }
      }
      const d = this.img.data;
      for (let i = 0; i < buf.length; i++) {
        const c = this.palette[buf[i]] || this.palette[0];
        d[i * 4] = c[0]; d[i * 4 + 1] = c[1]; d[i * 4 + 2] = c[2]; d[i * 4 + 3] = 255;
      }
      this.g.putImageData(this.img, 0, 0);
    },
    setLit(on) {
      for (let x = 0; x < this.W; x++) this.buf[(this.H - 1) * this.W + x] = on ? 36 : 0;
    },
  };

  // ---------------- the face ----------------
  function drawFace(g, x, y, s, w) {
    const p = w.player;
    const hp = Math.max(0, p.hp);
    const bracket = hp > 80 ? 0 : hp > 60 ? 1 : hp > 40 ? 2 : hp > 20 ? 3 : 4;
    const dead = p.dead;
    const pain = w.facePain > 0;
    const grin = w.faceGrin > 0;
    const look = Math.sin(w.time * 0.7) * (pain || grin ? 0 : 3);
    g.save();
    g.translate(x, y);
    // head
    const skin = ['#c9a179', '#c39572', '#b8886a', '#a87a60', '#95685a'][bracket];
    g.fillStyle = skin;
    g.fillRect(-s * 0.42, -s * 0.5, s * 0.84, s);
    g.fillStyle = '#7a5c3e'; // hair
    g.fillRect(-s * 0.42, -s * 0.5, s * 0.84, s * 0.2);
    g.fillRect(-s * 0.42, -s * 0.5, s * 0.12, s * 0.34);
    g.fillRect(s * 0.3, -s * 0.5, s * 0.12, s * 0.34);
    // blood as hp drops
    if (bracket >= 1) { g.fillStyle = '#8a1410'; g.fillRect(-s * 0.1 + look, -s * 0.5, s * 0.14, s * 0.26); }
    if (bracket >= 2) { g.fillStyle = '#8a1410'; g.fillRect(-s * 0.4, -s * 0.06, s * 0.2, s * 0.1); }
    if (bracket >= 3) { g.fillStyle = '#a01812'; g.fillRect(s * 0.14, -s * 0.14, s * 0.22, s * 0.12); g.fillRect(-s * 0.2, s * 0.3, s * 0.5, s * 0.08); }
    if (bracket >= 4) { g.fillStyle = '#a01812'; g.fillRect(-s * 0.42, -s * 0.34, s * 0.84, s * 0.16); }
    // eyes
    if (dead) {
      g.strokeStyle = '#301808'; g.lineWidth = s * 0.05;
      for (const ex of [-s * 0.18, s * 0.18]) {
        g.beginPath(); g.moveTo(ex - s * 0.08, -s * 0.2); g.lineTo(ex + s * 0.08, -s * 0.06); g.stroke();
        g.beginPath(); g.moveTo(ex + s * 0.08, -s * 0.2); g.lineTo(ex - s * 0.08, -s * 0.06); g.stroke();
      }
    } else if (pain) {
      g.fillStyle = '#fff';
      g.fillRect(-s * 0.28, -s * 0.22, s * 0.2, s * 0.14);
      g.fillRect(s * 0.08, -s * 0.22, s * 0.2, s * 0.14);
      g.fillStyle = '#301808';
      g.fillRect(-s * 0.22, -s * 0.2, s * 0.08, s * 0.1);
      g.fillRect(s * 0.14, -s * 0.2, s * 0.08, s * 0.1);
    } else {
      g.fillStyle = '#efe8dc';
      g.fillRect(-s * 0.28 + look, -s * 0.2, s * 0.18, s * 0.12);
      g.fillRect(s * 0.1 + look, -s * 0.2, s * 0.18, s * 0.12);
      g.fillStyle = '#243048';
      g.fillRect(-s * 0.24 + look * 1.4, -s * 0.18, s * 0.09, s * 0.09);
      g.fillRect(s * 0.14 + look * 1.4, -s * 0.18, s * 0.09, s * 0.09);
      g.fillStyle = '#7a5c3e';
      g.fillRect(-s * 0.3, -s * 0.3, s * 0.22, s * 0.06);
      g.fillRect(s * 0.08, -s * 0.3, s * 0.22, s * 0.06);
    }
    // mouth
    g.fillStyle = dead ? '#301808' : '#5c3a2a';
    if (dead) g.fillRect(-s * 0.14, s * 0.26, s * 0.28, s * 0.08);
    else if (grin) {
      g.fillStyle = '#2a1408';
      g.fillRect(-s * 0.2, s * 0.2, s * 0.4, s * 0.12);
      g.fillStyle = '#efe6d0';
      g.fillRect(-s * 0.18, s * 0.2, s * 0.36, s * 0.05);
    } else if (pain) { g.beginPath(); g.ellipse(0, s * 0.28, s * 0.12, s * 0.14, 0, 0, D.TAU); g.fill(); }
    else g.fillRect(-s * 0.16, s * 0.28, s * 0.32, s * 0.05 + bracket * 0.015 * s);
    g.restore();
  }

  // ---------------- weapon view models ----------------
  function drawWeapon(g, w) {
    const p = w.player;
    const wp = D.weapons[p.weapon];
    const bobX = Math.sin(p.bobT * 6) * 14 * p.bobAmt;
    const bobY = Math.abs(Math.cos(p.bobT * 6)) * 10 * p.bobAmt + p.kickT * 46;
    const switchY = (1 - Math.abs(p.switchT)) * 160;
    const cx = 480 + bobX, cy = 470 + bobY + switchY;
    const fired = p.fireFlash > 0;
    g.save();
    g.translate(cx, cy);
    const skin = '#c9a179', skinD = '#a5825f';
    const metal = (x, y, w2, h2, top, bottom) => {
      const gr = g.createLinearGradient(0, y, 0, y + h2);
      gr.addColorStop(0, top); gr.addColorStop(1, bottom);
      g.fillStyle = gr; g.fillRect(x, y, w2, h2);
    };
    const wood = (x, y, w2, h2) => metal(x, y, w2, h2, '#7c4522', '#4a2812');
    const hand = (x, y, w2, h2) => {
      metal(x, y, w2, h2, skin, skinD);
      g.fillStyle = 'rgba(60,35,18,0.35)';
      for (let k = 1; k < 4; k++) g.fillRect(x + (w2 / 4) * k - 1, y, 2, h2 * 0.4);
    };
    if (fired && p.weapon !== 'chaingun') {
      flare(g, 0, p.weapon === 'shotgun' ? -108 : -96, p.weapon === 'shotgun' ? 52 : 34);
    }
    if (p.weapon === 'pistol') {
      hand(-26, -34, 52, 60);
      g.fillStyle = '#b08b62'; g.fillRect(-26, -6, 52, 10);
      metal(-13, -96, 26, 66, '#5a5852', '#262422');
      metal(-13, -96, 26, 20, '#7c7a72', '#4c4a46');
      g.fillStyle = 'rgba(255,255,255,0.16)'; g.fillRect(-13, -96, 4, 66);
      g.fillStyle = '#141210'; g.fillRect(-5, -100, 10, 8);
    } else if (p.weapon === 'shotgun') {
      metal(-20, -110, 40, 54, '#504e48', '#282624');
      metal(-20, -110, 40, 14, '#82807a', '#504e48');
      g.fillStyle = 'rgba(255,255,255,0.14)'; g.fillRect(-20, -110, 5, 54);
      g.fillStyle = '#141210'; g.fillRect(-14, -114, 12, 8); g.fillRect(2, -114, 12, 8);
      wood(-24, -58, 48, 26);
      g.fillStyle = 'rgba(255,240,220,0.12)'; g.fillRect(-24, -58, 48, 5);
      hand(-34, -46, 30, 26); // pump hand
      hand(6, 4, 34, 26);     // trigger hand
      wood(-8, -12, 40, 30);
    } else if (p.weapon === 'fists') {
      const zerk = p.berserkT > 0;
      const jab = p.kickT;
      g.save();
      g.translate(-52 + jab * 26, -6 - jab * 30);
      metal(-20, -22, 44, 34, zerk ? '#d86a5a' : skin, zerk ? '#a03428' : skinD);
      g.fillStyle = 'rgba(60,35,18,0.4)';
      for (let k = 0; k < 4; k++) g.fillRect(-16 + k * 10, -22, 3, 12);
      g.restore();
      g.save();
      g.translate(52 - (1 - jab) * 8, -10 - (1 - jab) * 12);
      metal(-22, -20, 44, 34, zerk ? '#d86a5a' : skin, zerk ? '#a03428' : skinD);
      g.fillStyle = 'rgba(60,35,18,0.4)';
      for (let k = 0; k < 4; k++) g.fillRect(-18 + k * 10, -20, 3, 12);
      g.restore();
    } else if (p.weapon === 'rocket') {
      metal(-30, -104, 60, 72, '#4a5040', '#242a1e');
      metal(-30, -104, 60, 14, '#6a7058', '#4a5040');
      g.fillStyle = '#141210';
      g.beginPath(); g.arc(0, -104, 22, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(-30, -104, 6, 72);
      hand(-42, -30, 30, 28); hand(14, -8, 32, 26);
      wood(-12, -32, 30, 26);
    } else if (p.weapon === 'plasma') {
      metal(-26, -96, 52, 60, '#2c3a4c', '#141c26');
      for (let i = 0; i < 3; i++) metal(-30, -88 + i * 18, 60, 8, '#3e5470', '#26364a');
      g.fillStyle = `rgba(106,200,255,${fired ? 0.95 : 0.55})`;
      g.fillRect(-8, -102, 16, 8);
      hand(-40, -26, 28, 26); hand(12, -12, 30, 26);
      if (fired) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const halo = g.createRadialGradient(0, -100, 2, 0, -100, 40);
        halo.addColorStop(0, 'rgba(160,220,255,0.9)');
        halo.addColorStop(1, 'rgba(60,140,255,0)');
        g.fillStyle = halo;
        g.beginPath(); g.arc(0, -100, 40, 0, D.TAU); g.fill();
        g.restore();
      }
    } else if (p.weapon === 'chaingun') {
      const spin = p.spin || 0;
      metal(-40, -50, 80, 44, '#4a4844', '#242220');
      metal(-40, -50, 80, 12, '#787670', '#4a4844');
      for (let i = 0; i < 3; i++) {
        const yy = -84 + ((spin * 30 + i * 12) % 36);
        metal(-30, yy, 60, 9, i % 2 ? '#504e48' : '#6c6a64', i % 2 ? '#302e2a' : '#44423e');
      }
      g.fillStyle = '#141210'; g.fillRect(-34, -88, 68, 8);
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(-34, -88, 68, 2);
      hand(-52, -22, 26, 26); hand(26, -22, 26, 26);
      if (fired) flare(g, 0, -92, 40);
    }
    g.restore();
  }
  function flare(g, x, y, r) {
    g.save();
    g.translate(x, y);
    g.globalCompositeOperation = 'lighter';
    const halo = g.createRadialGradient(0, 0, 2, 0, 0, r * 1.8);
    halo.addColorStop(0, 'rgba(255,240,190,0.9)');
    halo.addColorStop(0.4, 'rgba(255,180,80,0.4)');
    halo.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = halo;
    g.beginPath(); g.arc(0, 0, r * 1.8, 0, D.TAU); g.fill();
    g.fillStyle = 'rgba(255,225,140,0.95)';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i * D.TAU / 8 + 0.3;
      const rr = i % 2 ? r : r * 0.42;
      g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    g.fillStyle = '#fffbe8';
    g.beginPath(); g.arc(0, 0, r * 0.28, 0, D.TAU); g.fill();
    g.restore();
  }

  // ---------------- story cards ----------------
  const STORY = {
    start: [
      'The hobby directory went quiet three days ago.',
      'Then the dig site under Hangar Bay broke into something that was',
      'never a mine. The crew stopped answering. The machines did not.',
      '',
      'You have a pistol, fifty rounds, and the only working keycard.',
      'Go find out what is still running down there.',
    ],
    afterOverseer: [
      'The Overseer is a smear on the foundry floor.',
      '',
      'But its death rattle went OUT — down through the rock, along',
      'cables older than the base. Something below acknowledged.',
      'The catacombs are open. The dead there have stopped lying still.',
    ],
    preFinale: [
      'Past the spire there is no more sky.',
      '',
      'Every signal in the complex terminates in one chamber. Every',
      'cable. Every prayer. The miners called it the Machine Heart',
      'before it ate them.',
      '',
      'It is expecting you. It grew the others FOR you.',
    ],
    ending: [
      'The Heart bursts, and for one long second every light in the',
      'complex burns white — then, for the first time in years,',
      'the dark below the world is just dark.',
      '',
      'You climb toward the surface, boots loud in the new silence.',
      'The hobby directory is safe. For now.',
      '',
      'E1 — THE DIG — COMPLETE',
    ],
  };

  // medals + best times survive the browser closing
  const progress = {
    data: null,
    load() {
      try { this.data = JSON.parse(localStorage.getItem('doomed_progress')) || {}; }
      catch (e) { this.data = {}; }
      this.data.maps = this.data.maps || {};
      this.data.bestFloor = this.data.bestFloor || 0;
      return this.data;
    },
    save() { try { localStorage.setItem('doomed_progress', JSON.stringify(this.data)); } catch (e) {} },
  };
  progress.load();

  // ---------------- game object ----------------
  D.game = {
    mode: 'title', time: 0,
    menuIdx: 1, levelIdx: 0, diff: 1,
    menuStage: 'diff', levelSel: 0,
    endless: null, story: null, progress,
    paused: false,
    player: null, ents: [], doors: {}, map: null,
    boost: 0, shake: 0, redFlash: 0, bonusFlash: 0,
    facePain: 0, faceGrin: 0, msg: '', msgT: 0,
    noise: 0, noiseRadius: 0, nightmare: false,
    stats: null, totals: null, automap: false,
    meltCv: null, meltCols: null, meltT: 0, meltNext: null,
    cheatBuf: '', god: false,

    init(cv, g) {
      this.cv = cv; this.g = g;
      fire.init();
      D.rc.init();
    },

    // ============ level lifecycle ============
    startEndless(floor, seed, fresh) {
      this.endless = { floor, seed };
      const map = D.genEndless(floor, seed);
      this.startLevel(-1, fresh, map);
    },

    startLevel(idx, fresh, mapOverride) {
      const src = mapOverride || D.maps[idx];
      this.levelIdx = idx;
      if (idx >= 0) this.endless = null;
      this.map = {
        w: src.w, h: src.h, grid: src.grid.slice(), meta: src.meta,
        floorH: src.floorH.slice(), ceilH: src.ceilH.slice(), wallT: src.wallT,
        movers: src.movers.map(m => ({ ...m, cells: m.cells.slice(), t: 0, state: m.type === 'lift' ? 'low' : m.state, dmgT: 0 })),
        triggers: (src.triggers || []).map(t => ({ ...t, fired: false })),
        secretExits: src.secretExits || [],
      };
      this.doors = {};
      for (const [k, d] of Object.entries(src.doors)) {
        this.doors[k] = { ...d, open: 0, state: 'closed', timer: 0, found: false, wantOpen: false };
      }
      this.ents = [];
      let px = 2, py = 2;
      for (const t of src.things) {
        if (t.type === 'player') { px = t.x; py = t.y; continue; }
        if (t.type === 'tele') {
          this.ents.push({
            type: 'tele', x: t.x, y: t.y, tx: t.tx, ty: t.ty,
            sprite: 'tele_0', sprH: 0.035, bright: true, solid: false,
            z: this.map.floorH[(t.y | 0) * this.map.w + (t.x | 0)], lift: 0.01,
          });
          continue;
        }
        const e = D.ent.spawn(t);
        if (e) {
          e.z = this.map.grid[(t.y | 0) * this.map.w + (t.x | 0)] ? 0 : this.map.floorH[(t.y | 0) * this.map.w + (t.x | 0)];
          if (e.fly) e.z += 0.5;
          this.ents.push(e);
        }
      }
      // dust motes hang in the lamplight (GL renderer makes them glow)
      for (const t of src.things) {
        if (t.type !== 'lamp') continue;
        for (let i = 0; i < 6; i++) {
          this.ents.push({
            type: 'mote', sprite: 'mote_0', solid: false, sprH: 0.018, bright: true,
            baseX: t.x + D.rand(-0.9, 0.9), baseY: t.y + D.rand(-0.9, 0.9),
            x: t.x, y: t.y, z: D.rand(0.25, 1.0), baseZ: D.rand(0.25, 1.0), ph: D.rand(0, 6.28),
          });
        }
      }
      const old = this.player;
      const ang = src.meta.dir || 0;
      this.player = {
        x: px, y: py, dirX: Math.cos(ang), dirY: Math.sin(ang),
        hp: fresh ? 100 : old.hp, armor: fresh ? 0 : old.armor,
        ammo: fresh ? { bullets: 50, shells: 0, rockets: 0, cells: 0 }
          : { bullets: old.ammo.bullets, shells: old.ammo.shells, rockets: old.ammo.rockets || 0, cells: old.ammo.cells || 0 },
        weapons: fresh ? { pistol: true, fists: true } : { ...old.weapons, fists: true },
        weapon: fresh ? 'pistol' : old.weapon,
        berserkT: 0,
        keys: { blue: false, red: false },
        cooldown: 0, bobT: 0, bobAmt: 0, kickT: 0, fireFlash: 0,
        switchT: 1, pendingSwitch: null, spin: 0, dead: false, radius: 0.28,
        pitch: 0,
        z: this.map.floorH[(py | 0) * this.map.w + (px | 0)] || 0,
        vz: 0, grounded: true, crouched: false, bodyH: 0.55, eyeH: 0.46,
      };
      D.light.bake(this.map, src.things);
      this.stains = new Float32Array(this.map.w * this.map.h);
      this.lights = [];
      this.stats = { kills: 0, items: 0, secrets: 0, time: 0 };
      this.totals = {
        kills: this.ents.filter(e => e.countKill).length,
        items: this.ents.filter(e => e.countItem).length,
        secrets: Object.values(this.doors).filter(d => d.kind === 'secret').length,
      };
      this.boost = 0; this.shake = 0; this.redFlash = 0; this.bonusFlash = 0;
      this.msg = ''; this.msgT = 0;
      this.cleared = false;
      this.paused = false;
      this.mapLatch = false;
      // prerender the minimap's static walls (doors drawn live on top)
      this.miniCv = document.createElement('canvas');
      this.miniCv.width = this.map.w; this.miniCv.height = this.map.h;
      const mg2 = this.miniCv.getContext('2d');
      for (let y = 0; y < this.map.h; y++) {
        for (let x = 0; x < this.map.w; x++) {
          const c = this.map.grid[y * this.map.w + x];
          if (!c) continue;
          mg2.fillStyle = c === D.tex.EXIT ? '#3ae83a' : 'rgba(196,182,156,0.85)';
          mg2.fillRect(x, y, 1, 1);
        }
      }
      D.input.mouseDX = D.input.mouseDY = 0;
      this.mode = 'level';
      const track = idx < 0
        ? ['e1', 'e2', 'e3'][(this.endless ? this.endless.floor : 1) % 3]
        : ['e1', 'e2', 'e1', 'e3', 'e2', 'e1', 'e2', 'e3', 'e1'][idx] || 'e1';
      D.audio.startMusic(track);
      D.audio.intensity = 1;
      this.message(this.map.meta.name);
    },

    message(m) { this.msg = m.toUpperCase(); this.msgT = 3; },
    makeNoise(x, y, r) { this.noise = 0.12; this.noiseRadius = r; },
    addStain(x, y, amt) {
      if (!this.stains) return;
      const i = (y | 0) * this.map.w + (x | 0);
      if (i >= 0 && i < this.stains.length) this.stains[i] = Math.min(1, this.stains[i] + amt);
    },

    // ============ combat glue ============
    hurtEnt(e, dmg, kx, ky, attacker) {
      if (e.gone) return;
      if (e.kind === 'barrel') {
        e.hp -= dmg; e.flash = 1; e.lastAttacker = attacker;
        if (e.hp <= 0) D.ent.explodeBarrel(e, this);
        return;
      }
      if (e.type !== 'enemy' || e.dead) return;
      e.hp -= dmg;
      e.flash = 1;
      this.addStain(e.x, e.y, 0.1);
      // INFIGHTING: monsters remember who hurt them
      if (attacker && attacker !== 'player' && attacker.type === 'enemy' && attacker !== e) {
        e.grudge = attacker;
      }
      if (e.state === 'sleep') { e.state = 'wake'; e.stateT = 0; }
      if (e.hp <= 0) {
        e.dead = true; e.solid = false; e.stateT = 0; e.state = 'die';
        if (e.countKill) { this.stats.kills++; e.countKill = false; }
        this.addStain(e.x, e.y, 0.55);
        const def = D.ent.DEFS[e.etype];
        const gibbed = e.hp < -25 && e.etype !== 'boss';
        D.audio.sfx(gibbed ? 'gib' : 'enemyDie', { vol: 0.8 });
        if (gibbed) {
          // overkill: the body comes apart and stays apart
          e.gone = true;
          this.addStain(e.x, e.y, 0.85);
          for (let i = 0; i < 7; i++) {
            const a = D.rand(0, D.TAU);
            this.ents.push({
              type: 'gib', x: e.x, y: e.y, z: (e.z || 0) + 0.35,
              dx: Math.cos(a) * D.rand(0.8, 2.6), dy: Math.sin(a) * D.rand(0.8, 2.6),
              vz: D.rand(1.2, 3.2), animT: Math.random(),
              sprite: 'gib_0', sprH: 0.09, solid: false,
            });
          }
        }
        if (def.drops) {
          this.ents.push({ type: 'pickup', kind: def.drops, x: e.x, y: e.y, z: e.z || 0, sprH: D.ent.PICKUPS[def.drops].sprH, sprite: def.drops + '_0', solid: false, lift: 0.02 });
        }
        if (e.etype === 'boss') this.message('the overseer falls. the way is open.');
      } else if (Math.random() < D.ent.DEFS[e.etype].pain) {
        e.state = 'pain'; e.stateT = 0;
        D.audio.sfx('enemyPain', { vol: 0.5 });
      }
    },

    damagePlayer(dmg, from) {
      const p = this.player;
      if (p.dead || this.god) return;
      dmg = Math.max(1, Math.round(dmg * DIFFS[this.diff].mult));
      if (p.armor > 0) {
        const absorb = Math.min(p.armor, Math.ceil(dmg / 3));
        p.armor -= absorb; dmg -= absorb;
      }
      p.hp -= dmg;
      this.redFlash = Math.min(0.75, this.redFlash + dmg * 0.02 + 0.18);
      this.facePain = 0.7;
      this.shake = Math.min(0.4, this.shake + dmg * 0.008);
      D.audio.sfx('hurt', { vol: 0.7 });
      if (p.hp <= 0) {
        p.hp = 0; p.dead = true;
        D.audio.sfx('die');
        D.audio.stopMusic();
      }
    },

    spawnFx(x, y, kind, sprH, lift) {
      const frames = kind === 'explo' ? ['explo_0', 'explo_1', 'explo_2'] : kind === 'blood' ? ['blood_0', 'blood_1'] : ['puff_0', 'puff_1'];
      this.ents.push({
        type: 'fx', x, y, z: D.ent.floorAt(this, x, y),
        frames, t: 0, rate: kind === 'explo' ? 9 : 12, sprite: frames[0],
        sprH: sprH || 0.4, lift: lift ?? 0.3, bright: kind === 'explo', solid: false,
      });
    },

    // ============ update ============
    togglePause() {
      if (this.mode !== 'level') return;
      if (D.net && D.net.role !== 'off') { this.message('no pausing a shared world.'); return; }
      this.paused = !this.paused;
      if (D.audio.ctx) { this.paused ? D.audio.ctx.suspend() : D.audio.ctx.resume(); }
    },

    update(dt) {
      if (this.paused && this.mode === 'level') return;
      this.paused = false; // leaving level mode always unpauses
      this.time += dt;
      if (this.mode === 'title' || this.mode === 'victory') { fire.update(); this.updateTitle(dt); return; }
      if (this.mode === 'story') { fire.update(); this.updateStory(dt); return; }
      if (this.mode === 'melt') { this.updateMelt(dt); return; }
      if (this.mode === 'inter') { this.updateInter(dt); return; }
      if (this.mode === 'level') this.updateLevel(dt);
    },

    updateTitle(dt) {
      const inp = D.input;
      if (this.mode === 'victory') {
        if (inp.enterPressed || inp.firePressed) {
          D.audio.sfx('menuGo');
          this.mode = 'title'; this.menuStage = 'diff';
          D.audio.startMusic('title');
        }
        return;
      }
      if (inp.downPressed || inp.upPressed) {
        const dir = inp.downPressed ? 1 : -1;
        const nLevels = D.MAIN_LEVELS + 1; // campaign entries + ENDLESS
        if (this.menuStage === 'diff') this.menuIdx = (this.menuIdx + dir + DIFFS.length) % DIFFS.length;
        else this.levelSel = (this.levelSel + dir + nLevels) % nLevels;
        D.audio.sfx('menu');
      }
      if (inp.enterPressed || inp.firePressed) {
        if (this.menuStage === 'diff') {
          this.diff = this.menuIdx;
          this.nightmare = !!DIFFS[this.diff].nightmare;
          this.menuStage = 'level';
          D.audio.sfx('menuGo');
        } else {
          D.audio.sfx('menuGo');
          this.menuStage = 'diff';
          this.player = null;
          const lvl = this.levelSel;
          if (lvl >= D.MAIN_LEVELS) {
            const seed = this.urlSeed || Math.random().toString(36).slice(2, 8);
            this.startMelt(() => this.startEndless(this.urlFloor || 1, seed, true));
          } else if (lvl === 0) {
            this.showStory(STORY.start, () => this.startLevel(0, true));
          } else {
            this.startMelt(() => this.startLevel(lvl, true));
          }
        }
      }
    },

    updateLevel(dt) {
      const p = this.player;
      const inp = D.input;
      this.noise = Math.max(0, this.noise - dt);
      this.boost = Math.max(0, this.boost - dt * 2.2);
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.redFlash = Math.max(0, this.redFlash - dt * 1.4);
      this.bonusFlash = Math.max(0, this.bonusFlash - dt * 2);
      this.facePain = Math.max(0, this.facePain - dt);
      this.faceGrin = Math.max(0, this.faceGrin - dt);
      this.msgT = Math.max(0, this.msgT - dt);
      this.stats.time += dt;
      this.automap = inp.map || this.mapLatch;

      // ---- guest client: local aim, remote everything ----
      if (D.net && D.net.role === 'guest') {
        const rot = ((inp.turnR ? 1 : 0) - (inp.turnL ? 1 : 0)) * 2.6 * dt + inp.mouseDX * 0.0022;
        inp.mouseDX = 0;
        if (rot) {
          const c = Math.cos(rot), s = Math.sin(rot);
          const dx = p.dirX * c - p.dirY * s;
          p.dirY = p.dirX * s + p.dirY * c;
          p.dirX = dx;
        }
        p.pitch = D.clamp(p.pitch - inp.mouseDY * 0.16, -80, 80);
        inp.mouseDY = 0;
        p.eyeH = D.lerp(p.eyeH, inp.crouch ? 0.22 : 0.46, Math.min(1, dt * 10));
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.kickT = Math.max(0, p.kickT - dt * 4);
        p.fireFlash = Math.max(0, p.fireFlash - dt);
        if (inp.firePressed && p.cooldown <= 0) {
          const wp = D.weapons[p.weapon];
          p.cooldown = wp.interval; p.kickT = 1; p.fireFlash = 0.09;
          D.audio.sfx(wp.snd, { vol: 0.8 });
        }
        for (const [key, wname] of [['w1', 'pistol'], ['w2', 'shotgun'], ['w3', 'chaingun'], ['w4', 'rocket'], ['w5', 'plasma'], ['w6', 'fists']]) {
          if (inp[key + 'Pressed']) p.weapon = wname;
        }
        this.lights = this.lights || [];
        this.lights.length = 0;
        if (p.fireFlash > 0) this.lights.push({ x: p.x, y: p.y, s: 1.4, k: 0.35, r: 1, g: 0.82, b: 0.5 });
        D.net.guestUpdate(this, dt);
        this.msgT = Math.max(0, this.msgT - dt);
        return;
      }

      if (p.dead) {
        if (D.net && D.net.role === 'host' && D.net.mpMode === 'dm') {
          // deathmatch hosts respawn like everyone else
          p.respawnT = (p.respawnT || 2.5) - dt;
          if (p.respawnT <= 0) {
            const spots = D.net.spawnSpots(this);
            const s = spots[Math.floor(Math.random() * spots.length)];
            p.x = s.x; p.y = s.y; p.z = D.ent.floorAt(this, s.x, s.y);
            p.hp = 100; p.dead = false; p.respawnT = 0; p.vz = 0;
            D.audio.startMusic(['e1', 'e2', 'e3'][this.levelIdx % 3] || 'e1');
            this.spawnFx(p.x, p.y, 'puff', 0.8, 0.4);
          }
          return;
        }
        if (inp.enterPressed || inp.usePressed) {
          if (this.endless) {
            const seed = this.endless.seed;
            this.startMelt(() => this.startEndless(1, seed, true));
          } else {
            this.startMelt(() => this.startLevel(this.levelIdx, true));
          }
        }
        return;
      }

      // ---- movement ----
      const turn = (inp.turnR ? 1 : 0) - (inp.turnL ? 1 : 0);
      const rot = turn * 2.6 * dt + inp.mouseDX * 0.0022;
      inp.mouseDX = 0;
      p.pitch = D.clamp(p.pitch - inp.mouseDY * 0.16, -80, 80);
      inp.mouseDY = 0;
      if (rot) {
        const c = Math.cos(rot), s = Math.sin(rot);
        const dx = p.dirX * c - p.dirY * s;
        p.dirY = p.dirX * s + p.dirY * c;
        p.dirX = dx;
      }
      const fwd = (inp.fwd ? 1 : 0) - (inp.back ? 1 : 0);
      const strafe = (inp.sr ? 1 : 0) - (inp.sl ? 1 : 0);
      const spd = p.crouched ? 1.9 : 3.4;
      let mx = p.dirX * fwd - p.dirY * strafe;
      let my = p.dirY * fwd + p.dirX * strafe;
      const ml = Math.sqrt(mx * mx + my * my);
      if (ml > 0.01) {
        mx /= ml; my /= ml;
        D.ent.tryMove(this, p, p.x + mx * spd * dt, p.y + my * spd * dt, false);
        if (p.grounded) { p.bobT += dt; p.bobAmt = Math.min(1, p.bobAmt + dt * 5); }
      } else p.bobAmt = Math.max(0, p.bobAmt - dt * 6);

      // ---- the vertical: gravity, jumping, crouching ----
      const ground = D.ent.groundAt(this, p);
      p.vz -= 9.5 * dt;
      p.z += p.vz * dt;
      const ceil = D.ent.ceilAt(this, p.x, p.y);
      const bodyH = p.crouched ? 0.34 : p.bodyH;
      if (p.z + bodyH > ceil) { p.z = ceil - bodyH; p.vz = Math.min(p.vz, 0); }
      if (p.z <= ground) {
        if (!p.grounded && p.vz < -6.2) {
          this.damagePlayer(Math.round((-p.vz - 6.2) * 9), null);
          this.message('the landing disagrees with you.');
        }
        if (!p.grounded && p.vz < -2) D.audio.sfx('kneel', { vol: 0.3 });
        p.z = ground; p.vz = 0; p.grounded = true;
      } else if (p.z > ground + 0.02) p.grounded = false;
      if (inp.jumpPressed && p.grounded && !p.crouched) {
        p.vz = 3.2; p.grounded = false;
        D.audio.sfx('step', { vol: 0.8 });
      }
      if (inp.crouch) p.crouched = true;
      else if (p.crouched) {
        // stand only if there is headroom
        if (ceil - Math.max(ground, p.z) >= p.bodyH + 0.02) p.crouched = false;
      }
      p.eyeH = D.lerp(p.eyeH, p.crouched ? 0.22 : 0.46, Math.min(1, dt * 10));

      // ---- movers: lifts rise, crushers hunger ----
      for (const m of this.map.movers) {
        if (m.type === 'lift') {
          const onIt = (ent) => !ent.gone && m.cells.includes(((ent.y | 0) * this.map.w + (ent.x | 0))) && ent.z <= this.map.floorH[m.cells[0]] + 0.08;
          const occupied = onIt(p) || this.ents.some(e => (e.type === 'enemy' && !e.dead) && onIt(e));
          const cur = this.map.floorH[m.cells[0]];
          let target = cur;
          if (m.state === 'low') { if (occupied) { m.state = 'rising'; D.audio.sfx('door', { vol: 0.5 }); } }
          else if (m.state === 'rising') { target = m.high; if (cur >= m.high - 0.001) { m.state = 'high'; m.t = 0; } }
          else if (m.state === 'high') { m.t += dt; if (m.t > 2.2 && !occupied) { m.state = 'lowering'; D.audio.sfx('door', { vol: 0.4 }); } }
          else if (m.state === 'lowering') { target = m.low; if (cur <= m.low + 0.001) m.state = 'low'; }
          if (target !== cur) {
            const nv = cur + Math.sign(target - cur) * m.speed * dt;
            const clamped = Math.sign(target - cur) > 0 ? Math.min(nv, m.high) : Math.max(nv, m.low);
            for (const c of m.cells) this.map.floorH[c] = clamped;
            // riders come along
            const ride = (ent) => {
              const ci = (ent.y | 0) * this.map.w + (ent.x | 0);
              if (m.cells.includes(ci) && ent.z <= clamped + 0.1) { ent.z = clamped; if (ent === p) p.grounded = true; }
            };
            ride(p);
            for (const e of this.ents) if (e.solid || e.type === 'pickup') ride(e);
          }
        } else if (m.type === 'crusher') {
          m.t += dt;
          if (m.top === undefined) m.top = D.CEIL;
          const ph = m.t * m.speed + (m.phase || 0);
          const gap = m.low + (m.top - m.low) * (0.5 + 0.5 * Math.cos(ph));
          for (const c of m.cells) this.map.ceilH[c] = gap;
          const closing = Math.sin(ph) > 0;
          m.dmgT -= dt;
          if (closing && m.dmgT <= 0) {
            const hurts = (ent, isP) => {
              const ci = (ent.y | 0) * this.map.w + (ent.x | 0);
              if (!m.cells.includes(ci)) return;
              const bh = isP ? (p.crouched ? 0.34 : p.bodyH) : (ent.sprH || 0.7);
              if (gap - Math.max(this.map.floorH[ci], ent.z) < bh) {
                if (isP) this.damagePlayer(12, null);
                else this.hurtEnt(ent, 20, 0, 0);
                this.shake = Math.min(0.5, this.shake + 0.2);
                m.dmgT = 0.4;
              }
            };
            hurts(p, true);
            for (const e of this.ents) if (e.type === 'enemy' && !e.dead) hurts(e, false);
          }
        }
      }

      // ---- weapons ----
      p.cooldown = Math.max(0, p.cooldown - dt);
      p.kickT = Math.max(0, p.kickT - dt * 4);
      p.fireFlash = Math.max(0, p.fireFlash - dt);
      if (p.pendingSwitch && p.pendingSwitch !== p.weapon) p.targetWeapon = p.pendingSwitch, p.pendingSwitch = null;
      for (const [key, wname] of [['w1', 'pistol'], ['w2', 'shotgun'], ['w3', 'chaingun'], ['w4', 'rocket'], ['w5', 'plasma'], ['w6', 'fists']]) {
        if (inp[key + 'Pressed'] && p.weapons[wname] && p.weapon !== wname) p.targetWeapon = wname;
      }
      p.berserkT = Math.max(0, (p.berserkT || 0) - dt);
      if (p.targetWeapon) {
        p.switchT -= dt * 5;
        if (p.switchT <= 0) { p.weapon = p.targetWeapon; p.targetWeapon = null; }
      } else if (p.switchT < 1) p.switchT = Math.min(1, p.switchT + dt * 5);

      const wp = D.weapons[p.weapon];
      const wantFire = wp.auto ? inp.fire : inp.firePressed;
      if (wantFire && p.cooldown <= 0 && !p.targetWeapon) {
        const hasAmmo = wp.melee || p.ammo[wp.ammo] >= wp.use;
        if (hasAmmo) {
          if (!wp.melee) p.ammo[wp.ammo] -= wp.use;
          p.cooldown = wp.interval;
          p.kickT = 1; p.fireFlash = wp.melee ? 0.05 : 0.09;
          if (!wp.melee) this.boost = Math.min(0.5, this.boost + 0.3);
          D.audio.sfx(wp.snd);
          this.makeNoise(p.x, p.y, wp.melee ? 4 : 13);
          const aim = Math.atan2(p.dirY, p.dirX);
          const slope = p.pitch / 270;
          const muzzleZ = p.z + p.eyeH;
          if (wp.melee) {
            // fists: nearest body in a short arc; berserk turns them lethal
            const mult = p.berserkT > 0 ? 8 : 1;
            let best = null, bestD = 1.35;
            for (const e of this.ents) {
              if (e.gone || e.dead || !(e.type === 'enemy' || e.kind === 'barrel')) continue;
              const d = D.dist(p.x, p.y, e.x, e.y);
              if (d > bestD) continue;
              const angTo = Math.atan2(e.y - p.y, e.x - p.x);
              let da = angTo - aim;
              while (da > Math.PI) da -= D.TAU;
              while (da < -Math.PI) da += D.TAU;
              if (Math.abs(da) < 0.75) { best = e; bestD = d; }
            }
            if (best) {
              this.hurtEnt(best, D.randInt(...wp.dmg) * mult, p.dirX, p.dirY, 'player');
              D.audio.sfx('gib', { vol: 0.4 });
              if (p.berserkT > 0) this.shake = Math.min(0.4, this.shake + 0.2);
            }
          } else if (wp.proj) {
            const speed = D.ent.PROJ[wp.proj].speed;
            this.ents.push(D.ent.makeProjectile(
              p.x + p.dirX * 0.4, p.y + p.dirY * 0.4, muzzleZ - 0.06,
              aim, slope * speed, wp.proj, 'player'));
          } else {
            for (let i = 0; i < wp.pellets; i++) {
              const a = aim + (Math.random() - 0.5) * 2 * wp.spread;
              D.ent.hitscan(this, p.x, p.y, muzzleZ, Math.cos(a), Math.sin(a), D.randInt(...wp.dmg), 'player',
                slope + (Math.random() - 0.5) * (wp.spread + 0.02));
            }
          }
        } else if (inp.firePressed) {
          D.audio.sfx('noway', { vol: 0.5 });
          if (p.weapon !== 'pistol' && p.ammo.bullets > 0) p.targetWeapon = 'pistol';
        }
      }
      if (p.weapon === 'chaingun' && inp.fire && p.ammo.bullets > 0) p.spin = (p.spin || 0) + dt * 3;

      // ---- use ----
      if (inp.usePressed) this.tryUse();

      // ---- dynamic score: the music tracks the heat of the fight ----
      let awake = 0, bossUp = false;
      for (const e of this.ents) {
        if (e.type !== 'enemy' || e.dead || e.state === 'sleep') continue;
        awake++;
        if (e.etype === 'boss') bossUp = true;
      }
      D.audio.intensity = bossUp ? 3 : awake >= 4 ? 2 : awake >= 1 ? 1 : 0;

      // ---- cleared bonus: no monsters left, nothing stays shut ----
      if (!this.cleared && this.totals.kills > 0 && this.stats.kills >= this.totals.kills) {
        this.cleared = true;
        this.message('area cleared — all doors open.');
        D.audio.sfx('keycard');
      }

      // ---- doors ----
      for (const d of Object.values(this.doors)) {
        if (this.cleared && d.kind === 'door' && (d.state === 'closed' || d.state === 'closing')) {
          this.openDoor(d, true);
        }
        if (d.wantOpen) { d.wantOpen = false; if (d.state === 'closed' && d.kind === 'door') this.openDoor(d, true); }
        const cx = d.x + 0.5, cy = d.y + 0.5;
        const near = D.dist(p.x, p.y, cx, cy) < 2 || this.ents.some(e => e.type === 'enemy' && !e.dead && D.dist(e.x, e.y, cx, cy) < 1.5);
        if (d.state === 'opening') {
          d.open += dt * 1.6;
          if (d.open >= 1) { d.open = 1; d.state = 'open'; d.timer = 8; }
        } else if (d.state === 'open' && d.kind !== 'secret') {
          d.timer -= dt;
          if (d.timer <= 0 && !near && !this.cleared) { d.state = 'closing'; D.audio.sfx('door', { vol: 0.6 }); }
        } else if (d.state === 'closing') {
          // bounce back open if anyone steps into the doorway mid-close
          if (near && D.dist(p.x, p.y, cx, cy) < 1) { d.state = 'opening'; }
          else {
            d.open -= dt * 1.6;
            if (d.open <= 0) { d.open = 0; d.state = 'closed'; }
          }
        }
      }

      // ---- teleporters ----
      p.teleCd = Math.max(0, (p.teleCd || 0) - dt);
      for (const e of this.ents) if (e.type === 'enemy') e.teleCd = Math.max(0, (e.teleCd || 0) - dt);
      for (const t of this.ents) {
        if (t.type !== 'tele') continue;
        for (const u of [p, ...this.ents.filter(e => e.type === 'enemy' && !e.dead && !e.fly)]) {
          if ((u.teleCd || 0) > 0) continue;
          if (D.dist(u.x, u.y, t.x, t.y) < 0.45) {
            this.spawnFx(u.x, u.y, 'puff', 0.8, 0.4);
            u.x = t.tx; u.y = t.ty;
            u.z = D.ent.floorAt(this, u.x, u.y); u.vz = 0;
            u.teleCd = 1.3;
            if (u === p) this.boost = Math.min(0.6, this.boost + 0.4);
            this.spawnFx(u.x, u.y, 'puff', 0.8, 0.4);
            D.audio.sfx('tele');
            this.makeNoise(u.x, u.y, 6);
          }
        }
      }

      // ---- ambush triggers ----
      for (const tr of this.map.triggers || []) {
        if (tr.fired) continue;
        if (p.x >= tr.x1 && p.x <= tr.x2 + 1 && p.y >= tr.y1 && p.y <= tr.y2 + 1) {
          tr.fired = true;
          for (const c of tr.cells) {
            const door = this.doors[c];
            if (door) this.openDoor(door, true);
          }
          this.makeNoise(p.x, p.y, 18);
          if (tr.msg) this.message(tr.msg);
          D.audio.sfx('door');
        }
      }

      // ---- entities ----
      for (const e of this.ents) D.ent.update(e, dt, this);
      this.ents = this.ents.filter(e => !e.gone);

      // ---- multiplayer host: guest bodies + snapshots ----
      if (D.net && D.net.role === 'host') D.net.hostUpdate(this, dt);

      // ---- dust motes drift ----
      for (const e of this.ents) {
        if (e.type !== 'mote') continue;
        e.x = e.baseX + Math.sin(this.time * 0.21 + e.ph) * 0.28;
        e.y = e.baseY + Math.cos(this.time * 0.17 + e.ph * 1.7) * 0.28;
        e.z = e.baseZ + Math.sin(this.time * 0.4 + e.ph * 2.3) * 0.12;
      }

      // ---- dynamic lights: muzzle, projectiles, explosions ----
      const L = this.lights;
      L.length = 0;
      if (p.fireFlash > 0 || this.boost > 0.05) {
        const s = Math.min(1, p.fireFlash * 8 + this.boost);
        L.push({ x: p.x, y: p.y, s: s * 1.6, k: 0.35, r: 1, g: 0.82, b: 0.5 });
      }
      for (const e of this.ents) {
        if (L.length >= 6) break;
        if (e.gone) continue;
        if (e.type === 'proj') {
          if (e.kind === 'greenball') L.push({ x: e.x, y: e.y, s: 1.1, k: 0.8, r: 0.35, g: 1, b: 0.4 });
          else if (e.kind === 'plasma') L.push({ x: e.x, y: e.y, s: 1.2, k: 0.8, r: 0.4, g: 0.7, b: 1 });
          else if (e.kind === 'rocket') L.push({ x: e.x, y: e.y, s: 1.4, k: 0.6, r: 1, g: 0.6, b: 0.25 });
          else L.push({ x: e.x, y: e.y, s: 1.1, k: 0.8, r: 1, g: 0.55, b: 0.22 });
        } else if (e.type === 'fx' && e.frames[0] === 'explo_0' && e.t < 0.28) {
          L.push({ x: e.x, y: e.y, s: 2.6 * (1 - e.t * 3), k: 0.25, r: 1, g: 0.7, b: 0.35 });
        }
      }
    },

    // what would E do right now? (non-mutating twin of tryUse, for hints)
    peekUse() {
      const p = this.player;
      for (const d of [0.4, 0.7, 1.0, 1.3]) {
        const tx = p.x + p.dirX * d, ty = p.y + p.dirY * d;
        if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) break;
        const idx = (ty | 0) * this.map.w + (tx | 0);
        const cell = this.map.grid[idx];
        if (!cell) continue;
        if (cell === D.tex.EXIT) return { kind: 'exit' };
        const door = this.doors[idx];
        if (!door) return null;
        if (door.kind === 'secret') return null;      // never spoil a secret
        if (door.kind === 'blue' && !p.keys.blue) return { kind: 'locked', key: 'BLUE' };
        if (door.kind === 'red' && !p.keys.red) return { kind: 'locked', key: 'RED' };
        if (door.state === 'closed' || door.state === 'closing') return { kind: 'door' };
        return null;
      }
      return null;
    },

    tryUse() {
      const p = this.player;
      // trace the use ray — first solid cell within reach gets used
      for (const d of [0.4, 0.7, 1.0, 1.3]) {
        const tx = p.x + p.dirX * d, ty = p.y + p.dirY * d;
        if (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) break;
        const idx = (ty | 0) * this.map.w + (tx | 0);
        const cell = this.map.grid[idx];
        if (!cell) continue;
        if (cell === D.tex.EXIT) {
          D.audio.sfx('switch');
          D.audio.stopMusic();
          this.exitWasSecret = this.map.secretExits.includes(idx);
          this.awardMedals();
          this.startMelt(() => { this.mode = 'inter'; this.interT = 0; D.audio.startMusic('inter'); });
          return;
        }
        const door = this.doors[idx];
        if (!door) break; // plain wall
        if (door.kind === 'blue' && !p.keys.blue) { this.message('you need a blue keycard.'); D.audio.sfx('doorLocked'); return; }
        if (door.kind === 'red' && !p.keys.red) { this.message('you need a red keycard.'); D.audio.sfx('doorLocked'); return; }
        if (door.state === 'closed' || door.state === 'closing') this.openDoor(door);
        return;
      }
      D.audio.sfx('noway', { vol: 0.35 });
    },

    openDoor(door, byMonster) {
      door.state = 'opening';
      D.audio.sfx('door', { vol: byMonster ? 0.45 : 0.8 });
      if (door.kind === 'secret' && !door.found) {
        door.found = true;
        this.stats.secrets++;
        this.message('you found a secret!');
        D.audio.sfx('secret');
      }
    },

    // ============ melt transition ============
    startMelt(next) {
      if (!this.meltCv) {
        this.meltCv = document.createElement('canvas');
        this.meltCv.width = 960; this.meltCv.height = 540;
      }
      const mg = this.meltCv.getContext('2d');
      mg.fillStyle = '#000';
      mg.fillRect(0, 0, 960, 540);
      if (D.gl.ok && D.gl.glcv) mg.drawImage(D.gl.glcv, 0, 0, 960, 540);
      mg.drawImage(this.cv, 0, 0);
      this.meltCols = [];
      for (let i = 0; i < 96; i++) this.meltCols.push({ delay: Math.random() * 0.35, y: 0 });
      this.meltT = 0;
      this.meltNext = next;
      next(); // switch state now; melt reveals it
      this.modeAfter = this.mode;
      this.mode = 'melt';
    },

    updateMelt(dt) {
      this.meltT += dt;
      let done = true;
      for (const c of this.meltCols) {
        if (this.meltT > c.delay) c.y += dt * (900 + c.delay * 1400);
        if (c.y < 540) done = false;
      }
      if (this.modeAfter === 'level' && this.mode === 'melt') {
        // keep world sim gently alive during reveal (doors, fx)
      }
      if (done) this.mode = this.modeAfter;
    },

    // medals earned the moment you flip the exit switch
    awardMedals() {
      const s = this.stats, t = this.totals, meta = this.map.meta;
      this.medals = {
        par: s.time <= meta.par,
        kills: t.kills > 0 && s.kills >= t.kills,
        secrets: t.secrets > 0 && s.secrets >= t.secrets,
      };
      if (this.endless) {
        if (this.endless.floor > progress.data.bestFloor) {
          progress.data.bestFloor = this.endless.floor;
          progress.save();
        }
        return;
      }
      const key = 'm' + this.levelIdx;
      const rec = progress.data.maps[key] || { medals: {}, bestTime: Infinity };
      rec.medals.par = rec.medals.par || this.medals.par;
      rec.medals.kills = rec.medals.kills || this.medals.kills;
      rec.medals.secrets = rec.medals.secrets || this.medals.secrets;
      rec.bestTime = Math.min(rec.bestTime, Math.round(s.time));
      progress.data.maps[key] = rec;
      progress.save();
    },

    // where does this level lead? (secret exits, story cards, the end)
    advance() {
      if (this.endless) {
        this.startMelt(() => this.startEndless(this.endless.floor + 1, this.endless.seed, false));
        return;
      }
      const meta = this.map.meta;
      if (meta.custom) {
        // a shared map is its own little campaign
        this.startMelt(() => { this.mode = 'title'; this.menuStage = 'diff'; D.audio.startMusic('title'); });
        return;
      }
      if (this.exitWasSecret && meta.secretNext !== undefined) {
        this.startMelt(() => this.startLevel(meta.secretNext, false));
        return;
      }
      if (meta.final) {
        this.showStory(STORY.ending, () => { this.mode = 'victory'; fire.setLit(true); D.audio.startMusic('victory'); });
        return;
      }
      const next = meta.next !== undefined ? meta.next : this.levelIdx + 1;
      const card = this.levelIdx === 3 ? STORY.afterOverseer : this.levelIdx === 6 ? STORY.preFinale : null;
      if (card) this.showStory(card, () => this.startLevel(next, false));
      else this.startMelt(() => this.startLevel(next, false));
    },

    showStory(lines, onDone) {
      this.story = { lines, onDone, t: 0, chars: 0 };
      this.mode = 'story';
      D.audio.startMusic('title');
    },

    updateStory(dt) {
      const st = this.story;
      st.t += dt;
      const total = st.lines.join('\n').length;
      st.chars = Math.min(total, st.chars + dt * 40);
      if (D.input.enterPressed || D.input.usePressed || D.input.firePressed || D.input.jumpPressed) {
        if (st.chars < total) st.chars = total;
        else { this.story = null; st.onDone(); }
      }
    },

    drawStory(g) {
      g.fillStyle = '#080505'; g.fillRect(0, 0, 960, 540);
      g.imageSmoothingEnabled = false;
      g.drawImage(fire.cv, 0, 0, fire.W, fire.H, 0, 0, 960, 540);
      g.fillStyle = 'rgba(8,5,5,0.78)'; g.fillRect(0, 0, 960, 540);
      const st = this.story;
      let remaining = Math.floor(st.chars);
      g.font = '20px "Courier New", monospace';
      g.textAlign = 'left'; g.textBaseline = 'top';
      let y = 120;
      for (const line of st.lines) {
        const shown = line.slice(0, Math.max(0, remaining));
        remaining -= line.length + 1;
        g.fillStyle = '#2a1410'; g.fillText(shown, 142, y + 2);
        g.fillStyle = '#d8b890'; g.fillText(shown, 140, y);
        y += 32;
      }
      if (remaining >= 0 && Math.floor(st.t * 1.5) % 2 === 0) {
        g.font = '15px monospace'; g.textAlign = 'center';
        g.fillStyle = '#8a6a4a';
        g.fillText('— press fire —', 480, 486);
      }
    },

    updateInter(dt) {
      this.interT += dt;
      if (D.input.enterPressed || D.input.usePressed || D.input.firePressed) {
        D.audio.sfx('menuGo');
        this.advance();
      }
    },

    // ============ draw ============
    draw(g) {
      switch (this.mode) {
        case 'title': this.drawTitle(g); break;
        case 'victory': this.drawVictory(g); break;
        case 'level': this.drawLevel(g); break;
        case 'inter': this.drawInter(g); break;
        case 'story': this.drawStory(g); break;
        case 'melt': {
          if (this.modeAfter === 'level') this.drawLevel(g);
          else if (this.modeAfter === 'inter') this.drawInter(g);
          else if (this.modeAfter === 'victory') this.drawVictory(g);
          else this.drawTitle(g);
          const cw = 960 / this.meltCols.length;
          for (let i = 0; i < this.meltCols.length; i++) {
            const c = this.meltCols[i];
            if (c.y >= 540) continue;
            g.drawImage(this.meltCv, i * cw, 0, cw, 540, i * cw, c.y, cw, 540);
          }
          break;
        }
      }
    },

    drawLevel(g) {
      const p = this.player;
      const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 30 : 0;
      const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 20 : 0;
      const bobPitch = Math.abs(Math.cos(p.bobT * 6)) * 2.4 * p.bobAmt;
      const view = {
        x: p.x, y: p.y, dirX: p.dirX, dirY: p.dirY,
        planeX: -p.dirY * 0.66, planeY: p.dirX * 0.66,
        map: this.map, doors: this.doors, ents: this.ents,
        boost: this.boost * 0.4 + p.fireFlash * 1.2,
        pitch: (p.pitch + shakeY * 0.6 - bobPitch) * (D.rc.RH / 270),
        eyeZ: p.z + p.eyeH,
        lights: this.lights, stains: this.stains,
      };
      if (D.gl.ok) {
        try {
          D.gl.render(view, this.time);
          g.clearRect(0, 0, 960, 540);
        } catch (err) {
          console.error('DOOMED: WebGL render failed, switching to software.', err);
          D.gl.ok = false;
        }
      }
      if (!D.gl.ok) {
        D.rc.render(view);
        g.save();
        g.translate(shakeX, shakeY + Math.abs(Math.cos(p.bobT * 6)) * 5 * p.bobAmt);
        D.rc.blit(g);
        g.restore();
      }

      if (!p.dead) drawWeapon(g, this);

      // screen tints
      if (p.berserkT > 0) {
        const bz = Math.min(0.26, p.berserkT > 57 ? (60 - p.berserkT) * 0.12 : p.berserkT * 0.0038 + 0.04);
        g.fillStyle = `rgba(190,16,8,${bz})`; g.fillRect(0, 0, 960, 540);
      }
      if (this.redFlash > 0) { g.fillStyle = `rgba(180,10,5,${Math.min(0.6, this.redFlash)})`; g.fillRect(0, 0, 960, 540); }
      if (this.bonusFlash > 0) { g.fillStyle = `rgba(220,190,60,${Math.min(0.3, this.bonusFlash)})`; g.fillRect(0, 0, 960, 540); }
      if (p.dead) {
        g.fillStyle = 'rgba(120,8,4,0.45)'; g.fillRect(0, 0, 960, 540);
        this.bigText(g, 'YOU DIED', 480, 230, 64, '#ff3a2a');
        if (this.endless) {
          this.smallText(g, `the descent ends at floor ${this.endless.floor} · seed ${this.endless.seed}`, 480, 284, '#e8c9a0');
          this.smallText(g, 'press USE to start the run over', 480, 314, '#e8c9a0');
        } else {
          this.smallText(g, 'press USE to try again', 480, 290, '#e8c9a0');
        }
      }

      // crosshair fixed at screen center — pitch tilts the world (and the shot)
      if (!p.dead) {
        g.fillStyle = 'rgba(255,255,255,0.75)';
        g.fillRect(478, 268, 4, 4);
        g.fillRect(472, 269, 3, 2); g.fillRect(485, 269, 3, 2);

        // context hint: what would USE do right here?
        const peek = this.peekUse();
        if (peek) {
          const useKey = D.touch && D.touch.active ? 'USE' : 'E';
          let txt, col = '#e8e2d4';
          if (peek.kind === 'door') txt = `${useKey} — open`;
          else if (peek.kind === 'exit') { txt = `${useKey} — throw the switch`; col = '#7ce080'; }
          else if (peek.kind === 'locked') { txt = `locked — find the ${peek.key} keycard`; col = peek.key === 'BLUE' ? '#7a9aff' : '#ff7a6a'; }
          if (txt) {
            g.font = 'bold 15px monospace';
            g.textAlign = 'center'; g.textBaseline = 'middle';
            const w2 = g.measureText(txt).width + 22;
            g.fillStyle = 'rgba(8,6,6,0.62)';
            g.fillRect(480 - w2 / 2, 296, w2, 26);
            g.fillStyle = col;
            g.fillText(txt, 480, 309);
          }
        }
      }

      // message
      if (this.msgT > 0) {
        g.globalAlpha = Math.min(1, this.msgT);
        this.smallText(g, this.msg, 12, 24, '#e83a28', 'left');
        g.globalAlpha = 1;
      }

      if (this.automap) this.drawAutomap(g);
      else this.drawMini(g);
      this.drawHUD(g);
      this.drawTouchUI(g);

      // pause overlay doubles as the controls card
      if (this.paused) {
        g.fillStyle = 'rgba(4,3,3,0.72)';
        g.fillRect(0, 0, 960, 540);
        this.bigText(g, 'PAUSED', 480, 180, 64, '#e8c93a');
        const lines = D.touch && D.touch.active ? [
          'left thumb — walk · right thumb — aim',
          'FIRE shoots · JMP jumps · USE opens doors & switches',
          'WPN cycles weapons · MAP toggles the map',
          '',
          'tap ❚❚ to resume',
        ] : [
          'WASD move · mouse aims · CLICK / CTRL fire',
          'SPACE jump · C crouch · E use doors & switches',
          '1-6 weapons · TAB map · N multiplayer',
          '',
          'P or ESC to resume',
        ];
        lines.forEach((l, i) => this.smallText(g, l, 480, 256 + i * 30, i === lines.length - 1 ? '#e8c93a' : '#cfc4ae'));
      }
    },

    drawTouchUI(g) {
      if (!D.touch || !D.touch.active) return;
      g.save();
      g.globalAlpha = 0.35;
      // move stick
      const mv = D.touch.move;
      const ox = mv ? mv.ox : 130, oy = mv ? mv.oy : 400;
      g.strokeStyle = '#fff'; g.lineWidth = 2;
      g.beginPath(); g.arc(ox, oy, 52, 0, D.TAU); g.stroke();
      g.fillStyle = '#fff';
      g.beginPath(); g.arc(ox + (mv ? mv.dx * 40 : 0), oy + (mv ? mv.dy * 40 : 0), 20, 0, D.TAU); g.fill();
      // buttons
      for (const b of D.touchButtons) {
        const held = D.touch.buttons[b.id] !== undefined;
        g.globalAlpha = held ? 0.6 : 0.3;
        g.fillStyle = b.id === 'fire' ? '#e84a2a' : '#cfd4e0';
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, D.TAU); g.fill();
        g.globalAlpha = 0.8;
        g.fillStyle = '#0c0a08';
        g.font = `bold ${b.r > 40 ? 18 : 12}px monospace`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.label, b.x, b.y);
      }
      g.restore();
    },

    drawHUD(g) {
      const p = this.player;
      const y0 = 540 - 76;
      g.fillStyle = '#1c1a18'; g.fillRect(0, y0, 960, 76);
      g.fillStyle = '#2e2a26'; g.fillRect(0, y0, 960, 4);
      g.fillStyle = '#0c0a08'; g.fillRect(0, y0 + 4, 960, 2);
      const led = (v, x, y, c = '#e83a28', size = 40) => {
        g.font = `bold ${size}px 'Courier New', monospace`;
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#3a0c08';
        g.fillText(String(v), x + 2, y + 2);
        g.fillStyle = c;
        g.fillText(String(v), x, y);
      };
      const label = (t, x, y) => {
        g.font = 'bold 13px monospace'; g.textAlign = 'center';
        g.fillStyle = '#8a8074'; g.fillText(t, x, y);
      };
      // ammo
      led(D.weapons[p.weapon].melee ? '—' : p.ammo[D.weapons[p.weapon].ammo], 90, y0 + 36);
      label('AMMO', 90, y0 + 66);
      // health
      led(Math.max(0, p.hp) + '%', 240, y0 + 36, p.hp > 40 ? '#e83a28' : '#ff7a3a');
      label('HEALTH', 240, y0 + 66);
      // arms
      g.fillStyle = '#28241f'; g.fillRect(316, y0 + 8, 118, 60);
      label('ARMS', 375, y0 + 66);
      [['2', 'shotgun'], ['3', 'chaingun'], ['4', 'rocket'], ['5', 'plasma'], ['6', 'fists']].forEach(([n, wn], i) => {
        g.font = 'bold 17px monospace';
        g.fillStyle = p.weapon === wn ? '#fff0a0' : p.weapons[wn] ? '#e8c93a' : '#4a453e';
        g.fillText(n, 332 + i * 22, y0 + 38);
      });
      // face
      g.fillStyle = '#28241f'; g.fillRect(444, y0 + 6, 72, 66);
      drawFace(g, 480, y0 + 39, 56, this);
      // armor
      led(p.armor + '%', 620, y0 + 36, '#3a9ae8');
      label('ARMOR', 620, y0 + 66);
      // keys
      g.fillStyle = '#28241f'; g.fillRect(690, y0 + 8, 34, 60);
      if (p.keys.blue) { g.fillStyle = '#3050c8'; g.fillRect(697, y0 + 14, 20, 12); }
      if (p.keys.red) { g.fillStyle = '#c02418'; g.fillRect(697, y0 + 34, 20, 12); }
      // ammo table
      const rows = [['BULL', p.ammo.bullets, 200], ['SHEL', p.ammo.shells, 50], ['RCKT', p.ammo.rockets, 30], ['CELL', p.ammo.cells, 200]];
      rows.forEach(([nm, cur, mx], i) => {
        g.font = 'bold 12px monospace'; g.textAlign = 'left';
        g.fillStyle = '#8a8074'; g.fillText(nm, 760, y0 + 18 + i * 15);
        g.fillStyle = '#e8c93a'; g.textAlign = 'right';
        g.fillText(`${cur}/${mx}`, 940, y0 + 18 + i * 15);
      });
    },

    // always-on minimap, top-right; tap it (or TAB) for the full map
    drawMini(g) {
      const R = D.minimapRect || { x1: 824, y1: 28, x2: 952, y2: 168 };
      const w = R.x2 - R.x1, h = R.y2 - R.y1;
      g.fillStyle = 'rgba(10,8,8,0.5)';
      g.fillRect(R.x1, R.y1, w, h);
      g.strokeStyle = 'rgba(138,124,100,0.55)';
      g.lineWidth = 1;
      g.strokeRect(R.x1 + 0.5, R.y1 + 0.5, w - 1, h - 1);
      const m = this.map;
      const availW = w - 8, availH = h - 22;
      const sc = Math.min(availW / m.w, availH / m.h);
      const ox = R.x1 + (w - m.w * sc) / 2;
      const oy = R.y1 + 3 + (availH - m.h * sc) / 2;
      if (this.miniCv) {
        const smooth = g.imageSmoothingEnabled;
        g.imageSmoothingEnabled = false;
        g.drawImage(this.miniCv, ox, oy, m.w * sc, m.h * sc);
        g.imageSmoothingEnabled = smooth;
      }
      // doors, live (secrets stay disguised as wall)
      for (const d of Object.values(this.doors)) {
        if (d.kind === 'secret') continue;
        g.fillStyle = d.kind === 'blue' ? '#3050c8' : d.kind === 'red' ? '#c02418'
          : d.open > 0.5 ? 'rgba(184,160,96,0.3)' : '#b8a060';
        g.fillRect(ox + d.x * sc, oy + d.y * sc, Math.max(sc, 1.5), Math.max(sc, 1.5));
      }
      // awake enemies + keycards
      for (const e of this.ents) {
        if (e.type === 'enemy' && !e.dead && e.state !== 'sleep') {
          g.fillStyle = '#e83a28';
          g.fillRect(ox + e.x * sc - 1, oy + e.y * sc - 1, 2.5, 2.5);
        } else if (e.type === 'pickup' && (e.kind === 'keyB' || e.kind === 'keyR')) {
          g.fillStyle = e.kind === 'keyB' ? '#5a80ff' : '#ff5a4a';
          g.fillRect(ox + e.x * sc - 1, oy + e.y * sc - 1, 2, 2);
        }
      }
      // you
      const p = this.player;
      g.save();
      g.translate(ox + p.x * sc, oy + p.y * sc);
      g.rotate(Math.atan2(p.dirY, p.dirX));
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(4.5, 0); g.lineTo(-3, -3); g.lineTo(-3, 3); g.closePath(); g.fill();
      g.restore();
      g.font = '10px monospace'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = 'rgba(200,190,160,0.8)';
      g.fillText(D.touch && D.touch.active ? 'tap — full map' : 'TAB — full map', R.x1 + w / 2, R.y2 - 6);
    },

    drawAutomap(g) {
      const m = this.map, p = this.player;
      const sc = Math.min(880 / m.w, 380 / m.h);
      const ox = 480 - m.w * sc / 2, oy = 220 - m.h * sc / 2;
      g.fillStyle = 'rgba(6,4,4,0.82)'; g.fillRect(0, 0, 960, 540 - 76);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        const c = m.grid[y * m.w + x];
        if (!c) continue;
        const door = this.doors[y * m.w + x];
        g.fillStyle = door
          ? (door.kind === 'blue' ? '#3050c8' : door.kind === 'red' ? '#c02418' : door.kind === 'secret' ? '#6a4428' : '#b8a060')
          : c === D.tex.EXIT ? '#3ae83a' : '#8a2418';
        g.fillRect(ox + x * sc, oy + y * sc, sc - 0.5, sc - 0.5);
      }
      for (const e of this.ents) {
        if (e.type === 'enemy' && !e.dead && e.state !== 'sleep') {
          g.fillStyle = '#e83a28';
          g.fillRect(ox + e.x * sc - 2, oy + e.y * sc - 2, 4, 4);
        }
      }
      g.save();
      g.translate(ox + p.x * sc, oy + p.y * sc);
      g.rotate(Math.atan2(p.dirY, p.dirX));
      g.fillStyle = '#fff';
      g.beginPath(); g.moveTo(7, 0); g.lineTo(-5, -5); g.lineTo(-5, 5); g.closePath(); g.fill();
      g.restore();
      this.smallText(g, this.map.meta.name, 480, 30, '#e8c9a0');
    },

    // ============ screens ============
    bigText(g, t, x, y, size, color) {
      g.font = `900 ${size}px Impact, 'Arial Black', sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#000'; g.fillText(t, x + size * 0.06, y + size * 0.06);
      const grad = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      grad.addColorStop(0, color); grad.addColorStop(0.55, '#7a1008'); grad.addColorStop(1, color);
      g.fillStyle = grad;
      g.fillText(t, x, y);
    },
    smallText(g, t, x, y, color, align = 'center') {
      g.font = 'bold 17px monospace';
      g.textAlign = align; g.textBaseline = 'middle';
      g.fillStyle = '#000'; g.fillText(t, x + 1, y + 1);
      g.fillStyle = color; g.fillText(t, x, y);
    },

    drawTitle(g) {
      g.fillStyle = '#060404'; g.fillRect(0, 0, 960, 540);
      g.imageSmoothingEnabled = false;
      g.drawImage(fire.cv, 0, 0, fire.W, fire.H, 0, 0, 960, 540);
      this.bigText(g, 'DOOMED', 480, 150, 130, '#e83a28');
      this.smallText(g, 'a raycast homage — no WADs were harmed', 480, 225, '#b09a80');
      if (this.menuStage === 'diff') {
        DIFFS.forEach((d, i) => {
          const sel = i === this.menuIdx;
          this.smallText(g, (sel ? '▸ ' : '  ') + d.name + (sel ? ' ◂' : '  '), 480, 300 + i * 34, sel ? '#e8c93a' : '#9a8a74');
        });
        this.smallText(g, 'ENTER to choose your pain', 480, 508, '#e83a28');
      } else {
        this.smallText(g, '— ' + DIFFS[this.diff].name + ' —', 480, 262, '#9a8a74');
        for (let i = 0; i < D.MAIN_LEVELS; i++) {
          const m = D.maps[i];
          const sel = i === this.levelSel;
          const rec = progress.data.maps['m' + i];
          const glyphs = rec ? `  ${rec.medals.par ? '★' : ''}${rec.medals.kills ? '☠' : ''}${rec.medals.secrets ? '◉' : ''}` : '';
          this.smallText(g, (sel ? '▸ ' : '  ') + `E1M${i + 1}  ${m.meta.name}${glyphs}` + (sel ? ' ◂' : ''), 480, 292 + i * 23, sel ? '#e8c93a' : '#9a8a74');
        }
        const selE = this.levelSel >= D.MAIN_LEVELS;
        const best = progress.data.bestFloor;
        this.smallText(g, (selE ? '▸ ' : '  ') + 'ENDLESS DESCENT' + (best ? `  (best: floor ${best})` : '') + (selE ? ' ◂' : ''), 480, 292 + D.MAIN_LEVELS * 23 + 6, selE ? '#7ce080' : '#6a8a6e');
        this.smallText(g, 'ENTER to rip and tear', 480, 508, '#e83a28');
      }
      this.smallText(g, 'WASD move · mouse aims · CLICK fire · SPACE jump · C crouch · E use · 1-6 weapons · TAB map', 480, 466, '#7a7064');
      this.smallText(g, 'N — multiplayer (co-op / deathmatch) · editor.html — build & share your own maps · gamepad + touch ready', 480, 488, '#6a8a6e');
    },

    drawInter(g) {
      g.fillStyle = '#0c0605'; g.fillRect(0, 0, 960, 540);
      // slow scrolling brick backdrop
      const t = D.tex.list[D.tex.BRICK];
      g.globalAlpha = 0.25;
      g.imageSmoothingEnabled = false;
      if (!this.brickCv) {
        const S = D.tex.SIZE;
        this.brickCv = document.createElement('canvas');
        this.brickCv.width = S; this.brickCv.height = S;
        this.brickCv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(t.data), S, S), 0, 0);
      }
      for (let y = 0; y < 9; y++) for (let x = 0; x < 15; x++) g.drawImage(this.brickCv, x * 64, y * 64, 64, 64);
      g.globalAlpha = 1;
      this.bigText(g, this.map.meta.name, 480, 90, 56, '#e83a28');
      this.smallText(g, 'FINISHED', 480, 140, '#e8c93a');
      const reveal = Math.min(1, this.interT / 1.6);
      const rows = [
        ['KILLS', this.stats.kills, this.totals.kills],
        ['ITEMS', this.stats.items, this.totals.items],
        ['SECRETS', this.stats.secrets, this.totals.secrets],
      ];
      rows.forEach(([nm, got, tot], i) => {
        const pct = tot ? Math.round(100 * got / tot) : 100;
        const shown = Math.round(pct * Math.min(1, reveal * 3 - i * 0.8 > 0 ? reveal * 3 - i * 0.8 : 0));
        g.font = '900 34px Impact, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#e83a28';
        g.fillText(nm, 300, 220 + i * 60);
        g.textAlign = 'right'; g.fillStyle = '#e8c93a';
        g.fillText(shown + '%', 660, 220 + i * 60);
      });
      const mm = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      g.font = '900 28px Impact, sans-serif'; g.textAlign = 'left'; g.fillStyle = '#e83a28';
      g.fillText('TIME', 300, 410);
      g.textAlign = 'right'; g.fillStyle = '#e8c93a';
      g.fillText(mm(this.stats.time), 540, 410);
      g.textAlign = 'left'; g.fillStyle = '#e83a28';
      g.fillText('PAR', 580, 410);
      g.textAlign = 'right'; g.fillStyle = '#e8c93a';
      g.fillText(mm(this.map.meta.par), 760, 410);
      // medals
      if (this.medals && this.interT > 1.2) {
        const earned = [];
        if (this.medals.par) earned.push(['★ PAR BEAT', '#e8c93a']);
        if (this.medals.kills) earned.push(['☠ FULL CARNAGE', '#e85a3a']);
        if (this.medals.secrets) earned.push(['◉ NOTHING HIDDEN', '#7ce080']);
        earned.forEach(([txt, col], i) => {
          const x = 480 + (i - (earned.length - 1) / 2) * 220;
          g.font = '900 22px Impact, sans-serif'; g.textAlign = 'center';
          g.fillStyle = col; g.fillText(txt, x, 452);
        });
      }
      if (this.endless) {
        this.smallText(g, `seed ${this.endless.seed} · share ?endless=1&seed=${this.endless.seed} · best floor ${progress.data.bestFloor}`, 480, 66, '#8a9a8a');
      }
      if (this.interT > 1 && Math.floor(this.time * 2) % 2) {
        const prompt = this.endless ? 'press USE to descend'
          : this.map.meta.final ? 'press USE to end it'
          : this.exitWasSecret && this.map.meta.secretNext !== undefined ? 'press USE — you found somewhere older'
          : 'press USE for the next level';
        this.smallText(g, prompt, 480, 490, '#e8c9a0');
      }
    },

    drawVictory(g) {
      g.fillStyle = '#060404'; g.fillRect(0, 0, 960, 540);
      g.imageSmoothingEnabled = false;
      g.drawImage(fire.cv, 0, 0, fire.W, fire.H, 0, 0, 960, 540);
      this.bigText(g, 'YOU DID IT', 480, 140, 90, '#e83a28');
      const lines = [
        'the overseer is dead. the tunnels are quiet.',
        'somewhere above, the hobby directory is safe.',
        '',
        'three levels. one shotgun. no mercy.',
      ];
      lines.forEach((l, i) => this.smallText(g, l, 480, 240 + i * 32, '#e8c9a0'));
      this.smallText(g, 'ENTER — back to the title', 480, 460, '#e8c93a');
    },

    // cheats, typed raw
    cheat(ch) {
      this.cheatBuf = (this.cheatBuf + ch).slice(-8);
      if (this.cheatBuf.endsWith('iddqd')) {
        this.god = !this.god;
        if (this.god && this.player) this.player.hp = 100;
        this.message(this.god ? 'degreelessness mode ON' : 'degreelessness mode OFF');
      }
      if (this.cheatBuf.endsWith('idkfa') && this.player) {
        const p = this.player;
        p.weapons = { fists: true, pistol: true, shotgun: true, chaingun: true, rocket: true, plasma: true };
        p.ammo.bullets = 200; p.ammo.shells = 50; p.ammo.rockets = 30; p.ammo.cells = 200;
        p.armor = 200; p.keys.blue = p.keys.red = true;
        this.message('very happy ammo added');
      }
    },
  };
})();
