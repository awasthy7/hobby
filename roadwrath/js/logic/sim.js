// logic/sim.js — the whole race simulation: riders, physics, combat, traffic,
// cops, combo, places. Pure + headless + deterministic (race.rng only).

import {
  STEP, RIDER_COUNT, COUNTDOWN,
  ROAD_HALF_W, SHOULDER_W, OFFROAD_DRAG,
  GRAVITY, STEER_VMAX, LEAN_RATE, BRAKE_DECEL, ENGINE_BRAKE, DRAG_K,
  TUCK_TOP_BONUS, TUCK_STAMINA_DRAIN, DRAFT_DIST, DRAFT_X, DRAFT_ACCEL_BONUS,
  CURVE_GRIP, AIR_CONTROL,
  ATTACK_RANGE_S, ATTACK_RANGE_X, PUNCH_DMG, KICK_DMG, KICK_SHOVE, PUNCH_SHOVE,
  WEAPON_DMG, WEAPON_RANGE_X, WEAPON_STEAL_CHANCE, ATTACK_COOLDOWN,
  ATTACK_STAMINA, LOW_STAMINA_ATTACK, STAMINA_REGEN, HIT_FLINCH_TIME, MAX_HEALTH, MAX_STAMINA,
  KNOCKDOWN_SPEED_KEEP, DOWN_TIME, RUN_SPEED, RUN_SPEED_IDLE, REMOUNT_HEALTH,
  BIKE_SKID_AHEAD,
  CRASH_CLOSING_SPEED, CAR_HIT_SLOW, RIDER_BUMP_SHOVE, OBSTACLE_R,
  BARRIER_SCRAPE_SLOW, BIKE_DMG_CRASH, BIKE_DMG_SCRAPE, MAX_BIKE_DMG,
  TRAFFIC_WINDOW, TRAFFIC_SPEEDS, TRAFFIC_KINDS, TRAFFIC_DIMS,
  COP_SIGHT_S, COP_ARREST_DIST, COP_ESCAPE_DIST, COP_TOP_SPEED,
  NEARMISS_DIST, NEARMISS_MIN_SPEED, COMBO_DECAY, COMBO_STEP, COMBO_MAX,
  SCORE_NEARMISS, SCORE_DRAFT_PER_S, SCORE_KNOCKDOWN, SCORE_CASH_RATE,
  RUBBER_BEHIND_BOOST, RUBBER_AHEAD_EASE, RUBBER_RANGE,
  PAYOUTS, FINISH_PAY_OTHER, REPAIR_FEE, BUSTED_FINE,
  LEVELS, BIKES,
  MUSIC_INTENSITY_SPEED, COMBAT_HEAT_TIME,
} from '../config.js';
import { makeRng, clamp, lerp, damp, pick, TAU } from '../util.js';
import { sampleAt } from './tracks.js';
import { RIVALS, pickTaunt } from './rivals.js';

// local tunables
const GRIP_LAT = 1.7;          // cornering grip scale (× CURVE_GRIP·g·lean)
const BANK_GRIP = 0.6;         // banked-corner grip bonus: maxLat *= 1 + BANK_GRIP*|bank|
const BOOST_TIME = 1.4;        // s of boost after crossing a speed pad
const BOOST_TOP = 0.35;        // +35% top speed while boosting
const BOOST_ACCEL = 14;        // m/s^2 extra accel while boosting
const LOOP_MIN_SPEED = 22;     // m/s entry gate: slower riders just pass under
const LOOP_DUR = 1.1;          // s of the scripted up-and-over arc
const SLIDE_DOWN_T = 0.55;     // s of hard sliding before you low-side
const PUNCH_ANIM = 0.35;       // s, punchT/kickT decay window
const TAUNT_GAP = 8;           // s between taunts per rival
const AI_LANE = ROAD_HALF_W - 0.4;
const CAR_COLORS = [0xb8b0a0, 0x6a7a8a, 0x8a4a3a, 0x4a6a4a, 0x3a3a44, 0xc8a05a, 0x7a5a8a];

// zero-alloc scratch
const SAMP = { x: 0, y: 0, z: 0, tx: 0, tz: 1, curv: 0, bank: 0 };
const SAMP2 = { x: 0, y: 0, z: 0, tx: 0, tz: 1, curv: 0, bank: 0 };
const CTL = { steer: 0, throttle: 0, brake: 0, tuck: false };
const ORDER = [];

// ---------------------------------------------------------------------------
// createRace
// ---------------------------------------------------------------------------
function makeRider(id, name, isPlayer, color, bikeId, stats, slot) {
  const row = slot >> 1;
  return {
    id, name, isPlayer, color, bikeId,
    // echelon grid: alternate rows sit wider so no bike hides directly behind
    // another from the chase camera (straight columns read as "2 bikes")
    s: -6 - row * 5, x: ((slot & 1) ? 1 : -1) * (1.7 + (row % 2) * 2.2),
    y: 0, vy: 0, speed: 0, vx: 0, lean: 0, leanVis: 0,
    state: 'grid',
    health: MAX_HEALTH, stamina: MAX_STAMINA, bikeDamage: 0,
    weapon: null, attackCd: 0, punchT: 0, kickT: 0, attackSide: 1, hitT: 0,
    pendAtk: null, pendAtkT: 0,       // queued attack pressed during cooldown

    tumbleT: 0, downS: 0, bikeS: 0, bikeX: 0,
    skidding: false, offroad: false, airborne: false, tucking: false, drafting: false,
    place: slot + 1, finishTime: 0,
    ai: null,
    stats,
    slideT: 0, slope: 0, scrapeCd: 0, propI: 0, draftT: 0, wasAhead: true,
    // stunts: boost pads + fake loops
    boostT: 0, boostI: 0,
    loopT: 0, loopDur: 0, loopS0: 0, loopEntrySpeed: 0, loopI: 0,
  };
}

