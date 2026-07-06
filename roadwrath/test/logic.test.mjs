// test/logic.test.mjs — unit tests: career economy, combat, tracks, determinism, rubber-band.
import { test } from 'node:test';
import assert from 'node:assert';

import {
  STEP, BIKES, LEVELS, PAYOUTS, FINISH_PAY_OTHER, REPAIR_FEE, BUSTED_FINE,
  START_CASH, QUALIFY_PLACE, RACES_PER_LEVEL, LEVEL_COUNT,
  MAX_HEALTH, PUNCH_DMG, WEAPON_STEAL_CHANCE, TRACK_SAMPLE_STEP,
  RUBBER_BEHIND_BOOST, RUBBER_AHEAD_EASE,
} from '../js/config.js';
import { getTrack, sampleAt } from '../js/logic/tracks.js';
import { createRace, stepRace, _test } from '../js/logic/sim.js';
import { RIVALS, pickTaunt } from '../js/logic/rivals.js';
import {
  newCareer, loadCareer, saveCareer, clearSave, currentBike, buyBike, applyRaceResult,
} from '../js/logic/career.js';
import { makeRng } from '../js/util.js';

function fakeRace(result, extra = {}) {
  return {
    result,
    combo: { best: extra.best || 1, score: 0, mult: 1, timer: 0 },
    grudgeDelta: extra.grudge || {},
    playerKnockdowns: extra.kd || 0,
  };
}

function mkRace(level = 1, raceIndex = 0, seed = 42, opts = {}) {
  const track = getTrack(level, raceIndex, opts);
  return createRace({
    track, level, raceIndex,
    bike: BIKES[level >= 4 ? 2 : level >= 2 ? 1 : 0],
    rivalScore: {}, seed, opts,
  });
}

function goRacing(race) { // skip countdown without stepping
  race.status = 'racing';
  race.time = 0;
  for (const r of race.riders) r.state = 'riding';
}

const IDLE = { steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false };

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------
test('newCareer defaults', () => {
  const c = newCareer();
  assert.equal(c.cash, START_CASH);
  assert.equal(c.level, 1);
  assert.equal(c.raceIndex, 0);
  assert.equal(c.bikeId, BIKES[0].id);
  assert.deepEqual(c.ownedBikes, [BIKES[0].id]);
  assert.equal(currentBike(c).id, BIKES[0].id);
});

test('qualify advances, non-qualify repeats', () => {
  const c = newCareer();
  let res = applyRaceResult(c, fakeRace({ place: QUALIFY_PLACE, cause: 'finish', payout: 400, scoreCash: 20, fee: 0 }));
  assert.equal(res.advanced, true);
  assert.equal(c.raceIndex, 1);
  assert.equal(c.cash, START_CASH + 420);
  res = applyRaceResult(c, fakeRace({ place: QUALIFY_PLACE + 1, cause: 'finish', payout: FINISH_PAY_OTHER, scoreCash: 0, fee: 0 }));
  assert.equal(res.advanced, false);
  assert.equal(c.raceIndex, 1);
});

test('level progression and career completion', () => {
  const c = newCareer();
  c.raceIndex = RACES_PER_LEVEL - 1;
  let res = applyRaceResult(c, fakeRace({ place: 1, cause: 'finish', payout: 1000, scoreCash: 0, fee: 0 }));
  assert.equal(res.leveledUp, true);
  assert.equal(c.level, 2);
  assert.equal(c.raceIndex, 0);
  assert.equal(c.totalWins, 1);

  c.level = LEVEL_COUNT;
  c.raceIndex = RACES_PER_LEVEL - 1;
  res = applyRaceResult(c, fakeRace({ place: 1, cause: 'finish', payout: 5000, scoreCash: 0, fee: 0 }));
  assert.equal(res.careerComplete, true);
  assert.equal(c.finished, true);
});

