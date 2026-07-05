// FOLIO IV — THE GARDEN. Desire and cultivation. Eight seeds are offered;
// five get planted; one gets the most of your light. You will be known
// by what you water.

P.app.register('garden', {
  SEEDS: ['patience', 'hunger', 'wonder', 'rest', 'courage', 'mischief', 'silence', 'spring'],
  NEED: 5,

  enter() {
    P.audio.scene({ root: 110, scale: [0, 2, 4, 7, 9], chimeRoot: 440, padVol: 0.045, shimmer: true });
    this.NEED = P.FAST ? 2 : 5;
    this.WATER = P.FAST ? 1.5 : 7;
    P.profile.data.seeds = []; // this folio owns the garden
    P.profile.data.wateredMost = null;
    this.particles = new P.Particles(500);
    this.plants = [];
    this.carrying = null;
    this.planted = 0;
    this.waterHint = false;
    this.finishing = false;
    this.soilY = P.app.h * 0.76;

    const pouch = document.createElement('div');
    pouch.id = 'seedpouch';
    document.getElementById('ui').appendChild(pouch);
    this.pouch = pouch;
    this.SEEDS.forEach(s => {
      const chip = document.createElement('button');
      chip.className = 'seed';
      chip.textContent = s;
      chip.addEventListener('click', () => {
        P.audio.ensure();
        if (chip.classList.contains('taken')) return;
        this.pouch.querySelectorAll('.seed').forEach(c => c.classList.remove('carrying'));
        if (this.carrying === s) { this.carrying = null; return; }
        this.carrying = s;
        chip.classList.add('carrying');
        P.audio.chime(2, { vol: 0.08, dur: 1.2 });
      });
      pouch.appendChild(chip);
    });
  },

  exit() { this.pouch?.remove(); },
  resize() { this.soilY = P.app.h * 0.76; },

  begin() {
    P.ui.caption('eight seeds. the ground has room for five.', { hold: 4200 });
    P.ui.caption('take a seed from the pouch, then touch the soil.', { hold: 4600 });
    this.pouch.classList.add('show');
  },

  plantColor(word) {
    const hues = { patience: 172, hunger: 12, wonder: 265, rest: 205, courage: 28, mischief: 320, silence: 190, spring: 95 };
    return hues[word] ?? (P.hashString(word) % 360);
  },

  pointerDown(x, y) {
    if (this.carrying && y > this.soilY - 30) {
      const word = this.carrying;
      this.carrying = null;
      const chip = [...this.pouch.querySelectorAll('.seed')].find(c => c.textContent === word);
      chip?.classList.remove('carrying');
      chip?.classList.add('taken');
      this.plants.push({
        x: P.clamp(x, 70, P.app.w - 70), y0: Math.max(y, this.soilY + 10),
        word, growth: 0, water: 0, glow: 0,
        hMax: P.rand(120, 190) * Math.min(1, P.app.h / 800),
        sway: P.rand(100), hue: this.plantColor(word),
        sprite: new P.Word(word, { size: 16, color: '#eafff2', glow: `hsl(${this.plantColor(word)},90%,70%)` }),
      });
      this.planted++;
      P.profile.data.seeds.push(word);
      P.profile.collect(word);
      P.audio.chime(this.planted + 2, { x: x / P.app.w, vol: 0.14, dur: 2.8 });
      this.particles.burst(x, this.soilY + 14, 14, () => ({
        x: x + P.rand(-14, 14), y: this.soilY + P.rand(0, 18),
        vx: P.rand(-10, 10), vy: P.rand(-20, -6),
        size: P.rand(0.8, 1.8), color: '#9be8b8', decay: P.rand(0.4, 0.7), drag: 0.98,
      }));
      if (this.planted === 1) {
        setTimeout(() => {
          if (!this.waterHint) {
            this.waterHint = true;
            P.ui.caption('now hold your light above a seedling,<br>and water it.', { hold: 4800 });
          }
        }, 2500);
      }
      if (this.planted >= this.NEED) this.pouch.classList.remove('show');
    }
  },

  update(dt, t) {
    // fireflies
    if (Math.random() < 0.3) {
      this.particles.spawn({
        x: P.rand(P.app.w), y: P.rand(P.app.h * 0.3, P.app.h * 0.95),
        vx: P.rand(-8, 8), vy: P.rand(-6, 2),
        size: P.rand(0.6, 1.6), color: '#b8ffd9',
        alpha: P.rand(0.15, 0.5), decay: P.rand(0.15, 0.3), drag: 0.99,
      });
    }

    const px = P.app.pointer.x, py = P.app.pointer.y;
    const watering = P.app.pointer.down;
    let totalWater = 0;
    for (const pl of this.plants) {
      pl.growth = Math.min(1, pl.growth + dt / 4.5);
      const topY = pl.y0 - pl.hMax * pl.growth * (1 + Math.min(0.35, pl.water * 0.045));
      const near = P.dist(px, py, pl.x, (topY + pl.y0) / 2) < 110 || P.dist(px, py, pl.x, topY) < 110;
      if (watering && near) {
        pl.water += dt;
        pl.glow = Math.min(1, pl.glow + dt * 1.5);
        // falling light
        if (Math.random() < 0.7) {
          this.particles.spawn({
            x: px + P.rand(-18, 18), y: py + P.rand(-6, 6),
            vx: P.rand(-4, 4), vy: P.rand(40, 90),
            size: P.rand(0.6, 1.5), color: '#d8ffe8',
            alpha: 0.7, decay: P.rand(0.8, 1.3), drag: 0.995,
          });
        }
        if (Math.random() < 0.05) P.audio.chime(Math.floor(P.rand(5, 10)), { x: px / P.app.w, vol: 0.04, dur: 1.6 });
      } else {
        pl.glow = Math.max(0, pl.glow - dt * 0.8);
      }
      // blossom spores
      if (pl.growth > 0.85 && Math.random() < 0.1 + pl.glow * 0.3) {
        this.particles.spawn({
          x: pl.x + P.rand(-14, 14), y: topY + P.rand(-10, 6),
          vx: P.rand(-6, 6), vy: P.rand(-16, -5),
          size: P.rand(0.5, 1.4), color: `hsl(${pl.hue},85%,75%)`,
          alpha: 0.6, decay: P.rand(0.25, 0.5), drag: 0.99,
        });
      }
      totalWater += pl.water;
    }
    this.particles.update(dt);

    if (!this.finishing && this.planted >= this.NEED && totalWater > this.WATER &&
        this.plants.every(p => p.growth > 0.9)) {
      this.finishing = true;
      this.finish();
    }
  },

  async finish() {
    let most = null;
    for (const pl of this.plants) if (pl.water > 1.2 && (!most || pl.water > most.water)) most = pl;
    P.profile.data.wateredMost = most ? most.word : null;
    await P.sleep(1200);
    if (most) {
      await P.ui.caption(`the garden noticed:<br>you watered <em>${most.word}</em> longest.`, { hold: 4600 });
    }
    P.profile.data.expectedSeconds += 170;
    P.app.completeFolio([
      { text: 'you will be known by what you water.', attrib: 'the gardener’s rule', hold: 4600 },
    ], 'tide');
  },

  drawPlant(g, pl, t) {
    const waterBonus = 1 + Math.min(0.35, pl.water * 0.045);
    const H = pl.hMax * pl.growth * waterBonus;
    if (H < 2) return;
    const sway = Math.sin(t * 0.8 + pl.sway) * H * 0.06;
    const topX = pl.x + sway, topY = pl.y0 - H;

    g.save();
    g.strokeStyle = `hsla(150, 45%, ${30 + pl.glow * 15}%, 0.9)`;
    g.lineWidth = 2.2;
    g.beginPath();
    g.moveTo(pl.x, pl.y0);
    g.quadraticCurveTo(pl.x + sway * 0.3, pl.y0 - H * 0.5, topX, topY);
    g.stroke();

    // leaves
    for (const f of [0.38, 0.62]) {
      const lx = P.lerp(pl.x, topX, f), ly = pl.y0 - H * f;
      const side = f === 0.38 ? -1 : 1;
      const lw = 14 * pl.growth;
      g.fillStyle = `hsla(140, 55%, ${34 + pl.glow * 14}%, 0.85)`;
      g.beginPath();
      g.ellipse(lx + side * lw * 0.7, ly, lw, lw * 0.36, side * 0.5, 0, P.TAU);
      g.fill();
    }

    // blossom
    const bloom = P.clamp((pl.growth - 0.6) / 0.4, 0, 1);
    if (bloom > 0) {
      g.globalCompositeOperation = 'lighter';
      const petalR = 13 * bloom * waterBonus;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * P.TAU + t * 0.1;
        g.fillStyle = `hsla(${pl.hue}, 85%, ${62 + pl.glow * 12}%, ${0.32 * bloom})`;
        g.beginPath();
        g.ellipse(topX + Math.cos(a) * petalR * 0.7, topY + Math.sin(a) * petalR * 0.7,
          petalR, petalR * 0.45, a, 0, P.TAU);
        g.fill();
      }
      g.fillStyle = `hsla(${pl.hue}, 90%, 80%, ${0.8 * bloom})`;
      g.beginPath(); g.arc(topX, topY, 2.4, 0, P.TAU); g.fill();
      pl.sprite.x = topX; pl.sprite.y = topY - 26;
      pl.sprite.alpha = bloom * (0.55 + 0.45 * pl.glow);
      pl.sprite.draw(g);
    }
    g.restore();
  },

  draw(g, w, h, t) {
    const bg = g.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#04120d');
    bg.addColorStop(0.7, '#0a2e22');
    bg.addColorStop(1, '#0d3a2b');
    g.fillStyle = bg;
    g.fillRect(0, 0, w, h);

    // soil
    const sg = g.createLinearGradient(0, this.soilY, 0, h);
    sg.addColorStop(0, '#132018');
    sg.addColorStop(1, '#070d09');
    g.fillStyle = sg;
    g.fillRect(0, this.soilY, w, h - this.soilY);
    g.strokeStyle = 'rgba(140,255,190,0.12)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, this.soilY); g.lineTo(w, this.soilY); g.stroke();

    // planting hint where the cursor hovers the soil
    if (this.carrying && P.app.pointer.y > this.soilY - 30) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = 'rgba(150,255,200,0.4)';
      g.setLineDash([3, 5]);
      g.beginPath();
      g.arc(P.app.pointer.x, Math.max(P.app.pointer.y, this.soilY + 10), 14, 0, P.TAU);
      g.stroke();
      g.restore();
    }

    for (const pl of this.plants) this.drawPlant(g, pl, t);
    this.particles.draw(g);
  },
});