export function createRace({ track, level, raceIndex, bike, rivalScore, seed, opts }) {
  const rng = makeRng(seed >>> 0 || 1);
  const lvl = LEVELS[level - 1];
  const slowest = BIKES[0], fastest = BIKES[BIKES.length - 1];   // rival stat-blend anchors

  const riders = [];
  const player = makeRider('player', 'YOU', true, bike.color, bike.id, {
    topSpeed: bike.topSpeed, accel: bike.accel, lean: bike.lean, tough: bike.tough,
  }, RIDER_COUNT - 1);
  riders.push(player);

  for (let i = 0; i < RIDER_COUNT - 1; i++) {
    const def = RIVALS[i % RIVALS.length];
    const skill = clamp(lvl.rivalSkill * lerp(0.82, 1.12, def.baseSkill) + (rng() - 0.5) * 0.05, 0.15, 1);
    // stat blend: low-skill rivals ride near the slowest bike's pace, top
    // skill (level 9) near the fastest tier (titan1200)
    const bx = clamp((skill - 0.5) / 0.5, 0, 1);
    const stats = {
      topSpeed: lerp(slowest.topSpeed, fastest.topSpeed, bx),
      accel: lerp(slowest.accel, fastest.accel, bx),
      lean: lerp(slowest.lean, fastest.lean, bx),
      tough: lerp(slowest.tough, fastest.tough, bx),
    };
    const bikeId = BIKES[clamp(Math.round(bx * (BIKES.length - 1)), 0, BIKES.length - 1)].id;
    const r = makeRider(def.id, def.name, false, def.color, bikeId, stats, i);
    r.weapon = def.startWeapon || null;
    const grudge = rivalScore && rivalScore[def.id] > 0 ? 'player' : null;
    const baseAgg = def.personality === 'aggressive' ? 0.9
      : def.personality === 'dirty' ? 0.75
        : def.personality === 'wildcard' ? 0.55 : 0.22;
    r.ai = {
      personality: def.personality, skill,
      aggression: clamp(baseAgg + (rng() - 0.5) * 0.1 + (grudge ? 0.2 : 0), 0, 1),
      grudge,
      targetX: r.x, decideT: rng() * 0.3, rubber: 0,
      throttle: 1, brake: 0, attack: null, burstT: 0,
      tauntT: 2 + rng() * TAUNT_GAP, def,
    };
    riders.push(r);
  }

  const race = {
    track, level, raceIndex,
    time: -COUNTDOWN, status: 'countdown',
    finishS: track.length,
    riders,
    traffic: [],
    cops: [],
    events: [],
    intensity: 0, combatHeat: 0, copChase: false,
    combo: { mult: 1, timer: 0, best: 1, score: 0 },
    result: null,
    opts: { god: !!(opts && opts.god), fast: !!(opts && opts.fast) },
    rng,
    // internals
    grudgeDelta: {}, playerKnockdowns: 0,
    countdownN: 4, trafficId: 1, trafficT: 0,
    trafficTarget: Math.round(lvl.trafficPerKm * TRAFFIC_WINDOW * 2 / 1000),
  };

  for (const z of track.copZones) {
    race.cops.push({
      id: 'cop' + race.cops.length,
      s: (z.s0 + z.s1) / 2, x: ROAD_HALF_W + 2.2,
      speed: 0, state: 'idle',
    });
  }
  for (let i = 0; i < race.trafficTarget; i++) spawnCar(race, true);
  return race;
}

function spawnCar(race, initial) {
  const rng = race.rng, ps = race.riders[0].s;
  const dir = rng() < 0.45 ? -1 : 1;
  let s;
  if (initial) s = ps + 150 + rng() * (TRAFFIC_WINDOW - 150);
  else if (dir < 0) s = ps + TRAFFIC_WINDOW * (0.8 + rng() * 0.2);
  else s = rng() < 0.75
    ? ps + 250 + rng() * (TRAFFIC_WINDOW - 280)
    : ps - TRAFFIC_WINDOW * (0.6 + rng() * 0.3);
  const kind = pick(rng, TRAFFIC_KINDS);
  const dims = TRAFFIC_DIMS[kind];
  const baseX = (dir < 0 ? -1 : 1) * (2.2 + rng() * 3.2);
  race.traffic.push({
    id: race.trafficId++, kind, s, x: baseX, dir,
    speed: lerp(TRAFFIC_SPEEDS[0], TRAFFIC_SPEEDS[1], rng()),
    color: pick(rng, CAR_COLORS),
    baseX, w: dims.w, l: dims.l, wob: rng() * TAU,
    nm: false, rel: s > ps ? 1 : -1,
  });
}

// ---------------------------------------------------------------------------
// stepRace
// ---------------------------------------------------------------------------
export function stepRace(race, input, dt) {
  race.events.length = 0;
  race.time += dt;

  if (race.status === 'countdown') {
    const n = Math.max(0, Math.ceil(-race.time));
    if (n !== race.countdownN && n <= 3) {
      race.countdownN = n;
      race.events.push({ type: 'countdown', n });
      if (n === 0) {
        race.status = 'racing';
        for (let i = 0; i < race.riders.length; i++) race.riders[i].state = 'riding';
      }
    }
    if (race.status === 'countdown') { moveTraffic(race, dt); return; }
  }

  const racing = race.status === 'racing';
  const player = race.riders[0];

  for (let i = 0; i < race.riders.length; i++) {
    const r = race.riders[i];
    tickTimers(r, dt);
    if (r.state === 'riding') {
      if (r.isPlayer) {
        CTL.steer = clamp(input.steer, -1, 1);
        CTL.throttle = clamp(input.throttle, 0, 1);
        CTL.brake = clamp(input.brake, 0, 1);
        CTL.tuck = !!input.boost;
      } else {
        aiControl(race, r, dt);
      }
      physicsStep(race, r, CTL, dt, racing);
      if (r.state === 'riding') propCollide(race, r, racing);
    } else if (r.state === 'down') {
      r.tumbleT += dt;
      r.speed = Math.max(0, r.speed - 20 * dt);
      r.s += r.speed * dt;
      if (r.tumbleT >= DOWN_TIME) { r.state = 'running'; r.speed = 0; }
    } else if (r.state === 'running') {
      runStep(race, r, input, dt);
    } else if (r.state === 'finished') {
      r.speed = damp(r.speed, 12, 0.8, dt);
      r.s += r.speed * dt;
      r.x = damp(r.x, 2.5, 0.8, dt);
      r.leanVis = damp(r.leanVis, 0, 4, dt);
    }
  }

  // combat — presses during the cooldown QUEUE (briefly) and fire the moment
  // it ends, so mashing never feels dead; a fresh press replaces the queue.
  if (racing) {
    if (player.state === 'riding') {
      // queue INTENT ('primary'), not a resolved weapon — the weapon can be
      // stolen before the cooldown ends; tryAttack resolves at fire time
      if (input.punch) { player.pendAtk = 'primary'; player.pendAtkT = 0.6; }
      else if (input.kick) { player.pendAtk = 'kick'; player.pendAtkT = 0.6; }
      if (player.pendAtk && player.attackCd <= 0) {
        tryAttack(race, player, player.pendAtk);
        player.pendAtk = null; player.pendAtkT = 0;
      }
    }
    for (let i = 1; i < race.riders.length; i++) {
      const r = race.riders[i];
      if (r.ai.attack) {
        if (r.state === 'riding') tryAttack(race, r, r.ai.attack);
        r.ai.attack = null;
      }
    }
  }

  moveTraffic(race, dt);
  if (racing) collideWorld(race, dt);
  updateCops(race, dt, racing);
  updatePlaces(race, racing);
  if (racing) updateCombo(race, dt);
  updateIntensity(race, dt);
  checkFinish(race);
}

