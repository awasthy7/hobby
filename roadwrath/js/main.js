// main.js — boot, fixed-step game loop, state machine, module wiring.
// This file is the integration contract: every import signature used here is
// frozen; modules implement to match.

import {
  STEP, COUNTDOWN, BIKES, LEVEL_COUNT, RACES_PER_LEVEL,
  SLOWMO_TIME, SLOWMO_SCALE, SETTINGS_KEY,
} from './config.js';
import { clamp } from './util.js';
import { createInput } from './input.js';
import { getTrack } from './logic/tracks.js';
import { createRace, stepRace } from './logic/sim.js';
import {
  loadCareer, newCareer, saveCareer, clearSave,
  applyRaceResult, currentBike, buyBike,
} from './logic/career.js';
import {
  initRenderer, setQuality, resizeRenderer, buildWorld, updateRender,
} from './render/renderer.js';
import { createAudioSys } from './audio/audio.js';
import { initHUD, updateHUD, showHUD } from './ui/hud.js';
import {
  initScreens, showScreen, hideScreen, screenAction, stamp,
} from './ui/screens.js';

// ---------------------------------------------------------------------------
// URL params & settings
// ---------------------------------------------------------------------------
const qp = new URLSearchParams(location.search);
const P = {
  race: parseInt(qp.get('race') || '0', 10) || 0,   // 1..15 jump straight in
  god: qp.get('god') === '1',
  fast: qp.get('fast') === '1',
  nomusic: qp.get('nomusic') === '1',
  quality: qp.get('quality'),                        // 'low' | 'high' | null
  seed: parseInt(qp.get('seed') || '0', 10) || 0,
  reset: qp.get('reset') === '1',
  fps: qp.get('fps') === '1',
};

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
    if (s && typeof s === 'object') return { volume: 0.8, muted: false, quality: 'high', ...s };
  } catch (e) { /* fall through */ }
  return { volume: 0.8, muted: false, quality: 'high' };
}
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* ok */ }
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
if (P.reset) { clearSave(); try { localStorage.removeItem(SETTINGS_KEY); } catch (e) {} }

const settings = loadSettings();
if (P.quality === 'low' || P.quality === 'high') settings.quality = P.quality;

const canvas = document.getElementById('game-canvas');
const rd = initRenderer(canvas, settings.quality);
const inp = createInput(window);
const audio = createAudioSys(settings);
if (P.nomusic) audio.setMusicEnabled(false);
const hud = initHUD(document.getElementById('hud'));
const scr = initScreens(document.getElementById('screens'));
const fpsEl = document.getElementById('fps');
if (P.fps) fpsEl.hidden = false;

let career = loadCareer();
let race = null;
let state = 'boot';        // 'title'|'prerace'|'race'|'pause'|'recap'|'shop'|'gameover'|'complete'
let camMode = 'title';
let slowmoT = 0;
let raceOverT = -1;        // >=0 counts down the post-finish coast
let attempts = 0;          // reseeds restarts
let acc = 0;
let last = performance.now();
let fpsEMA = 60;
const frameEvents = [];
// combat edges latched across frames until a sim step consumes them
let pendPunch = false;
let pendKick = false;
const stepInput = { steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false };

// one-time gesture unlock for WebAudio
const unlock = () => { audio.unlock(); window.removeEventListener('pointerdown', unlock); window.removeEventListener('keydown', unlock); };
window.addEventListener('pointerdown', unlock);
window.addEventListener('keydown', unlock);

window.addEventListener('resize', () => resizeRenderer(rd));

// ---------------------------------------------------------------------------
// Race lifecycle
// ---------------------------------------------------------------------------
function makeRace() {
  const track = getTrack(career.level, career.raceIndex, { fast: P.fast });
  const seed = P.seed || ((career.level * 7919 + career.raceIndex * 131 + attempts * 17 + 1) >>> 0);
  race = createRace({
    track,
    level: career.level,
    raceIndex: career.raceIndex,
    bike: currentBike(career),
    rivalScore: career.rivalScore,
    seed,
    opts: { god: P.god, fast: P.fast },
  });
  buildWorld(rd, track);
  return race;
}

function gotoTitle() {
  state = 'title';
  camMode = 'title';
  // leaving free play: drop the scaffold and restore the real saved career
  if (career && career.freePlay) career = loadCareer();
  if (!race) { const saved = career; career = career || newCareer(); makeRace(); career = saved; }
  showHUD(hud, false);
  audio.setMusicTheme('title');
  showScreen(scr, 'title', {
    hasSave: !!career,
    settings,
    onNew: () => { clearSave(); career = newCareer(); saveCareer(career); gotoPrerace(); },
    onContinue: () => { if (!career) career = newCareer(); gotoPrerace(); },
    onQuality: (q) => { settings.quality = q; saveSettings(); setQuality(rd, q); },
    onVolume: (v) => { settings.volume = clamp(v, 0, 1); saveSettings(); audio.setVolume(settings.volume); },
    onRaceSelect: gotoRaceSelect,
  });
}

