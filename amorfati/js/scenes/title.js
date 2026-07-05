// TITLE — the wheel, the name, the count of your recurrences.
Z.scenes.title = {
  enter(opts) {
    this.t = 0;
    this.afterYes = !!(opts && opts.afterYes);
    Z.audio.startAmb('noon');
  },

  update(dt) {
    this.t += dt;
    if (this.t > 1.2 && (Z.input.anyPressed || Z.input.mclicked)) {
      Z.audio.sfx('chord');
      Z.go('rope');
    }
  },

  draw(g) {
    g.fillStyle = '#050408'; g.fillRect(0, 0, 960, 540);
    const t = this.t;

    // the self-rolling wheel: an ouroboros of gold dust
    g.save();
    g.translate(480, 244);
    g.rotate(t * 0.22);
    for (let i = 0; i < 90; i++) {
      const a = i / 90 * Z.TAU;
      const r = 128 + Z.noise1(i * 0.4 + t * 0.5, 41) * 7;
      const bright = 0.25 + 0.75 * Math.abs(Math.sin(a * 0.5 + t * 0.8));
      g.fillStyle = `rgba(216,168,56,${bright * 0.8})`;
      const s = 1.4 + bright * 2;
      g.fillRect(Math.cos(a) * r - s / 2, Math.sin(a) * r - s / 2, s, s);
    }
    g.restore();

    // name
    g.textAlign = 'center';
    g.font = '900 64px Georgia, serif';
    g.fillStyle = '#e8dcc0';
    g.fillText('AMOR FATI', 480, 232);
    g.font = 'italic 17px Georgia, serif';
    g.fillStyle = '#8a7d5e';
    g.fillText('a game designed after Friedrich Nietzsche', 480, 272);

    const loop = Z.save.data.loop, yes = Z.save.data.yes;
    g.font = '14px Georgia, serif';
    g.fillStyle = '#6a6050';
    if (loop === 1) {
      g.fillText('in which you live one life, and are asked a question about it', 480, 384);
    } else {
      g.fillText(`you have begun this life ${loop} times` + (yes ? ` · you have said yes ${yes === 1 ? 'once' : yes + ' times'}` : ''), 480, 384);
    }
    if (this.afterYes) {
      g.font = 'italic 15px Georgia, serif';
      g.fillStyle = '#b89a4e';
      g.fillText('da capo — from the beginning, and gladly', 480, 412);
    }

    if (Math.floor(t * 1.4) % 2 === 0 && t > 1.2) {
      g.font = '15px Georgia, serif';
      g.fillStyle = '#9a8c6a';
      g.fillText('— any key —', 480, 466);
    }

    g.font = '12px Georgia, serif';
    g.fillStyle = '#4a4438';
    g.fillText('A/D move · W jump/rise · E use · SPACE roar · mouse gaze', 480, 500);
  },
};