function tickTimers(r, dt) {
  if (r.attackCd > 0) r.attackCd -= dt;
  if (r.punchT > 0) r.punchT = Math.max(0, r.punchT - dt / PUNCH_ANIM);
  if (r.kickT > 0) r.kickT = Math.max(0, r.kickT - dt / PUNCH_ANIM);
  if (r.hitT > 0) r.hitT = Math.max(0, r.hitT - dt / HIT_FLINCH_TIME);
  if (r.scrapeCd > 0) r.scrapeCd -= dt;
  if (r.boostT > 0) r.boostT = Math.max(0, r.boostT - dt);
  if (r.pendAtkT > 0) { r.pendAtkT -= dt; if (r.pendAtkT <= 0) r.pendAtk = null; }
  if (r.ai && r.ai.tauntT > 0) r.ai.tauntT -= dt;
}

// ---------------------------------------------------------------------------
// Rider physics (shared player/AI)
// ---------------------------------------------------------------------------
function physicsStep(race, r, ctl, dt, racing) {
  const st = r.stats;
  const track = race.track;

  // FAKE LOOP: scripted up-and-over arc. Suppresses steering/lateral/collision
  // (airborne guards elsewhere skip car/prop hits) and advances s at the entry
  // speed so it reads as a launch, not a teleport. Camera barrel-rolls off loopT.
  if (r.loopT > 0) return loopStep(race, r, dt);
  if (track.loops && track.loops.length) {
    let li = r.loopI;
    while (li < track.loops.length && track.loops[li].s < r.s) li++;
    if (li < track.loops.length) {
      const lp = track.loops[li];
      const willCross = r.s + r.speed * dt >= lp.s;
      if (willCross) {
        r.loopI = li + 1;                  // consumed regardless (pass-under or launch)
        if (r.speed >= LOOP_MIN_SPEED) {
          r.loopT = LOOP_DUR; r.loopDur = LOOP_DUR;
          r.loopS0 = r.s; r.loopEntrySpeed = r.speed;
          r.airborne = true; r.vy = 0; r.skidding = false; r.slideT = 0;
          race.events.push({ type: 'loop', rider: r, phase: 'enter' });
          return loopStep(race, r, dt);
        }
      } else {
        r.loopI = li;                      // keep cursor parked at the next loop
      }
    } else {
      r.loopI = li;
    }
  }

  // BOOST PADS: on crossing into a boost zone, arm a timed boost once. boostI
  // walks past zones already behind us so this stays O(1) amortized per step.
  const zones = track.boostZones;
  if (zones && zones.length) {
    let bi = r.boostI;
    while (bi < zones.length && zones[bi].s1 < r.s) bi++;
    r.boostI = bi;
    // must actually be ON the pavement — no boost from the shoulder/barrier.
    // (A laterally-missed pad stays armed until s passes s1, so steering onto
    // it mid-zone still triggers.)
    if (bi < zones.length && r.s >= zones[bi].s0 && r.s <= zones[bi].s1
        && Math.abs(r.x) <= ROAD_HALF_W) {
      r.boostI = bi + 1;                   // one boost per zone entry, never per-step
      r.boostT = BOOST_TIME;
      race.events.push({ type: 'boost', rider: r });
    }
  }

  r.tucking = !!ctl.tuck && r.stamina > 0.5;
  // Regen always except while tucking — the old cooldown gate let a normal
  // punch cadence drain stamina to zero and silently lock out combat.
  if (r.tucking) r.stamina = Math.max(0, r.stamina - TUCK_STAMINA_DRAIN * dt);
  else r.stamina = Math.min(MAX_STAMINA, r.stamina + STAMINA_REGEN * dt);

  r.drafting = checkDraft(race, r);

  // lean builds smoothly toward steer
  const dLean = clamp(ctl.steer, -1, 1) - r.lean;
  const maxD = LEAN_RATE * dt;
  r.lean += clamp(dLean, -maxD, maxD);

  // longitudinal
  const rubber = r.ai ? r.ai.rubber : 0;
  const boosting = r.boostT > 0;
  const top = st.topSpeed * (r.tucking ? 1 + TUCK_TOP_BONUS : 1) * (boosting ? 1 + BOOST_TOP : 1) * (1 + rubber);
  let a = -DRAG_K * r.speed * r.speed;
  if (!r.airborne) {
    if (ctl.throttle > 0.02) {
      const f = r.speed / Math.max(top, 1);
      a += ctl.throttle * st.accel * (r.drafting ? 1 + DRAFT_ACCEL_BONUS : 1) * Math.max(0, 1 - f * f * f);
    } else {
      a -= ENGINE_BRAKE;
    }
    if (ctl.brake > 0.02) a -= BRAKE_DECEL * ctl.brake;
    if (boosting) a += BOOST_ACCEL;
  }
  // small grace band past the paint line so riding the edge isn't punished —
  // the drag kicks in once you're clearly onto the shoulder
  r.offroad = Math.abs(r.x) > ROAD_HALF_W + 0.4 && !r.airborne;
  if (r.offroad) a -= r.speed * OFFROAD_DRAG;
  r.speed = Math.max(0, r.speed + a * dt);

  // lateral: lean commands lateral speed, grip caps cornering
  sampleAt(track, r.s, SAMP);
  const curv = SAMP.curv;
  const roadY0 = SAMP.y;
  const spd = clamp(r.speed / 26, 0.15, 1);
  const auth = r.airborne ? AIR_CONTROL : r.skidding ? 0.45 : 1;
  r.vx = damp(r.vx, r.lean * STEER_VMAX * st.lean * spd * auth, 7, dt);

  // banked corners add grip: carry more speed through stadium/loop-track bends.
  const maxLat = CURVE_GRIP * GRAVITY * st.lean * GRIP_LAT * (r.offroad ? 0.55 : 1)
    * (1 + BANK_GRIP * Math.abs(SAMP.bank));
  const acv = Math.abs(curv);
  const safe = acv > 1e-5 ? Math.sqrt(maxLat / acv) : 1e9;
  if (!r.airborne && r.speed > safe) {
    const over = r.speed / safe - 1;
    r.skidding = true;
    r.speed = Math.max(0, r.speed - (6 + over * 22) * dt);
    r.vx += -Math.sign(curv) * (14 + over * 30) * dt;   // slide to the outside
    r.slideT += dt * (0.6 + over * 2.4);
    if (r.slideT > SLIDE_DOWN_T && over > 0.12) { knockdown(race, r, 'slide', null); return; }
  } else {
    r.slideT = Math.max(0, r.slideT - dt * 2.5);
    if (r.slideT <= 0) r.skidding = false;
  }
  if (!r.airborne && ctl.brake > 0.7 && Math.abs(r.lean) > 0.7 && r.speed > 14) r.skidding = true;

  const prevS = r.s;
  r.s += r.speed * dt;
  r.x += r.vx * dt;

  // barriers / world edge
  if (track.barriers) {
    const lim = ROAD_HALF_W + 1.5;
    if (r.x > lim || r.x < -lim) {
      const side = r.x > 0 ? 1 : -1;
      r.x = side * lim;
      r.vx *= -0.15;
      r.speed *= BARRIER_SCRAPE_SLOW;
      if (r.scrapeCd <= 0 && racing) {
        r.scrapeCd = 0.5;
        race.events.push({ type: 'scrape', rider: r, side, what: 'barrier' });
        if (r.isPlayer && !race.opts.god) r.bikeDamage = Math.min(MAX_BIKE_DMG, r.bikeDamage + BIKE_DMG_SCRAPE);
      }
    }
  } else {
    const lim = ROAD_HALF_W + SHOULDER_W;
    if (r.x > lim || r.x < -lim) { r.x = clamp(r.x, -lim, lim); r.vx = 0; }
  }

  // elevation: follow the road, launch off crests
  sampleAt(track, r.s, SAMP2);
  const ds = Math.max(r.s - prevS, 1e-6);
  const slope = (SAMP2.y - roadY0) / ds;
  if (r.airborne) {
    r.vy -= GRAVITY * dt;
    r.y += (r.vy - slope * r.speed) * dt;
    if (r.y <= 0) {
      r.y = 0; r.airborne = false;
      // only genuinely hard slams cost speed — designed ramp landings come in
      // around 8-10 m/s and should feel rewarding, not punitive
      if (r.vy < -11) r.speed = Math.max(0, r.speed - (-r.vy - 11) * 0.6);
      r.vy = 0;
    }
  } else {
    const dSlope = slope - r.slope;
    if (dSlope < 0 && r.speed > 16 && -dSlope * r.speed * r.speed / ds > GRAVITY * 2.6) {
      r.airborne = true;
      r.vy = Math.max(0, r.slope * r.speed) + 0.5;
      r.y = 0.01;
    } else if (r.offroad && r.speed > 12 && race.rng() < 0.004) {
      r.airborne = true; r.vy = 0.8 + race.rng() * 0.6; r.y = 0.01;  // dirt rumble hop
    }
  }
  r.slope = slope;

  r.leanVis = damp(r.leanVis, r.lean + (r.skidding ? clamp(-r.vx * 0.02, -0.3, 0.3) : 0), 10, dt);
}

