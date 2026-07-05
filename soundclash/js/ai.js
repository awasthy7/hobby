// SOUNDCLASH — CPU opponent. The tell that sells the theme: at higher
// difficulties the AI deliberately times its attacks to land on the beat.

S.AI_LEVELS = [
  { think: 0.24, aggression: 0.45, beatSkill: 0.2, block: 0.1, name: 'OPENING ACT' },
  { think: 0.17, aggression: 0.62, beatSkill: 0.5, block: 0.24, name: 'SUPPORT ACT' },
  { think: 0.13, aggression: 0.78, beatSkill: 0.78, block: 0.38, name: 'HEADLINER' },
  { think: 0.10, aggression: 0.9, beatSkill: 0.95, block: 0.52, name: 'THE REMIX' },
];

S.AI = class {
  constructor(level = 0) {
    this.cfg = S.AI_LEVELS[S.clamp(level, 0, S.AI_LEVELS.length - 1)];
    this.timer = 0;
    this.move = 0;            // -1 back, 0 hold, 1 toward
    this.wantJump = false;
    this.blocking = false;
    this.pending = null;      // {kind, at}
  }

  input(dt, me, opp, world) {
    const inp = { left: false, right: false, up: false, down: false, lightPressed: false, heavyPressed: false, specialPressed: false, superPressed: false };
    this.timer -= dt;
    const dist = Math.abs(opp.x - me.x);
    const toward = opp.x > me.x ? 1 : -1;
    const c = this.cfg;

    if (this.timer <= 0) {
      this.timer = c.think * S.rand(0.7, 1.3);
      this.blocking = false;
      this.wantJump = false;

      // defend if the opponent is swinging nearby
      if (opp.state === 'attack' && dist < 190 && Math.random() < c.block) {
        this.blocking = true;
      } else if (opp.state === 'down' || opp.state === 'getup') {
        this.move = dist > 130 ? toward : 0; // stalk, don't spam the floored
      } else if (dist > 430) {
        this.move = toward;
        if (Math.random() < 0.3 && me.specialCd <= 0) this.queue('special');
        if (Math.random() < 0.12) this.wantJump = true;
      } else if (dist > 190) {
        this.move = Math.random() < c.aggression ? toward : (Math.random() < 0.3 ? -toward : 0);
        if (Math.random() < 0.18 && me.specialCd <= 0) this.queue('special');
      } else {
        // in range: fight
        if (me.groove >= 5 && Math.random() < 0.8) this.queue('super');
        else if (Math.random() < c.aggression) {
          this.queue(Math.random() < 0.32 ? 'heavy' : 'light');
        } else {
          this.move = Math.random() < 0.5 ? -toward : 0;
        }
      }
    }

    // beat-aware attack release
    if (this.pending) {
      const now = S.audio.now();
      if (now >= this.pending.at) {
        inp[this.pending.kind + 'Pressed'] = true;
        this.pending = null;
      }
    }

    if (this.blocking) inp.down = true;
    else if (this.move === 1) { if (toward > 0) inp.right = true; else inp.left = true; }
    else if (this.move === -1) { if (toward > 0) inp.left = true; else inp.right = true; }
    if (this.wantJump && me.grounded) { inp.up = true; this.wantJump = false; }
    return inp;
  }

  queue(kind) {
    const now = S.audio.now();
    if (Math.random() < this.cfg.beatSkill && S.audio.music) {
      const b = S.audio.beatInfo(now);
      const at = b.next - 0.02 + S.rand(-0.02, 0.02);
      this.pending = { kind, at: at - now > 0.6 ? now : at };
    } else {
      this.pending = { kind, at: now + S.rand(0, 0.08) };
    }
    this.move = 0;
  }
};
