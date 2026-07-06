// ui/screens.js — menu/overlay screens + the slam stamp. DOM is rebuilt on
// each showScreen (never per-frame); one virtual selection list drives
// keyboard, gamepad, and mouse alike.

import { RACES_PER_LEVEL, LEVEL_COUNT, MPH, TRACKS, THEMES } from '../config.js';
import { clamp } from '../util.js';

const money = (n) => (n < 0 ? '-$' : '$') +
  Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+$)/g, ',');
const ord = (n) => {
  const m = n % 100;
  return n + (m >= 11 && m <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][n % 10] || 'TH');
};
const esc = (v) => String(v).replace(/[&<>"]/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const fmtTime = (t) =>
  ((t / 60) | 0) + ':' + String((t % 60) | 0).padStart(2, '0') + '.' + (((t * 10) | 0) % 10);
const fmtMult = (m) => '×' + Math.round((m || 1) * 100) / 100;

export function initScreens(el) {
  const wrap = document.createElement('div');
  wrap.className = 'screen';
  wrap.hidden = true;
  el.appendChild(wrap);
  const stampEl = document.createElement('div');
  stampEl.className = 'rw-stamp';
  el.appendChild(stampEl);
  return {
    root: el, wrap, stampEl,
    name: null, data: null,
    items: [], sel: 0, horizontal: false,
    on: {},        // per-screen handlers: back / shop / restart
    raf: 0,        // count-up animation handle
  };
}

export function showScreen(s, name, data) {
  cancelAnimationFrame(s.raf);
  s.name = name;
  s.data = data;
  s.items = [];
  s.sel = 0;
  s.horizontal = false;
  s.on = {};
  s.wrap.innerHTML = '';
  s.wrap.hidden = false;
  s.wrap.className = 'screen screen--' + name;
  (RENDER[name] || (() => {}))(s, data);
  select(s, s.sel);
}

export function hideScreen(s) {
  cancelAnimationFrame(s.raf);
  s.name = null;
  s.items = [];
  s.wrap.hidden = true;
  s.wrap.innerHTML = '';
}

export function screenAction(s, action) {
  if (!s.name) return;
  const it = s.items[s.sel];
  switch (action) {
    case 'up': move(s, -1); break;
    case 'down': move(s, 1); break;
    case 'left':
      if (it && it.left) it.left();
      else if (s.horizontal) move(s, -1);
      break;
    case 'right':
      if (it && it.right) it.right();
      else if (s.horizontal) move(s, 1);
      break;
    case 'confirm': if (it && it.activate) it.activate(); break;
    case 'back': case 'pause': if (s.on.back) s.on.back(); break;
    case 'shop': if (s.on.shop) s.on.shop(); break;
    case 'restart': if (s.on.restart) s.on.restart(); break;
  }
}

export function stamp(s, text, color) {
  const el = s.stampEl;
  el.textContent = text;
  el.style.color = color || 'var(--gold)';
  el.classList.remove('go');
  void el.offsetWidth;   // restart animation
  el.classList.add('go');
}

// -- selection plumbing ------------------------------------------------------
function select(s, i) {
  if (!s.items.length) return;
  s.sel = ((i % s.items.length) + s.items.length) % s.items.length;
  s.items.forEach((it, j) => it.el.classList.toggle('sel', j === s.sel));
  // keep keyboard selection visible in scrolling lists (race select);
  // 'nearest' is a no-op for already-visible items so mouse hover doesn't jump
  const el = s.items[s.sel].el;
  if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' });
}
function move(s, d) { select(s, s.sel + d); }

function addItem(s, el, ops) {
  const idx = s.items.length;
  s.items.push({ el, ...(ops || {}) });
  el.classList.add('mi');
  el.addEventListener('click', () => {
    select(s, idx);
    if (el.blur) el.blur();
    const it = s.items[idx];
    if (it && it.activate) it.activate();
  });
  el.addEventListener('mouseenter', () => select(s, idx));
  return el;
}

function div(cls, html) {
  const d = document.createElement('div');
  d.className = cls;
  if (html != null) d.innerHTML = html;
  return d;
}

function menuBtn(s, parent, html, activate, ops) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'mbtn';
  b.innerHTML = html;
  parent.appendChild(b);
  addItem(s, b, { activate, ...(ops || {}) });
  return b;
}

// $ lines count up over ~0.9s; cancelled by the next showScreen/hideScreen
function countUp(s, targets) {
  const t0 = performance.now();
  const dur = 900;
  const step = () => {
    const k = clamp((performance.now() - t0) / dur, 0, 1);
    const e = 1 - (1 - k) * (1 - k);
    for (const tg of targets) tg.node.textContent = tg.fmt(Math.round(tg.val * e));
    if (k < 1) s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}

// -- screens -----------------------------------------------------------------
function rTitle(s, d) {
  const w = s.wrap;
  w.appendChild(div('logo',
    '<span class="logo-road">ROAD</span><span class="logo-wrath">WRATH</span>'));
  w.appendChild(div('logo-tag', 'RIDE FAST · SWING HARD · GET PAID'));

  const menu = div('menu panel');
  w.appendChild(menu);
  if (d.hasSave) menuBtn(s, menu, 'CONTINUE', () => d.onContinue());
  menuBtn(s, menu, d.hasSave ? 'NEW CAREER' : 'START CAREER', () => d.onNew());
  if (d.onRaceSelect) menuBtn(s, menu, 'FREE PLAY', () => d.onRaceSelect());

  let qBtn = null;
  const qLabel = () => 'QUALITY&ensp;<b>◂ ' + esc(String(d.settings.quality).toUpperCase()) + ' ▸</b>';
  const flipQ = () => {
    d.onQuality(d.settings.quality === 'high' ? 'low' : 'high');
    qBtn.innerHTML = qLabel();
  };
  qBtn = menuBtn(s, menu, qLabel(), flipQ, { left: flipQ, right: flipQ });

  const vBtn = document.createElement('button');
  vBtn.type = 'button';
  vBtn.className = 'mbtn mbtn-vol';
  const vLab = document.createElement('span');
  vLab.textContent = 'VOLUME ';
  vBtn.appendChild(vLab);
  const blocks = [];
  const paint = () => {
    const lit = Math.round(clamp(d.settings.volume, 0, 1) * 10);
    blocks.forEach((b, i) => b.classList.toggle('on', i < lit));
  };
  for (let i = 0; i < 10; i++) {
    const b = document.createElement('i');
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      d.onVolume((i + 1) / 10);
      paint();
    });
    vBtn.appendChild(b);
    blocks.push(b);
  }
  const nudge = (dv) => {
    d.onVolume(clamp(Math.round((d.settings.volume + dv) * 10) / 10, 0, 1));
    paint();
  };
  menu.appendChild(vBtn);
  addItem(s, vBtn, {
    activate: () => nudge(d.settings.volume >= 0.99 ? -1 : 0.1),
    left: () => nudge(-0.1),
    right: () => nudge(0.1),
  });
  paint();

  w.appendChild(div('legend',
    '<b>WASD/ARROWS</b> DRIVE · <b>J</b> PUNCH · <b>K</b> KICK · <b>SHIFT</b> TUCK · ' +
    '<b>R</b> RESTART · <b>M</b> MUTE · <b>ESC</b> PAUSE · GAMEPAD SUPPORTED'));
  w.appendChild(div('copyline', '© 2026 HOBBY.SYS — ROAD WRATH'));
}