// Scripted fake-loop step: advance at the entry speed, arc y up and back to 0
// over loopDur, hold x. Steering/lateral/collision are suppressed (r.airborne
// keeps the existing collision guards from firing). Camera reads loopT for the
// barrel roll; renderer reads y for the lift.
function loopStep(race, r, dt) {
  const track = race.track;
  r.loopT = Math.max(0, r.loopT - dt);
  r.s += r.loopEntrySpeed * dt;
  r.speed = r.loopEntrySpeed;
  r.vx = 0; r.lean = 0; r.skidding = false; r.tucking = false;
  // find the loop we're on to size the arc; radius drives launch height.
  const lp = track.loops[Math.min(r.loopI - 1, track.loops.length - 1)];
  const loopHeight = 2 * (lp ? lp.radius : 9);
  const frac = 1 - r.loopT / Math.max(r.loopDur, 1e-6);   // 0→1 through the loop
  r.y = Math.sin(Math.PI * clamp(frac, 0, 1)) * loopHeight;
  r.leanVis = damp(r.leanVis, 0, 6, dt);
  if (r.loopT <= 0) {
    r.loopT = 0; r.y = 0; r.vy = 0; r.airborne = false;
    // real gradient at the exit point — a fabricated slope=0 on a downhill
    // exit read as a crest drop and spuriously re-launched the rider
    sampleAt(track, r.s, SAMP);
    const yExit = SAMP.y;
    sampleAt(track, r.s - 1, SAMP);
    r.slope = yExit - SAMP.y;
    race.events.push({ type: 'loop', rider: r, phase: 'exit' });
  }
}

