// DOOMED — boot, input, loop. ?level=2 jumps to a level, ?god=1 for iddqd.
(function () {
  D.input = {
    fwd: false, back: false, sl: false, sr: false,
    turnL: false, turnR: false, fire: false, map: false, crouch: false,
    mouseDX: 0, mouseDY: 0,
    firePressed: false, usePressed: false, enterPressed: false,
    upPressed: false, downPressed: false, jumpPressed: false,
    w1Pressed: false, w2Pressed: false, w3Pressed: false,
    w4Pressed: false, w5Pressed: false, w6Pressed: false,
  };

  const HOLD = {
    w: 'fwd', s: 'back', a: 'sl', d: 'sr',
    ArrowUp: 'fwd', ArrowDown: 'back', ArrowLeft: 'turnL', ArrowRight: 'turnR',
    Control: 'fire', Tab: 'map', c: 'crouch',
  };
  const PRESS = {
    ' ': 'jumpPressed', e: 'usePressed', Enter: 'enterPressed',
    ArrowUp: 'upPressed', ArrowDown: 'downPressed', w: 'upPressed', s: 'downPressed',
    1: 'w1Pressed', 2: 'w2Pressed', 3: 'w3Pressed',
    4: 'w4Pressed', 5: 'w5Pressed', 6: 'w6Pressed', Control: 'firePressed',
  };

  window.addEventListener('keydown', (e) => {
    // typing in the multiplayer code boxes must not drive the game
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    D.audio.ensure();
    if (D.game.mode === 'title' && !D.audio.music) D.audio.startMusic('title');
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.repeat) { if (HOLD[k]) e.preventDefault(); return; }
    if (HOLD[k]) D.input[HOLD[k]] = true;
    if (PRESS[k]) D.input[PRESS[k]] = true;
    if (/^[a-z]$/.test(k)) D.game.cheat(k);
    if (HOLD[k] || PRESS[k] || k === 'Tab') e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (HOLD[k]) D.input[HOLD[k]] = false;
  });

  function clearPressed() {
    const i = D.input;
    i.firePressed = i.usePressed = i.enterPressed = i.jumpPressed = false;
    i.upPressed = i.downPressed = false;
    i.w1Pressed = i.w2Pressed = i.w3Pressed = false;
    i.w4Pressed = i.w5Pressed = i.w6Pressed = false;
  }

  function boot() {
    const cv = document.getElementById('stage');
    const g = cv.getContext('2d');
    D.game.init(cv, g);

    cv.addEventListener('mousedown', (e) => {
      D.audio.ensure();
      if (D.game.mode === 'level' && document.pointerLockElement !== cv) {
        cv.requestPointerLock?.();
      }
      D.input.fire = true;
      D.input.firePressed = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => { D.input.fire = false; });
    window.addEventListener('mousemove', (e) => {
      if (document.pointerLockElement === cv) {
        D.input.mouseDX += e.movementX;
        D.input.mouseDY += e.movementY;
      }
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---------- multiplayer UI (copy-paste signaling) ----------
    const mpui = document.getElementById('mpui');
    const mpstep = document.getElementById('mpstep');
    const mpout = document.getElementById('mpout');
    const mpin = document.getElementById('mpin');
    if (mpui) {
      const setStep = (t) => { mpstep.textContent = t; };
      const hostStart = async (mode) => {
        try {
          D.net.mpMode = mode;
          // host needs a running level for bodies to spawn into
          if (D.game.mode !== 'level') {
            D.game.diff = 1;
            D.game.player = null;
            D.game.startLevel(0, true);
          }
          if (mode === 'dm') {
            D.game.ents = D.game.ents.filter(e => e.type !== 'enemy');
            D.game.totals.kills = 0;
            D.game.message('DEATHMATCH — first blood decides nothing. frags do.');
          }
          setStep('creating invite… (a few seconds for ICE)');
          const code = await D.net.hostInvite();
          mpout.value = code;
          document.getElementById('mpaccept').hidden = false;
          setStep('1) send YOUR code to your friend  2) paste THEIR answer below  3) press ACCEPT ANSWER');
        } catch (err) { setStep('✗ ' + err.message); }
      };
      document.getElementById('mpcoop').onclick = () => hostStart('coop');
      document.getElementById('mpdm').onclick = () => hostStart('dm');
      document.getElementById('mpaccept').onclick = async () => {
        try {
          await D.net.hostAccept(mpin.value.trim());
          setStep('✓ handshake sent — the marine drops in when the channel opens. ESC to close.');
        } catch (err) { setStep('✗ bad answer code: ' + err.message); }
      };
      document.getElementById('mpjoin').onclick = async () => {
        try {
          setStep('answering… (a few seconds for ICE)');
          const answer = await D.net.joinWithOffer(mpin.value.trim());
          mpout.value = answer;
          setStep('send YOUR answer code back to the host. the game starts when they accept.');
        } catch (err) { setStep('✗ bad host code: ' + err.message); }
      };
      document.getElementById('mpclose').onclick = () => { mpui.hidden = true; };
      window.addEventListener('keydown', (e) => {
        const typing = e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT');
        if (!typing && e.key.toLowerCase() === 'n' && (D.game.mode === 'title' || D.game.mode === 'level')) {
          mpui.hidden = !mpui.hidden;
        }
        if (e.key === 'Escape' && !mpui.hidden) { mpui.hidden = true; e.stopPropagation(); }
      });
    }

    const params = new URLSearchParams(location.search);
    if (params.get('god') === '1') D.game.god = true;
    const res = parseInt(params.get('res') || '0', 10);
    if (res === 480) D.rc.setRes(480, 270);
    else if (res === 960) D.rc.setRes(960, 540);
    // WebGL renderer unless ?gl=0; software carries on if it declines
    if (params.get('gl') !== '0') D.gl.init(document.getElementById('glstage'));
    const lvl = parseInt(params.get('level') || '0', 10);
    D.game.urlSeed = params.get('seed') || null;
    D.game.urlFloor = parseInt(params.get('floor') || '0', 10) || null;
    const custom = params.get('custom');
    if (custom) {
      // a shared level: the URL is the map
      try {
        const map = D.customCodec.decode(custom);
        map.__code = custom;   // keep the code so a host can share this map
        D.game.diff = 1;
        D.game.player = null;
        D.game.startLevel(-1, true, map);
      } catch (err) {
        console.error('DOOMED: bad custom map code', err);
      }
    } else if (params.get('endless') === '1') {
      // deep-link a run: ?endless=1&seed=abc123&floor=4
      D.game.diff = 1;
      D.game.player = null;
      D.game.startEndless(D.game.urlFloor || 1, D.game.urlSeed || Math.random().toString(36).slice(2, 8), true);
    } else if (lvl >= 1 && lvl <= D.maps.length) {
      D.game.diff = 1;
      D.game.player = null;
      D.game.startLevel(lvl - 1, true);
    }

    // ---------- gamepad ----------
    const padPrev = {};
    function pollGamepad() {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const gp = pads && pads[0];
      if (!gp) return;
      const dz = (v) => Math.abs(v) < 0.22 ? 0 : v;
      const i = D.input;
      const mx = dz(gp.axes[0] || 0), my = dz(gp.axes[1] || 0);
      i.fwd = i.fwd || my < -0.35;
      i.back = i.back || my > 0.35;
      i.sl = i.sl || mx < -0.35;
      i.sr = i.sr || mx > 0.35;
      i.mouseDX += dz(gp.axes[2] || 0) * 16;
      i.mouseDY += dz(gp.axes[3] || 0) * 10;
      const btn = (n) => !!(gp.buttons[n] && gp.buttons[n].pressed);
      const edge = (n) => { const now = btn(n), was = padPrev[n]; padPrev[n] = now; return now && !was; };
      i.fire = i.fire || btn(7) || btn(5);
      if (edge(7) || edge(5)) i.firePressed = true;
      if (edge(0)) { i.jumpPressed = true; i.enterPressed = true; i.anyKey = true; }
      if (edge(2) || edge(1)) i.usePressed = true;
      i.crouch = i.crouch || btn(4) || btn(10);
      if (edge(9)) i.enterPressed = true;
      if (edge(12)) i.upPressed = true;
      if (edge(13)) i.downPressed = true;
      const cycleWeapon = (dir) => {
        const order = ['fists', 'pistol', 'shotgun', 'chaingun', 'rocket', 'plasma'];
        const p = D.game.player;
        if (!p) return;
        let idx = order.indexOf(p.weapon);
        for (let k = 0; k < order.length; k++) {
          idx = (idx + dir + order.length) % order.length;
          if (p.weapons[order[idx]]) { p.targetWeapon = order[idx]; break; }
        }
      };
      if (edge(14)) cycleWeapon(-1);
      if (edge(15)) cycleWeapon(1);
      D.audio.ensure();
    }
    D.cycleWeapon = (dir) => {
      const order = ['fists', 'pistol', 'shotgun', 'chaingun', 'rocket', 'plasma'];
      const p = D.game.player;
      if (!p) return;
      let idx = order.indexOf(p.weapon);
      for (let k = 0; k < order.length; k++) {
        idx = (idx + dir + order.length) % order.length;
        if (p.weapons[order[idx]]) { p.targetWeapon = order[idx]; break; }
      }
    };

    // ---------- touch: twin sticks + buttons ----------
    D.touch = { active: false, move: null, look: null, buttons: {} };
    const T = D.touch;
    const BTNS = [
      { id: 'fire', x: 855, y: 355, r: 52, label: 'FIRE' },
      { id: 'jump', x: 890, y: 245, r: 36, label: 'JMP' },
      { id: 'use', x: 790, y: 265, r: 36, label: 'USE' },
      { id: 'wpn', x: 905, y: 145, r: 30, label: 'WPN' },
    ];
    D.touchButtons = BTNS;
    function touchPos(t) {
      const r = cv.getBoundingClientRect();
      return { x: (t.clientX - r.left) / r.width * 960, y: (t.clientY - r.top) / r.height * 540 };
    }
    cv.addEventListener('touchstart', (e) => {
      e.preventDefault();
      T.active = true;
      D.audio.ensure();
      for (const t of e.changedTouches) {
        const pos = touchPos(t);
        const btn = BTNS.find(b => D.dist(pos.x, pos.y, b.x, b.y) < b.r + 14);
        if (btn) {
          T.buttons[btn.id] = t.identifier;
          if (btn.id === 'fire') { D.input.fire = true; D.input.firePressed = true; }
          if (btn.id === 'jump') D.input.jumpPressed = true;
          if (btn.id === 'use') { D.input.usePressed = true; D.input.enterPressed = true; }
          if (btn.id === 'wpn') D.cycleWeapon(1);
        } else if (pos.x < 420) {
          T.move = { id: t.identifier, ox: pos.x, oy: pos.y, dx: 0, dy: 0 };
        } else {
          T.look = { id: t.identifier, lx: pos.x, ly: pos.y };
          D.input.enterPressed = true; // menus advance on right-side tap
        }
      }
    }, { passive: false });
    cv.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const pos = touchPos(t);
        if (T.move && t.identifier === T.move.id) {
          T.move.dx = D.clamp((pos.x - T.move.ox) / 55, -1, 1);
          T.move.dy = D.clamp((pos.y - T.move.oy) / 55, -1, 1);
        } else if (T.look && t.identifier === T.look.id) {
          D.input.mouseDX += (pos.x - T.look.lx) * 2.4;
          D.input.mouseDY += (pos.y - T.look.ly) * 2.4;
          T.look.lx = pos.x; T.look.ly = pos.y;
        }
      }
    }, { passive: false });
    const touchEnd = (e) => {
      for (const t of e.changedTouches) {
        if (T.move && t.identifier === T.move.id) T.move = null;
        if (T.look && t.identifier === T.look.id) T.look = null;
        for (const b of BTNS) {
          if (T.buttons[b.id] === t.identifier) {
            delete T.buttons[b.id];
            if (b.id === 'fire') D.input.fire = false;
          }
        }
      }
    };
    cv.addEventListener('touchend', touchEnd);
    cv.addEventListener('touchcancel', touchEnd);
    function applyTouch() {
      if (!T.active || !T.move) return;
      const i = D.input;
      i.fwd = i.fwd || T.move.dy < -0.3;
      i.back = i.back || T.move.dy > 0.3;
      i.sl = i.sl || T.move.dx < -0.3;
      i.sr = i.sr || T.move.dx > 0.3;
    }

    let last = performance.now();
    let emaMs = 8, slowFrames = 0;
    const lockedRes = !!res;
    function loop(ts) {
      const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
      last = ts;
      const t0 = performance.now();
      pollGamepad();
      applyTouch();
      // a bad frame must never kill the loop (black screen of death)
      try {
        D.game.update(dt);
        D.game.draw(g);
      } catch (err) {
        if (err.message !== loop.lastErr) {
          loop.lastErr = err.message;
          console.error('DOOMED frame error:', err);
        }
      }
      // adaptive resolution: if this machine can't hold 60, drop once to 480p
      emaMs = emaMs * 0.95 + (performance.now() - t0) * 0.05;
      if (!lockedRes && D.rc.RW > 480) {
        slowFrames = emaMs > 15 ? slowFrames + 1 : 0;
        if (slowFrames > 90) {
          D.rc.setRes(480, 270);
          console.info('DOOMED: dropping to 480x270 for framerate');
        }
      }
      clearPressed();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
