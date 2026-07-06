// ui/hud.js — in-race DOM HUD. All nodes built once at init; every per-frame
// write is dirty-checked against a cache and toasts come from a fixed pool.

import { MPH, BIKES, TUCK_TOP_BONUS } from '../config.js';
import { clamp } from '../util.js';

const TOAST_TIME = 2.5;   // s (race time) a toast stays up
const TOAST_POOL = 4;
const TOAST_QMAX = 6;
const TICKS = 12;         // speed tick count under the mph readout

export function initHUD(el) {
  el.innerHTML = `
  <div class="hud-bars">
    <div class="hud-bar"><span class="hud-bar-label">RIDER</span><div class="hud-bar-track"><div class="hud-bar-fill hud-fill-health"></div></div></div>
    <div class="hud-bar"><span class="hud-bar-label">STAM</span><div class="hud-bar-track"><div class="hud-bar-fill hud-fill-stam"></div></div></div>
    <div class="hud-bar hud-bar-bike"><span class="hud-bar-label">BIKE</span><div class="hud-bar-track"><div class="hud-bar-fill hud-fill-bike"></div></div></div>
    <div class="hud-meta"><span class="hud-cash"></span><span class="hud-weapon" hidden></span></div>
  </div>
  <div class="hud-top">
    <div class="hud-pos"><span class="hud-place"></span><span class="hud-pos-total"></span></div>
    <div class="hud-timer">0:00.0</div>
    <div class="hud-cop" hidden>⚠ COPS ⚠</div>
  </div>
  <div class="hud-strip"></div>
  <div class="hud-speed">
    <div class="hud-mph">0</div>
    <div class="hud-ticks"></div>
    <div class="hud-mph-label">MPH</div>
  </div>
  <div class="hud-combo" hidden><div class="hud-combo-mult"></div><div class="hud-combo-kind"></div></div>
  <div class="hud-hint" hidden></div>
  <div class="hud-toasts"></div>
  <div class="hud-count"></div>`;

  const q = (sel) => el.querySelector(sel);
  const ticksEl = q('.hud-ticks');
  const ticks = [];
  for (let i = 0; i < TICKS; i++) {
    const t = document.createElement('i');
    ticksEl.appendChild(t);
    ticks.push(t);
  }
  const toastsEl = q('.hud-toasts');
  const toasts = [];
  for (let i = 0; i < TOAST_POOL; i++) {
    const t = document.createElement('div');
    t.className = 'hud-toast';
    const name = document.createElement('span'); name.className = 'hud-toast-name';
    const text = document.createElement('span'); text.className = 'hud-toast-text';
    t.appendChild(name); t.appendChild(text);
    toastsEl.appendChild(t);
    toasts.push({ el: t, nameEl: name, textEl: text, busy: false, until: 0 });
  }

  return {
    el,
    race: null,
    bike: BIKES[0],
    last: {},
    litTicks: -1,
    toastQ: [],
    ticks, toasts,
    fillHealth: q('.hud-fill-health'),
    fillStam: q('.hud-fill-stam'),
    fillBike: q('.hud-fill-bike'),
    barBike: q('.hud-bar-bike'),
    cash: q('.hud-cash'),
    weapon: q('.hud-weapon'),
    place: q('.hud-place'),
    posTotal: q('.hud-pos-total'),
    timer: q('.hud-timer'),
    cop: q('.hud-cop'),
    strip: q('.hud-strip'),
    dots: [],
    mph: q('.hud-mph'),
    combo: q('.hud-combo'),
    comboMult: q('.hud-combo-mult'),
    comboKind: q('.hud-combo-kind'),
    hint: q('.hud-hint'),
    count: q('.hud-count'),
  };
}

export function showHUD(h, visible) {
  h.el.hidden = !visible;
}

// -- dirty-check write helpers ----------------------------------------------
function setText(h, key, node, text) {
  if (h.last[key] !== text) { h.last[key] = text; node.textContent = text; }
}
function setW(h, key, node, pct) {
  if (h.last[key] !== pct) { h.last[key] = pct; node.style.width = pct + '%'; }
}
function setHidden(h, key, node, hid) {
  if (h.last[key] !== hid) { h.last[key] = hid; node.hidden = hid; }
}
function setClass(h, key, node, cls, on) {
  if (h.last[key] !== on) { h.last[key] = on; node.classList.toggle(cls, on); }
}

const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const money = (n) => (n < 0 ? '-$' : '$') +
  Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+$)/g, ',');

function resetForRace(h, race) {
  h.race = race;
  h.last = {};
  h.litTicks = -1;
  h.toastQ.length = 0;
  h.bike = BIKES.find((b) => b.id === race.riders[0].bikeId) || BIKES[0];
  for (const t of h.toasts) { t.busy = false; t.el.classList.remove('show'); }
  h.count.classList.remove('slam');
  h.combo.hidden = true;
  h.cop.hidden = true;
  // rebuild progress dots for this race's riders
  h.strip.textContent = '';
  h.dots.length = 0;
  h.posTotal.textContent = '/' + race.riders.length;
  for (const r of race.riders) {
    const d = document.createElement('i');
    d.className = 'hud-dot' + (r.isPlayer ? ' hud-dot-player' : '');
    d.style.background = hex(r.color);
    h.strip.appendChild(d);
    h.dots.push({ el: d, lastPct: -1 });
  }
}

function pushToast(h, name, color, text, cls) {
  if (h.toastQ.length >= TOAST_QMAX) h.toastQ.shift();
  h.toastQ.push({ name, color, text, cls });
}