function checkDraft(race, r) {
  if (r.state !== 'riding' || r.speed < 8) return false;
  const riders = race.riders;
  for (let i = 0; i < riders.length; i++) {
    const o = riders[i];
    if (o === r || o.state === 'down' || o.state === 'running') continue;
    const ds = o.s - r.s;
    if (ds > 1.5 && ds < DRAFT_DIST && Math.abs(o.x - r.x) < DRAFT_X && o.speed > 8) return true;
  }
  const cars = race.traffic;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    if (c.dir < 0) continue;
    const ds = c.s - r.s;
    if (ds > 2 && ds < DRAFT_DIST + c.l * 0.5 && Math.abs(c.x - r.x) < DRAFT_X) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// AI
// ---------------------------------------------------------------------------
function aiControl(race, r, dt) {
  const ai = r.ai;
  ai.decideT -= dt;
  if (ai.decideT <= 0) { aiDecide(race, r); ai.decideT = 0.15 + race.rng() * 0.15; }
  CTL.steer = clamp((ai.targetX - r.x) * 0.3 - r.vx * 0.055, -1, 1);
  CTL.throttle = ai.throttle;
  CTL.brake = ai.brake;
  CTL.tuck = false;
}

function nearestRider(race, r, range) {
  let best = null, bd = range;
  const riders = race.riders;
  for (let i = 0; i < riders.length; i++) {
    const o = riders[i];
    if (o === r || o.state !== 'riding') continue;
    if (o.loopT > 0 || Math.abs(o.y - r.y) > 1.5) continue;   // can't fight someone mid-air
    const ds = Math.abs(o.s - r.s);
    if (ds < bd && Math.abs(o.x - r.x) < 8) { bd = ds; best = o; }
  }
  return best;
}

function aiDecide(race, r) {
  const ai = r.ai, rng = race.rng, player = race.riders[0];
  const look = Math.max(30, r.speed * 1.3);
  sampleAt(race.track, r.s + look, SAMP2);

  // racing line: hug the inside of the upcoming corner
  let tx = clamp(SAMP2.curv * 420, -1, 1) * 3.4;

  if (ai.personality === 'wildcard') {
    ai.burstT -= 0.25;
    if (rng() < 0.18) tx = (rng() * 2 - 1) * 5.5;                 // erratic lane pick
    if (ai.burstT <= 0 && rng() < 0.06) ai.burstT = 3 + rng() * 3; // aggression burst
  }

  // hunt a victim
  let victim = null;
  if (ai.grudge === 'player' && player.state === 'riding' && Math.abs(player.s - r.s) < 14) victim = player;
  else if (ai.personality === 'aggressive' || (ai.personality === 'wildcard' && ai.burstT > 0)) victim = nearestRider(race, r, 14);
  else if (ai.personality === 'dirty' && player.state === 'riding' && Math.abs(player.s - r.s) < 14) {
    victim = rng() < 0.7 ? player : nearestRider(race, r, 14);
  }
  if (victim) tx = clamp(victim.x + (rng() < 0.5 ? -0.6 : 0.6), -6, 6);

  // corner speed sense
  const acv = Math.abs(SAMP2.curv);
  const maxLat = CURVE_GRIP * GRAVITY * r.stats.lean * GRIP_LAT * (1 + BANK_GRIP * Math.abs(SAMP2.bank));
  const safeV = acv > 1e-5 ? Math.sqrt(maxLat / acv) * (0.88 + 0.18 * ai.skill) : 1e9;
  ai.throttle = 1; ai.brake = 0;
  if (r.speed > safeV) { ai.throttle = 0; if (r.speed > safeV * 1.12) ai.brake = 1; }

  // traffic avoidance: ~2s lookahead, brake-check when boxed in
  let blocked = false;
  const cars = race.traffic;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const rel = c.dir > 0 ? c.speed : -c.speed;
    const dsC = c.s - r.s;
    const closing = r.speed - rel;
    if (dsC < 2 || closing <= 0.5) continue;
    const tHit = dsC / closing;
    if (tHit > 2) continue;
    if (Math.abs(c.x - tx) < c.w * 0.5 + 1.6) {
      const passL = c.x - c.w * 0.5 - 2.0;
      const passR = c.x + c.w * 0.5 + 2.0;
      tx = passR > AI_LANE ? passL
        : passL < -AI_LANE ? passR
          : Math.abs(passL - r.x) < Math.abs(passR - r.x) ? passL : passR;
      if (tHit < 0.7 && Math.abs(c.x - r.x) < c.w * 0.5 + 1.2) blocked = true;
    }
  }
  if (blocked) { ai.throttle = 0; ai.brake = 1; }
  ai.targetX = clamp(tx, -AI_LANE, AI_LANE);

  // rubber-band around the player
  const gap = player.s - r.s;
  ai.rubber = gap > 0
    ? RUBBER_BEHIND_BOOST * Math.min(1, gap / RUBBER_RANGE)
    : -RUBBER_AHEAD_EASE * Math.min(1, -gap / RUBBER_RANGE);

  // fight decision
  if (race.status === 'racing' && r.attackCd <= 0 && r.stamina >= ATTACK_STAMINA) {
    const t = victim || nearestRider(race, r, ATTACK_RANGE_S + 1);
    if (t && t.state === 'riding' && Math.abs(t.s - r.s) < ATTACK_RANGE_S && Math.abs(t.x - r.x) < 3.6) {
      let ag = ai.aggression;
      if (ai.grudge && t.isPlayer) ag *= 1.6;
      if (ai.personality === 'wildcard' && ai.burstT > 0) ag *= 1.8;
      if (rng() < ag * 0.55) {
        ai.attack = r.weapon ? r.weapon
          : (ai.personality === 'dirty' && rng() < 0.6 ? 'kick' : 'punch');
      }
    }
  }

  if (ai.grudge === 'player' && ai.tauntT <= 0 && Math.abs(player.s - r.s) < 25 && rng() < 0.12) {
    taunt(race, r, 'grudge');
  }
}