test('game over on negative cash, wrecked/busted fees stall progress', () => {
  const c = newCareer();
  c.cash = 100;
  const res = applyRaceResult(c, fakeRace({ place: 8, cause: 'busted', payout: 0, scoreCash: 0, fee: 500 }));
  assert.equal(res.gameOver, true);
  assert.equal(res.advanced, false);
  assert.ok(c.cash < 0);
  assert.equal(c.raceIndex, 0);
});

test('grudge merge and stats', () => {
  const c = newCareer();
  applyRaceResult(c, fakeRace(
    { place: 1, cause: 'finish', payout: 1000, scoreCash: 0, fee: 0 },
    { grudge: { sledge: 2, vex: -1 }, kd: 2, best: 3.25 },
  ));
  assert.equal(c.rivalScore.sledge, 2);
  assert.equal(c.rivalScore.vex, -1);
  assert.equal(c.totalKnockdowns, 2);
  assert.equal(c.bestCombo, 3.25);
  assert.equal(c.totalRaces, 1);
});

test('buyBike paths', () => {
  const c = newCareer();
  assert.equal(buyBike(c, 'kestrel600'), false);       // cannot afford
  c.cash = 5000;
  assert.equal(buyBike(c, 'kestrel600'), true);
  assert.equal(c.cash, 5000 - BIKES[1].price);
  assert.equal(c.bikeId, 'kestrel600');
  assert.equal(buyBike(c, 'rat250'), true);            // owned: reselect, no charge
  assert.equal(c.bikeId, 'rat250');
  assert.equal(c.cash, 5000 - BIKES[1].price);
  assert.equal(buyBike(c, 'nope'), false);
});

test('save/load/clear roundtrip (in-memory fallback)', () => {
  clearSave();
  assert.equal(loadCareer(), null);
  const c = newCareer();
  c.cash = 3333; c.level = 3; c.rivalScore.kaz = 1;
  saveCareer(c);
  const l = loadCareer();
  assert.deepEqual(l, c);
  clearSave();
  assert.equal(loadCareer(), null);
});

test('sim payout math via endRace', () => {
  for (const [place, cause, level] of [[1, 'finish', 1], [2, 'finish', 3], [5, 'finish', 2]]) {
    const race = mkRace(level, 0, 7, { fast: true });
    goRacing(race);
    race.riders[0].place = place;
    _test.endRace(race, cause);
    const expect = place <= PAYOUTS.length ? PAYOUTS[place - 1] * level : FINISH_PAY_OTHER;
    assert.equal(race.result.payout, expect);
    assert.equal(race.result.fee, 0);
    assert.equal(race.status, 'over');
  }
  const w = mkRace(2, 0, 7, { fast: true });
  goRacing(w);
  _test.endRace(w, 'wrecked');
  assert.equal(w.result.fee, REPAIR_FEE * 2);
  assert.equal(w.result.payout, 0);
  const b = mkRace(3, 0, 7, { fast: true });
  goRacing(b);
  _test.endRace(b, 'busted');
  assert.equal(b.result.fee, BUSTED_FINE * 3);
});

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
test('punch hits in range, damages, sets anim fields', () => {
  const race = mkRace();
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  p.s = 500; p.x = 0; p.attackCd = 0; p.stamina = 100;
  v.s = 502; v.x = 1.2; v.hitT = 0; v.health = MAX_HEALTH;
  race.events.length = 0;
  _test.tryAttack(race, p, 'punch');
  const atk = race.events.find((e) => e.type === 'attack');
  assert.ok(atk && atk.hit === true && atk.target === v && atk.kind === 'punch');
  const hit = race.events.find((e) => e.type === 'hit');
  assert.ok(hit && hit.rider === v && hit.from === p && hit.dmg === PUNCH_DMG);
  assert.equal(v.health, MAX_HEALTH - PUNCH_DMG);
  assert.ok(p.punchT > 0);
  assert.equal(p.attackSide, 1);
  assert.ok(v.hitT > 0);
});