// FREE PLAY: every level/race pickable. Builds a THROWAWAY career scaffold
// (career.freePlay = true) — nothing it does may touch the real localStorage
// save (career.js skips saves for it, and gotoTitle restores the real career).
// Tier per level is an explicit map: rivals blend toward titan1200 at high
// levels, so the formula-derived tiers left L6-L8 podium-locked.
const FREEPLAY_TIER = [0, 0, 1, 1, 2, 3, 4, 4, 4];   // index level-1

function freePlayScaffold(level, raceIndex) {
  const c = newCareer();
  c.freePlay = true;
  c.level = clamp(level, 1, LEVEL_COUNT);
  c.raceIndex = clamp(raceIndex, 0, RACES_PER_LEVEL - 1);
  const tier = FREEPLAY_TIER[c.level - 1] ?? BIKES.length - 1;
  c.bikeId = BIKES[tier].id;
  c.ownedBikes = BIKES.filter((b, i) => b.price === 0 || i <= tier).map((b) => b.id);
  c.cash = 2500 * c.level;
  return c;
}

function gotoRaceSelect() {
  state = 'raceselect';
  camMode = 'title';
  showHUD(hud, false);
  showScreen(scr, 'raceselect', {
    onPick: (level, raceIndex) => {
      career = freePlayScaffold(level, raceIndex);
      gotoPrerace();
    },
    onBack: gotoTitle,
  });
}

function gotoPrerace() {
  if (!career) career = newCareer();
  state = 'prerace';
  camMode = 'grid';
  attempts = 0;
  makeRace();
  showHUD(hud, false);
  audio.setMusicTheme(race.track.theme);
  showScreen(scr, 'prerace', {
    career, race, bike: currentBike(career),
    onGo: beginRace,
    onShop: gotoShop,
    onBack: gotoTitle,   // Esc on the grid returns to the title (not a dead key)
  });
}

function beginRace() {
  hideScreen(scr);
  showHUD(hud, true);
  inp.clearBuffers();
  pendPunch = pendKick = false;
  state = 'race';
  camMode = 'chase';
  slowmoT = 0;
  raceOverT = -1;
  acc = 0;
}

function restartRace() {
  attempts++;
  makeRace();
  beginRace();
}

function gotoShop(from) {
  state = 'shop';
  camMode = from === 'recap' ? 'over' : 'grid';   // deterministic backdrop either entry
  showScreen(scr, 'shop', {
    career, bikes: BIKES,
    onBuy: (id) => buyBike(career, id),   // returns success; screens re-render
    onBack: () => (from === 'recap' ? gotoRecap._again() : gotoPrerace()),
  });
}

function gotoRecap(res) {
  state = 'recap';
  camMode = 'over';
  showHUD(hud, false);
  const data = {
    career, race, res,
    onNext: () => {
      // free play: one race, then back to the picker — never continue the
      // scaffold as if it were a real career (and never its game-over path)
      if (career && career.freePlay) return gotoRaceSelect();
      if (res.gameOver) return gotoGameover();
      if (res.careerComplete) return gotoComplete();
      gotoPrerace();
    },
    onShop: () => gotoShop('recap'),
    // retry only when the race wasn't passed — and never as an escape hatch out
    // of a game-over (RETRY is hidden then, but the R key still routes here)
    onRestart: () => { if (!res.advanced && !res.gameOver) restartRace(); },
  };
  gotoRecap._again = () => { state = 'recap'; showScreen(scr, 'recap', data); };
  showScreen(scr, 'recap', data);
}

function gotoGameover() {
  state = 'gameover';
  // a broke FREE-PLAY scaffold must not delete the real career save
  if (career && career.freePlay) career = loadCareer();
  else { clearSave(); career = null; }
  audio.setMusicTheme('title');
  showScreen(scr, 'gameover', { onNew: () => { career = newCareer(); saveCareer(career); gotoPrerace(); } });
}

function gotoComplete() {
  state = 'complete';
  audio.setMusicTheme('title');
  showScreen(scr, 'complete', { career, onTitle: gotoTitle });
}

function finishRace() {
  const res = applyRaceResult(career, race);
  gotoRecap(res);
}

// Quit from the pause menu. If the race already ended (we're in the post-finish
// coast, result computed but not yet applied), bank it first so a finished
// race's payout/qualification isn't silently thrown away.
function quitFromRace() {
  if (raceOverT >= 0 && race && race.result) {
    applyRaceResult(career, race);
    raceOverT = -1;            // ensure the loop can't also finalize this race
  }
  gotoTitle();
}