function taunt(race, r, kind) {
  if (!r.ai || r.ai.tauntT > 0 || race.status !== 'racing') return;
  r.ai.tauntT = TAUNT_GAP;
  race.events.push({ type: 'taunt', rider: r, line: pickTaunt(r.ai.def, kind, race.rng) });
}

// ---------------------------------------------------------------------------
// Combat
// ---------------------------------------------------------------------------
function tryAttack(race, a, kind) {
  // Block only when the bar is essentially empty (LOW_STAMINA_ATTACK), so a
  // steady punch cadence never silently locks out; cost still can't go negative.
  if (a.attackCd > 0 || a.stamina < LOW_STAMINA_ATTACK || a.state !== 'riding') return;
  if (a.loopT > 0) return;   // no swinging mid-loop (and don't burn stamina/cooldown)
  // Re-resolve the weapon at FIRE time: a queued/AI attack can carry a stale
  // kind after the weapon was stolen ('primary' = whatever is held right now).
  if (kind === 'primary') kind = a.weapon || 'punch';
  else if ((kind === 'club' || kind === 'chain') && a.weapon !== kind) kind = 'punch';
  a.attackCd = ATTACK_COOLDOWN;
  a.stamina = Math.max(0, a.stamina - ATTACK_STAMINA);
  if (kind === 'kick') a.kickT = 1; else a.punchT = 1;

  const rangeX = kind === 'club' || kind === 'chain' ? WEAPON_RANGE_X[kind] : ATTACK_RANGE_X;
  let t = null, best = 1e9;
  const riders = race.riders;
  for (let i = 0; i < riders.length; i++) {
    const o = riders[i];
    if (o === a || o.state !== 'riding') continue;
    if (o.loopT > 0 || Math.abs(o.y - a.y) > 1.5) continue;   // no punching across altitude
    const ds = Math.abs(o.s - a.s), dx = Math.abs(o.x - a.x);
    if (ds <= ATTACK_RANGE_S && dx <= rangeX && ds + dx < best) { best = ds + dx; t = o; }
  }
  a.attackSide = t ? (t.x >= a.x ? 1 : -1) : (a.lean >= 0 ? 1 : -1);
  const hit = !!t && t.hitT <= 0;
  race.events.push({ type: 'attack', rider: a, target: t, kind, hit });
  if (Math.abs(a.s - race.riders[0].s) < 30) race.combatHeat = COMBAT_HEAT_TIME;
  if (!hit) return;

  if (kind === 'punch' && t.weapon && !a.weapon && race.rng() < WEAPON_STEAL_CHANCE) {
    a.weapon = t.weapon; t.weapon = null;
    race.events.push({ type: 'steal', rider: a, from: t, weapon: a.weapon });
  }
  const dmg = kind === 'punch' ? PUNCH_DMG : kind === 'kick' ? KICK_DMG : WEAPON_DMG[kind];
  const side = t.x >= a.x ? 1 : -1;
  t.vx += side * (kind === 'kick' ? KICK_SHOVE : PUNCH_SHOVE);
  t.hitT = 1;
  if (!(t.isPlayer && race.opts.god)) t.health = Math.max(0, t.health - dmg);
  race.events.push({
    type: 'hit', rider: t, from: a, dmg,
    weapon: kind === 'punch' || kind === 'kick' ? null : kind,
  });
  if (!t.isPlayer && a.isPlayer && t.ai && t.ai.tauntT <= 0 && race.rng() < 0.35) taunt(race, t, 'hit');
  if (t.health <= 0) knockdown(race, t, 'combat', a);
}

function knockdown(race, r, cause, by) {
  if (r.state !== 'riding') return;
  if (r.isPlayer && race.opts.god) { r.speed *= 0.6; r.health = MAX_HEALTH; return; }
  // going down mid-loop cancels the scripted arc — otherwise loopT freezes
  // (camera stuck mid-barrel-roll) and a phantom half-loop replays at remount
  if (r.loopT > 0) {
    r.loopT = 0; r.loopDur = 0; r.loopEntrySpeed = 0;
    race.events.push({ type: 'loop', rider: r, phase: 'exit' });
  }
  r.state = 'down';
  r.tumbleT = 0;
  r.downS = r.s;
  r.bikeS = r.s + BIKE_SKID_AHEAD[0] + race.rng() * (BIKE_SKID_AHEAD[1] - BIKE_SKID_AHEAD[0]);
  r.bikeX = clamp(r.x + (race.rng() * 2 - 1) * 2, -(ROAD_HALF_W + 2), ROAD_HALF_W + 2);
  r.speed *= KNOCKDOWN_SPEED_KEEP;
  r.vx = 0; r.airborne = false; r.y = 0; r.vy = 0;
  r.skidding = false; r.tucking = false; r.drafting = false;
  r.slideT = 0; r.lean = 0;
  if (r.isPlayer) r.bikeDamage = Math.min(MAX_BIKE_DMG, r.bikeDamage + BIKE_DMG_CRASH);
  race.events.push({ type: 'down', rider: r, cause, by: by || null });

  if (by && by.isPlayer && !r.isPlayer) {
    race.grudgeDelta[r.id] = (race.grudgeDelta[r.id] || 0) + 1;
    race.playerKnockdowns++;
    if (r.ai) { r.ai.grudge = 'player'; r.ai.aggression = Math.min(1, r.ai.aggression + 0.15); }
    if (race.status === 'racing') comboEvent(race, 'knockdown', SCORE_KNOCKDOWN);
  } else if (by && !by.isPlayer && r.isPlayer) {
    race.grudgeDelta[by.id] = (race.grudgeDelta[by.id] || 0) - 1;
    taunt(race, by, 'knockdown');
  }
  if (r.isPlayer && r.bikeDamage >= MAX_BIKE_DMG && race.status === 'racing') {
    race.events.push({ type: 'wrecked' });
    endRace(race, 'wrecked');
  }
}