function rPrerace(s, d) {
  const { career, race, bike } = d;
  const tr = race.track;
  const w = s.wrap;
  w.appendChild(div('scr-kicker', (career.freePlay ? 'FREE PLAY · ' : '') + 'LEVEL ' + career.level));
  w.appendChild(div('scr-title', esc(String(tr.name).toUpperCase())));
  w.appendChild(div('scr-sub',
    'RACE ' + (race.raceIndex + 1) + '/' + RACES_PER_LEVEL + ' · ' + (tr.length / 1000).toFixed(1) + ' KM'));

  const panel = div('panel prerace-panel');
  const left = div('prerace-col');
  left.innerHTML =
    '<div class="col-head">YOUR RIDE</div>' +
    '<div class="bike-line"><i class="chip" style="background:' + hex(bike.color) + '"></i>' + esc(bike.name) + '</div>' +
    '<div class="dim">TOP ' + Math.round(bike.topSpeed * MPH) + ' MPH</div>' +
    '<div class="cash-line">CASH <b class="gold">' + money(career.cash) + '</b></div>' +
    (tr.copZones && tr.copZones.length
      ? '<div class="warn">⚠ SPEED TRAPS ON THIS RUN — FIGHT CLEAN NEAR THE LAW</div>' : '');
  const right = div('prerace-col');
  right.innerHTML = '<div class="col-head">THE PACK</div>' +
    race.riders.slice(1).map((r) =>
      '<div class="rival-row"><i class="chip" style="background:' + hex(r.color) + '"></i>' +
      '<span class="rival-name">' + esc(r.name) + '</span>' +
      (r.weapon ? '<span class="tag tag-weapon">' + r.weapon.toUpperCase() + '</span>' : '') +
      (r.ai && r.ai.grudge ? '<span class="tag tag-grudge">WANTS BLOOD</span>' : '') +
      '</div>').join('');
  panel.appendChild(left);
  panel.appendChild(right);
  w.appendChild(panel);

  const menu = div('menu-row');
  menuBtn(s, menu, 'RIDE <span class="key">[ENTER]</span>', () => d.onGo());
  menuBtn(s, menu, 'SHOP <span class="key">[S]</span>', () => d.onShop());
  w.appendChild(menu);
  s.on.shop = () => d.onShop();
  if (d.onBack) s.on.back = () => d.onBack();   // Esc → title
}