// ---------------------------------------------------------------------------
// Global actions (keyboard/gamepad UI events from input.js)
// ---------------------------------------------------------------------------
inp.onAction((action) => {
  if (action === 'mute') {
    settings.muted = !settings.muted; saveSettings(); audio.setMuted(settings.muted);
    return;
  }
  if (state === 'race') {
    if (action === 'pause') { state = 'pause'; showScreen(scr, 'pause', { onResume: resumeRace, onQuit: quitFromRace }); }
    // block restart during the post-finish coast so a reflex R doesn't discard the result
    else if (action === 'restart' && raceOverT < 0) restartRace();
    return;
  }
  if (state === 'pause') {
    if (action === 'pause' || action === 'back') { resumeRace(); return; }
  }
  screenAction(scr, action);   // screens handle confirm/back/up/down/left/right/shop
});

function resumeRace() {
  hideScreen(scr);
  pendPunch = pendKick = false;   // a press latched before pausing must not fire on resume
  state = 'race';
  last = performance.now(); // don't integrate the paused time
}

// ---------------------------------------------------------------------------
// Event fan-out
// ---------------------------------------------------------------------------
function handleEvents(events) {
  for (const ev of events) {
    if (ev.type === 'down' && ev.by && ev.by.isPlayer) slowmoT = SLOWMO_TIME;
    if (ev.type === 'race_over') {
      raceOverT = 3.0;
      if (ev.cause === 'busted') stamp(scr, 'BUSTED', '#5a8ae8');
      else if (ev.cause === 'wrecked') stamp(scr, 'WRECKED', '#e83a28');
      else stamp(scr, ev.place <= 3 ? `FINISHED  ${ordinal(ev.place)}` : `FINISHED  ${ordinal(ev.place)} — TOP 3 TO QUALIFY`, ev.place <= 3 ? '#f5b642' : '#b8b0a0');
    }
  }
}
const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][((n % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function tick(now) {
  requestAnimationFrame(tick);
  const dtReal = clamp((now - last) / 1000, 0, 0.1);
  last = now;
  if (P.fps) {
    fpsEMA += ((dtReal > 0 ? 1 / dtReal : 60) - fpsEMA) * 0.05;
    fpsEl.textContent = `${fpsEMA.toFixed(0)} fps`;
  }

  inp.poll();
  frameEvents.length = 0;

  let dtSim = 0;
  if (state === 'race') {
    const scale = slowmoT > 0 ? SLOWMO_SCALE : 1;
    slowmoT = Math.max(0, slowmoT - dtReal);
    dtSim = dtReal * scale;
    acc += dtSim;
    const input = inp.readGame();
    // Latch combat edges until a sim step actually consumes them. On fast
    // frames (144Hz displays) or during slow-mo, dtSim can be < STEP so the
    // loop below runs ZERO times — without the latch the press would vanish.
    pendPunch = pendPunch || input.punch;
    pendKick = pendKick || input.kick;
    let steps = 0;
    while (acc >= STEP && steps < 15) {
      stepInput.steer = input.steer; stepInput.throttle = input.throttle;
      stepInput.brake = input.brake; stepInput.boost = input.boost;
      stepInput.punch = pendPunch; stepInput.kick = pendKick;
      stepRace(race, stepInput, STEP);
      pendPunch = pendKick = false;              // delivered to the sim
      if (race.events.length) frameEvents.push(...race.events);
      acc -= STEP; steps++;
    }
    handleEvents(frameEvents);

    if (raceOverT >= 0) {
      raceOverT -= dtReal;
      camMode = 'over';
      if (raceOverT < 0) { finishRace(); dtSim = 0; }
    }
  }

  if (race) {
    updateRender(rd, race, dtReal, dtSim, camMode, frameEvents);
    audio.update(state === 'race' ? race : null, dtReal, frameEvents);
    if (state === 'race') updateHUD(hud, race, career, frameEvents);
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------
// debug/play-test handle (read-only introspection)
Object.defineProperty(window, '__RW', {
  value: { get race() { return race; }, get state() { return state; }, get career() { return career; }, get rd() { return rd; } },
});

if (P.race >= 1 && P.race <= LEVEL_COUNT * RACES_PER_LEVEL) {
  // ?race=N deep-link is a free-play scaffold too — it must never touch the save
  const idx = P.race - 1;
  career = freePlayScaffold(Math.floor(idx / RACES_PER_LEVEL) + 1, idx % RACES_PER_LEVEL);
  gotoPrerace();
} else {
  gotoTitle();
}
requestAnimationFrame(tick);