function runStep(race, r, input, dt) {
  const run = r.isPlayer ? (input.throttle > 0.3 ? RUN_SPEED : RUN_SPEED_IDLE) : RUN_SPEED;
  r.speed = run;
  const ds = r.bikeS - r.s, dx = r.bikeX - r.x;
  const dist = Math.sqrt(ds * ds + dx * dx);
  if (dist < 1.2) {
    r.state = 'riding';
    r.s = r.bikeS; r.x = r.bikeX;
    r.health = Math.max(r.health, REMOUNT_HEALTH);
    r.speed = 3;     // paddling start
    r.hitT = 0; r.tumbleT = 0; r.slideT = 0; r.lean = 0; r.vx = 0;
    race.events.push({ type: 'remount', rider: r });
  } else {
    r.s += (ds / dist) * run * dt;
    r.x += (dx / dist) * run * dt;
  }
}

// ---------------------------------------------------------------------------
// Traffic & collisions
// ---------------------------------------------------------------------------
function moveTraffic(race, dt) {
  const cars = race.traffic, ps = race.riders[0].s;
  for (let i = cars.length - 1; i >= 0; i--) {
    const c = cars[i];
    c.s += c.dir * c.speed * dt;
    c.x = c.baseX + Math.sin(race.time * 0.7 + c.wob) * 0.22;
    if (Math.abs(c.s - ps) > TRAFFIC_WINDOW * 1.15) { cars[i] = cars[cars.length - 1]; cars.pop(); }
  }
  race.trafficT -= dt;
  if (race.trafficT <= 0) {
    race.trafficT = 0.5;
    while (cars.length < race.trafficTarget) spawnCar(race, false);
  }
}

function collideWorld(race, dt) {
  const riders = race.riders, cars = race.traffic;

  // rider vs car
  for (let i = 0; i < riders.length; i++) {
    const r = riders[i];
    if (r.state !== 'riding') continue;
    if (r.airborne) continue;          // jumping over traffic clears it (a core mechanic)
    for (let j = 0; j < cars.length; j++) {
      const c = cars[j];
      const ds = r.s - c.s;
      if (ds > c.l * 0.5 + 1 || ds < -(c.l * 0.5 + 1)) continue;
      const dx = r.x - c.x;
      if (dx > c.w * 0.5 + 0.6 || dx < -(c.w * 0.5 + 0.6)) continue;
      const closing = r.speed - (c.dir > 0 ? c.speed : -c.speed);
      if (closing >= CRASH_CLOSING_SPEED) {
        knockdown(race, r, 'crash', null);
        break;
      }
      // scrape: shove out, slow down
      const side = dx >= 0 ? 1 : -1;
      r.x = c.x + side * (c.w * 0.5 + 0.7);
      r.vx = side * 2;
      if (r.scrapeCd <= 0) {
        r.scrapeCd = 0.4;
        r.speed = Math.max(c.dir > 0 ? c.speed * 0.9 : 4, r.speed * CAR_HIT_SLOW);
        race.events.push({ type: 'scrape', rider: r, side, what: 'car' });
        if (r.isPlayer && !race.opts.god) r.bikeDamage = Math.min(MAX_BIKE_DMG, r.bikeDamage + BIKE_DMG_SCRAPE);
      }
      break;
    }
  }

  // rider vs rider bumps
  for (let i = 0; i < riders.length; i++) {
    const a = riders[i];
    if (a.state !== 'riding') continue;
    for (let j = i + 1; j < riders.length; j++) {
      const b = riders[j];
      if (b.state !== 'riding') continue;
      const ds = a.s - b.s;
      if (ds > 1.8 || ds < -1.8) continue;
      const dx = a.x - b.x;
      if (dx > 1.2 || dx < -1.2) continue;
      const side = dx >= 0 ? 1 : -1;
      a.vx += side * RIDER_BUMP_SHOVE;
      b.vx -= side * RIDER_BUMP_SHOVE;
      a.x += side * 0.08; b.x -= side * 0.08;
      if (a.scrapeCd <= 0 || b.scrapeCd <= 0) {
        a.scrapeCd = 0.35; b.scrapeCd = 0.35;
        race.events.push({ type: 'scrape', rider: a.isPlayer || b.isPlayer ? (a.isPlayer ? a : b) : a, side, what: 'rider' });
      }
    }
  }
}

function propCollide(race, r, racing) {
  const props = race.track.props;
  let i = r.propI;
  while (i < props.length && props[i].s < r.s - 3) i++;
  r.propI = i;
  if (r.airborne) return;              // jumping clears props too
  for (; i < props.length; i++) {
    const p = props[i];
    if (p.s > r.s + 3) break;
    if (!p.collide) continue;
    const ds = r.s - p.s, dx = r.x - p.x;
    if (ds * ds + dx * dx > OBSTACLE_R * OBSTACLE_R) continue;
    if (r.speed > 7 && racing) {
      knockdown(race, r, 'obstacle', null);
    } else {
      r.speed = 0;
      r.x = p.x + (dx >= 0 ? OBSTACLE_R : -OBSTACLE_R);
    }
    break;
  }
}

