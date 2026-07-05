// SOUNDCLASH — stages. Every venue is an instrument: speakers pump with the
// kick, skylines equalize with the bass, chandeliers answer the accents.
// World is 1200 wide; camera pans 0..240; parallax via cam factors.

S.STAGES = {
  metal: {
    name: 'CLUB INFERNO',
    draw(g, cam, t) {
      const a = S.audio.state;
      // walls
      const bg = g.createLinearGradient(0, 0, 0, 540);
      bg.addColorStop(0, '#12060a');
      bg.addColorStop(0.7, '#1e0a10');
      bg.addColorStop(1, '#0c0508');
      g.fillStyle = bg;
      g.fillRect(0, 0, 960, 540);
      // fire glow side vents
      S.gfx.glow(g, 60 - cam * 0.3, 470, 180 + a.bass * 60, 'rgba(255,90,20,0.8)', 0.3 + a.kick * 0.25);
      S.gfx.glow(g, 900 - cam * 0.3 + 240 * 0.3, 470, 180 + a.bass * 60, 'rgba(255,60,10,0.8)', 0.3 + a.kick * 0.25);
      // amp wall
      for (let i = 0; i < 6; i++) {
        const x = 40 + i * 155 - cam * 0.5;
        for (let row = 0; row < 2; row++) {
          const y = 190 + row * 105;
          g.fillStyle = row ? '#191219' : '#150f15';
          g.fillRect(x, y, 130, 100);
          g.strokeStyle = '#2a1f28';
          g.lineWidth = 3;
          g.strokeRect(x + 3, y + 3, 124, 94);
          const r = 30 + a.kick * 7;
          const grad = g.createRadialGradient(x + 65, y + 50, 2, x + 65, y + 50, r);
          grad.addColorStop(0, '#0a0708');
          grad.addColorStop(0.8, '#241a20');
          grad.addColorStop(1, '#0f0a0d');
          g.fillStyle = grad;
          g.beginPath(); g.arc(x + 65, y + 50, r, 0, S.TAU); g.fill();
          g.strokeStyle = `rgba(255,90,40,${0.2 + a.kick * 0.5})`;
          g.lineWidth = 2;
          g.beginPath(); g.arc(x + 65, y + 50, r + 3, 0, S.TAU); g.stroke();
        }
      }
      // hanging cage lights, strobing with the snare
      for (let i = 0; i < 3; i++) {
        const x = 160 + i * 320 - cam * 0.7;
        const sway = Math.sin(t * 1.3 + i * 2) * 10;
        g.strokeStyle = '#2a2026';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + sway, 74); g.stroke();
        S.gfx.circle(g, x + sway, 84, 12, '#241a1e', '#0a0a12', 3);
        const on = 0.25 + a.snare * 0.75;
        S.gfx.glow(g, x + sway, 88, 90 + a.snare * 60, 'rgba(255,140,60,0.9)', on * 0.5);
        g.fillStyle = `rgba(255,190,120,${on})`;
        g.beginPath(); g.arc(x + sway, 86, 5, 0, S.TAU); g.fill();
      }
      // crowd silhouettes on the beat
      g.fillStyle = '#08050a';
      for (let i = 0; i < 22; i++) {
        const x = i * 48 - cam * 0.82 - 10;
        const jump = Math.pow(1 - a.beatPhase, 2) * (6 + (i * 7) % 9);
        g.beginPath(); g.arc(x, 428 - jump, 13, 0, S.TAU); g.fill();
        g.fillRect(x - 11, 428 - jump, 22, 34);
        if (i % 3 === 0) { // raised fist
          g.fillRect(x + 8, 404 - jump - (i % 2) * 6, 5, 26);
        }
      }
    },
  },

  synthwave: {
    name: 'NEON DRIVE',
    draw(g, cam, t) {
      const a = S.audio.state;
      const bg = g.createLinearGradient(0, 0, 0, 540);
      bg.addColorStop(0, '#0c0722');
      bg.addColorStop(0.55, '#2b0f45');
      bg.addColorStop(0.78, '#5c1b52');
      bg.addColorStop(1, '#0e0a20');
      g.fillStyle = bg;
      g.fillRect(0, 0, 960, 540);
      // stars
      for (let i = 0; i < 40; i++) {
        const x = (i * 97 % 990) - cam * 0.1, y = (i * 53) % 240;
        g.fillStyle = `rgba(255,255,255,${0.2 + 0.3 * Math.sin(t * 2 + i)})`;
        g.fillRect(x, y, 2, 2);
      }
      // grid sun
      const sx = 620 - cam * 0.16, sy = 300;
      const sr = 110 + a.kick * 8;
      const sun = g.createLinearGradient(0, sy - sr, 0, sy + sr);
      sun.addColorStop(0, '#ffd166');
      sun.addColorStop(0.5, '#ff4da6');
      sun.addColorStop(1, '#b43dff');
      g.save();
      g.beginPath(); g.arc(sx, sy, sr, 0, S.TAU); g.clip();
      g.fillStyle = sun;
      g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
      g.fillStyle = '#0c0722';
      for (let i = 0; i < 6; i++) g.fillRect(sx - sr, sy + 10 + i * 18, sr * 2, 4 + i * 1.5);
      g.restore();
      S.gfx.glow(g, sx, sy, sr * 2.1, 'rgba(255,77,166,0.8)', 0.3 + a.kick * 0.2);
      // skyline with equalizer windows
      for (let i = 0; i < 14; i++) {
        const bx = i * 88 - cam * 0.4 - 40;
        const bh = 90 + (i * 37 % 120);
        g.fillStyle = '#120b28';
        g.fillRect(bx, 388 - bh, 70, bh + 20);
        const cols = 3;
        for (let cCol = 0; cCol < cols; cCol++) {
          const env = [a.kick, a.bass, a.snare][(i + cCol) % 3];
          const litRows = Math.round(env * 6);
          for (let r = 0; r < litRows; r++) {
            g.fillStyle = ['#33e6ff', '#ff3db8', '#ffd166'][(i + cCol) % 3];
            g.globalAlpha = 0.55;
            g.fillRect(bx + 8 + cCol * 20, 380 - r * 13 - (i * 37 % 120) * 0.4, 12, 8);
          }
        }
        g.globalAlpha = 1;
      }
      // laser fans sweeping with the bar
      g.save();
      g.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const ox = i ? 940 - cam * 0.3 : 20 - cam * 0.3;
        const base = i ? Math.PI : 0;
        for (let k = 0; k < 3; k++) {
          const ang = base + (i ? -1 : 1) * (0.5 + Math.sin(t * 0.7 + a.beatPhase * Math.PI + k * 0.5) * 0.35);
          g.strokeStyle = `rgba(51,230,255,${0.1 + a.snare * 0.18})`;
          g.lineWidth = 3;
          g.beginPath();
          g.moveTo(ox, 120);
          g.lineTo(ox + Math.cos(ang) * 900, 120 + Math.abs(Math.sin(ang)) * 520);
          g.stroke();
        }
      }
      g.restore();
      // rooftop edge
      g.fillStyle = '#0d0a1c';
      g.fillRect(0, 408, 960, 132);
      g.strokeStyle = `rgba(51,230,255,${0.4 + a.kick * 0.4})`;
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, 410); g.lineTo(960, 410); g.stroke();
    },
  },

  orchestral: {
    name: 'THE GRAND HALL',
    draw(g, cam, t) {
      const a = S.audio.state;
      const bg = g.createLinearGradient(0, 0, 0, 540);
      bg.addColorStop(0, '#171022');
      bg.addColorStop(0.75, '#241830');
      bg.addColorStop(1, '#120c18');
      g.fillStyle = bg;
      g.fillRect(0, 0, 960, 540);
      // organ pipes
      for (let i = 0; i < 16; i++) {
        const x = 130 + i * 46 - cam * 0.45;
        const hgt = 150 + Math.abs(8 - i) * -6 + (i % 2) * 22 + 90;
        const lit = a.bass * (i % 3 === 0 ? 1 : 0.4);
        const grad = g.createLinearGradient(x, 0, x + 26, 0);
        grad.addColorStop(0, '#3a3048');
        grad.addColorStop(0.5, `rgb(${90 + lit * 120},${76 + lit * 100},${50 + lit * 60})`);
        grad.addColorStop(1, '#2a2238');
        g.fillStyle = grad;
        g.fillRect(x, 330 - hgt, 26, hgt);
        g.fillStyle = '#171022';
        g.fillRect(x + 8, 330 - hgt + 8, 10, 26);
      }
      g.fillStyle = '#1d1428';
      g.fillRect(60 - cam * 0.45, 320, 850, 40);
      // chandeliers
      for (let i = 0; i < 2; i++) {
        const x = 260 + i * 420 - cam * 0.6;
        const sway = Math.sin(t * 0.9 + i * 2.4) * 8;
        g.strokeStyle = '#3a3048';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x + sway, 66); g.stroke();
        const cx = x + sway, cy = 76;
        S.gfx.poly(g, [[cx - 34, cy], [cx + 34, cy], [cx + 20, cy + 22], [cx - 20, cy + 22]], '#4a3c28', '#0a0a12', 3);
        for (let k = -2; k <= 2; k++) {
          const fx = cx + k * 15, fy = cy - 4;
          const fl = 0.5 + 0.5 * Math.sin(t * 7 + k * 2 + i * 3) * 0.5 + a.accent * 0.5;
          g.fillStyle = `rgba(255,214,130,${0.6 + fl * 0.4})`;
          g.beginPath(); g.arc(fx, fy, 2.5, 0, S.TAU); g.fill();
          S.gfx.glow(g, fx, fy, 26 + a.accent * 26, 'rgba(255,200,110,0.9)', 0.16 + fl * 0.1);
        }
      }
      // side curtains
      for (const side of [0, 1]) {
        const x = side ? 960 : 0;
        const grad = g.createLinearGradient(side ? x - 130 : 0, 0, side ? x : 130, 0);
        grad.addColorStop(side ? 1 : 0, '#4a1420');
        grad.addColorStop(side ? 0 : 1, 'rgba(74,20,32,0)');
        g.fillStyle = grad;
        g.fillRect(side ? x - 130 : 0, 0, 130, 540);
        g.strokeStyle = 'rgba(20,8,12,0.6)';
        for (let k = 0; k < 5; k++) {
          const cx2 = side ? x - 14 - k * 22 : 14 + k * 22;
          g.lineWidth = 6;
          g.beginPath();
          g.moveTo(cx2, 0);
          g.quadraticCurveTo(cx2 + Math.sin(t * 0.6 + k) * 4, 270, cx2 + (side ? 10 : -10), 540);
          g.stroke();
        }
      }
      // balcony crowd
      g.fillStyle = '#0d0a14';
      g.fillRect(0 - cam * 0.7, 360, 1300, 24);
      for (let i = 0; i < 18; i++) {
        const x = 30 + i * 56 - cam * 0.7;
        const nod = Math.pow(1 - a.beatPhase, 2) * 3;
        g.fillStyle = '#0a0810';
        g.beginPath(); g.arc(x, 352 - nod, 9, 0, S.TAU); g.fill();
      }
    },
  },
};

// shared floor + beat pulse, drawn by the game under the fighters
S.drawFloor = function (g, cam, groundY, accent) {
  const a = S.audio.state;
  const fg = g.createLinearGradient(0, groundY - 8, 0, 540);
  fg.addColorStop(0, '#1a1622');
  fg.addColorStop(0.12, '#100d18');
  fg.addColorStop(1, '#07060c');
  g.fillStyle = fg;
  g.fillRect(0, groundY - 6, 960, 540 - groundY + 6);
  g.strokeStyle = `rgba(255,255,255,0.08)`;
  g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, groundY - 5); g.lineTo(960, groundY - 5); g.stroke();
  // beat pulse rolling out across the floor
  const ph = a.beatPhase;
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = accent;
  g.globalAlpha = (1 - ph) * 0.28;
  g.lineWidth = 2.5;
  g.beginPath();
  g.ellipse(480, groundY + 26, 60 + ph * 460, 10 + ph * 60, 0, 0, S.TAU);
  g.stroke();
  g.restore();
};