test('attack misses out of range', () => {
  const race = mkRace();
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  p.s = 500; p.x = 0; p.attackCd = 0; p.stamina = 100;
  v.s = 520; v.x = 0; v.health = MAX_HEALTH;
  for (let i = 2; i < race.riders.length; i++) race.riders[i].s = 900; // clear the area
  race.events.length = 0;
  _test.tryAttack(race, p, 'punch');
  const atk = race.events.find((e) => e.type === 'attack');
  assert.ok(atk && atk.hit === false && atk.target === null);
  assert.equal(race.events.find((e) => e.type === 'hit'), undefined);
  assert.equal(v.health, MAX_HEALTH);
});

test('knockdown at zero health, grudge + combo bookkeeping', () => {
  const race = mkRace();
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  p.s = 500; p.x = 0; p.attackCd = 0; p.stamina = 100;
  v.s = 501; v.x = 1; v.hitT = 0; v.health = 5; v.weapon = null;
  race.events.length = 0;
  _test.tryAttack(race, p, 'punch');
  assert.equal(v.state, 'down');
  assert.equal(v.health, 0);
  const down = race.events.find((e) => e.type === 'down');
  assert.ok(down && down.rider === v && down.cause === 'combat' && down.by === p);
  assert.equal(race.grudgeDelta[v.id], 1);
  assert.equal(race.playerKnockdowns, 1);
  assert.ok(v.bikeS > v.s);
  const combo = race.events.find((e) => e.type === 'combo');
  assert.ok(combo && combo.kind === 'knockdown');
  assert.ok(race.combo.mult > 1);
});

test('knockdown mid-loop cancels the loop cleanly (regression)', () => {
  const race = mkRace(8, 0, 42, {});          // hotwheels has loops
  goRacing(race);
  const p = race.riders[0];
  const lp = race.track.loops[0];
  assert.ok(lp, 'hotwheels track has a loop');
  // put the player mid-loop
  p.s = lp.s + 5; p.loopT = 0.5; p.loopDur = 1.1; p.loopEntrySpeed = 40; p.y = 12; p.airborne = true;
  race.events.length = 0;
  _test.knockdown(race, p, 'combat', race.riders[1]);
  assert.equal(p.state, 'down');
  assert.equal(p.loopT, 0, 'loopT cleared on knockdown');
  assert.ok(race.events.some((e) => e.type === 'loop' && e.phase === 'exit'),
    'loop exit emitted so renderer/audio unwind');
  // remount must NOT resume a phantom loop
  p.state = 'riding'; p.speed = 3;
  const before = p.y;
  stepRace(race, { ...IDLE, throttle: 1 }, STEP);
  assert.ok(p.y <= before + 0.1 && p.speed < 10, 'no phantom loop teleport after remount');
});

test('queued attack re-resolves weapon at fire time (regression)', () => {
  const race = mkRace(1, 0, 42, { god: true });
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  for (let i = 2; i < race.riders.length; i++) race.riders[i].s = 2000;
  p.weapon = 'club';
  v.s = p.s + 1.5; v.x = p.x + 1; v.state = 'riding'; v.health = 100; v.hitT = 0; v.weapon = null;
  // press punch (queues 'primary'), then LOSE the weapon before it fires
  p.attackCd = 0.2;                            // mid-cooldown so it queues
  stepRace(race, { ...IDLE, throttle: 1, punch: true }, STEP);
  assert.equal(p.pendAtk, 'primary');
  p.weapon = null;                             // stolen/lost before cooldown ends
  let fired = null;
  for (let i = 0; i < Math.ceil(0.3 / STEP); i++) {
    v.s = p.s + 1.5; v.x = p.x + 1; v.state = 'riding'; v.health = 100; v.hitT = 0;
    race.events.length = 0;
    stepRace(race, { ...IDLE, throttle: 1 }, STEP);
    const atk = race.events.find((e) => e.type === 'attack');
    if (atk) { fired = atk; break; }
  }
  assert.ok(fired, 'queued attack fired');
  assert.equal(fired.kind, 'punch', 'stale club re-resolved to a bare punch');
});

