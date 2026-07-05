// SOUNDCLASH — the roster. Body proportions, palettes, movesets, and the
// bespoke drawing (heads, props, coat-tails) that turns skeletons into people.
// Pose angles: 0 = limb hanging down, positive swings toward facing direction.

S.CHARS = {
  riff: {
    key: 'riff', name: 'RIFF', genre: 'metal', tagline: 'WALL OF SOUND',
    hp: 1050, walk: 205, jumpV: -730,
    colors: {
      suit: '#8a1f2b', suitDark: '#5c1420', skin: '#e8b48c', accent: '#ff4d3d',
      glow: 'rgba(255,80,50,0.55)', trim: '#2b2430', hair: '#1a1a22',
    },
    body: { torso: 48, armU: 27, armL: 25, legU: 31, legL: 33, headR: 15, limbW: 13, torsoW: 24 },
    moves: {
      lights: [
        [ // guitar jab
          { dur: 0.10, p: { torso: 0.12, armF: [1.0, 1.6], armB: [0.4, 1.9], legF: [0.34, -0.2], legB: [-0.3, 0.3], rx: -4 } },
          { dur: 0.09, p: { torso: 0.34, armF: [1.62, 0.12], armB: [0.9, 1.1], legF: [0.5, -0.25], legB: [-0.5, 0.42], rx: 10 }, lungeV: 170, hit: true },
          { dur: 0.17, p: { torso: 0.14, armF: [1.0, 1.4], armB: [0.5, 1.7], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
        [ // rising strum
          { dur: 0.09, p: { torso: -0.1, armF: [0.4, 2.2], armB: [1.2, 0.9], legF: [0.3, -0.2], legB: [-0.35, 0.35], rx: -3 } },
          { dur: 0.09, p: { torso: 0.28, armF: [2.2, 0.4], armB: [0.6, 1.4], legF: [0.55, -0.3], legB: [-0.45, 0.4], rx: 8 }, lungeV: 150, hit: true },
          { dur: 0.18, p: { torso: 0.1, armF: [1.0, 1.5], armB: [0.5, 1.7], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
      ],
      light: { dmg: 58, reach: 74, kb: 190, hitstun: 0.30, sfxHeavy: false },
      heavyAnim: [
        { dur: 0.26, p: { torso: -0.34, armF: [0.2, 2.6], armB: [2.9, 0.2], legF: [0.4, -0.3], legB: [-0.5, 0.5], rx: -12, head: -0.3 } },
        { dur: 0.11, p: { torso: 0.6, armF: [2.5, 0.15], armB: [1.5, 0.3], legF: [0.7, -0.3], legB: [-0.6, 0.55], rx: 16 }, lungeV: 260, hit: true },
        { dur: 0.34, p: { torso: 0.25, armF: [1.3, 0.8], armB: [0.7, 1.3], legF: [0.35, -0.2], legB: [-0.35, 0.35] } },
      ],
      heavy: { dmg: 135, reach: 96, kb: 420, hitstun: 0.5, knockdown: true, sfxHeavy: true },
      specialAnim: [
        { dur: 0.22, p: { torso: -0.2, armF: [0.5, 2.4], armB: [2.4, 0.5], legF: [0.36, -0.25], legB: [-0.44, 0.4], rx: -8 } },
        { dur: 0.12, p: { torso: 0.42, armF: [1.9, 0.1], armB: [1.2, 0.6], legF: [0.6, -0.3], legB: [-0.55, 0.5], rx: 8 }, hit: false, spawn: true },
        { dur: 0.3, p: { torso: 0.15, armF: [1.1, 1.2], armB: [0.6, 1.5], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
      ],
      special: { cooldown: 1.5, projectile: 'feedback' },
      superName: 'WALL OF SOUND',
      super: { dmg: 250, reach: 320, kb: 560 },
    },
    smearColor: 'rgba(255,90,50,0.4)',
  },

  echo: {
    key: 'echo', name: 'ECHO', genre: 'synthwave', tagline: 'THE DROP',
    hp: 900, walk: 265, jumpV: -780,
    colors: {
      suit: '#1d2a52', suitDark: '#141c3a', skin: '#e8c4a8', accent: '#33e6ff',
      glow: 'rgba(60,230,255,0.55)', trim: '#ff3db8', hair: '#10131f',
    },
    body: { torso: 44, armU: 25, armL: 24, legU: 30, legL: 33, headR: 14, limbW: 11, torsoW: 20 },
    moves: {
      lights: [
        [ // neon jab
          { dur: 0.07, p: { torso: 0.1, armF: [1.1, 1.5], armB: [0.5, 1.8], legF: [0.3, -0.2], legB: [-0.3, 0.3], rx: -2 } },
          { dur: 0.07, p: { torso: 0.28, armF: [1.58, 0.06], armB: [0.8, 1.4], legF: [0.44, -0.24], legB: [-0.44, 0.36], rx: 9 }, lungeV: 210, hit: true },
          { dur: 0.12, p: { torso: 0.12, armF: [1.05, 1.4], armB: [0.5, 1.7], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
        [ // cross
          { dur: 0.07, p: { torso: 0.06, armF: [0.6, 1.9], armB: [1.1, 1.4], legF: [0.3, -0.2], legB: [-0.32, 0.32], rx: -2 } },
          { dur: 0.07, p: { torso: 0.34, armF: [0.7, 1.1], armB: [1.62, 0.05], legF: [0.5, -0.26], legB: [-0.4, 0.36], rx: 11 }, lungeV: 230, hit: true },
          { dur: 0.13, p: { torso: 0.12, armF: [1.0, 1.5], armB: [0.6, 1.6], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
      ],
      light: { dmg: 46, reach: 66, kb: 150, hitstun: 0.26, sfxHeavy: false },
      heavyAnim: [
        { dur: 0.18, p: { torso: -0.2, armF: [0.8, 1.8], armB: [1.0, 1.6], legF: [0.1, -0.5], legB: [-0.6, 0.7], rx: -8, ry: 4 } },
        { dur: 0.11, p: { torso: 0.5, armF: [1.1, 0.9], armB: [0.4, 1.3], legF: [2.1, -0.15], legB: [-0.5, 0.6], rx: 18, ry: -6 }, lungeV: 320, hit: true },
        { dur: 0.26, p: { torso: 0.15, armF: [1.0, 1.4], armB: [0.6, 1.6], legF: [0.35, -0.22], legB: [-0.32, 0.32] } },
      ],
      heavy: { dmg: 104, reach: 92, kb: 380, hitstun: 0.46, knockdown: true, sfxHeavy: true },
      specialAnim: [
        { dur: 0.16, p: { torso: -0.12, armF: [0.6, 2.2], armB: [1.6, 0.8], legF: [0.3, -0.24], legB: [-0.4, 0.36], rx: -6 } },
        { dur: 0.1, p: { torso: 0.3, armF: [1.66, 0.05], armB: [0.9, 1.2], legF: [0.5, -0.26], legB: [-0.5, 0.44], rx: 6 }, spawn: true },
        { dur: 0.24, p: { torso: 0.1, armF: [1.05, 1.4], armB: [0.55, 1.65], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
      ],
      special: { cooldown: 1.15, projectile: 'laser' },
      superName: 'THE DROP',
      super: { dmg: 225, reach: 340, kb: 520 },
    },
    smearColor: 'rgba(60,230,255,0.4)',
  },

  maestro: {
    key: 'maestro', name: 'MAESTRO', genre: 'orchestral', tagline: 'FINAL MOVEMENT',
    hp: 980, walk: 225, jumpV: -750,
    colors: {
      suit: '#3a2d5c', suitDark: '#241c3e', skin: '#f0d0b8', accent: '#ffd166',
      glow: 'rgba(255,209,102,0.5)', trim: '#f5efe0', hair: '#d8d4cc',
    },
    body: { torso: 47, armU: 26, armL: 26, legU: 31, legL: 33, headR: 14, limbW: 11, torsoW: 21 },
    moves: {
      lights: [
        [ // baton flick
          { dur: 0.09, p: { torso: 0.1, armF: [0.9, 2.0], armB: [0.4, 1.6], legF: [0.32, -0.2], legB: [-0.3, 0.3], rx: -3 } },
          { dur: 0.08, p: { torso: 0.26, armF: [1.9, 0.1], armB: [0.6, 1.4], legF: [0.46, -0.24], legB: [-0.44, 0.38], rx: 8 }, lungeV: 160, hit: true },
          { dur: 0.15, p: { torso: 0.1, armF: [1.1, 1.6], armB: [0.4, 1.6], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
        [ // downbeat cut
          { dur: 0.09, p: { torso: -0.08, armF: [2.6, 0.4], armB: [0.5, 1.5], legF: [0.3, -0.2], legB: [-0.34, 0.32], rx: -2 } },
          { dur: 0.08, p: { torso: 0.3, armF: [1.2, 0.15], armB: [0.7, 1.3], legF: [0.5, -0.28], legB: [-0.42, 0.36], rx: 9 }, lungeV: 170, hit: true },
          { dur: 0.16, p: { torso: 0.1, armF: [1.0, 1.6], armB: [0.5, 1.6], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
        ],
      ],
      light: { dmg: 52, reach: 84, kb: 170, hitstun: 0.28, sfxHeavy: false },
      heavyAnim: [
        { dur: 0.22, p: { torso: 0.3, armF: [0.3, 0.6], armB: [0.6, 1.6], legF: [0.4, -0.5], legB: [-0.3, 0.5], rx: -6, ry: 8 } },
        { dur: 0.10, p: { torso: -0.3, armF: [3.0, 0.05], armB: [0.8, 1.2], legF: [0.6, -0.2], legB: [-0.7, 0.6], rx: 10, ry: -14 }, lungeV: 200, hit: true },
        { dur: 0.3, p: { torso: 0.05, armF: [1.2, 1.2], armB: [0.5, 1.6], legF: [0.32, -0.2], legB: [-0.3, 0.3] } },
      ],
      heavy: { dmg: 118, reach: 84, kb: 260, hitstun: 0.5, launch: -520, sfxHeavy: true },
      specialAnim: [
        { dur: 0.18, p: { torso: -0.1, armF: [2.8, 0.3], armB: [1.4, 0.9], legF: [0.32, -0.22], legB: [-0.4, 0.34], rx: -4 } },
        { dur: 0.12, p: { torso: 0.24, armF: [1.7, 0.1], armB: [0.8, 1.3], legF: [0.46, -0.26], legB: [-0.46, 0.4], rx: 5 }, spawn: true },
        { dur: 0.3, p: { torso: 0.08, armF: [1.1, 1.5], armB: [0.5, 1.6], legF: [0.3, -0.2], legB: [-0.3, 0.3] } },
      ],
      special: { cooldown: 1.6, projectile: 'notes' },
      superName: 'SYMPHONY NO. K.O.',
      super: { dmg: 240, reach: 380, kb: 480 },
    },
    smearColor: 'rgba(255,209,102,0.4)',
  },
};

// ---------------- bespoke drawing hooks ----------------

S.charArt = {
  riff: {
    back(g, f, j) {
      // hair tail whipping behind
      const sway = Math.sin(f.animT * 3 + 1) * 4 + f.vx * -0.012;
      g.strokeStyle = f.char.colors.hair;
      g.lineWidth = 9;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(j.head.x - 6, j.head.y + 4);
      g.quadraticCurveTo(j.head.x - 22 + sway, j.head.y + 26, j.head.x - 18 + sway * 2, j.head.y + 48);
      g.stroke();
    },
    head(g, f, j) {
      const c = f.char.colors;
      S.gfx.circle(g, j.head.x, j.head.y, 15, c.skin);
      // mohawk
      const pts = [];
      for (let i = 0; i <= 4; i++) {
        const a = -2.4 + i * 0.5;
        pts.push([j.head.x + Math.cos(a) * 14, j.head.y + Math.sin(a) * 14]);
        if (i < 4) pts.push([j.head.x + Math.cos(a + 0.25) * 27, j.head.y + Math.sin(a + 0.25) * 27]);
      }
      S.gfx.poly(g, pts, c.hair, '#0a0a12', 4);
      // shades
      g.fillStyle = '#14141c';
      g.fillRect(j.head.x - 2, j.head.y - 6, 16, 7);
      g.fillStyle = c.accent;
      g.globalAlpha = 0.7;
      g.fillRect(j.head.x + 3, j.head.y - 5, 4, 5);
      g.globalAlpha = 1;
    },
    prop(g, f, j) {
      // flying-V guitar between hands (or slung during hurt states)
      const c = f.char.colors;
      const a = Math.atan2(j.handF.y - j.handB.y, j.handF.x - j.handB.x);
      const cx = (j.handF.x + j.handB.x) / 2, cy = (j.handF.y + j.handB.y) / 2;
      g.save();
      g.translate(cx, cy);
      g.rotate(a);
      // neck
      S.gfx.capsule(g, -46, 0, 26, 0, 5, '#c8a468', '#0a0a12', 4);
      // V body
      S.gfx.poly(g, [[26, -2], [58, -20], [50, 2], [58, 18]], c.suitDark, '#0a0a12', 4);
      g.strokeStyle = c.accent;
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-44, 0); g.lineTo(40, 0); g.stroke();
      // headstock
      S.gfx.poly(g, [[-46, -5], [-58, -8], [-56, 6], [-46, 4]], c.hair, '#0a0a12', 3);
      g.restore();
    },
    torsoDecor(g, f, j) {
      g.strokeStyle = f.char.colors.trim;
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(j.neck.x - 8, j.neck.y + 8); g.lineTo(j.hip.x - 8, j.hip.y - 2); g.stroke();
      g.beginPath(); g.moveTo(j.neck.x + 8, j.neck.y + 8); g.lineTo(j.hip.x + 8, j.hip.y - 2); g.stroke();
    },
  },

  echo: {
    back(g, f, j) {
      // short scarf trail
      const c = f.char.colors;
      const sway = Math.sin(f.animT * 4) * 5 - f.vx * 0.02;
      g.strokeStyle = c.trim;
      g.lineWidth = 6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(j.neck.x - 4, j.neck.y + 4);
      g.quadraticCurveTo(j.neck.x - 20 + sway, j.neck.y + 12, j.neck.x - 30 + sway * 1.6, j.neck.y + 8 + Math.abs(sway));
      g.stroke();
    },
    head(g, f, j) {
      const c = f.char.colors;
      S.gfx.circle(g, j.head.x, j.head.y, 14, c.hair);
      // visor
      g.fillStyle = '#0c1018';
      g.beginPath();
      g.roundRect(j.head.x - 6, j.head.y - 7, 22, 12, 5);
      g.fill();
      const grad = g.createLinearGradient(j.head.x - 6, 0, j.head.x + 16, 0);
      grad.addColorStop(0, c.accent);
      grad.addColorStop(1, c.trim);
      g.fillStyle = grad;
      g.globalAlpha = 0.9;
      g.beginPath();
      g.roundRect(j.head.x - 4, j.head.y - 5, 18, 4 + 2 * S.audio.state.kick, 3);
      g.fill();
      g.globalAlpha = 1;
      S.gfx.glow(g, j.head.x + 5, j.head.y - 3, 18, c.accent, 0.4);
    },
    prop(g, f, j) {
      const c = f.char.colors;
      for (const h of [j.handF, j.handB]) {
        S.gfx.circle(g, h.x, h.y, 7.5, c.suitDark, '#0a0a12', 4);
        g.strokeStyle = c.accent;
        g.lineWidth = 2;
        g.beginPath(); g.arc(h.x, h.y, 7.5, 0, S.TAU); g.stroke();
        S.gfx.glow(g, h.x, h.y, 16, c.accent, 0.35 + S.audio.state.kick * 0.3);
      }
    },
    torsoDecor(g, f, j) {
      const c = f.char.colors;
      g.strokeStyle = c.accent;
      g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(j.neck.x + 9, j.neck.y + 6); g.lineTo(j.hip.x + 9, j.hip.y - 4); g.stroke();
    },
  },

  maestro: {
    back(g, f, j) {
      // coat tails, swaying with motion
      const c = f.char.colors;
      const sway = Math.sin(f.animT * 2.4) * 5 - f.vx * 0.03;
      for (const side of [-1, 1]) {
        g.beginPath();
        g.moveTo(j.hip.x + side * 9, j.hip.y - 6);
        g.quadraticCurveTo(j.hip.x + side * 14 + sway, j.hip.y + 22, j.hip.x + side * 8 + sway * 2, j.hip.y + 42);
        g.quadraticCurveTo(j.hip.x + side * 2 + sway, j.hip.y + 20, j.hip.x - side * 2, j.hip.y - 2);
        g.closePath();
        g.fillStyle = c.suitDark;
        g.strokeStyle = '#0a0a12';
        g.lineWidth = 3.5;
        g.stroke(); g.fill();
      }
    },
    head(g, f, j) {
      const c = f.char.colors;
      S.gfx.circle(g, j.head.x, j.head.y, 14, c.skin);
      // swept silver hair
      S.gfx.poly(g, [
        [j.head.x - 14, j.head.y - 2], [j.head.x - 10, j.head.y - 15],
        [j.head.x + 4, j.head.y - 18], [j.head.x + 15, j.head.y - 10],
        [j.head.x + 8, j.head.y - 13], [j.head.x - 4, j.head.y - 12],
      ], c.hair, '#0a0a12', 3.5);
      // collar
      g.fillStyle = c.trim;
      g.fillRect(j.neck.x - 8, j.neck.y - 2, 16, 6);
      // monocle glint
      g.strokeStyle = c.accent;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(j.head.x + 7, j.head.y - 1, 4.5, 0, S.TAU); g.stroke();
    },
    prop(g, f, j) {
      // baton with glowing tip
      const c = f.char.colors;
      const dx = j.handF.x - j.elbowF.x, dy = j.handF.y - j.elbowF.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = j.handF.x + (dx / len) * 34, ty = j.handF.y + (dy / len) * 34;
      S.gfx.capsule(g, j.handF.x, j.handF.y, tx, ty, 3, c.trim, '#0a0a12', 3);
      S.gfx.glow(g, tx, ty, 14, c.accent, 0.6);
      S.gfx.circle(g, tx, ty, 2.5, c.accent, null);
      f._batonTip = { x: tx, y: ty };
    },
    torsoDecor(g, f, j) {
      const c = f.char.colors;
      g.fillStyle = c.trim;
      g.beginPath();
      g.moveTo(j.neck.x, j.neck.y + 6);
      g.lineTo(j.neck.x + 7, j.neck.y + 16);
      g.lineTo(j.neck.x, j.neck.y + 30);
      g.lineTo(j.neck.x - 7, j.neck.y + 16);
      g.closePath();
      g.fill();
    },
  },
};