function pumpToasts(h, t) {
  for (const tn of h.toasts) {
    if (tn.busy && t >= tn.until) { tn.busy = false; tn.el.classList.remove('show'); }
  }
  while (h.toastQ.length) {
    const free = h.toasts.find((x) => !x.busy);
    if (!free) break;
    const m = h.toastQ.shift();
    free.busy = true;
    free.until = t + TOAST_TIME;
    free.nameEl.textContent = m.name ? m.name + ':' : '';
    free.nameEl.style.color = m.color || '';
    free.el.classList.remove('feed-good', 'feed-bad', 'taunt');
    free.el.classList.add(m.cls, 'show');
    free.textEl.textContent = m.text;
  }
}

function slamCount(h, text, isGo) {
  h.count.textContent = text;
  h.count.classList.toggle('go', isGo);
  h.count.classList.remove('slam');
  void h.count.offsetWidth;   // restart the CSS animation
  h.count.classList.add('slam');
}

const COMBO_KINDS = { nearmiss: 'NEAR MISS', draft: 'DRAFT', knockdown: 'KNOCKDOWN' };
const DOWN_VERBS = { combat: 'KNOCKED DOWN', crash: 'WIPED OUT', obstacle: 'WIPED OUT', slide: 'SLID OUT' };

export function updateHUD(h, race, career, events) {
  if (h.race !== race) resetForRace(h, race);
  const p = race.riders[0];
  const t = Math.max(0, race.time);

  // speed + ticks
  setText(h, 'mph', h.mph, String(Math.max(0, Math.round(p.speed * MPH))));
  const vmax = h.bike.topSpeed * (1 + TUCK_TOP_BONUS);
  const lit = clamp(Math.round(p.speed / vmax * TICKS), 0, TICKS);
  if (lit !== h.litTicks) {
    h.litTicks = lit;
    for (let i = 0; i < TICKS; i++) h.ticks[i].classList.toggle('lit', i < lit);
  }

  // bars
  setW(h, 'hp', h.fillHealth, Math.round(clamp(p.health, 0, 100)));
  setW(h, 'st', h.fillStam, Math.round(clamp(p.stamina, 0, 100)));
  setW(h, 'bd', h.fillBike, Math.round(clamp(p.bikeDamage, 0, 100)));
  setClass(h, 'bdFlash', h.barBike, 'flash', p.bikeDamage > 70);

  // position + timer — freeze at the recorded finish time during the post-race
  // coast so the on-screen clock matches the recap (busted/wrecked keep live t)
  setText(h, 'place', h.place, String(p.place));
  const tt = p.finishTime > 0 ? p.finishTime : t;
  const timer = ((tt / 60) | 0) + ':' + String((tt % 60) | 0).padStart(2, '0') + '.' + (((tt * 10) | 0) % 10);
  setText(h, 'timer', h.timer, timer);

  // cash + weapon
  setText(h, 'cash', h.cash, money(career ? career.cash : 0));
  setHidden(h, 'wpnHid', h.weapon, !p.weapon);
  if (p.weapon) setText(h, 'wpn', h.weapon, p.weapon.toUpperCase());

  // combo
  const cm = Math.round(race.combo.mult * 100) / 100;
  setHidden(h, 'comboHid', h.combo, cm <= 1);
  if (cm > 1) setText(h, 'comboMult', h.comboMult, '×' + cm);

  // cop chase warning
  setHidden(h, 'cop', h.cop, !race.copChase);

  // contextual hint
  const hint = p.state === 'running' ? 'HOLD THROTTLE — RUN TO YOUR BIKE'
    : p.state === 'down' ? ''
    : p.offroad ? 'OFFROAD' : '';
  setHidden(h, 'hintHid', h.hint, !hint);
  if (hint) setText(h, 'hint', h.hint, hint);

  // progress strip (0.25% granularity keeps writes rare)
  const len = race.track.length || 1;
  for (let i = 0; i < race.riders.length; i++) {
    const pct = clamp(Math.round((1 - race.riders[i].s / len) * 400) / 4, 0, 100);
    const dot = h.dots[i];
    if (dot && dot.lastPct !== pct) { dot.lastPct = pct; dot.el.style.top = pct + '%'; }
  }

  // events
  for (const ev of events) {
    if (ev.type === 'countdown') {
      slamCount(h, ev.n === 0 ? 'GO' : String(ev.n), ev.n === 0);
    } else if (ev.type === 'taunt') {
      pushToast(h, ev.rider.name, hex(ev.rider.color), ev.line, 'taunt');
    } else if (ev.type === 'combo') {
      h.comboKind.textContent = COMBO_KINDS[ev.kind] || ev.kind.toUpperCase();
      h.combo.classList.remove('pop');
      void h.combo.offsetWidth;
      h.combo.classList.add('pop');
    } else if (ev.type === 'steal') {
      if (ev.rider.isPlayer) pushToast(h, '', '', 'YOU TOOK ' + ev.from.name + "'S " + ev.weapon.toUpperCase(), 'feed-good');
      else if (ev.from.isPlayer) pushToast(h, '', '', ev.rider.name + ' TOOK YOUR ' + ev.weapon.toUpperCase(), 'feed-bad');
    } else if (ev.type === 'down') {
      if (ev.by && ev.by.isPlayer) pushToast(h, '', '', ev.rider.name + ' ATE ASPHALT', 'feed-good');
      else if (ev.rider.isPlayer) pushToast(h, '', '', 'YOU ' + (DOWN_VERBS[ev.cause] || 'WENT DOWN'), 'feed-bad');
    }
  }
  pumpToasts(h, t);
}