test('press during cooldown queues and fires when it ends (regression)', () => {
  const race = mkRace(1, 0, 42, { god: true });
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  // land a first punch to start the cooldown
  v.s = p.s + 1.5; v.x = p.x + 1; v.state = 'riding'; v.health = 100; v.hitT = 0;
  stepRace(race, { ...IDLE, throttle: 1, punch: true }, STEP);
  assert.ok(p.attackCd > 0, 'first punch started the cooldown');
  // press again IMMEDIATELY (mid-cooldown) — old code discarded this press
  stepRace(race, { ...IDLE, throttle: 1, punch: true }, STEP);
  assert.equal(p.pendAtk, 'primary', 'mid-cooldown press is queued as intent');
  // run until just past cooldown with NO further presses; the queued one must fire
  let fired = false;
  for (let i = 0; i < Math.ceil(0.55 / STEP); i++) {
    v.s = p.s + 1.5; v.x = p.x + 1; v.state = 'riding'; v.health = 100; v.hitT = 0;
    race.events.length = 0;
    stepRace(race, { ...IDLE, throttle: 1 }, STEP);
    if (race.events.some((e) => e.type === 'attack')) { fired = true; break; }
  }
  assert.ok(fired, 'queued attack fires the moment cooldown ends');
  assert.equal(p.pendAtk, null, 'queue cleared after firing');
});

test('steady punch cadence never stamina-locks the player (regression)', () => {
  // A realistic punch every ~0.6s for 30s must keep landing — the old economy
  // (regen blocked during cooldown) drained stamina to zero and silently killed combat.
  const race = mkRace(1, 0, 42, { god: true });
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  let punches = 0, landed = 0;
  for (let step = 0; step < 120 * 30; step++) {
    v.s = p.s + 1.5; v.x = p.x + 1; v.state = 'riding'; v.health = 100; v.hitT = 0;
    const doPunch = (step % 72) === 0;                 // every 0.6s
    race.events.length = 0;
    stepRace(race, { ...IDLE, throttle: 1, punch: doPunch }, STEP);
    if (doPunch) { punches++; if (race.events.some((e) => e.type === 'attack')) landed++; }
  }
  assert.ok(punches > 30, 'should have issued many punches');
  assert.equal(landed, punches, `every steady punch must fire (got ${landed}/${punches})`);
});

test('airborne rider clears a car directly beneath instead of crashing (regression)', () => {
  const race = mkRace();
  goRacing(race);
  const p = race.riders[0];
  // park rivals far away so they can't interfere
  for (let i = 1; i < race.riders.length; i++) race.riders[i].s = -500;
  p.s = 100; p.x = 0; p.speed = 40; p.airborne = true; p.y = 5; p.vy = 10;
  race.traffic.length = 0;
  race.traffic.push({ id: 1, kind: 'bus', s: 103, x: 0, dir: 1, speed: 5, color: 0, w: 2.5, l: 11, baseX: 0, wob: 0, nm: false, rel: 0 });
  race.events.length = 0;
  _test.collideWorld(race, STEP);
  assert.equal(p.state, 'riding', 'airborne rider over a car must not be knocked down');
  assert.ok(!race.events.some((e) => e.type === 'down'), 'no crash event while airborne');
  // and the same rider grounded at the same spot DOES crash
  p.airborne = false; p.y = 0; p.state = 'riding';
  _test.collideWorld(race, STEP);
  assert.equal(p.state, 'down', 'grounded rider at crash-closing speed still wipes out');
});

