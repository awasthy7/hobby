// test/smoke.test.mjs — full-sim smoke: every level survives 30s of scripted
// riding with finite numbers and well-formed events; a fast race completes.
import { test } from 'node:test';
import assert from 'node:assert';

import { STEP, BIKES } from '../js/config.js';
import { getTrack } from '../js/logic/tracks.js';
import { createRace, stepRace } from '../js/logic/sim.js';

const RIDER_NUMS = [
  's', 'x', 'y', 'vy', 'speed', 'vx', 'lean', 'leanVis', 'health', 'stamina',
  'bikeDamage', 'attackCd', 'punchT', 'kickT', 'attackSide', 'hitT', 'tumbleT',
  'downS', 'bikeS', 'bikeX', 'place', 'finishTime',
];
const CAR_NUMS = ['id', 's', 'x', 'dir', 'speed', 'color'];
const COP_NUMS = ['s', 'x', 'speed'];
const RIDER_STATES = ['grid', 'riding', 'down', 'running', 'finished'];

const EVENT_OK = {
  countdown: (e) => Number.isFinite(e.n) && e.n >= 0 && e.n <= 3,
  attack: (e) => !!e.rider && typeof e.hit === 'boolean' && ['punch', 'kick', 'club', 'chain'].includes(e.kind),
  hit: (e) => !!e.rider && !!e.from && Number.isFinite(e.dmg) && e.dmg > 0,
  steal: (e) => !!e.rider && !!e.from && ['club', 'chain'].includes(e.weapon),
  down: (e) => !!e.rider && ['combat', 'crash', 'obstacle', 'slide'].includes(e.cause),
  remount: (e) => !!e.rider,
  scrape: (e) => !!e.rider && (e.side === 1 || e.side === -1) && ['car', 'rider', 'barrier'].includes(e.what),
  combo: (e) => ['nearmiss', 'draft', 'knockdown'].includes(e.kind) && Number.isFinite(e.mult),
  combo_break: () => true,
  overtake: (e) => !!e.rider && !!e.target,
  taunt: (e) => !!e.rider && typeof e.line === 'string' && e.line.length > 0,
  cop: (e) => typeof e.on === 'boolean',
  busted: () => true,
  wrecked: () => true,
  finish: (e) => !!e.rider && Number.isFinite(e.place),
  race_over: (e) => Number.isFinite(e.place) && typeof e.cause === 'string'
    && Number.isFinite(e.payout) && Number.isFinite(e.scoreCash) && Number.isFinite(e.fee),
};

function sweepFinite(race, tag) {
  for (const r of race.riders) {
    for (const f of RIDER_NUMS) {
      assert.ok(Number.isFinite(r[f]), `${tag}: rider ${r.id}.${f} = ${r[f]}`);
    }
    assert.ok(RIDER_STATES.includes(r.state), `${tag}: rider state ${r.state}`);
    assert.ok(r.health >= 0 && r.health <= 100, `${tag}: health ${r.health}`);
    assert.ok(r.stamina >= 0 && r.stamina <= 100, `${tag}: stamina ${r.stamina}`);
  }
  for (const c of race.traffic) {
    for (const f of CAR_NUMS) assert.ok(Number.isFinite(c[f]), `${tag}: car.${f} = ${c[f]}`);
  }
  for (const c of race.cops) {
    for (const f of COP_NUMS) assert.ok(Number.isFinite(c[f]), `${tag}: cop.${f} = ${c[f]}`);
  }
  assert.ok(Number.isFinite(race.intensity) && race.intensity >= 0 && race.intensity <= 1.001);
}

function scriptedInput(inp, t, i) {
  inp.steer = Math.sin(t * 0.6) * 0.35;
  inp.throttle = 1;
  inp.brake = t % 7 < 0.25 ? 0.6 : 0;
  inp.punch = i % Math.round(2 / STEP) === 0 && t > 0;
  inp.kick = i % Math.round(5.3 / STEP) === 0 && t > 0;
  inp.boost = t % 11 > 8;
  return inp;
}

for (let level = 1; level <= 5; level++) {
  test(`smoke: level ${level} — 30 sim-seconds of scripted riding`, () => {
    const track = getTrack(level, 1, {});
    const race = createRace({
      track, level, raceIndex: 1,
      bike: BIKES[level >= 4 ? 2 : level >= 2 ? 1 : 0],
      rivalScore: { vex: 1 }, seed: 1000 + level, opts: {},
    });
    const inp = { steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false };
    const steps = Math.round(30 / STEP);
    let lastSweepS = race.riders[0].s;
    let stayedRiding = false;
    let sawGo = false;

    for (let i = 0; i < steps; i++) {
      const t = race.time;
      scriptedInput(inp, Math.max(0, t), i);
      stepRace(race, inp, STEP);

      for (const ev of race.events) {
        const check = EVENT_OK[ev.type];
        assert.ok(check, `unknown event type ${ev.type}`);
        assert.ok(check(ev), `bad payload for ${ev.type}: ${JSON.stringify(Object.keys(ev))}`);
        if (ev.type === 'countdown' && ev.n === 0) sawGo = true;
      }

      const p = race.riders[0];
      if (p.state !== 'riding') stayedRiding = false;

      if (i % 120 === 119) {
        sweepFinite(race, `level ${level} t=${race.time.toFixed(1)}`);
        if (stayedRiding && race.status === 'racing') {
          assert.ok(p.s > lastSweepS, `player.s stalled at ${p.s} (t=${race.time.toFixed(1)})`);
        }
        lastSweepS = p.s;
        stayedRiding = race.status === 'racing' && p.state === 'riding';
      }
    }
    assert.ok(sawGo, 'GO countdown event never fired');
    assert.ok(race.riders[0].s > 100, `player barely moved: ${race.riders[0].s}`);
    sweepFinite(race, `level ${level} final`);
  });
}

test('smoke: full fast race reaches race_over with a result', () => {
  const track = getTrack(1, 0, { fast: true });
  const race = createRace({
    track, level: 1, raceIndex: 0, bike: BIKES[0],
    rivalScore: {}, seed: 77, opts: { fast: true },
  });
  const inp = { steer: 0, throttle: 0, brake: 0, punch: false, kick: false, boost: false };
  const steps = Math.round(240 / STEP);
  let overEvent = null;
  for (let i = 0; i < steps; i++) {
    scriptedInput(inp, Math.max(0, race.time), i);
    inp.brake = 0;                        // just ride it out
    stepRace(race, inp, STEP);
    for (const ev of race.events) if (ev.type === 'race_over') overEvent = ev;
    if (race.status === 'over' && race.time > (overEvent ? 3 : 0)) break;
  }
  assert.equal(race.status, 'over');
  assert.ok(race.result, 'race.result not set');
  assert.ok(overEvent, 'race_over event not emitted');
  assert.equal(overEvent.place, race.result.place);
  assert.ok(['finish', 'busted', 'wrecked'].includes(race.result.cause));
  if (race.result.cause === 'finish') {
    assert.ok(race.riders[0].finishTime > 0);
    assert.equal(race.riders[0].state, 'finished');
  }
  sweepFinite(race, 'fast race final');
});
