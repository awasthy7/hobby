// DOOMED — every sprite is drawn with canvas shapes at chunky low res, then
// baked to raw RGBA for the raycaster. Frame naming: <thing>_<frame>.
(function () {
  const cache = {};

  function bake(name, w, h, fn) {
    // authored in logical pixels, baked at 2x for smoother edges up close
    const S = 2;
    const cv = document.createElement('canvas');
    cv.width = w * S; cv.height = h * S;
    const p = cv.getContext('2d');
    p.imageSmoothingEnabled = false;
    p.scale(S, S);
    const help = {
      rect: (x, y, ww, hh, c) => { p.fillStyle = c; p.fillRect(Math.round(x), Math.round(y), Math.round(ww), Math.round(hh)); },
      ell: (x, y, rx, ry, c) => { p.fillStyle = c; p.beginPath(); p.ellipse(x, y, rx, ry, 0, 0, D.TAU); p.fill(); },
      tri: (x1, y1, x2, y2, x3, y3, c) => { p.fillStyle = c; p.beginPath(); p.moveTo(x1, y1); p.lineTo(x2, y2); p.lineTo(x3, y3); p.fill(); },
    };
    fn(help, w, h, p);
    cache[name] = { w: w * S, h: h * S, data: p.getImageData(0, 0, w * S, h * S).data };
  }

  // ============ GRUNT (possessed soldier) ============
  const G = { armor: '#4a5a38', armorD: '#37452a', skin: '#c9a179', pants: '#3a3a30', gun: '#222', blood: '#8a1410' };
  function grunt(frame) {
    bake('grunt_' + frame, 40, 56, (q) => {
      const legL = frame === 'walk1' ? -3 : 2, legR = -legL;
      if (frame.startsWith('die') || frame === 'corpse') {
        const stage = frame === 'die0' ? 0 : frame === 'die1' ? 1 : 2;
        if (stage < 2) {
          const drop = stage * 12;
          q.ell(20, 46, 12 - stage * 2, 4, G.blood);
          q.rect(12, 22 + drop, 16, 18 - drop / 2, G.armor);
          q.ell(20, 16 + drop * 1.4, 7, 7, G.skin);
          q.rect(8, 26 + drop, 5, 10, G.armor);
          q.rect(27, 26 + drop, 5, 10, G.armor);
          q.rect(14, 40 + drop / 2, 5, 12 - drop / 2, G.pants);
          q.rect(21, 40 + drop / 2, 5, 12 - drop / 2, G.pants);
        } else {
          q.ell(20, 50, 16, 5, G.blood);
          q.rect(6, 44, 26, 7, G.armor);
          q.ell(33, 47, 5, 4, G.skin);
          q.rect(2, 46, 7, 4, G.pants);
        }
        return;
      }
      const pain = frame === 'pain';
      const atk = frame === 'attack';
      // legs
      q.rect(13 + legL, 38, 6, 16, G.pants);
      q.rect(21 + legR, 38, 6, 16, G.pants);
      q.rect(12 + legL, 52, 8, 4, '#1c1c18');
      q.rect(20 + legR, 52, 8, 4, '#1c1c18');
      // torso
      q.rect(11, 20, 18, 20, G.armor);
      q.rect(11, 20, 18, 4, G.armorD);
      q.rect(18, 24, 4, 14, G.armorD);
      // head
      q.ell(20, 13, 7, 8, G.skin);
      q.rect(13, 6, 14, 5, G.armorD); // helmet
      q.rect(15, 12, 3, 2, pain ? '#fff' : '#301808');
      q.rect(23, 12, 3, 2, pain ? '#fff' : '#301808');
      q.rect(17, 18, 7, 1, G.blood);
      // arms + rifle
      if (atk) {
        q.rect(6, 24, 8, 5, G.armor);
        q.rect(26, 24, 8, 5, G.armor);
        q.rect(4, 22, 32, 4, G.gun);
        q.ell(37, 24, 3, 3, '#ffd870'); // muzzle
      } else if (pain) {
        q.rect(5, 18, 7, 5, G.armor);
        q.rect(28, 18, 7, 5, G.armor);
        q.rect(10, 30, 20, 4, G.gun);
      } else {
        q.rect(8, 24, 6, 12, G.armor);
        q.rect(26, 24, 6, 12, G.armor);
        q.rect(9, 32, 22, 4, G.gun); // rifle held low across
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain', 'die0', 'die1', 'corpse'].forEach(grunt);

  // ============ IMP ============
  const I = { hide: '#7a4a2a', hideD: '#5c3620', spike: '#d8c9a8', eye: '#ffd23e', fire: '#ff7a1e' };
  function imp(frame) {
    bake('imp_' + frame, 44, 58, (q) => {
      if (frame.startsWith('die') || frame === 'corpse') {
        const stage = frame === 'die0' ? 0 : frame === 'die1' ? 1 : 2;
        if (stage < 2) {
          const drop = stage * 14;
          q.ell(22, 50, 12, 4, '#5c1408');
          q.ell(22, 30 + drop, 11, 14 - stage * 3, I.hide);
          q.ell(22, 14 + drop * 1.5, 8, 8, I.hideD);
          if (!stage) { q.rect(16, 12, 3, 2, I.eye); q.rect(25, 12, 3, 2, I.eye); }
        } else {
          q.ell(22, 52, 17, 5, '#5c1408');
          q.ell(20, 48, 15, 6, I.hideD);
          q.ell(33, 49, 5, 4, I.hide);
          q.tri(10, 44, 14, 36, 17, 44, I.spike);
        }
        return;
      }
      const pain = frame === 'pain';
      const atk = frame === 'attack';
      const legL = frame === 'walk1' ? -3 : 2, legR = frame === 'walk1' ? 2 : -3;
      // legs (digitigrade)
      q.rect(14 + legL, 40, 6, 10, I.hideD);
      q.rect(24 + legR, 40, 6, 10, I.hideD);
      q.rect(12 + legL, 49, 7, 7, I.hide);
      q.rect(25 + legR, 49, 7, 7, I.hide);
      // hunched torso
      q.ell(22, 30, 12, 13, I.hide);
      q.ell(22, 27, 10, 8, I.hideD);
      // shoulder spikes
      q.tri(8, 26, 12, 12, 16, 24, I.spike);
      q.tri(36, 26, 32, 12, 28, 24, I.spike);
      // head
      q.ell(22, 14, 8, 8, I.hideD);
      q.tri(15, 8, 13, 1, 19, 7, I.spike);
      q.tri(29, 8, 31, 1, 25, 7, I.spike);
      q.rect(17, 12, 4, 3, pain ? '#fff' : I.eye);
      q.rect(24, 12, 4, 3, pain ? '#fff' : I.eye);
      q.rect(18, 19, 8, 2, '#2c1208');
      for (let i = 0; i < 4; i++) q.rect(18 + i * 2, 19, 1, 2, I.spike); // teeth
      // arms
      if (atk) {
        q.rect(4, 18, 7, 6, I.hide);
        q.ell(6, 14, 6, 6, I.fire);
        q.ell(6, 14, 3, 3, '#ffe28a');
        q.rect(32, 26, 8, 6, I.hide);
      } else if (pain) {
        q.rect(3, 22, 9, 5, I.hide);
        q.rect(32, 22, 9, 5, I.hide);
      } else {
        q.rect(7, 28, 6, 12, I.hide);
        q.rect(31, 28, 6, 12, I.hide);
        q.ell(10, 42, 4, 4, I.hideD); // claws
        q.ell(34, 42, 4, 4, I.hideD);
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain', 'die0', 'die1', 'corpse'].forEach(imp);

  // ============ BRUTE (the pink one) ============
  const B = { skin: '#c96a72', skinD: '#a54852', maw: '#5c0e12', teeth: '#efe6d0' };
  function brute(frame) {
    bake('brute_' + frame, 60, 54, (q) => {
      if (frame.startsWith('die') || frame === 'corpse') {
        const stage = frame === 'die0' ? 0 : frame === 'die1' ? 1 : 2;
        if (stage < 2) {
          q.ell(30, 48, 16, 5, '#6a1010');
          q.ell(30, 32 + stage * 8, 20 - stage * 3, 16 - stage * 4, B.skin);
          q.ell(30, 24 + stage * 12, 12, 9, B.skinD);
        } else {
          q.ell(30, 49, 22, 5, '#6a1010');
          q.ell(30, 45, 20, 7, B.skinD);
          q.ell(44, 46, 7, 5, B.skin);
        }
        return;
      }
      const pain = frame === 'pain';
      const atk = frame === 'attack';
      const legL = frame === 'walk1' ? -4 : 3, legR = -legL;
      // stumpy legs
      q.rect(18 + legL, 40, 9, 12, B.skinD);
      q.rect(33 + legR, 40, 9, 12, B.skinD);
      // massive body = mostly head
      q.ell(30, 26, 22, 18, B.skin);
      q.ell(30, 20, 18, 11, B.skinD);
      // eyes
      q.rect(20, 16, 5, 3, pain ? '#fff' : '#2ce065');
      q.rect(35, 16, 5, 3, pain ? '#fff' : '#2ce065');
      // maw
      const open = atk ? 12 : pain ? 8 : 4;
      q.ell(30, 30 + open / 4, 14, 5 + open / 2, B.maw);
      for (let i = 0; i < 6; i++) {
        q.tri(19 + i * 4, 26 + open / 6, 21 + i * 4, 32 + open / 3, 23 + i * 4, 26 + open / 6, B.teeth);
        q.tri(20 + i * 4, 35 + open / 2, 22 + i * 4, 29 + open / 4, 24 + i * 4, 35 + open / 2, B.teeth);
      }
      // little arms
      q.rect(6, 28, 8, 5, B.skin);
      q.rect(46, 28, 8, 5, B.skin);
    });
  }
  ['walk0', 'walk1', 'attack', 'pain', 'die0', 'die1', 'corpse'].forEach(brute);

  // ============ BOSS (the Overseer) ============
  const O = { hide: '#5c1616', hideD: '#3e0e0e', bone: '#d8cba8', eye: '#7cff4e', fire: '#5ce048' };
  function boss(frame) {
    bake('boss_' + frame, 72, 88, (q) => {
      if (frame.startsWith('die') || frame === 'corpse') {
        const stage = frame === 'die0' ? 0 : frame === 'die1' ? 1 : 2;
        if (stage < 2) {
          q.ell(36, 78, 22, 6, '#4c0808');
          q.ell(36, 46 + stage * 14, 20, 26 - stage * 8, O.hide);
          q.ell(36, 22 + stage * 22, 12, 12, O.hideD);
          q.tri(24, 12 + stage * 22, 18, 0 + stage * 22, 28, 8 + stage * 22, O.bone);
          q.tri(48, 12 + stage * 22, 54, 0 + stage * 22, 44, 8 + stage * 22, O.bone);
        } else {
          q.ell(36, 80, 28, 7, '#4c0808');
          q.ell(36, 74, 24, 9, O.hideD);
          q.tri(14, 72, 10, 58, 20, 68, O.bone);
          q.ell(52, 74, 8, 6, O.hide);
        }
        return;
      }
      const pain = frame === 'pain';
      const atk = frame === 'attack';
      const legL = frame === 'walk1' ? -4 : 3, legR = -legL;
      // goat legs
      q.rect(22 + legL, 60, 10, 16, O.hideD);
      q.rect(40 + legR, 60, 10, 16, O.hideD);
      q.rect(21 + legL, 74, 9, 12, O.hide);
      q.rect(41 + legR, 74, 9, 12, O.hide);
      q.tri(21 + legL, 86, 30 + legL, 86, 25 + legL, 80, O.bone); // hooves
      q.tri(41 + legR, 86, 50 + legR, 86, 45 + legR, 80, O.bone);
      // torso
      q.ell(36, 42, 20, 22, O.hide);
      q.ell(36, 36, 16, 13, O.hideD);
      q.rect(30, 48, 12, 14, O.hideD); // abs shadow
      // head + horns
      q.ell(36, 16, 11, 11, O.hide);
      q.tri(24, 10, 14, -2, 28, 6, O.bone);
      q.tri(48, 10, 58, -2, 44, 6, O.bone);
      q.rect(29, 13, 5, 4, pain ? '#fff' : O.eye);
      q.rect(38, 13, 5, 4, pain ? '#fff' : O.eye);
      q.rect(31, 23, 10, 2, '#1c0808');
      // arms
      if (atk) {
        q.rect(8, 22, 10, 7, O.hide);
        q.rect(54, 22, 10, 7, O.hide);
        q.ell(11, 15, 8, 8, O.fire);
        q.ell(61, 15, 8, 8, O.fire);
        q.ell(11, 15, 4, 4, '#d8ffb0');
        q.ell(61, 15, 4, 4, '#d8ffb0');
      } else {
        q.rect(12, 34, 9, 20, O.hide);
        q.rect(51, 34, 9, 20, O.hide);
        q.ell(16, 56, 5, 6, O.hideD);
        q.ell(56, 56, 5, 6, O.hideD);
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain', 'die0', 'die1', 'corpse'].forEach(boss);

  // ============ PROJECTILES / FX ============
  bake('fireball_0', 16, 16, (q) => {
    q.ell(8, 8, 7, 7, '#c83c10');
    q.ell(8, 8, 5, 5, '#ff8a1e');
    q.ell(9, 7, 2.5, 2.5, '#ffe28a');
  });
  bake('fireball_1', 16, 16, (q) => {
    q.ell(8, 8, 6, 7, '#e05010');
    q.ell(8, 8, 4, 5, '#ffa63e');
    q.ell(7, 9, 2, 2, '#fff0b0');
  });
  bake('greenball_0', 18, 18, (q) => {
    q.ell(9, 9, 8, 8, '#2c8a20');
    q.ell(9, 9, 5.5, 5.5, '#5ce048');
    q.ell(10, 8, 2.5, 2.5, '#d8ffb0');
  });
  bake('greenball_1', 18, 18, (q) => {
    q.ell(9, 9, 7, 8, '#3aa028');
    q.ell(9, 9, 4.5, 5.5, '#7cff5e');
    q.ell(8, 10, 2, 2, '#eaffd0');
  });
  ['0', '1', '2'].forEach((f, i) => bake('explo_' + f, 36, 36, (q) => {
    const r = 8 + i * 6;
    q.ell(18, 18, r, r, i === 2 ? '#552210' : '#c84210');
    if (i < 2) { q.ell(18, 18, r * 0.7, r * 0.7, '#ff9a2e'); q.ell(18, 16, r * 0.35, r * 0.35, '#ffe8a0'); }
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + i, rr = r + 3 + (k % 3) * 2;
      q.ell(18 + Math.cos(a) * rr, 18 + Math.sin(a) * rr, 2.5 - i * 0.5, 2.5 - i * 0.5, i === 2 ? '#3c1a0c' : '#e06a1e');
    }
  }));
  bake('puff_0', 10, 10, (q) => { q.ell(5, 5, 4, 4, '#c8c0b4'); q.ell(5, 4, 2, 2, '#efe8dc'); });
  bake('puff_1', 10, 10, (q) => { q.ell(5, 5, 3, 3, '#8a857c'); });
  bake('blood_0', 10, 10, (q) => { q.ell(5, 5, 4, 4, '#a01812'); q.ell(4, 6, 2, 2, '#6a0e0a'); });
  bake('blood_1', 10, 10, (q) => { q.ell(5, 5, 3, 3, '#6a0e0a'); });

  // ============ PICKUPS ============
  bake('stim_0', 20, 14, (q) => {
    q.rect(1, 3, 18, 10, '#d8d4c8');
    q.rect(1, 3, 18, 2, '#efece2');
    q.rect(8, 4, 4, 8, '#c02418');
    q.rect(6, 6, 8, 4, '#c02418');
  });
  bake('medkit_0', 26, 18, (q) => {
    q.rect(1, 4, 24, 13, '#3c6a34');
    q.rect(1, 4, 24, 3, '#4e8442');
    q.rect(10, 6, 6, 10, '#efece2');
    q.rect(7, 9, 12, 4, '#efece2');
    q.rect(11, 7, 4, 8, '#c02418');
    q.rect(8, 10, 10, 2, '#c02418');
  });
  bake('clip_0', 14, 12, (q) => {
    q.rect(2, 3, 10, 8, '#6a6456');
    q.rect(3, 1, 2, 3, '#c8a43e'); q.rect(6, 1, 2, 3, '#c8a43e'); q.rect(9, 1, 2, 3, '#c8a43e');
  });
  bake('shells_0', 18, 12, (q) => {
    for (let i = 0; i < 4; i++) { q.rect(1 + i * 4, 2, 3, 8, '#c02418'); q.rect(1 + i * 4, 8, 3, 3, '#c8a43e'); }
  });
  bake('armor_0', 24, 20, (q) => {
    q.ell(12, 10, 11, 9, '#2c7a3a');
    q.ell(12, 8, 8, 6, '#3c9c4e');
    q.rect(10, 4, 4, 12, '#1e5228');
    q.rect(5, 8, 14, 3, '#1e5228');
  });
  bake('soul_0', 22, 22, (q) => {
    q.ell(11, 11, 10, 10, '#2438a0');
    q.ell(11, 11, 7, 7, '#3e5ee0');
    q.ell(9, 9, 3, 3, '#b0c8ff');
    q.ell(13, 13, 5, 4, '#1a2870');
    q.rect(8, 10, 2, 2, '#fff'); q.rect(13, 10, 2, 2, '#fff'); // it stares back
  });
  bake('keyB_0', 12, 20, (q) => {
    q.rect(2, 1, 8, 12, '#3050c8');
    q.rect(4, 3, 4, 6, '#8aa0f0');
    q.rect(5, 12, 2, 7, '#3050c8');
    q.rect(5, 16, 4, 2, '#3050c8');
  });
  bake('keyR_0', 12, 20, (q) => {
    q.rect(2, 1, 8, 12, '#c02418');
    q.rect(4, 3, 4, 6, '#f0928a');
    q.rect(5, 12, 2, 7, '#c02418');
    q.rect(5, 16, 4, 2, '#c02418');
  });
  bake('wshotgun_0', 30, 12, (q) => {
    q.rect(1, 4, 22, 3, '#4a4640');
    q.rect(20, 3, 9, 6, '#6a3a1e');
    q.rect(4, 6, 8, 3, '#6a3a1e');
  });
  bake('wchaingun_0', 30, 16, (q) => {
    q.rect(2, 4, 20, 8, '#3c3a36');
    q.rect(20, 6, 9, 4, '#54504a');
    for (let i = 0; i < 3; i++) q.rect(22, 5 + i * 3, 8, 1, '#221f1c');
    q.rect(6, 2, 4, 12, '#54504a');
  });
  bake('barrel_0', 22, 30, (q) => {
    q.ell(11, 26, 10, 4, '#1c3a20');
    q.rect(1, 6, 20, 20, '#2c5a34');
    q.ell(11, 6, 10, 4, '#3c7a46');
    q.ell(11, 6, 7, 2.5, '#8ac83e');
    q.ell(11, 6, 4, 1.5, '#c8f06a');
    q.rect(1, 12, 20, 2, '#1c3a20');
    q.rect(1, 20, 20, 2, '#1c3a20');
  });
  bake('lamp_0', 14, 40, (q) => {
    q.rect(5, 8, 4, 30, '#3c3a36');
    q.ell(7, 38, 6, 2, '#2a2826');
    q.ell(7, 6, 6, 6, '#ffd870');
    q.ell(7, 6, 3.5, 3.5, '#fff2c0');
  });
  bake('mote_0', 3, 3, (q) => { q.rect(0, 0, 3, 3, 'rgba(255,240,200,0.8)'); q.rect(1, 1, 1, 1, '#fff8e0'); });
  bake('gore_0', 20, 16, (q) => {
    q.ell(10, 13, 9, 3, '#6a0e0a');
    q.ell(8, 10, 4, 3, '#a01812');
    q.tri(12, 4, 15, 11, 9, 11, '#d8cba8');
    q.ell(14, 11, 3, 2, '#a01812');
  });

  // ============ DIRECTIONAL VIEWS (back + sides) ============
  // Backs are the front minus the face; sides are slim profiles. Only walk
  // and attack frames get views — pain and death read fine from any angle.
  function mirror(from, to) {
    const s = cache[from];
    const w = s.w, h = s.h;
    const d = new Uint8ClampedArray(s.data.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const a = (y * w + x) * 4, b = (y * w + (w - 1 - x)) * 4;
      d[a] = s.data[b]; d[a + 1] = s.data[b + 1]; d[a + 2] = s.data[b + 2]; d[a + 3] = s.data[b + 3];
    }
    cache[to] = { w, h, data: d };
  }

  function gruntBack(frame) {
    bake('grunt_' + frame + '_b', 40, 56, (q) => {
      const legL = frame === 'walk1' ? -3 : 2, legR = -legL;
      q.rect(13 + legL, 38, 6, 16, G.pants); q.rect(21 + legR, 38, 6, 16, G.pants);
      q.rect(12 + legL, 52, 8, 4, '#1c1c18'); q.rect(20 + legR, 52, 8, 4, '#1c1c18');
      q.rect(11, 20, 18, 20, G.armorD);
      q.rect(13, 22, 14, 16, G.armor);       // backpack plate
      q.ell(20, 13, 7, 8, G.skin);
      q.rect(13, 6, 14, 8, G.armorD);        // helmet covers the back of the head
      q.rect(8, 24, 6, 12, G.armor); q.rect(26, 24, 6, 12, G.armor);
      if (frame === 'attack') q.rect(4, 22, 6, 4, G.gun);
    });
  }
  function gruntSide(frame) {
    bake('grunt_' + frame + '_sr', 30, 56, (q) => {
      const legL = frame === 'walk1' ? -4 : 3;
      q.rect(12 + legL, 38, 6, 16, G.pants); q.rect(12 - legL, 38, 6, 16, G.pants);
      q.rect(11 + legL, 52, 8, 4, '#1c1c18'); q.rect(11 - legL, 52, 8, 4, '#1c1c18');
      q.rect(9, 20, 12, 20, G.armor);
      q.ell(15, 13, 6, 8, G.skin);
      q.rect(9, 6, 12, 5, G.armorD);
      q.rect(15, 11, 4, 3, frame === 'pain' ? '#fff' : '#301808'); // one eye, profile
      if (frame === 'attack') { q.rect(12, 22, 18, 4, G.gun); q.ell(29, 24, 3, 3, '#ffd870'); }
      else q.rect(13, 26, 14, 4, G.gun);
    });
    mirror('grunt_' + frame + '_sr', 'grunt_' + frame + '_sl');
  }
  ['walk0', 'walk1', 'attack'].forEach((f) => { gruntBack(f); gruntSide(f); });

  function impBack(frame) {
    bake('imp_' + frame + '_b', 44, 58, (q) => {
      const legL = frame === 'walk1' ? -3 : 2, legR = frame === 'walk1' ? 2 : -3;
      q.rect(14 + legL, 40, 6, 10, I.hideD); q.rect(24 + legR, 40, 6, 10, I.hideD);
      q.rect(12 + legL, 49, 7, 7, I.hide); q.rect(25 + legR, 49, 7, 7, I.hide);
      q.ell(22, 30, 12, 13, I.hideD);
      q.ell(22, 28, 9, 9, I.hide);           // spiny back
      for (let i = 0; i < 4; i++) q.tri(16 + i * 4, 26 - (i % 2) * 3, 18 + i * 4, 18 - (i % 2) * 3, 20 + i * 4, 26 - (i % 2) * 3, I.spike);
      q.tri(8, 26, 12, 12, 16, 24, I.spike);
      q.tri(36, 26, 32, 12, 28, 24, I.spike);
      q.ell(22, 14, 8, 8, I.hideD);
      q.tri(15, 8, 13, 1, 19, 7, I.spike);
      q.tri(29, 8, 31, 1, 25, 7, I.spike);
      q.rect(7, 28, 6, 12, I.hide); q.rect(31, 28, 6, 12, I.hide);
      if (frame === 'attack') { q.rect(4, 18, 7, 6, I.hide); q.ell(6, 14, 5, 5, I.fire); }
    });
  }
  function impSide(frame) {
    bake('imp_' + frame + '_sr', 32, 58, (q) => {
      const legL = frame === 'walk1' ? -4 : 3;
      q.rect(12 + legL, 40, 6, 10, I.hideD); q.rect(12 - legL, 40, 6, 10, I.hideD);
      q.rect(11 + legL, 49, 7, 7, I.hide); q.rect(11 - legL, 49, 7, 7, I.hide);
      q.ell(16, 30, 9, 13, I.hide);
      q.tri(8, 24, 12, 10, 17, 22, I.spike);
      q.ell(17, 14, 7, 8, I.hideD);
      q.tri(13, 7, 11, 0, 17, 6, I.spike);
      q.rect(19, 12, 4, 3, I.eye);
      if (frame === 'attack') { q.rect(20, 20, 9, 5, I.hide); q.ell(29, 18, 5, 5, I.fire); q.ell(29, 18, 2.5, 2.5, '#ffe28a'); }
      else q.rect(14, 28, 5, 12, I.hideD);
    });
    mirror('imp_' + frame + '_sr', 'imp_' + frame + '_sl');
  }
  ['walk0', 'walk1', 'attack'].forEach((f) => { impBack(f); impSide(f); });

  function bruteBack(frame) {
    bake('brute_' + frame + '_b', 60, 54, (q) => {
      const legL = frame === 'walk1' ? -4 : 3, legR = -legL;
      q.rect(18 + legL, 40, 9, 12, B.skinD); q.rect(33 + legR, 40, 9, 12, B.skinD);
      q.ell(30, 26, 22, 18, B.skinD);
      q.ell(30, 24, 17, 13, B.skin);        // broad pink back
      q.rect(6, 28, 8, 5, B.skin); q.rect(46, 28, 8, 5, B.skin);
    });
  }
  function bruteSide(frame) {
    bake('brute_' + frame + '_sr', 44, 54, (q) => {
      const legL = frame === 'walk1' ? -5 : 4;
      q.rect(16 + legL, 40, 9, 12, B.skinD); q.rect(16 - legL, 40, 9, 12, B.skinD);
      q.ell(22, 26, 18, 18, B.skin);
      q.rect(30, 15, 5, 3, frame === 'pain' ? '#fff' : '#2ce065');
      const open = frame === 'attack' ? 12 : 4;
      q.ell(32, 30 + open / 4, 9, 4 + open / 2, B.maw);
      for (let i = 0; i < 3; i++) q.tri(27 + i * 5, 27, 29 + i * 5, 33 + open / 3, 31 + i * 5, 27, B.teeth);
      q.rect(10, 28, 7, 5, B.skinD);
    });
    mirror('brute_' + frame + '_sr', 'brute_' + frame + '_sl');
  }
  ['walk0', 'walk1', 'attack'].forEach((f) => { bruteBack(f); bruteSide(f); });

  function bossBack(frame) {
    bake('boss_' + frame + '_b', 72, 88, (q) => {
      const legL = frame === 'walk1' ? -4 : 3, legR = -legL;
      q.rect(22 + legL, 60, 10, 16, O.hideD); q.rect(40 + legR, 60, 10, 16, O.hideD);
      q.rect(21 + legL, 74, 9, 12, O.hide); q.rect(41 + legR, 74, 9, 12, O.hide);
      q.ell(36, 42, 20, 22, O.hideD);
      q.ell(36, 40, 15, 16, O.hide);
      for (let i = 0; i < 3; i++) q.tri(30 + i * 6 - 6, 34 - (i % 2) * 4, 33 + i * 6 - 6, 24 - (i % 2) * 4, 36 + i * 6 - 6, 34 - (i % 2) * 4, O.bone);
      q.ell(36, 16, 11, 11, O.hideD);
      q.tri(24, 10, 14, -2, 28, 6, O.bone);
      q.tri(48, 10, 58, -2, 44, 6, O.bone);
      q.rect(12, 34, 9, 20, O.hide); q.rect(51, 34, 9, 20, O.hide);
    });
  }
  ['walk0', 'walk1', 'attack'].forEach(bossBack);

  // ============ NEW BESTIARY ============
  const W2 = { skin: '#6a5a7a', skinD: '#4c3e58', wing: '#8a7a9c', eye: '#ff5a3e' };
  function flyer(frame) {
    const flap = frame === 'walk1' ? -8 : 4;
    bake('flyer_' + frame, 44, 36, (q) => {
      q.tri(4, 16 + flap, 16, 12, 16, 22, W2.wing);
      q.tri(40, 16 + flap, 28, 12, 28, 22, W2.wing);
      q.ell(22, 17, 10, 10, W2.skin);
      q.ell(22, 14, 8, 6, W2.skinD);
      if (frame !== 'die0' && frame !== 'corpse') {
        q.rect(17, 13, 4, 3, frame === 'pain' ? '#fff' : W2.eye);
        q.rect(24, 13, 4, 3, frame === 'pain' ? '#fff' : W2.eye);
        const open = frame === 'attack' ? 6 : 2;
        q.ell(22, 22, 6, open, '#2c0e14');
        for (let i = 0; i < 4; i++) q.tri(17 + i * 3, 20, 18.5 + i * 3, 23 + open / 2, 20 + i * 3, 20, '#e8e0d0');
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain'].forEach(flyer);
  bake('flyer_die0', 44, 36, (q) => { q.ell(22, 20, 10, 8, W2.skinD); q.tri(4, 26, 16, 18, 16, 26, W2.wing); q.tri(40, 26, 28, 18, 28, 26, W2.wing); });
  bake('flyer_die1', 44, 36, (q) => { q.ell(22, 26, 9, 6, W2.skinD); });
  bake('flyer_corpse', 44, 36, (q) => { q.ell(22, 30, 11, 4, '#3a2030'); q.ell(20, 28, 7, 3, W2.skinD); q.tri(8, 30, 16, 24, 18, 30, W2.wing); });

  const TT = { shell: '#4a5058', shellD: '#32363c', eye: '#ff3a2a', glow: '#ffb03a' };
  function turret(frame) {
    bake('turret_' + frame, 34, 40, (q) => {
      q.rect(11, 30, 12, 8, TT.shellD);
      q.ell(17, 30, 12, 5, TT.shell);
      const open = frame === 'walk0' ? 0 : frame === 'attack' ? 10 : 6;
      q.ell(17, 22 - open / 2, 11, 9, TT.shell);
      q.ell(17, 22 - open / 2, 8, 6.5, TT.shellD);
      if (open > 0) {
        q.ell(17, 21 - open / 2, 4.5, 4.5, frame === 'attack' ? TT.glow : TT.eye);
        q.ell(17, 21 - open / 2, 2, 2, '#fff0d0');
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain'].forEach(turret);
  bake('turret_die0', 34, 40, (q) => { q.ell(17, 26, 11, 8, TT.shellD); q.tri(8, 20, 14, 8, 18, 20, TT.shell); });
  bake('turret_die1', 34, 40, (q) => { q.ell(17, 32, 12, 6, TT.shellD); });
  bake('turret_corpse', 34, 40, (q) => { q.ell(17, 34, 13, 4, '#1c1e22'); q.ell(15, 31, 8, 4, TT.shellD); });

  const RS = { robe: '#3a4436', robeD: '#28301f', skin: '#c8c0a8', glow: '#7cff5e' };
  function rezzer(frame) {
    const sway = frame === 'walk1' ? 3 : -2;
    bake('rezzer_' + frame, 40, 68, (q) => {
      q.tri(10 + sway, 66, 20, 18, 30 - sway, 66, RS.robe);
      q.rect(13, 30, 14, 26, RS.robeD);
      q.ell(20, 14, 8, 9, RS.robe);
      q.ell(20, 15, 5, 6, '#0c0e0a');       // hollow hood
      q.rect(17, 13, 2, 2, RS.glow); q.rect(22, 13, 2, 2, RS.glow);
      if (frame === 'attack') {
        q.rect(3, 22, 9, 4, RS.robe); q.rect(28, 22, 9, 4, RS.robe);
        q.ell(5, 18, 5, 5, RS.glow); q.ell(35, 18, 5, 5, RS.glow);
        q.ell(5, 18, 2, 2, '#eaffd0'); q.ell(35, 18, 2, 2, '#eaffd0');
      } else {
        q.rect(8, 28, 6, 16, RS.robe); q.rect(26, 28, 6, 16, RS.robe);
        q.ell(11, 45, 3, 4, RS.skin); q.ell(29, 45, 3, 4, RS.skin);
      }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain'].forEach(rezzer);
  bake('rezzer_die0', 40, 68, (q) => { q.tri(10, 66, 20, 34, 30, 66, RS.robe); q.ell(20, 30, 8, 9, RS.robeD); });
  bake('rezzer_die1', 40, 68, (q) => { q.ell(20, 58, 14, 8, RS.robeD); });
  bake('rezzer_corpse', 40, 68, (q) => { q.ell(20, 62, 16, 5, RS.robeD); q.ell(26, 60, 6, 4, RS.robe); });
  bake('rezzer_back', 40, 68, (q) => { q.tri(10, 66, 20, 18, 30, 66, RS.robeD); q.ell(20, 14, 8, 9, RS.robe); });
  cache['rezzer_walk0_b'] = cache['rezzer_back']; cache['rezzer_walk1_b'] = cache['rezzer_back'];

  // ============ MARINE — the other you (multiplayer) ============
  const MR = { armor: '#3a6a2e', armorD: '#2a4e22', visor: '#18242e', skin: '#c9a179', boot: '#241f1a' };
  function marine(frame) {
    const legL = frame === 'walk1' ? -3 : 2, legR = -legL;
    bake('marine_' + frame, 40, 56, (q) => {
      q.rect(13 + legL, 38, 6, 16, MR.armorD);
      q.rect(21 + legR, 38, 6, 16, MR.armorD);
      q.rect(12 + legL, 52, 8, 4, MR.boot);
      q.rect(20 + legR, 52, 8, 4, MR.boot);
      q.rect(11, 20, 18, 20, MR.armor);
      q.rect(11, 20, 18, 4, MR.armorD);
      q.rect(17, 24, 6, 10, MR.armorD);
      q.ell(20, 12, 8, 9, MR.armor);          // helmet
      q.rect(14, 10, 12, 6, MR.visor);
      q.rect(15, 11, 4, 2, '#3e6a8a');        // visor shine
      if (frame === 'attack') {
        q.rect(8, 22, 8, 5, MR.armor);
        q.rect(24, 22, 8, 5, MR.armor);
        q.rect(6, 20, 30, 4, '#2c2a26');
        q.ell(37, 22, 3, 3, '#ffd870');
      } else {
        q.rect(8, 24, 6, 12, MR.armor);
        q.rect(26, 24, 6, 12, MR.armor);
        q.rect(10, 32, 20, 4, '#2c2a26');
      }
    });
  }
  ['walk0', 'walk1', 'attack'].forEach(marine);
  function marineBack(frame) {
    const legL = frame === 'walk1' ? -3 : 2, legR = -legL;
    bake('marine_' + frame + '_b', 40, 56, (q) => {
      q.rect(13 + legL, 38, 6, 16, MR.armorD);
      q.rect(21 + legR, 38, 6, 16, MR.armorD);
      q.rect(12 + legL, 52, 8, 4, MR.boot);
      q.rect(20 + legR, 52, 8, 4, MR.boot);
      q.rect(11, 20, 18, 20, MR.armorD);
      q.rect(13, 22, 14, 14, MR.armor);       // backplate
      q.ell(20, 12, 8, 9, MR.armor);
      q.rect(14, 8, 12, 8, MR.armorD);
    });
  }
  ['walk0', 'walk1', 'attack'].forEach(marineBack);
  bake('marine_die0', 40, 56, (q) => { q.ell(20, 46, 12, 5, '#6a0e0a'); q.rect(10, 34, 20, 12, MR.armor); q.ell(20, 28, 8, 8, MR.armor); });
  bake('marine_corpse', 40, 56, (q) => { q.ell(20, 50, 16, 5, '#6a0e0a'); q.rect(6, 44, 26, 7, MR.armorD); q.ell(32, 46, 6, 5, MR.armor); });

  // ============ MOTHER — the machine heart ============
  const MH = { shell: '#3a3440', shellD: '#241f2c', flesh: '#7a2430', fleshD: '#521820', core: '#7cff5e', cable: '#1c1822' };
  function mother(frame) {
    const pulse = frame === 'walk1' ? 3 : 0;
    const open = frame === 'attack' ? 8 : frame === 'pain' ? 4 : 0;
    bake('mother_' + frame, 88, 92, (q) => {
      // cables anchoring it to the world
      for (let i = 0; i < 5; i++) {
        q.rect(4 + i * 19, 70 + (i % 2) * 8, 5, 22 - (i % 2) * 8, MH.cable);
      }
      // armored shell
      q.ell(44, 48, 36 + pulse, 40 + pulse, MH.shellD);
      q.ell(44, 46, 31 + pulse, 35 + pulse, MH.shell);
      // exposed flesh chambers
      q.ell(44, 46, 24 + pulse, 28 + pulse, MH.flesh);
      q.ell(38, 38, 10, 12, MH.fleshD);
      q.ell(52, 54, 11, 10, MH.fleshD);
      // ribs clamped over the flesh
      for (let i = 0; i < 4; i++) {
        q.rect(20 + i * 14, 20 - pulse, 6, 18, MH.shell);
        q.rect(20 + i * 14, 62 + pulse, 6, 16, MH.shell);
      }
      // the eye-core
      if (frame.startsWith('die') || frame === 'corpse') {
        q.ell(44, 46, 8, 8, '#1c1822');
      } else {
        q.ell(44, 46, 9 + open * 0.6, 9 + open * 0.6, MH.core);
        q.ell(44, 46, 4 + open * 0.4, 4 + open * 0.4, '#eaffd0');
      }
      if (frame === 'pain') { q.rect(20, 30, 48, 4, '#fff'); }
    });
  }
  ['walk0', 'walk1', 'attack', 'pain'].forEach(mother);
  bake('mother_die0', 88, 92, (q) => {
    q.ell(44, 50, 34, 36, MH.shellD);
    q.ell(44, 48, 26, 28, MH.fleshD);
    q.ell(44, 46, 12, 12, '#ffd870');
    for (let i = 0; i < 6; i++) q.ell(20 + (i * 13) % 50, 24 + (i * 17) % 48, 4, 4, '#ff8a1e');
  });
  bake('mother_die1', 88, 92, (q) => {
    q.ell(44, 60, 30, 24, MH.shellD);
    q.ell(40, 56, 16, 12, MH.fleshD);
    q.tri(20, 44, 30, 20, 38, 44, MH.shell);
  });
  bake('mother_corpse', 88, 92, (q) => {
    q.ell(44, 78, 36, 10, '#18141e');
    q.ell(40, 70, 22, 12, MH.shellD);
    q.ell(54, 74, 10, 6, MH.fleshD);
    q.rect(10, 60, 5, 30, MH.cable);
    q.rect(70, 66, 5, 24, MH.cable);
  });

  // ============ NEW ARSENAL PICKUPS + PROJECTILES + GIBS ============
  bake('wrocket_0', 32, 12, (q) => {
    q.rect(1, 3, 26, 7, '#3c4034');
    q.ell(27, 6.5, 4, 4.5, '#2c3028');
    q.rect(5, 1, 5, 11, '#54584c');
  });
  bake('wplasma_0', 30, 14, (q) => {
    q.rect(2, 4, 20, 7, '#2c3a4c');
    for (let i = 0; i < 3; i++) q.rect(5 + i * 6, 2, 3, 11, '#3e5470');
    q.ell(24, 7.5, 4, 3.5, '#6ac8ff');
  });
  bake('rockets_0', 18, 14, (q) => {
    for (let i = 0; i < 2; i++) { q.rect(2 + i * 8, 2, 5, 10, '#4a5040'); q.tri(2 + i * 8, 2, 4.5 + i * 8, -1, 7 + i * 8, 2, '#803428'); }
  });
  bake('cells_0', 16, 14, (q) => {
    q.rect(1, 2, 14, 11, '#22303e');
    q.rect(3, 4, 10, 3, '#6ac8ff');
    q.rect(3, 9, 10, 2, '#3e5470');
  });
  bake('berserk_0', 22, 16, (q) => {
    q.rect(1, 3, 20, 12, '#2c1214');
    q.rect(2, 4, 18, 3, '#4a1a1e');
    q.ell(11, 10, 6, 4, '#c02418');
    q.rect(8, 8, 6, 4, '#e8e0d0');
  });
  bake('rocket_0', 18, 8, (q) => { q.rect(2, 2, 11, 4, '#4a5040'); q.tri(13, 1, 17, 4, 13, 7, '#803428'); q.ell(2, 4, 2.5, 2.5, '#ffb03a'); });
  bake('rocket_1', 18, 8, (q) => { q.rect(2, 2, 11, 4, '#54584c'); q.tri(13, 1, 17, 4, 13, 7, '#963c2c'); q.ell(2, 4, 3, 3, '#ffd870'); });
  bake('plasma_0', 12, 12, (q) => { q.ell(6, 6, 5.5, 5.5, '#2a6ac8'); q.ell(6, 6, 3.5, 3.5, '#6ac8ff'); q.ell(6.5, 5.5, 1.6, 1.6, '#eaf8ff'); });
  bake('plasma_1', 12, 12, (q) => { q.ell(6, 6, 5, 5.5, '#3a7ad8'); q.ell(6, 6, 3, 3.5, '#8ad8ff'); q.ell(5.5, 6.5, 1.4, 1.4, '#ffffff'); });
  for (let i = 0; i < 3; i++) {
    bake('gib_' + i, 10, 8, (q) => {
      q.ell(5, 4, 4 - i * 0.7, 3 - i * 0.5, '#a01812');
      q.ell(4, 3, 1.6, 1.4, i === 1 ? '#d8cba8' : '#6a0e0a');
    });
  }
  bake('gibrest_0', 14, 8, (q) => { q.ell(7, 6, 6, 2.5, '#6a0e0a'); q.ell(5, 4, 3, 2, '#a01812'); q.ell(10, 5, 2, 1.5, '#d8cba8'); });
  bake('tele_0', 30, 8, (q) => {
    q.ell(15, 4, 14, 3.5, '#1a3a2c');
    q.ell(15, 4, 10, 2.4, '#2c6a4a');
    q.ell(15, 4, 5, 1.3, '#5ee8a0');
  });

  D.sprites = {
    get: (name) => cache[name],
    all: cache,
  };
})();