test('cop chase ignores rival-vs-rival brawls far from the player (regression)', () => {
  const race = mkRace(2, 0, 3);           // level 2 has a cop
  goRacing(race);
  assert.ok(race.cops.length >= 1, 'level 2 should have a cop to test');
  const cop = race.cops[0];
  const p = race.riders[0], r1 = race.riders[1], r2 = race.riders[2];
  // player far away; two rivals brawl right on top of the cop
  p.s = cop.s + 3000; p.x = 0;
  r1.s = cop.s; r1.x = 0; r2.s = cop.s + 1; r2.x = 1;
  race.copChase = false;
  race.events.length = 0;
  race.events.push({ type: 'attack', rider: r1, target: r2, kind: 'punch', hit: true });
  _test.updateCops(race, STEP, true);
  assert.equal(race.copChase, false, 'a rival brawl across the map must not summon a chase');
  assert.ok(!race.events.some((e) => e.type === 'cop'), 'no cop event from a distant rival fight');

  // but the player fighting near the cop DOES start a chase
  p.s = cop.s + 10;
  race.events.length = 0;
  race.events.push({ type: 'attack', rider: p, target: r1, kind: 'punch', hit: true });
  _test.updateCops(race, STEP, true);
  assert.equal(race.copChase, true, 'player fighting in cop sight starts the chase');
});

test('weapon steal rate over seeded trials ~ WEAPON_STEAL_CHANCE', () => {
  const race = mkRace(1, 0, 777);
  goRacing(race);
  const p = race.riders[0], v = race.riders[1];
  p.s = 500; p.x = 0; v.s = 501.5; v.x = 1;
  const N = 4000;
  let steals = 0;
  for (let i = 0; i < N; i++) {
    p.attackCd = 0; p.stamina = 100; p.weapon = null;
    v.weapon = 'club'; v.health = MAX_HEALTH; v.hitT = 0; v.state = 'riding';
    race.events.length = 0;
    _test.tryAttack(race, p, 'punch');
    if (race.events.some((e) => e.type === 'steal')) steals++;
  }
  const rate = steals / N;
  assert.ok(Math.abs(rate - WEAPON_STEAL_CHANCE) < 0.04, `steal rate ${rate}`);
});

test('taunts exist for every rival and kind', () => {
  const rng = makeRng(9);
  assert.equal(RIVALS.length, 7);
  for (const def of RIVALS) {
    for (const kind of ['overtake', 'knockdown', 'hit', 'grudge']) {
      assert.ok(def.taunts[kind].length >= 2, `${def.id} ${kind}`);
      const line = pickTaunt(def, kind, rng);
      assert.ok(typeof line === 'string' && line.length > 0);
    }
  }
});

// ---------------------------------------------------------------------------
// Tracks
// ---------------------------------------------------------------------------
test('tracks: spacing, finiteness, props, copZones, stunt fields', () => {
  for (let level = 1; level <= LEVEL_COUNT; level++) {
    for (const ri of [0, 2]) {
      const t = getTrack(level, ri, {});
      const n = t.px.length;
      assert.ok(t.length > 1000);
      assert.equal(t.sampleStep, TRACK_SAMPLE_STEP);
      for (let i = 0; i < n; i++) {
        for (const arr of [t.px, t.py, t.pz, t.tx, t.tz, t.curv, t.bank]) {
          assert.ok(Number.isFinite(arr[i]), `NaN at ${i} level ${level}`);
        }
      }
      // ramps add vertical rise but stay within the arc-length tolerance
      for (let i = 0; i < n - 1; i++) {
        const dx = t.px[i + 1] - t.px[i], dy = t.py[i + 1] - t.py[i], dz = t.pz[i + 1] - t.pz[i];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        assert.ok(Math.abs(d - TRACK_SAMPLE_STEP) < 0.45, `spacing ${d} at ${i} level ${level}`);
      }
      for (let i = 1; i < t.props.length; i++) assert.ok(t.props[i].s >= t.props[i - 1].s);
      assert.equal(t.copZones.length, LEVELS[level - 1].copCount);
      for (const z of t.copZones) assert.ok(z.s0 >= 0 && z.s1 <= t.length && z.s1 > z.s0);
      // stunt fields present and in-bounds
      assert.ok(Array.isArray(t.boostZones) && Array.isArray(t.loops));
      for (const z of t.boostZones) assert.ok(z.s0 >= 0 && z.s1 <= t.length && z.s1 > z.s0);
      for (const lp of t.loops) assert.ok(lp.s > 0 && lp.s < t.length && lp.radius > 0);
      for (let i = 0; i < n; i++) assert.ok(Math.abs(t.bank[i]) <= 0.65, `bank ${t.bank[i]}`);
    }
  }
});