function rRecap(s, d) {
  const { career, race, res } = d;
  const r = race.result || { place: 8, cause: 'wrecked', payout: 0, scoreCash: 0, fee: 0 };
  const w = s.wrap;
  const head = r.cause === 'busted' ? 'BUSTED' : r.cause === 'wrecked' ? 'WRECKED' : ord(r.place);
  w.appendChild(div('recap-head ' + (r.cause !== 'finish' ? 'bad' : r.place <= 3 ? 'good' : 'meh'), esc(head)));
  if (res.careerComplete) w.appendChild(div('banner gold-banner', '★ ALL ' + LEVEL_COUNT + ' LEVELS CONQUERED ★'));
  else if (res.leveledUp) w.appendChild(div('banner gold-banner', 'LEVEL ' + career.level + ' UNLOCKED'));
  if (res.gameOver) w.appendChild(div('banner bad-banner', 'POCKETS EMPTY — CAREER OVER'));
  w.appendChild(div(res.advanced ? 'qstamp' : 'qfail',
    res.advanced ? 'QUALIFIED' : 'TOP 3 TO QUALIFY — RUN IT BACK'));

  const panel = div('panel recap-panel');
  const order = [...race.riders].sort((a, b) => (a.place || 9) - (b.place || 9));
  const gd = race.grudgeDelta || {};
  const rows = order.map((rd) => {
    const ko = rd.isPlayer
      ? (typeof race.playerKnockdowns === 'number' ? race.playerKnockdowns : 0)
      : Math.max(0, gd[rd.id] || 0);
    const time = rd.finishTime > 0 ? fmtTime(rd.finishTime)
      : (rd.isPlayer && r.cause !== 'finish') ? r.cause.toUpperCase() : 'DNF';
    return '<tr class="' + (rd.isPlayer ? 'you' : '') + '"><td>' + (rd.place || '—') + '</td>' +
      '<td><i class="chip" style="background:' + hex(rd.color) + '"></i>' + esc(rd.name) + '</td>' +
      '<td>' + time + '</td><td>' + (ko || '') + '</td></tr>';
  }).join('');
  panel.appendChild(div('recap-standings',
    '<table class="standings"><thead><tr><th>#</th><th>RIDER</th><th>TIME</th><th>KO</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>'));

  const lines = [
    { label: 'PURSE', val: r.payout, delta: true },
    { label: 'COMBO CASH', val: r.scoreCash, delta: true },
  ];
  if (r.fee) lines.push({ label: r.cause === 'busted' ? 'FINE' : 'REPAIR BILL', val: -r.fee, delta: true });
  lines.push({ label: 'BALANCE', val: career.cash, delta: false });
  const moneyBox = div('recap-money');
  const targets = [];
  for (const ln of lines) {
    const row = div('money-row' + (ln.delta ? (ln.val < 0 ? ' neg' : ' pos') : ' total'));
    const lab = document.createElement('span');
    lab.textContent = ln.label;
    const amt = document.createElement('b');
    row.appendChild(lab);
    row.appendChild(amt);
    moneyBox.appendChild(row);
    const fmt = ln.delta
      ? (v) => (ln.val < 0 ? '−' : '+') + money(Math.abs(v))
      : (v) => money(v);
    amt.textContent = fmt(0);
    targets.push({ node: amt, val: ln.val, fmt });
  }
  moneyBox.appendChild(div('money-note dim', 'BEST COMBO ' + fmtMult(race.combo && race.combo.best)));
  panel.appendChild(moneyBox);
  w.appendChild(panel);

  const menu = div('menu-row');
  menuBtn(s, menu, 'CONTINUE <span class="key">[ENTER]</span>', () => d.onNext());
  menuBtn(s, menu, 'SHOP <span class="key">[S]</span>', () => d.onShop());
  if (!res.advanced && !res.gameOver) menuBtn(s, menu, 'RETRY <span class="key">[R]</span>', () => d.onRestart());
  w.appendChild(menu);
  s.on.shop = () => d.onShop();
  s.on.restart = () => d.onRestart();
  countUp(s, targets);
}

