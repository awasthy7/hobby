// logic/career.js — career state, economy, persistence.
// localStorage when available, in-memory fallback so node tests run headless.

import {
  BIKES, LEVEL_COUNT, RACES_PER_LEVEL, START_CASH, QUALIFY_PLACE, SAVE_KEY,
} from '../config.js';

const mem = new Map();
function storeGet(k) {
  try { if (typeof localStorage !== 'undefined') return localStorage.getItem(k); } catch (e) { /* fall through */ }
  return mem.has(k) ? mem.get(k) : null;
}
function storeSet(k, v) {
  try { if (typeof localStorage !== 'undefined') { localStorage.setItem(k, v); return; } } catch (e) { /* fall through */ }
  mem.set(k, v);
}
function storeDel(k) {
  try { if (typeof localStorage !== 'undefined') { localStorage.removeItem(k); return; } } catch (e) { /* fall through */ }
  mem.delete(k);
}

export function newCareer() {
  return {
    level: 1, raceIndex: 0,
    cash: START_CASH,
    bikeId: BIKES[0].id,
    ownedBikes: [BIKES[0].id],
    totalRaces: 0, totalWins: 0, totalKnockdowns: 0, bestCombo: 1,
    rivalScore: {},
    finished: false,
  };
}

export function loadCareer() {
  try {
    const raw = storeGet(SAVE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (!c || typeof c !== 'object' || typeof c.cash !== 'number' || !c.bikeId) return null;
    return { ...newCareer(), ...c };   // forward-compat: fill missing fields
  } catch (e) {
    return null;
  }
}

export function saveCareer(career) {
  // free-play scaffolds are throwaway — they must NEVER overwrite the real
  // career save (single choke point covers applyRaceResult, buyBike, etc.)
  if (career && career.freePlay) return;
  try { storeSet(SAVE_KEY, JSON.stringify(career)); } catch (e) { /* non-fatal */ }
}

export function clearSave() {
  storeDel(SAVE_KEY);
}

export function currentBike(career) {
  return BIKES.find((b) => b.id === career.bikeId) || BIKES[0];
}

export function buyBike(career, bikeId) {
  const bike = BIKES.find((b) => b.id === bikeId);
  if (!bike) return false;
  if (career.ownedBikes.includes(bikeId)) {
    career.bikeId = bikeId;
    saveCareer(career);
    return true;
  }
  if (career.cash < bike.price) return false;
  career.cash -= bike.price;
  career.ownedBikes.push(bikeId);
  career.bikeId = bikeId;
  saveCareer(career);
  return true;
}

export function applyRaceResult(career, race) {
  const r = race.result || { place: 8, cause: 'wrecked', payout: 0, scoreCash: 0, fee: 0 };
  career.cash += r.payout + r.scoreCash - r.fee;
  career.totalRaces++;
  if (r.cause === 'finish' && r.place === 1) career.totalWins++;

  const delta = race.grudgeDelta || {};
  let kd = 0;
  for (const id in delta) {
    career.rivalScore[id] = (career.rivalScore[id] || 0) + delta[id];
    if (delta[id] > 0) kd += delta[id];
  }
  career.totalKnockdowns += typeof race.playerKnockdowns === 'number' ? race.playerKnockdowns : kd;
  if (race.combo && race.combo.best > career.bestCombo) career.bestCombo = race.combo.best;

  const advanced = r.cause === 'finish' && r.place <= QUALIFY_PLACE;
  let leveledUp = false, careerComplete = false;
  if (advanced) {
    career.raceIndex++;
    if (career.raceIndex >= RACES_PER_LEVEL) {
      career.raceIndex = 0;
      career.level++;
      leveledUp = true;
      if (career.level > LEVEL_COUNT) {
        career.level = LEVEL_COUNT;      // stays valid for replays
        career.finished = true;
        careerComplete = true;
      }
    }
  }

  const gameOver = career.cash < 0;
  if (!gameOver) saveCareer(career);

  return {
    advanced, leveledUp, gameOver, careerComplete,
    payout: r.payout, scoreCash: r.scoreCash, fee: r.fee,
  };
}
