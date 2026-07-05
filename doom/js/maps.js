// DOOMED — levels. Cells carry floor/ceiling heights now: platforms, stairs,
// pits, window sills, lifts and crushers. Cell values are texture ids
// (0 = open); heights live in parallel arrays.
(function () {
  const T = D.tex;

  function builder(w, h, baseTex) {
    const grid = new Array(w * h).fill(baseTex);
    const floorH = new Float32Array(w * h);              // 0 = base floor
    const ceilH = new Float32Array(w * h).fill(D.CEIL);  // standard ceiling
    const wallT = new Uint8Array(w * h).fill(baseTex); // riser/step texture
    const doors = {};
    const movers = [];
    const things = [];
    const rect = (x1, y1, x2, y2, fn) => {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) fn(y * w + x, x, y);
    };
    const b = {
      w, h, grid, doors, things, floorH, ceilH, wallT, movers,
      carve(x1, y1, x2, y2) { rect(x1, y1, x2, y2, (i) => grid[i] = 0); return b; },
      paintRing(x1, y1, x2, y2, tex) {
        for (let y = y1 - 1; y <= y2 + 1; y++) for (let x = x1 - 1; x <= x2 + 1; x++) {
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          const inside = x >= x1 && x <= x2 && y >= y1 && y <= y2;
          const i = y * w + x;
          if (!inside && grid[i] !== 0 && !doors[i]) { grid[i] = tex; wallT[i] = tex; }
        }
        return b;
      },
      wall(x, y, tex) { grid[y * w + x] = tex; return b; },
      platform(x1, y1, x2, y2, hgt, tex) {
        rect(x1, y1, x2, y2, (i) => { floorH[i] = hgt; if (tex) wallT[i] = tex; });
        return b;
      },
      pit(x1, y1, x2, y2, depth) { rect(x1, y1, x2, y2, (i) => floorH[i] = -depth); return b; },
      lowCeil(x1, y1, x2, y2, hgt) { rect(x1, y1, x2, y2, (i) => ceilH[i] = hgt); return b; },
      sill(x, y, hgt) { // a window: sill + lintel leave a slit only bullets fit
        grid[y * w + x] = 0; floorH[y * w + x] = hgt; ceilH[y * w + x] = hgt + 0.5;
        return b;
      },
      stairs(x1, y1, x2, y2, axis, from, to) {
        const n = axis === 'x' ? (x2 - x1 + 1) : (y2 - y1 + 1);
        rect(x1, y1, x2, y2, (i, x, y) => {
          const k = axis === 'x' ? (x - x1) : (y - y1);
          grid[i] = 0;
          floorH[i] = from + (to - from) * ((k + 1) / n);
        });
        return b;
      },
      lift(x1, y1, x2, y2, low, high, opts = {}) {
        const cells = [];
        rect(x1, y1, x2, y2, (i) => { grid[i] = 0; floorH[i] = low; cells.push(i); });
        movers.push({ type: 'lift', cells, low, high, speed: opts.speed || 1.1, mode: opts.mode || 'auto', state: 'low', t: 0 });
        return b;
      },
      crusher(x1, y1, x2, y2, opts = {}) {
        const cells = [];
        rect(x1, y1, x2, y2, (i) => { grid[i] = 0; cells.push(i); });
        movers.push({ type: 'crusher', cells, low: opts.low ?? 0.32, speed: opts.speed || 0.9, phase: opts.phase || 0, on: true });
        return b;
      },
      door(x, y, kind = 'door') {
        const tex = kind === 'blue' ? T.DOOR_B : kind === 'red' ? T.DOOR_R : kind === 'secret' ? T.CRACK : T.DOOR;
        grid[y * w + x] = tex;
        doors[y * w + x] = { x, y, kind };
        return b;
      },
      thing(x, y, type) { things.push({ x: x + 0.5, y: y + 0.5, type }); return b; },
      secretExit(x, y) {
        grid[y * w + x] = T.EXIT;
        b.secretExits.push(y * w + x);
        return b;
      },
      secretExits: [],
      tele(ax, ay, bx, by) {
        things.push({ type: 'tele', x: ax + 0.5, y: ay + 0.5, tx: bx + 0.5, ty: by + 0.5 });
        things.push({ type: 'tele', x: bx + 0.5, y: by + 0.5, tx: ax + 0.5, ty: ay + 0.5 });
        return b;
      },
      ambush(x1, y1, x2, y2, doorCells, msg) {
        b.triggers.push({ x1, y1, x2, y2, cells: doorCells.map(([x, y]) => y * w + x), msg });
        return b;
      },
      triggers: [],
    };
    return b;
  }

  // ================= E1: HANGAR BAY =================
  function level1() {
    const b = builder(26, 20, T.BRICK);
    b.carve(1, 1, 6, 6);                       // start room
    b.door(7, 3).carve(8, 3, 9, 3);            // east corridor
    b.carve(10, 1, 16, 8).paintRing(10, 1, 16, 8, T.TECH);  // hangar
    // loading platform with the shotgun on it — stairs up from the west
    b.stairs(11, 1, 12, 3, 'x', 0, 0.34);
    b.platform(13, 1, 16, 3, 0.5, T.TECH);
    b.door(13, 9).carve(13, 10, 13, 11);       // south corridor
    b.carve(8, 12, 20, 18);                    // storage (brick, stone crates)
    b.wall(11, 14, T.STONE).wall(12, 14, T.STONE).wall(11, 15, T.STONE)
     .wall(16, 13, T.STONE).wall(17, 16, T.STONE);
    b.pit(12, 17, 14, 18, 0.5);                // sunken loading pit
    b.carve(4, 14, 6, 16);                     // secret closet
    b.door(7, 15, 'secret');
    b.door(21, 15).carve(22, 14, 24, 16);      // exit wing, raised
    b.platform(22, 14, 24, 16, 0.25, T.BRICK);
    b.sill(21, 14, 0.65);                      // window into the exit wing
    b.wall(25, 15, T.EXIT);

    b.thing(3, 3, 'player');
    b.thing(2, 5, 'grunt');
    b.thing(15, 1, 'stim');
    b.thing(14, 2, 'wshotgun');                // up on the platform now
    b.thing(12, 2, 'grunt').thing(15, 6, 'grunt');
    b.thing(11, 7, 'barrel');
    b.thing(10, 13, 'grunt').thing(19, 13, 'grunt').thing(18, 17, 'grunt');
    b.thing(14, 16, 'imp');
    b.thing(9, 17, 'shells').thing(19, 16, 'medkit').thing(9, 13, 'clip').thing(16, 17, 'clip');
    b.thing(13, 17, 'shells').thing(13, 18, 'clip');   // loot in the pit
    b.thing(18, 12, 'barrel');
    b.thing(5, 15, 'soul').thing(5, 16, 'shells').thing(5, 14, 'clip').thing(4, 16, 'wrocket').thing(6, 14, 'rockets');
    b.thing(23, 14, 'imp').thing(23, 16, 'stim');
    b.thing(12, 12, 'lamp').thing(19, 18, 'gore');
    // grab the shotgun up top and the wall behind you opens
    b.carve(17, 1, 18, 3);
    b.platform(17, 1, 18, 3, 0.5, T.TECH);    // closet level with the platform
    b.door(17, 2);
    b.ambush(13, 1, 16, 3, [[17, 2]], 'the wall opens behind you.');
    b.thing(18, 1, 'grunt').thing(18, 3, 'grunt').thing(18, 2, 'shells');
    b.thing(14, 13, 'flyer');

    return { ...pack(b), meta: { name: 'HANGAR BAY', par: 60, dir: 0, ambient: [0.68, 0.61, 0.53] } };
  }

  // ================= E2: WASTE TUNNELS =================
  function level2() {
    const b = builder(30, 24, T.STONE);
    b.carve(1, 1, 5, 5);                        // start
    b.door(6, 3).carve(7, 3, 9, 3);
    b.carve(10, 1, 18, 9).paintRing(10, 1, 18, 9, T.BRICK); // hub
    b.door(19, 4, 'blue');                       // BLUE door -> comp mezzanine
    b.carve(20, 2, 26, 7).paintRing(20, 2, 26, 7, T.COMP);
    b.platform(21, 2, 26, 7, 0.72, T.COMP);      // computer floor is raised
    b.lift(20, 2, 20, 7, 0, 0.72, { mode: 'auto' }); // ride up past the door
    b.door(19, 2, 'secret');                     // secret shortcut into comp room
    b.door(14, 10).carve(14, 11, 14, 12);        // south to sewer
    b.carve(6, 13, 24, 21);                      // big sewer
    b.pit(7, 16, 13, 18, 0.55);                  // waste trench, west leg
    b.pit(17, 16, 23, 18, 0.55);                 // east leg — bridge between
    b.door(5, 17).carve(2, 15, 4, 19).paintRing(2, 15, 4, 19, T.TECH); // key nook
    b.door(3, 20, 'secret').carve(2, 21, 4, 22); // secret under nook
    b.door(25, 17, 'red');                       // RED door -> exit wing
    b.carve(26, 15, 28, 19).paintRing(26, 15, 28, 19, T.BRICK);
    b.crusher(26, 17, 26, 17, { phase: 0 });     // the way out is hungry
    b.crusher(27, 17, 27, 17, { phase: Math.PI });
    b.wall(29, 17, T.EXIT);

    b.thing(3, 3, 'player');
    b.thing(2, 5, 'clip').thing(4, 1, 'stim');
    b.thing(12, 2, 'barrel').thing(17, 8, 'barrel');
    b.thing(11, 5, 'grunt').thing(16, 3, 'grunt').thing(14, 7, 'imp');
    b.thing(17, 1, 'clip').thing(11, 8, 'stim').thing(10, 1, 'shells');
    b.thing(23, 4, 'wchaingun').thing(25, 2, 'armor').thing(21, 6, 'grunt').thing(24, 6, 'imp');
    b.thing(20, 6, 'shells').thing(25, 5, 'keyR').thing(22, 2, 'clip');
    b.thing(12, 17, 'brute').thing(18, 15, 'brute');
    b.thing(8, 20, 'imp').thing(22, 19, 'imp').thing(7, 14, 'grunt').thing(23, 14, 'grunt');
    b.thing(7, 20, 'medkit').thing(12, 14, 'shells').thing(20, 20, 'clip').thing(8, 15, 'clip');
    b.thing(9, 17, 'clip').thing(19, 17, 'shells'); // loot down in the trench
    b.thing(15, 18, 'barrel').thing(16, 18, 'barrel');
    b.thing(3, 17, 'keyB').thing(3, 15, 'brute').thing(2, 19, 'shells');
    b.thing(3, 21, 'soul').thing(2, 22, 'medkit').thing(4, 21, 'berserk');
    b.thing(27, 16, 'brute').thing(27, 19, 'imp').thing(26, 15, 'medkit');
    b.thing(10, 14, 'lamp').thing(20, 14, 'lamp').thing(9, 19, 'gore').thing(19, 17, 'gore');
    // new blood: a sentinel watching the hub, a wretch over the west trench
    b.thing(17, 2, 'turret').thing(10, 17, 'flyer');
    b.thing(20, 17, 'wplasma').thing(21, 17, 'cells').thing(9, 17, 'cells');
    // teleporter: sewer dead-end back up to the hub
    b.tele(7, 21, 17, 7);
    // taking the red key opens a closet at your back
    b.carve(24, 9, 26, 10);
    b.door(25, 8);
    b.ambush(23, 4, 26, 6, [[25, 8]], 'something was waiting for the alarm.');
    b.thing(24, 10, 'imp').thing(26, 10, 'imp').thing(25, 10, 'cells');

    return { ...pack(b), meta: { name: 'WASTE TUNNELS', par: 150, dir: 0, ambient: [0.5, 0.6, 0.5] } };
  }

  // ================= E3: THE OVERSEER =================
  function level3() {
    const b = builder(30, 24, T.BRICK);
    b.carve(1, 9, 4, 13);                        // start
    b.door(5, 11).carve(6, 11, 8, 11);
    b.crusher(7, 11, 7, 11, { low: 0.5, speed: 0.7 }); // dripping stone maw
    b.carve(9, 7, 15, 15).paintRing(9, 7, 15, 15, T.TECH); // antechamber
    b.door(12, 6);                               // north armory, raised
    b.carve(10, 3, 14, 5).paintRing(10, 3, 14, 5, T.COMP);
    b.platform(10, 3, 14, 5, 0.4, T.COMP);
    b.stairs(12, 5, 12, 5, 'y', 0.2, 0.2);       // half-step at the door
    b.door(12, 16, 'secret').carve(11, 17, 13, 19);        // south secret
    b.door(16, 11);                              // arena gate
    b.carve(17, 4, 28, 19);                      // boss arena — open to the hellsky
    b.lowCeil(17, 4, 28, 19, 3.0);
    b.platform(17, 4, 28, 5, 0.35, T.BRICK);     // north gallery ledge
    b.platform(17, 18, 28, 19, 0.35, T.BRICK);   // south gallery ledge
    b.pit(21, 9, 25, 13, 0.4);                   // the Overseer's pit
    b.wall(20, 8, T.BRICK).wall(20, 15, T.BRICK).wall(26, 8, T.BRICK).wall(26, 15, T.BRICK); // pillars
    b.platform(27, 10, 28, 12, 0.3, T.BRICK);    // exit ledge
    b.wall(29, 11, T.EXIT);

    b.thing(2, 11, 'player');
    b.thing(2, 13, 'medkit').thing(2, 9, 'shells').thing(3, 10, 'clip');
    b.thing(3, 12, 'wchaingun').thing(4, 11, 'wshotgun').thing(4, 13, 'armor');
    b.thing(1, 10, 'clip').thing(1, 12, 'clip').thing(4, 9, 'shells');
    b.thing(10, 8, 'imp').thing(14, 14, 'imp').thing(13, 12, 'brute');
    b.thing(10, 14, 'barrel').thing(14, 8, 'barrel');
    b.thing(9, 15, 'armor').thing(9, 7, 'shells');
    b.thing(12, 4, 'wshotgun').thing(10, 3, 'clip').thing(14, 3, 'clip').thing(11, 3, 'shells');
    b.thing(11, 5, 'grunt').thing(13, 5, 'grunt');
    b.thing(12, 18, 'soul').thing(11, 19, 'medkit').thing(13, 19, 'shells');
    b.thing(23, 11, 'boss');                     // looming up out of the pit
    b.thing(19, 4, 'imp').thing(19, 19, 'imp').thing(26, 4, 'imp').thing(26, 19, 'imp'); // gallery snipers
    b.thing(21, 7, 'brute').thing(21, 15, 'brute');
    b.thing(18, 6, 'barrel').thing(18, 17, 'barrel').thing(27, 6, 'barrel').thing(27, 17, 'barrel');
    b.thing(17, 17, 'medkit').thing(17, 6, 'shells').thing(28, 6, 'clip').thing(28, 17, 'medkit');
    b.thing(23, 9, 'soul');                      // dare the pit while he lives
    b.thing(9, 11, 'lamp').thing(15, 9, 'lamp').thing(15, 13, 'lamp');
    b.thing(18, 11, 'gore');
    // phase 3 garrison: gravewalker in the antechamber, wretches and a
    // sentinel in the arena, rockets in the armory, berserk in the secret
    b.thing(11, 10, 'rezzer');
    b.thing(20, 11, 'flyer').thing(25, 7, 'flyer');
    b.thing(28, 11, 'turret');
    b.thing(12, 3, 'wrocket').thing(10, 5, 'rockets').thing(14, 5, 'rockets');
    b.thing(17, 11, 'rockets').thing(18, 18, 'cells').thing(27, 4, 'cells');
    b.thing(13, 17, 'berserk');
    b.tele(18, 6, 27, 16);
    b.ambush(21, 9, 25, 13, [], 'the arena knows you are in the pit.');

    return { ...pack(b), meta: { name: 'THE OVERSEER', par: 200, dir: 0, ambient: [0.62, 0.49, 0.44] } };
  }

  function pack(b) {
    return {
      w: b.w, h: b.h, grid: b.grid, doors: b.doors, things: b.things,
      floorH: b.floorH, ceilH: b.ceilH, wallT: b.wallT, movers: b.movers,
      triggers: b.triggers, secretExits: b.secretExits,
    };
  }

  // ================= E3: PROCESSING =================
  function level_processing() {
    const b = builder(28, 22, T.TECH);
    b.carve(1, 1, 5, 5).paintRing(1, 1, 5, 5, T.BRICK);
    b.door(6, 3).carve(7, 3, 7, 3);
    b.carve(8, 1, 20, 8);                       // the press hall
    b.crusher(12, 2, 12, 6, { phase: 0 });
    b.crusher(15, 2, 15, 6, { phase: 2.1 });
    b.crusher(18, 2, 18, 6, { phase: 4.2 });
    b.door(10, 9).carve(8, 10, 13, 14).paintRing(8, 10, 13, 14, T.COMP); // control room
    b.platform(8, 13, 9, 14, 0.3, T.COMP);
    b.door(14, 12);                              // ambush panel into the sewer
    b.door(21, 4, 'blue').carve(22, 2, 26, 7).paintRing(22, 2, 26, 7, T.COMP); // east wing
    b.door(17, 9).carve(15, 10, 26, 18);         // sewer
    b.pit(16, 15, 19, 16, 0.55);
    b.pit(21, 15, 25, 16, 0.55);
    b.wall(27, 13, T.EXIT);
    b.carve(26, 12, 26, 14);

    b.thing(3, 3, 'player');
    b.thing(2, 4, 'clip').thing(4, 2, 'stim');
    b.thing(9, 2, 'grunt').thing(13, 7, 'grunt').thing(19, 2, 'grunt').thing(16, 4, 'imp');
    b.thing(10, 6, 'barrel').thing(19, 7, 'barrel');
    b.thing(9, 4, 'shells').thing(20, 6, 'clip').thing(13, 1, 'medkit');
    b.thing(12, 11, 'turret').thing(8, 14, 'keyB').thing(9, 10, 'cells').thing(12, 14, 'clip');
    b.thing(24, 4, 'wchaingun').thing(25, 6, 'rezzer').thing(23, 2, 'armor').thing(22, 6, 'clip').thing(25, 2, 'shells');
    b.ambush(8, 12, 10, 14, [[14, 12]], 'the panel slides open behind you.');
    b.thing(16, 12, 'imp').thing(15, 13, 'grunt');
    b.thing(17, 15, 'flyer').thing(23, 15, 'flyer');
    b.thing(18, 15, 'shells').thing(22, 15, 'clip').thing(16, 18, 'medkit').thing(25, 18, 'rockets');
    b.thing(20, 12, 'brute');
    b.thing(11, 4, 'lamp').thing(20, 10, 'lamp').thing(24, 17, 'gore');

    return { ...pack(b), meta: { name: 'PROCESSING', par: 120, dir: 0, ambient: [0.55, 0.57, 0.63] } };
  }

  // ================= E5: CATACOMBS =================
  function level_catacombs() {
    const b = builder(26, 24, T.STONE);
    b.carve(1, 1, 4, 4);
    b.door(5, 2).carve(6, 1, 24, 10);            // pillared crypt
    for (let x = 8; x <= 22; x += 3) for (let y = 3; y <= 8; y += 3) b.wall(x, y, T.STONE);
    b.door(12, 11).carve(6, 12, 24, 15);         // bone hall
    b.carve(7, 16, 8, 16).lowCeil(7, 16, 8, 16, 0.45); // crawl niche: crouch for it
    b.thing(7, 16, 'berserk');
    b.door(15, 16).carve(10, 17, 22, 22);        // deep crypt
    b.door(23, 19).carve(24, 18, 24, 20);
    b.wall(25, 19, T.EXIT);
    // the whispered way out: a cracked wall, a hidden room, a second exit
    b.carve(6, 19, 8, 21);
    b.door(9, 20, 'secret');
    b.secretExit(5, 20);

    b.thing(2, 2, 'player');
    b.thing(3, 3, 'clip').thing(1, 4, 'stim');
    b.thing(9, 2, 'grunt').thing(14, 5, 'imp').thing(20, 2, 'imp').thing(17, 8, 'grunt');
    b.thing(10, 8, 'shells').thing(21, 9, 'medkit').thing(7, 5, 'clip');
    b.thing(9, 13, 'brute').thing(20, 13, 'imp').thing(16, 12, 'shells');
    b.thing(12, 19, 'rezzer').thing(19, 20, 'rezzer');
    b.thing(13, 21, 'brute').thing(18, 18, 'brute');
    b.thing(11, 18, 'rockets').thing(21, 21, 'soul').thing(16, 20, 'medkit').thing(12, 17, 'cells');
    b.thing(7, 20, 'shells').thing(8, 19, 'rockets');
    b.thing(7, 2, 'lamp').thing(18, 13, 'lamp').thing(14, 18, 'gore').thing(17, 21, 'gore').thing(11, 20, 'gore');

    return { ...pack(b), meta: { name: 'CATACOMBS', par: 150, dir: 0, ambient: [0.44, 0.42, 0.48], secretNext: 8 } };
  }

  // ================= E6: THE VAULTS =================
  function level_vaults() {
    const b = builder(30, 24, T.COMP);
    b.carve(1, 10, 4, 13).paintRing(1, 10, 4, 13, T.TECH);
    b.door(5, 11).carve(6, 8, 14, 15).paintRing(6, 8, 14, 15, T.TECH); // hub
    b.door(10, 7, 'blue').carve(8, 3, 16, 6);    // north vault
    b.platform(14, 3, 16, 4, 0.4, T.COMP);
    b.thing(15, 4, 'keyR');
    b.door(15, 11).carve(16, 9, 22, 14);         // east wing (blue key)
    b.thing(21, 11, 'keyB');
    b.door(23, 11);                              // ambush closet
    b.carve(24, 10, 25, 12);
    b.ambush(19, 10, 22, 13, [[23, 11]], 'the vault answers.');
    b.door(10, 16).carve(8, 17, 20, 18);         // south run
    b.crusher(14, 17, 14, 18, { phase: 0, speed: 1.1 });
    b.carve(6, 19, 12, 22);                      // west chamber
    b.door(21, 17, 'red').carve(22, 16, 27, 20); // exit vault
    b.wall(28, 18, T.EXIT);

    b.thing(2, 11, 'player');
    b.thing(2, 13, 'medkit').thing(3, 10, 'clip');
    b.thing(8, 9, 'grunt').thing(12, 14, 'grunt').thing(10, 11, 'imp').thing(13, 9, 'barrel');
    b.thing(7, 14, 'shells').thing(13, 13, 'stim');
    b.thing(9, 4, 'turret').thing(15, 6, 'turret');
    b.thing(10, 4, 'wplasma').thing(12, 3, 'cells').thing(12, 5, 'cells').thing(8, 6, 'armor');
    b.thing(17, 10, 'flyer').thing(20, 13, 'imp').thing(18, 13, 'clip').thing(16, 14, 'medkit');
    b.thing(24, 11, 'imp').thing(25, 11, 'imp').thing(24, 12, 'cells');
    b.thing(9, 18, 'grunt').thing(17, 18, 'shells');
    b.thing(7, 20, 'brute').thing(10, 21, 'brute').thing(8, 22, 'medkit').thing(11, 19, 'rockets');
    b.thing(26, 18, 'turret').thing(23, 17, 'flyer').thing(24, 19, 'cells').thing(26, 16, 'medkit');
    b.thing(8, 11, 'lamp').thing(18, 11, 'lamp').thing(24, 18, 'lamp').thing(10, 19, 'gore');

    return { ...pack(b), meta: { name: 'THE VAULTS', par: 170, dir: 0, ambient: [0.5, 0.55, 0.62] } };
  }

  // ================= E7: SPIRE APPROACH =================
  function level_spire() {
    const b = builder(30, 24, T.BRICK);
    b.carve(1, 1, 4, 5);
    b.door(5, 3).carve(6, 1, 27, 17);            // the great yard
    b.lowCeil(6, 1, 27, 17, 3.0);                // open hellsky
    b.platform(6, 1, 27, 2, 0.4, T.BRICK);       // north gallery
    b.platform(6, 16, 27, 17, 0.4, T.BRICK);     // south gallery
    b.wall(12, 7, T.STONE).wall(12, 11, T.STONE).wall(19, 5, T.STONE)
     .wall(19, 12, T.STONE).wall(24, 8, T.STONE);
    b.tele(7, 16, 26, 2);
    b.door(18, 18).carve(16, 19, 22, 22);        // keep antehall
    b.wall(23, 20, T.EXIT);

    b.thing(2, 3, 'player');
    b.thing(1, 5, 'shells').thing(3, 1, 'medkit').thing(2, 2, 'clip');
    b.thing(10, 6, 'flyer').thing(15, 9, 'flyer').thing(21, 7, 'flyer').thing(25, 12, 'flyer').thing(13, 14, 'flyer');
    b.thing(9, 1, 'imp').thing(17, 2, 'imp').thing(23, 16, 'imp');
    b.thing(10, 12, 'brute').thing(20, 10, 'brute');
    b.thing(8, 8, 'rockets').thing(16, 6, 'rockets').thing(24, 14, 'rockets');
    b.thing(11, 2, 'cells').thing(22, 1, 'shells').thing(7, 12, 'medkit').thing(26, 6, 'medkit');
    b.thing(14, 1, 'armor').thing(20, 16, 'soul');
    b.thing(9, 16, 'barrel').thing(18, 1, 'barrel').thing(25, 16, 'barrel');
    b.thing(17, 20, 'grunt').thing(20, 21, 'grunt').thing(18, 21, 'medkit').thing(21, 19, 'clip');
    b.thing(13, 8, 'gore').thing(22, 11, 'gore');

    return { ...pack(b), meta: { name: 'SPIRE APPROACH', par: 160, dir: 0, ambient: [0.62, 0.52, 0.47] } };
  }

  // ================= E8: THE MACHINE HEART =================
  function level_machine() {
    const b = builder(30, 24, T.COMP);
    b.carve(1, 10, 4, 13).paintRing(1, 10, 4, 13, T.TECH);
    b.door(5, 11).carve(6, 9, 12, 14).paintRing(6, 9, 12, 14, T.TECH); // approach
    b.door(13, 11).carve(14, 3, 28, 20);         // her chamber
    b.wall(17, 6, T.COMP).wall(25, 6, T.COMP).wall(17, 17, T.COMP).wall(25, 17, T.COMP);
    b.platform(20, 10, 24, 13, 0.4, T.COMP);     // the dais
    b.wall(29, 11, T.EXIT);

    b.thing(2, 11, 'player');
    b.thing(2, 13, 'medkit').thing(3, 13, 'cells').thing(3, 10, 'rockets');
    b.thing(8, 10, 'armor').thing(10, 13, 'medkit').thing(7, 13, 'shells').thing(11, 10, 'cells');
    b.thing(8, 12, 'lamp').thing(11, 12, 'lamp');
    b.thing(22, 11, 'mother');
    b.thing(19, 5, 'flyer').thing(25, 18, 'flyer');
    b.thing(15, 4, 'rockets').thing(15, 19, 'rockets').thing(27, 4, 'cells').thing(27, 19, 'cells');
    b.thing(14, 11, 'medkit').thing(28, 6, 'medkit').thing(28, 17, 'medkit');
    b.thing(22, 4, 'soul');
    b.thing(16, 19, 'barrel').thing(27, 12, 'barrel');
    b.thing(15, 12, 'gore').thing(23, 18, 'gore');

    return { ...pack(b), meta: { name: 'THE MACHINE HEART', par: 240, dir: 0, ambient: [0.52, 0.48, 0.58], final: true } };
  }

  // ================= SECRET: THE BONEYARD =================
  function level_boneyard() {
    const b = builder(24, 20, T.STONE);
    b.carve(2, 2, 21, 17);
    for (let i = 0; i < 6; i++) b.wall(5 + i * 3, 6 + (i % 2) * 6, T.STONE);
    b.wall(22, 9, T.EXIT);
    b.carve(21, 8, 21, 10);

    b.thing(3, 9, 'player');
    b.thing(4, 8, 'berserk').thing(4, 10, 'berserk');
    b.thing(3, 3, 'soul').thing(3, 16, 'soul');
    b.thing(8, 4, 'brute').thing(8, 15, 'brute').thing(12, 8, 'brute').thing(13, 12, 'brute')
     .thing(17, 5, 'brute').thing(18, 14, 'brute');
    b.thing(10, 10, 'grunt').thing(15, 3, 'grunt').thing(16, 16, 'grunt').thing(20, 9, 'grunt');
    b.thing(6, 12, 'shells').thing(11, 4, 'shells').thing(19, 4, 'rockets').thing(19, 15, 'rockets');
    b.thing(12, 16, 'medkit').thing(20, 13, 'medkit');
    b.thing(5, 9, 'gore').thing(9, 9, 'gore').thing(13, 5, 'gore').thing(13, 13, 'gore')
     .thing(17, 9, 'gore').thing(7, 15, 'gore').thing(15, 8, 'gore').thing(19, 6, 'gore');
    b.thing(11, 11, 'lamp');

    return { ...pack(b), meta: { name: 'THE BONEYARD', par: 90, dir: 0, ambient: [0.62, 0.5, 0.44], next: 5, secret: true } };
  }

  D.maps = [
    level1(),            // 0 E1M1 HANGAR BAY
    level2(),            // 1 E1M2 WASTE TUNNELS
    level_processing(),  // 2 E1M3 PROCESSING
    level3(),            // 3 E1M4 THE OVERSEER (mid-boss)
    level_catacombs(),   // 4 E1M5 CATACOMBS (hides the secret exit)
    level_vaults(),      // 5 E1M6 THE VAULTS
    level_spire(),       // 6 E1M7 SPIRE APPROACH
    level_machine(),     // 7 E1M8 THE MACHINE HEART (finale)
    level_boneyard(),    // 8 E1M9 THE BONEYARD (secret)
  ];
  D.MAIN_LEVELS = 8;

  // ================= CUSTOM MAPS: url-safe codec =================
  // The editor serializes a level into a compact string that fits in a URL:
  // JSON -> {name, size, RLE grid, sparse floors, doors, things} -> base64url.
  const FQ = { a: -0.55, b: 0.3, c: 0.5 };
  const quantF = (v) => Math.abs(v + 0.55) < 0.01 ? 'a' : Math.abs(v - 0.3) < 0.01 ? 'b' : Math.abs(v - 0.5) < 0.01 ? 'c' : null;
  D.customCodec = {
    encode(data) {
      let rle = '';
      let run = 1;
      for (let i = 1; i <= data.grid.length; i++) {
        if (i < data.grid.length && data.grid[i] === data.grid[i - 1]) run++;
        else { rle += data.grid[i - 1].toString(36) + (run > 1 ? run.toString(36) : '') + ','; run = 1; }
      }
      const fl = [];
      for (let i = 0; i < data.floorH.length; i++) {
        const q = quantF(data.floorH[i]);
        if (q) fl.push(i.toString(36) + q);
      }
      const doors = Object.entries(data.doors).map(([i, d]) => (+i).toString(36) + d.kind[0]);
      const things = data.things.map(t => `${t.type}.${Math.round(t.x * 2)}.${Math.round(t.y * 2)}`);
      const json = JSON.stringify({ n: data.name || 'CUSTOM', w: data.w, h: data.h, g: rle, f: fl.join(','), d: doors.join(','), t: things.join(',') });
      return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    },
    decode(code) {
      const json = decodeURIComponent(escape(atob(code.replace(/-/g, '+').replace(/_/g, '/'))));
      const o = JSON.parse(json);
      const w = o.w, h = o.h;
      const grid = new Array(w * h).fill(1);
      let pos = 0;
      for (const tok of o.g.split(',')) {
        if (!tok) continue;
        const v = parseInt(tok[0], 36);
        const run = tok.length > 1 ? parseInt(tok.slice(1), 36) : 1;
        for (let k = 0; k < run && pos < grid.length; k++) grid[pos++] = v;
      }
      const floorH = new Float32Array(w * h);
      const ceilH = new Float32Array(w * h).fill(D.CEIL);
      if (o.f) for (const tok of o.f.split(',')) {
        if (!tok) continue;
        const q = tok[tok.length - 1];
        floorH[parseInt(tok.slice(0, -1), 36)] = FQ[q] ?? 0;
      }
      const doors = {};
      const kinds = { d: 'door', b: 'blue', r: 'red', s: 'secret' };
      if (o.d) for (const tok of o.d.split(',')) {
        if (!tok) continue;
        const idx = parseInt(tok.slice(0, -1), 36);
        doors[idx] = { x: idx % w, y: (idx / w) | 0, kind: kinds[tok[tok.length - 1]] || 'door' };
        if (grid[idx] === 0 || grid[idx] === undefined) grid[idx] = doors[idx].kind === 'blue' ? T.DOOR_B : doors[idx].kind === 'red' ? T.DOOR_R : doors[idx].kind === 'secret' ? T.CRACK : T.DOOR;
      }
      const things = [];
      if (o.t) for (const tok of o.t.split(',')) {
        if (!tok) continue;
        const [type, x, y] = tok.split('.');
        things.push({ type, x: (+x) / 2, y: (+y) / 2 });
      }
      const wallT = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) wallT[i] = grid[i] > 0 && grid[i] < 9 ? grid[i] : T.STONE;
      return {
        w, h, grid, floorH, ceilH, wallT, doors, things,
        movers: [], triggers: [], secretExits: [],
        meta: { name: o.n, par: 120, dir: 0, ambient: [0.6, 0.56, 0.52], custom: true },
      };
    },
  };

  // ================= ENDLESS: seeded floor generator =================
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hashSeed(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  D.genEndless = function (floor, seedStr) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const rng = mulberry32(hashSeed(seedStr + ':' + floor + ':' + attempt));
      const pick = (arr) => arr[Math.floor(rng() * arr.length)];
      const ri = (a, b2) => a + Math.floor(rng() * (b2 - a + 1));
      const W = Math.min(34, 24 + floor), H = Math.min(26, 18 + (floor >> 1));
      const theme = pick([T.BRICK, T.STONE, T.TECH, T.COMP]);
      const b = builder(W, H, theme);
      const boss = floor % 5 === 0;

      // rooms, then corridors stitched in placement order = guaranteed path
      const rooms = [];
      const nRooms = Math.min(9, 5 + (floor >> 1)) - (boss ? 1 : 0);
      for (let i = 0; i < nRooms; i++) {
        for (let tries = 0; tries < 30; tries++) {
          const rw = boss && i === nRooms - 1 ? ri(8, 10) : ri(3, 6);
          const rh = boss && i === nRooms - 1 ? ri(7, 9) : ri(3, 6);
          const x1 = ri(1, W - rw - 2), y1 = ri(1, H - rh - 2);
          if (rooms.some(r => x1 < r.x2 + 2 && x1 + rw > r.x1 - 2 && y1 < r.y2 + 2 && y1 + rh > r.y1 - 2)) continue;
          const room = { x1, y1, x2: x1 + rw, y2: y1 + rh, cx: x1 + (rw >> 1), cy: y1 + (rh >> 1) };
          rooms.push(room);
          b.carve(x1, y1, room.x2, room.y2);
          break;
        }
      }
      if (rooms.length < 3) continue;

      for (let i = 1; i < rooms.length; i++) {
        const a = rooms[i - 1], c = rooms[i];
        b.carve(Math.min(a.cx, c.cx), a.cy, Math.max(a.cx, c.cx), a.cy);
        b.carve(c.cx, Math.min(a.cy, c.cy), c.cx, Math.max(a.cy, c.cy));
        if (rng() < 0.4 && Math.abs(a.cx - c.cx) > 3) b.door(Math.floor((a.cx + c.cx) / 2), a.cy);
      }

      // vertical drama: some rooms rise or sink
      for (const r of rooms.slice(1, -1)) {
        const roll = rng();
        if (roll < 0.22) b.platform(r.x1 + 1, r.y1 + 1, r.x2 - 1, r.y2 - 1, 0.3, theme);
        else if (roll < 0.36 && floor > 1) b.pit(r.x1 + 1, r.y1 + 1, r.x2 - 1, r.y2 - 1, 0.55);
      }

      // farthest room gets the exit (and the boss)
      const home = rooms[0];
      let far = rooms[1], farD = 0;
      for (const r of rooms.slice(1)) {
        const d = D.dist(home.cx, home.cy, r.cx, r.cy);
        if (d > farD) { farD = d; far = r; }
      }
      b.grid[far.cy * W + (far.x2 + 1)] = T.EXIT;
      if (floor >= 3) {
        // gate EVERY entrance to the exit room with a red door
        let gated = 0;
        for (let x = far.x1 - 1; x <= far.x2 + 1; x++) {
          for (const y of [far.y1 - 1, far.y2 + 1]) {
            if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
            if (b.grid[y * W + x] === 0) { b.door(x, y, 'red'); gated++; }
          }
        }
        for (let y = far.y1; y <= far.y2; y++) {
          for (const x of [far.x1 - 1, far.x2 + 1]) {
            if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
            if (b.grid[y * W + x] === 0) { b.door(x, y, 'red'); gated++; }
          }
        }
        if (gated) {
          const keyRoom = pick(rooms.slice(1).filter(r => r !== far)) || home;
          b.thing(keyRoom.cx, keyRoom.cy, 'keyR');
        }
      }

      b.thing(home.cx, home.cy, 'player');
      b.thing(home.cx + 1, home.cy, 'clip');
      b.thing(home.cx - 1, home.cy, floor === 1 ? 'wshotgun' : floor === 2 ? 'wchaingun' : floor === 3 ? 'wrocket' : floor === 4 ? 'wplasma' : pick(['shells', 'rockets', 'cells']));
      if (floor % 4 === 0) b.thing(home.cx, home.cy + 1, 'berserk');

      const roster = ['grunt'];
      if (floor >= 2) roster.push('imp');
      if (floor >= 3) roster.push('brute', 'imp');
      if (floor >= 4) roster.push('flyer');
      if (floor >= 5) roster.push('turret');
      if (floor >= 6) roster.push('rezzer');
      let budget = Math.min(26, 6 + floor * 2);
      const spots = [];
      for (const r of rooms.slice(1)) {
        for (let x = r.x1; x <= r.x2; x++) for (let y = r.y1; y <= r.y2; y++) {
          if ((x + y) % 2 === 0 && !(r === far && boss)) spots.push([x, y, r]);
        }
      }
      while (budget > 0 && spots.length) {
        const [x, y] = spots.splice(Math.floor(rng() * spots.length), 1)[0];
        b.thing(x, y, pick(roster));
        budget--;
      }
      if (boss) {
        b.thing(far.cx, far.cy, 'boss');
        b.thing(far.x1, far.y1, 'soul');
      }
      // supplies scattered
      const sup = ['clip', 'shells', 'stim', 'clip', 'shells', 'medkit', 'cells', 'rockets', 'barrel', 'barrel', 'lamp', 'lamp', 'armor'];
      for (let i = 0; i < 8 + (floor >> 1) && spots.length; i++) {
        const [x, y] = spots.splice(Math.floor(rng() * spots.length), 1)[0];
        b.thing(x, y, pick(sup));
      }

      const map = pack(b);
      map.meta = {
        name: `FLOOR ${floor} — ${pick(['THE GRINDER', 'COLD STORAGE', 'BLOOD WORKS', 'THE STACKS', 'OUTER DARK', 'THE NARROWS', 'RUST HALLS', 'THE THROAT'])}`,
        par: 40 + rooms.length * 15, dir: 0,
        ambient: theme === T.STONE ? [0.46, 0.44, 0.5] : theme === T.COMP ? [0.5, 0.55, 0.62] : theme === T.TECH ? [0.55, 0.57, 0.63] : [0.64, 0.52, 0.46],
        endless: true, floor,
      };

      // sanity: exit reachable treating doors as open
      const doorCells = new Set(Object.keys(map.doors).map(Number));
      const seen = new Set(); const q = [[home.cx, home.cy]];
      let ok = false;
      while (q.length) {
        const [x, y] = q.pop();
        const idx = y * W + x;
        if (seen.has(idx)) continue;
        seen.add(idx);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const ni = ny * W + nx;
          if (map.grid[ni] === T.EXIT) ok = true;
          if ((map.grid[idx] === 0 || doorCells.has(idx)) && (map.grid[ni] === 0 || doorCells.has(ni))) {
            const rise = map.floorH[ni] - map.floorH[idx];
            if (rise <= 0.8) q.push([nx, ny]);
          }
        }
      }
      if (ok) return map;
    }
    // pathological seed: fall back to a campaign map so the run continues
    return D.maps[0];
  };

  // Dev sanity: flood-fill from player to the exit. Doors count as open;
  // an edge is passable if the climb is within jump range and there is
  // headroom; lift cells connect their low and high neighborhoods.
  D.maps.forEach((m, mi) => {
    const start = m.things.find(t => t.type === 'player');
    const liftCells = new Set();
    for (const mv of m.movers) if (mv.type === 'lift') for (const c of mv.cells) liftCells.add(c);
    const doorCells = new Set(Object.keys(m.doors).map(Number));
    const seen = new Set();
    const q = [[Math.floor(start.x), Math.floor(start.y)]];
    let exitFound = false;
    while (q.length) {
      const [x, y] = q.pop();
      const idx = y * m.w + x;
      if (seen.has(idx)) continue;
      seen.add(idx);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= m.w || ny >= m.h) continue;
        const ni = ny * m.w + nx;
        const c = m.grid[ni];
        if (c === T.EXIT) exitFound = true;
        const openHere = m.grid[idx] === 0 || doorCells.has(idx);
        const openThere = c === 0 || doorCells.has(ni);
        if (!openHere || !openThere) continue;
        const rise = m.floorH[ni] - m.floorH[idx];
        const passable = rise <= 0.8 || liftCells.has(ni) || liftCells.has(idx);
        const headroom = m.ceilH[ni] - Math.max(m.floorH[ni], m.floorH[idx]) >= 0.55;
        if (passable && (headroom || doorCells.has(ni))) q.push([nx, ny]);
      }
    }
    if (!exitFound) console.error(`MAP ${mi + 1} (${m.meta.name}): exit unreachable!`);
  });
})();