function rShop(s, d) {
  const { career, bikes } = d;
  const w = s.wrap;
  w.appendChild(div('scr-title', 'CHOP SHOP'));
  w.appendChild(div('scr-sub', 'CASH <b class="gold">' + money(career.cash) + '</b>'));

  const keys = ['topSpeed', 'accel', 'lean', 'tough'];
  const labels = ['TOP', 'ACCEL', 'GRIP', 'ARMOR'];
  const max = {};
  for (const k of keys) max[k] = Math.max(...bikes.map((b) => b[k]));

  const row = div('shop-row');
  bikes.forEach((b, i) => {
    const owned = career.ownedBikes.includes(b.id);
    const riding = career.bikeId === b.id;
    const afford = career.cash >= b.price;
    const badge = riding ? '<span class="badge riding">RIDING</span>'
      : owned ? '<span class="badge owned">OWNED</span>'
      : '<span class="badge price' + (afford ? '' : ' broke') + '">' + money(b.price) + '</span>';
    const bars = keys.map((k, j) =>
      '<div class="stat"><span>' + labels[j] + '</span><div class="stat-track">' +
      '<div class="stat-fill" style="width:' + Math.round(b[k] / max[k] * 100) + '%"></div></div></div>').join('');
    const card = div('bike-card panel' + (riding ? ' riding' : ''),
      '<div class="bike-swatch" style="background:' + hex(b.color) + '"></div>' +
      '<div class="bike-name">' + esc(b.name) + '</div>' +
      '<div class="bike-desc dim">' + esc(b.desc) + '</div>' + bars +
      '<div class="bike-badge">' + badge + '</div>' +
      '<div class="bike-action dim">' +
      (riding ? 'YOUR CURRENT RIDE' : owned ? '[ENTER] RIDE IT' : afford ? '[ENTER] BUY' : 'NOT ENOUGH CASH') +
      '</div>');
    row.appendChild(card);
    addItem(s, card, {
      activate: () => {
        if (career.bikeId === b.id) return;
        if (d.onBuy(b.id)) {
          showScreen(s, 'shop', d);   // re-render OWNED/RIDING states
          select(s, i);
        } else {
          card.classList.remove('deny');
          void card.offsetWidth;
          card.classList.add('deny');
        }
      },
    });
    if (riding) s.sel = i;
  });
  w.appendChild(row);
  w.appendChild(div('legend', '◂ ▸ CHOOSE · <b>ENTER</b> BUY / RIDE · <b>ESC</b> BACK'));
  s.horizontal = true;
  s.on.back = () => d.onBack();
}

function rPause(s, d) {
  const panel = div('panel pause-panel');
  panel.appendChild(div('scr-title small', 'PAUSED'));
  const menu = div('menu');
  menuBtn(s, menu, 'RESUME', () => d.onResume());
  menuBtn(s, menu, 'QUIT TO TITLE', () => d.onQuit());
  panel.appendChild(menu);
  s.wrap.appendChild(panel);
}

function rGameover(s, d) {
  const w = s.wrap;
  w.appendChild(div('scr-title blood', 'OUT OF CASH'));
  w.appendChild(div('scr-sub', 'THE REPO MAN TOOK THE BIKE. CAREER OVER.'));
  const menu = div('menu');
  menuBtn(s, menu, 'NEW CAREER <span class="key">[ENTER]</span>', () => d.onNew());
  w.appendChild(menu);
}