// ---------------------------------------------------------------------------
// Cops
// ---------------------------------------------------------------------------
function updateCops(race, dt, racing) {
  const cops = race.cops;
  if (!cops.length) return;
  const player = race.riders[0];

  if (racing && !race.copChase) {
    // "cops chase when YOU fight in view" — only trigger on combat that
    // involves the player (their swing, or a rival attacking them), and that
    // the player is close enough to be seen brawling. A rival-vs-rival scuffle
    // across the map no longer summons a chase on the player.
    let combatS = -1;
    const evs = race.events;
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.type !== 'attack') continue;
      const involvesPlayer = ev.rider.isPlayer || (ev.target && ev.target.isPlayer);
      if (involvesPlayer && Math.abs(ev.rider.s - player.s) < COP_SIGHT_S) {
        combatS = ev.rider.s; break;
      }
    }
    if (combatS >= 0) {
      for (let i = 0; i < cops.length; i++) {
        if (Math.abs(cops[i].s - combatS) < COP_SIGHT_S) {
          race.copChase = true;
          for (let j = 0; j < cops.length; j++) cops[j].state = 'chase';
          race.events.push({ type: 'cop', on: true });
          break;
        }
      }
    }
  }

  let minGap = Infinity;
  for (let i = 0; i < cops.length; i++) {
    const cop = cops[i];
    if (cop.state !== 'chase') continue;
    const gap = player.s - cop.s;
    if (gap < -40) cop.speed = damp(cop.speed, Math.max(0, player.speed - 4), 1.4, dt);
    else cop.speed = damp(cop.speed, COP_TOP_SPEED, 0.5, dt);
    cop.s += cop.speed * dt;
    cop.x = damp(cop.x, player.x, 1.5, dt);
    const ag = Math.abs(gap);
    if (ag < minGap) minGap = ag;
  }

  if (race.copChase) {
    if (minGap > COP_ESCAPE_DIST) {
      race.copChase = false;
      for (let i = 0; i < cops.length; i++) { cops[i].state = 'idle'; cops[i].speed = 0; }
      race.events.push({ type: 'cop', on: false });
    } else if (racing && !race.opts.god && (player.state === 'down' || player.state === 'running')) {
      for (let i = 0; i < cops.length; i++) {
        const cop = cops[i];
        if (cop.state === 'chase' && Math.abs(cop.s - player.s) < COP_ARREST_DIST && Math.abs(cop.x - player.x) < 7) {
          race.events.push({ type: 'busted' });
          endRace(race, 'busted');
          break;
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Places / combo / finish
// ---------------------------------------------------------------------------
function updatePlaces(race, racing) {
  const riders = race.riders;
  ORDER.length = 0;
  for (let i = 0; i < riders.length; i++) ORDER.push(riders[i]);
  // insertion sort: finished (by time) first, then by s
  for (let i = 1; i < ORDER.length; i++) {
    const r = ORDER[i];
    let j = i - 1;
    while (j >= 0 && laterThan(ORDER[j], r)) { ORDER[j + 1] = ORDER[j]; j--; }
    ORDER[j + 1] = r;
  }
  for (let i = 0; i < ORDER.length; i++) ORDER[i].place = i + 1;

  // overtake detection vs player
  const player = riders[0];
  for (let i = 1; i < riders.length; i++) {
    const r = riders[i];
    const ahead = r.s > player.s;
    if (ahead !== r.wasAhead && racing && player.state !== 'finished' && r.state !== 'finished') {
      if (ahead) {
        race.events.push({ type: 'overtake', rider: r, target: player });
        if (race.rng() < 0.65) taunt(race, r, 'overtake');
      } else {
        race.events.push({ type: 'overtake', rider: player, target: r });
      }
    }
    r.wasAhead = ahead;
  }
}

function laterThan(a, b) { // true if a places worse than b
  const af = a.state === 'finished', bf = b.state === 'finished';
  if (af && bf) return a.finishTime > b.finishTime;
  if (af !== bf) return bf;
  return a.s < b.s;
}

function comboEvent(race, kind, points) {
  const combo = race.combo;
  combo.mult = Math.min(COMBO_MAX, combo.mult + COMBO_STEP);
  combo.timer = COMBO_DECAY;
  combo.score += points * combo.mult;
  if (combo.mult > combo.best) combo.best = combo.mult;
  race.events.push({ type: 'combo', kind, mult: combo.mult });
}

function updateCombo(race, dt) {
  const player = race.riders[0], combo = race.combo;
  const cars = race.traffic;
  for (let i = 0; i < cars.length; i++) {
    const c = cars[i];
    const rel = c.s > player.s ? 1 : -1;
    if (rel < 0 && c.rel > 0 && !c.nm && player.state === 'riding' && player.speed >= NEARMISS_MIN_SPEED) {
      const gap = Math.abs(player.x - c.x) - c.w * 0.5;
      if (gap > 0 && gap < NEARMISS_DIST) { c.nm = true; comboEvent(race, 'nearmiss', SCORE_NEARMISS); }
    }
    c.rel = rel;
  }
  if (player.drafting && player.state === 'riding') {
    player.draftT += dt;
    if (player.draftT >= 1) { player.draftT -= 1; comboEvent(race, 'draft', SCORE_DRAFT_PER_S); }
  } else {
    player.draftT = 0;
  }
  if (combo.timer > 0) {
    combo.timer -= dt;
    if (combo.timer <= 0 && combo.mult > 1) {
      combo.mult = 1;
      race.events.push({ type: 'combo_break' });
    }
  }
}

function updateIntensity(race, dt) {
  const player = race.riders[0];
  race.combatHeat = Math.max(0, race.combatHeat - dt);
  const sf = player.speed / player.stats.topSpeed;
  const spdI = clamp((sf - MUSIC_INTENSITY_SPEED) / (1 - MUSIC_INTENSITY_SPEED), 0, 1);
  race.intensity = damp(race.intensity, Math.max(spdI, race.combatHeat > 0 ? 1 : 0), 3, dt);
}

function checkFinish(race) {
  const riders = race.riders;
  for (let i = 0; i < riders.length; i++) {
    const r = riders[i];
    if (r.state === 'riding' && r.s >= race.finishS) {
      r.state = 'finished';
      r.finishTime = race.time;
      race.events.push({ type: 'finish', rider: r, place: r.place });
      if (r.isPlayer && race.status === 'racing') endRace(race, 'finish');
    }
  }
}

function endRace(race, cause) {
  if (race.result) return;
  const player = race.riders[0];
  const place = player.place;
  let payout = 0;
  if (cause === 'finish') {
    payout = place <= PAYOUTS.length ? PAYOUTS[place - 1] * race.level : FINISH_PAY_OTHER;
  }
  const scoreCash = Math.round(race.combo.score * SCORE_CASH_RATE);
  const fee = cause === 'wrecked' ? REPAIR_FEE * race.level
    : cause === 'busted' ? BUSTED_FINE * race.level : 0;
  race.result = { place, cause, payout, scoreCash, fee };
  race.status = 'over';
  race.events.push({ type: 'race_over', place, cause, payout, scoreCash, fee });
}

// internals exposed for tests only
export const _test = { tryAttack, knockdown, physicsStep, aiDecide, endRace, collideWorld, propCollide, updateCops };
