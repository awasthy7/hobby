// input.js — keyboard + gamepad merged into PlayerInput + a UI action bus.
// Combat presses are edge-triggered and buffered ~150ms: exactly one
// readGame() consumes each press. Key repeat never re-fires edges.

const BUFFER_S = 0.15;      // combat press buffer window (s)
const NAV_DELAY = 0.38;     // gamepad menu-nav repeat: initial delay (s)
const NAV_RATE = 0.14;      // ...then repeat interval (s)
const STICK_DEAD = 0.22;    // steering deadzone
const NAV_STICK = 0.55;     // stick deflection that counts as a menu press

const PREVENT = new Set([
  'Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);

export function createInput(target) {
  const held = new Set();          // e.code currently down
  const cbs = [];
  let punchBuf = -Infinity;
  let kickBuf = -Infinity;

  // gamepad snapshot, refreshed by scanPad()
  const prevBtn = [];
  const navT = [0, 0, 0, 0];       // per-direction next-repeat time; 0 = idle
  let padSteer = 0, padRT = 0, padLT = 0, padA = false;

  const now = () => performance.now() / 1000;
  const emit = (a) => { for (const cb of cbs) cb(a); };

  const isTyping = (e) => {
    const t = e.target;
    return !!(t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' || t.isContentEditable));
  };

  function onKeyDown(e) {
    if (isTyping(e)) return;
    const c = e.code;
    if (PREVENT.has(c)) e.preventDefault();
    // menu nav rides the OS key repeat on purpose
    if (c === 'ArrowUp' || c === 'KeyW') emit('up');
    else if (c === 'ArrowDown' || c === 'KeyS') emit('down');
    else if (c === 'ArrowLeft' || c === 'KeyA') emit('left');
    else if (c === 'ArrowRight' || c === 'KeyD') emit('right');
    if (held.has(c)) return;       // repeat: no edge re-fire below
    held.add(c);
    switch (c) {
      case 'KeyJ': case 'KeyX': punchBuf = now(); break;
      case 'KeyK': case 'KeyC': kickBuf = now(); break;
      case 'Enter': case 'NumpadEnter': case 'Space': emit('confirm'); break;
      case 'Escape': emit('pause'); break;   // main + screens route by state
      case 'KeyR': emit('restart'); break;
      case 'KeyM': emit('mute'); break;
      case 'KeyS': emit('shop'); break;      // after 'down' above; screens cope
    }
  }
  function onKeyUp(e) { held.delete(e.code); }
  function onBlur() { held.clear(); }

  function getPad() {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected && p.buttons && p.buttons.length >= 10) return p;
    }
    return null;
  }

  function scanPad() {
    const p = getPad();
    if (!p) {
      padSteer = padRT = padLT = 0; padA = false;
      prevBtn.length = 0;
      navT[0] = navT[1] = navT[2] = navT[3] = 0;
      return;
    }
    const t = now();
    const btn = p.buttons;
    const down = (i) => !!(btn[i] && btn[i].pressed);
    const rose = (i) => down(i) && !prevBtn[i];

    if (rose(0)) emit('confirm');                    // A
    if (rose(1)) { kickBuf = t; emit('back'); }      // B: kick in race, back in menus
    if (rose(2)) punchBuf = t;                       // X
    if (rose(3)) emit('shop');                       // Y
    if (rose(8)) emit('restart');                    // Select
    if (rose(9)) emit('pause');                      // Start

    const ax = p.axes || [];
    const rawX = ax[0] || 0, rawY = ax[1] || 0;
    const mag = Math.abs(rawX);
    padSteer = mag > STICK_DEAD
      ? Math.max(-1, Math.min(1, (rawX - Math.sign(rawX) * STICK_DEAD) / (1 - STICK_DEAD)))
      : 0;
    padRT = btn[7] ? (btn[7].value || (btn[7].pressed ? 1 : 0)) : 0;
    padLT = btn[6] ? (btn[6].value || (btn[6].pressed ? 1 : 0)) : 0;
    padA = down(0);

    // dpad/stick menu nav with delay-then-repeat
    const dirs = [
      down(12) || rawY < -NAV_STICK,
      down(13) || rawY > NAV_STICK,
      down(14) || rawX < -NAV_STICK,
      down(15) || rawX > NAV_STICK,
    ];
    const names = ['up', 'down', 'left', 'right'];
    for (let i = 0; i < 4; i++) {
      if (dirs[i]) {
        if (navT[i] === 0) { emit(names[i]); navT[i] = t + NAV_DELAY; }
        else if (t >= navT[i]) { emit(names[i]); navT[i] = t + NAV_RATE; }
      } else navT[i] = 0;
    }

    for (let i = 0; i < btn.length; i++) prevBtn[i] = !!(btn[i] && btn[i].pressed);
  }

  target.addEventListener('keydown', onKeyDown);
  target.addEventListener('keyup', onKeyUp);
  target.addEventListener('blur', onBlur);

  return {
    poll() { scanPad(); },

    readGame() {
      scanPad();
      const t = now();
      // A/Left must move the bike toward screen-left. The chase camera looks
      // down +z, where the sim's +x lateral axis renders on screen-LEFT, so
      // A (screen-left intent) maps to steer = +1 (sim +x) and D to -1.
      let steer = (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0) -
                  (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0);
      if (Math.abs(padSteer) > Math.abs(steer)) steer = -padSteer;
      const throttle = Math.max(held.has('KeyW') || held.has('ArrowUp') ? 1 : 0, padRT);
      const brake = Math.max(held.has('KeyS') || held.has('ArrowDown') ? 1 : 0, padLT);
      let punch = false, kick = false;
      if (t - punchBuf <= BUFFER_S) { punch = true; punchBuf = -Infinity; }
      if (t - kickBuf <= BUFFER_S) { kick = true; kickBuf = -Infinity; }
      const boost = held.has('ShiftLeft') || held.has('ShiftRight') || padA;
      return { steer, throttle, brake, punch, kick, boost };
    },

    onAction(cb) { cbs.push(cb); },

    clearBuffers() { punchBuf = -Infinity; kickBuf = -Infinity; },

    dispose() {
      target.removeEventListener('keydown', onKeyDown);
      target.removeEventListener('keyup', onKeyUp);
      target.removeEventListener('blur', onBlur);
      cbs.length = 0;
    },
  };
}