test('sampleAt interpolation continuity + clamping', () => {
  const t = getTrack(3, 1, {});
  const a = { x: 0, y: 0, z: 0, tx: 0, tz: 0, curv: 0 };
  const b = { x: 0, y: 0, z: 0, tx: 0, tz: 0, curv: 0 };
  const rng = makeRng(5);
  for (let i = 0; i < 500; i++) {
    const s = rng() * t.length;
    sampleAt(t, s, a);
    sampleAt(t, s + 0.5, b);
    const d = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    assert.ok(d < 1.5, `discontinuity ${d} at s=${s}`);
    assert.ok(Math.abs(Math.hypot(a.tx, a.tz) - 1) < 0.01);
  }
  sampleAt(t, -50, a);
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.curv));
  sampleAt(t, t.length + 500, a);
  assert.ok(Number.isFinite(a.x));
  sampleAt(t, NaN, a);
  assert.ok(Number.isFinite(a.x));
});

// ---------------------------------------------------------------------------
// Stunts: boost pads + fake loops
// ---------------------------------------------------------------------------
test('boost pad gives a measurable top-speed bump', () => {
  // hotwheels (level 8) has boost zones. Compare distance covered over a fixed
  // window when a rider crosses a pad vs the same rider with no pad crossing.
  const track = getTrack(8, 0, {});
  assert.ok(track.boostZones.length > 0, 'hotwheels must have boost zones');
  const z = track.boostZones[0];

  function run(startS) {
    const race = mkRace(8, 0, 5);
    goRacing(race);
    const p = race.riders[0];
    for (let i = 1; i < race.riders.length; i++) race.riders[i].s = -800;
    p.s = startS; p.x = 0; p.speed = 45; p.boostI = 0;
    let boosted = false;
    for (let i = 0; i < 120; i++) {   // 1s window
      _test.physicsStep(race, p, { steer: 0, throttle: 1, brake: 0, tuck: false }, STEP, true);
      if (p.boostT > 0) boosted = true;
    }
    return { s: p.s, boosted };
  }
  const withPad = run(z.s0 - 5);      // rider rolls into the pad
  const noPad = run(z.s1 + 400);      // well past every pad
  assert.ok(withPad.boosted, 'crossing the pad must arm a boost');
  assert.ok(withPad.s - (z.s0 - 5) > noPad.s - (z.s1 + 400) + 3,
    `boosted rider must cover more ground (${withPad.s - (z.s0 - 5)} vs ${noPad.s - (z.s1 + 400)})`);
});

test('boost event fires once per zone entry, never per-step', () => {
  const track = getTrack(8, 0, {});
  const z = track.boostZones[0];
  const race = mkRace(8, 0, 5);
  goRacing(race);
  const p = race.riders[0];
  for (let i = 1; i < race.riders.length; i++) race.riders[i].s = -800;
  p.s = z.s0 - 5; p.x = 0; p.speed = 45; p.boostI = 0;
  let boostEvents = 0;
  for (let i = 0; i < 240; i++) {
    race.events.length = 0;
    _test.physicsStep(race, p, { steer: 0, throttle: 1, brake: 0, tuck: false }, STEP, true);
    boostEvents += race.events.filter((e) => e.type === 'boost').length;
  }
  assert.equal(boostEvents, 1, `exactly one boost event per zone, got ${boostEvents}`);
});