function rComplete(s, d) {
  const { career } = d;
  const w = s.wrap;
  w.appendChild(div('scr-kicker gold', 'CAREER COMPLETE'));
  w.appendChild(div('scr-title gold', 'KING OF THE ROAD'));
  const panel = div('panel stats-panel');
  const rows = [
    ['RACES', career.totalRaces],
    ['WINS', career.totalWins],
    ['KNOCKDOWNS', career.totalKnockdowns],
    ['BEST COMBO', fmtMult(career.bestCombo)],
    ['FINAL CASH', money(career.cash)],
  ];
  panel.innerHTML = rows.map(([k, v]) =>
    '<div class="stat-row"><span>' + k + '</span><b>' + v + '</b></div>').join('');
  w.appendChild(panel);
  const menu = div('menu');
  menuBtn(s, menu, 'BACK TO TITLE', () => d.onTitle());
  w.appendChild(menu);
  w.appendChild(div('copyline', 'HOBBY.SYS THANKS YOU FOR RIDING'));
}

// FREE PLAY race select — every level/race unlocked. A flat vertical list of
// levels; the selected level expands inline to its 3 races. One virtual
// selection list drives keys/gamepad/mouse; left/right collapse/expand.
function rRaceSelect(s, d) {
  const w = s.wrap;
  w.appendChild(div('scr-kicker', 'FREE PLAY'));
  w.appendChild(div('scr-title', 'RACE SELECT'));
  w.appendChild(div('scr-sub', 'EVERY ROAD UNLOCKED · PICK YOUR FIGHT'));

  // levels: [{ level, name, theme, races }] — fall back to TRACKS/THEMES.
  const levels = (d.levels && d.levels.length) ? d.levels : TRACKS.map((t, i) => {
    const th = THEMES[t.theme] || {};
    return { level: i + 1, name: th.name || t.id, theme: t.theme, races: RACES_PER_LEVEL };
  });
  if (typeof d.open !== 'number') d.open = 0;   // which level row is expanded

  const list = div('panel rs-list');
  levels.forEach((lv, li) => {
    const th = THEMES[lv.theme] || {};
    const open = li === d.open;
    const stunt = th.loops ? 'LOOPS' : (th.boostPads || th.bankFactor) ? 'STUNTS' : '';
    const row = div('rs-level' + (open ? ' open' : ''),
      '<span class="rs-caret">' + (open ? '▾' : '▸') + '</span>' +
      '<span class="rs-num">L' + lv.level + '</span>' +
      '<span class="rs-name">' + esc(String(lv.name).toUpperCase()) + '</span>' +
      (stunt ? '<span class="tag tag-stunt">' + stunt + '</span>' : '') +
      '<span class="rs-flavor dim">' + esc(String(lv.theme).toUpperCase()) + '</span>');
    list.appendChild(row);
    const toggle = () => {
      const was = li === d.open;
      d.open = was ? -1 : li;   // clicking the open level collapses it
      showScreen(s, 'raceselect', d);
      // keep the caret we just clicked selected after the rebuild
      for (let k = 0; k < s.items.length; k++) {
        if (s.items[k].levelIdx === li) { select(s, k); break; }
      }
    };
    addItem(s, row, { activate: toggle, right: () => { if (li !== d.open) toggle(); },
      left: () => { if (li === d.open) toggle(); }, levelIdx: li });

    if (open) {
      const races = div('rs-races');
      for (let ri = 0; ri < lv.races; ri++) {
        const rb = document.createElement('button');
        rb.type = 'button';
        rb.className = 'mbtn rs-race';
        rb.innerHTML = 'RACE ' + (ri + 1) + ' <span class="key">·' +
          (ri === 0 ? ' SHORT' : ri === lv.races - 1 ? ' LONG' : ' MID') + '</span>';
        races.appendChild(rb);
        addItem(s, rb, { activate: () => d.onPick(lv.level, ri), levelIdx: li });
      }
      list.appendChild(races);
    }
  });
  w.appendChild(list);

  w.appendChild(div('legend',
    '<b>↑↓</b> LEVEL · <b>▸ / ENTER</b> OPEN · <b>◂</b> CLOSE · <b>ENTER</b> RACE · <b>ESC</b> BACK'));
  if (d.onBack) s.on.back = () => d.onBack();
}

const RENDER = {
  title: rTitle,
  raceselect: rRaceSelect,
  prerace: rPrerace,
  recap: rRecap,
  shop: rShop,
  pause: rPause,
  gameover: rGameover,
  complete: rComplete,
};