test('fast rider triggers loop: enter+exit events, returns to riding y=0, s advanced', () => {
  const track = getTrack(8, 0, {});
  assert.ok(track.loops.length > 0, 'hotwheels must have loops');
  const lp = track.loops[0];
  const race = mkRace(8, 0, 9);
  goRacing(race);
  const p = race.riders[0];
  for (let i = 1; i < race.riders.length; i++) race.riders[i].s = -800;
  p.s = lp.s - 4; p.x = 1.0; p.speed = 40; p.loopI = 0;
  const s0 = p.s;
  let enter = 0, exit = 0, maxY = 0;
  for (let i = 0; i < 200; i++) {   // > LOOP_DUR worth of steps
    race.events.length = 0;
    _test.physicsStep(race, p, { steer: 0, throttle: 1, brake: 0, tuck: false }, STEP, true);
    for (const e of race.events) {
      if (e.type === 'loop' && e.phase === 'enter') enter++;
      if (e.type === 'loop' && e.phase === 'exit') exit++;
    }
    if (p.y > maxY) maxY = p.y;
  }
  assert.equal(enter, 1, 'exactly one loop enter');
  assert.equal(exit, 1, 'exactly one loop exit');
  assert.equal(p.state, 'riding', 'rider returns to riding after the loop');
  assert.ok(Math.abs(p.y) < 1e-6, `rider lands at y=0 (got ${p.y})`);
  assert.ok(!p.airborne, 'no longer airborne after loop');
  assert.ok(p.s > s0 + 20, `s advanced smoothly through the loop (got ${p.s - s0})`);
  assert.ok(maxY > 5, `loop lofts the rider (peak y ${maxY})`);
});

test('slow rider (speed < LOOP_MIN_SPEED) passes under the loop, no trigger', () => {
  const track = getTrack(8, 0, {});
  const lp = track.loops[0];
  const race = mkRace(8, 0, 9);
  goRacing(race);
  const p = race.riders[0];
  for (let i = 1; i < race.riders.length; i++) race.riders[i].s = -800;
  p.s = lp.s - 4; p.x = 0; p.speed = 15; p.loopI = 0;   // below LOOP_MIN_SPEED (22)
  let loopEvents = 0;
  for (let i = 0; i < 120; i++) {
    race.events.length = 0;
    _test.physicsStep(race, p, { steer: 0, throttle: 0, brake: 0, tuck: false }, STEP, true);
    loopEvents += race.events.filter((e) => e.type === 'loop').length;
  }
  assert.equal(loopEvents, 0, 'a slow rider must not trigger a loop');
  assert.equal(p.state, 'riding');
  assert.equal(p.loopT, 0, 'no scripted loop in progress');
});

// ---------------------------------------------------------------------------
// Determinism & rubber-band
// ---------------------------------------------------------------------------
function runSeeded(seed, seconds) {
  const track = getTrack(2, 1, {});
  const race = createRace({
    track, level: 2, raceIndex: 1, bike: BIKES[1], rivalScore: { sledge: 1 }, seed, opts: {},
  });
  const inp = { ...IDLE };
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i++) {
    const t = i * STEP;
    inp.steer = Math.sin(t * 0.8) * 0.5;
    inp.throttle = 1;
    inp.brake = i % 900 < 40 ? 1 : 0;
    inp.punch = i % 240 === 0;
    inp.boost = t > 4 && t < 6;
    stepRace(race, inp, STEP);
  }
  return race;
}

test('determinism: same seed + inputs -> bit-identical player state', () => {
  const a = runSeeded(1234, 10 + 3.2);
  const b = runSeeded(1234, 10 + 3.2);
  assert.strictEqual(a.riders[0].s, b.riders[0].s);
  assert.strictEqual(a.riders[0].x, b.riders[0].x);
  assert.strictEqual(a.riders[0].health, b.riders[0].health);
  for (let i = 1; i < a.riders.length; i++) {
    assert.strictEqual(a.riders[i].s, b.riders[i].s);
  }
  const c = runSeeded(4321, 5);
  assert.notStrictEqual(a.riders[0].s, c.riders[0].s);
});

test('rubber-band stays within configured bounds', () => {
  const race = runSeeded(99, 20);
  for (let i = 1; i < race.riders.length; i++) {
    const rb = race.riders[i].ai.rubber;
    assert.ok(rb <= RUBBER_BEHIND_BOOST + 1e-9, `rubber ${rb}`);
    assert.ok(rb >= -RUBBER_AHEAD_EASE - 1e-9, `rubber ${rb}`);
  }
});
