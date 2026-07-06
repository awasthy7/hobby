// config.js — every tuning constant, data table, and the shared state contract.
// ALL modules import from here. No module invents its own magic numbers for
// anything listed below, and no module reads/writes race-state fields that are
// not documented in the typedefs at the bottom of this file.

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
export const STEP = 1 / 120;          // fixed sim timestep (s)
export const MPH = 2.23694;           // m/s → mph for the HUD
export const RIDER_COUNT = 8;         // player + 7 rivals
export const COUNTDOWN = 3.2;         // seconds before GO (race.time starts at -COUNTDOWN)

// Road (all meters). x is lateral: negative = left (oncoming lanes), positive = right.
export const ROAD_HALF_W = 7.2;       // paved half-width; centre line at x=0
export const SHOULDER_W = 4.5;        // rideable dirt beyond pavement (slow, bumpy)
export const OFFROAD_DRAG = 0.35;     // extra drag factor while on shoulder
export const PROP_MIN_X = ROAD_HALF_W + 2.5; // props never spawn closer than this

// Bike physics
export const GRAVITY = 9.8;
export const STEER_VMAX = 26;         // max lateral speed (m/s) at full lean, full speed
export const LEAN_RATE = 3.4;         // how fast lean builds (1/s)
export const BRAKE_DECEL = 26;        // m/s^2
export const ENGINE_BRAKE = 3.5;      // m/s^2 when coasting
export const DRAG_K = 0.0022;         // quadratic drag: a = DRAG_K * v^2
export const TUCK_TOP_BONUS = 0.10;   // +10% top speed while boosting (Shift tuck)
export const TUCK_STAMINA_DRAIN = 4;  // stamina/s while tucking
export const DRAFT_DIST = 9;          // m behind a vehicle/rider to draft
export const DRAFT_X = 1.6;           // lateral window for drafting
export const DRAFT_ACCEL_BONUS = 0.5; // +50% accel while drafting
export const CURVE_GRIP = 0.92;       // fraction of ideal curve speed before sliding out
export const AIR_CONTROL = 0.3;       // steering effectiveness while airborne

// Combat
export const ATTACK_RANGE_S = 4.0;    // longitudinal reach (m)
export const ATTACK_RANGE_X = 2.8;    // lateral reach (m)
export const PUNCH_DMG = 13;
export const KICK_DMG = 9;
export const KICK_SHOVE = 3.2;        // lateral m/s applied to target
export const PUNCH_SHOVE = 1.4;
export const WEAPON_DMG = { club: 24, chain: 19 };
export const WEAPON_RANGE_X = { club: 3.2, chain: 4.0 };
export const WEAPON_STEAL_CHANCE = 0.45; // punching a weapon-holder can steal it
export const ATTACK_COOLDOWN = 0.5;   // s between attacks
export const ATTACK_STAMINA = 12;     // stamina cost per swing
export const STAMINA_REGEN = 26;      // stamina/s (regenerates always except while tucking)
export const LOW_STAMINA_ATTACK = 5;  // below this, swings are blocked (so you can never fully lock out)
export const HIT_FLINCH_TIME = 0.35;  // attacker cannot be counter-hit window / target flinch
export const MAX_HEALTH = 100;
export const MAX_STAMINA = 100;
export const KNOCKDOWN_SPEED_KEEP = 0.35; // bike keeps this fraction of speed, skids ahead
export const DOWN_TIME = 1.4;         // s ragdolling before auto-run starts
export const RUN_SPEED = 6.5;         // m/s running back to bike (throttle held = RUN_SPEED)
export const RUN_SPEED_IDLE = 3.5;    // m/s if throttle not held
export const REMOUNT_HEALTH = 55;     // health restored to at remount (never above current+)
export const BIKE_SKID_AHEAD = [18, 34]; // bike comes to rest this far ahead of fall point

// Collisions
export const CRASH_CLOSING_SPEED = 16;  // m/s closing speed with traffic → wipeout
export const SCRAPE_CLOSING_SPEED = 16; // below this → scrape (sparks + slow)
export const CAR_HIT_SLOW = 0.55;       // speed multiplier on scrape with car
export const RIDER_BUMP_SHOVE = 2.0;    // lateral m/s when riders touch
export const OBSTACLE_R = 1.6;          // prop collision radius (m)
export const BARRIER_SCRAPE_SLOW = 0.988; // per-step speed multiplier while grinding barrier
export const BIKE_DMG_CRASH = 22;       // bike damage per wipeout
export const BIKE_DMG_SCRAPE = 2;       // per scrape event
export const MAX_BIKE_DMG = 100;        // at 100 → WRECKED, race over

// Traffic
export const TRAFFIC_WINDOW = 700;    // m around player where traffic exists
export const TRAFFIC_SPEEDS = [14, 22]; // min/max car speed m/s
export const TRAFFIC_KINDS = ['sedan', 'pickup', 'van', 'bus'];
export const TRAFFIC_DIMS = {         // {w: full width, l: full length} meters
  sedan: { w: 1.9, l: 4.6 }, pickup: { w: 2.0, l: 5.4 },
  van: { w: 2.1, l: 5.2 }, bus: { w: 2.5, l: 11.0 },
};

// Cops
export const COP_SIGHT_S = 75;        // combat within this range of a cop → chase
export const COP_ARREST_DIST = 9;     // cop this close to a downed/running player → busted
export const COP_ESCAPE_DIST = 380;   // gap that ends a chase
export const COP_TOP_SPEED = 56;      // m/s — outrunnable on bike 2+, barely on bike 1 tucked

// Scoring / combo (player only)
export const NEARMISS_DIST = 1.7;     // lateral gap to count a near-miss
export const NEARMISS_MIN_SPEED = 22; // m/s
export const COMBO_DECAY = 4.0;       // s without an event → combo breaks
export const COMBO_STEP = 0.25;       // multiplier gained per event
export const COMBO_MAX = 5.0;
export const SCORE_NEARMISS = 120;
export const SCORE_DRAFT_PER_S = 40;
export const SCORE_KNOCKDOWN = 500;
export const SCORE_CASH_RATE = 0.02;  // $ per score point, paid at race end

// Rubber-band AI
export const RUBBER_BEHIND_BOOST = 0.14; // rival far behind player gets up to +14% speed
export const RUBBER_AHEAD_EASE = 0.07;   // rival far ahead eases up to −7%
export const RUBBER_RANGE = 320;         // m over which rubber-banding scales

// ---------------------------------------------------------------------------
// Career
// ---------------------------------------------------------------------------
export const LEVEL_COUNT = 9;
export const RACES_PER_LEVEL = 3;
export const START_CASH = 3000;          // enough to feel the shop from the start

export const PAYOUTS = [1400, 900, 550];  // 1st/2nd/3rd, multiplied by level number
export const FINISH_PAY_OTHER = 150;      // 4th+ finisher consolation (flat)
export const REPAIR_FEE = 300;            // × level, charged when WRECKED
export const BUSTED_FINE = 450;           // × level
export const QUALIFY_PLACE = 3;           // top-3 advances to next race

// Five tiers now — each is a clear, felt jump in top speed and acceleration.
// Rival stat-blending (sim.js) anchors on rat250 (slowest) and titan1200 (fastest).
export const BIKES = [
  {
    id: 'rat250', name: 'RAT 250', price: 0,
    topSpeed: 40, accel: 8.5, lean: 1.0, tough: 1.0, weight: 1.0,
    color: 0x8a2020, desc: 'It starts. Usually.',
  },
  {
    id: 'kestrel600', name: 'KESTREL 600', price: 3800,
    topSpeed: 52, accel: 12.0, lean: 1.18, tough: 1.25, weight: 1.1,
    color: 0x2255cc, desc: 'Half falcon, half debt.',
  },
  {
    id: 'widow900', name: 'WIDOWMAKER 900', price: 11000,
    topSpeed: 64, accel: 15.5, lean: 1.35, tough: 1.5, weight: 1.25,
    color: 0x111114, desc: 'The name is a promise.',
  },
  {
    id: 'volt1000', name: 'VOLT 1000', price: 24000,
    topSpeed: 76, accel: 19.0, lean: 1.5, tough: 1.7, weight: 1.3,
    color: 0x18c0d8, desc: 'Electric. Silent. Merciless.',
  },
  {
    id: 'titan1200', name: 'TITAN 1200', price: 44000,
    topSpeed: 90, accel: 23.0, lean: 1.62, tough: 2.0, weight: 1.4,
    color: 0xd8a018, desc: 'The last bike you will ever want.',
  },
];

// Per-level difficulty knobs (index 0 = level 1). Must stay LEVEL_COUNT long
// and aligned 1:1 with TRACKS.
export const LEVELS = [
  { trafficPerKm: 5,  copCount: 0, rivalSkill: 0.55 },   // 1 coast
  { trafficPerKm: 7,  copCount: 1, rivalSkill: 0.66 },   // 2 desert
  { trafficPerKm: 9,  copCount: 1, rivalSkill: 0.76 },   // 3 redwood
  { trafficPerKm: 11, copCount: 2, rivalSkill: 0.86 },   // 4 city
  { trafficPerKm: 13, copCount: 2, rivalSkill: 0.92 },   // 5 storm
  { trafficPerKm: 8,  copCount: 1, rivalSkill: 0.8 },    // 6 beach
  { trafficPerKm: 6,  copCount: 0, rivalSkill: 0.9 },    // 7 mountain (few cars, technical)
  { trafficPerKm: 3,  copCount: 0, rivalSkill: 0.94 },   // 8 hotwheels (toy track, almost no traffic)
  { trafficPerKm: 2,  copCount: 0, rivalSkill: 1.0 },    // 9 trackmania (stadium, pure racing)
];

// ---------------------------------------------------------------------------
// Tracks & themes
// ---------------------------------------------------------------------------
// Visual palettes are shared: tracks.js uses geometry params, render/* uses colors.
export const THEMES = {
  coast: {
    name: 'Pacific Coast',
    skyTop: 0x2a5d9e, skyBottom: 0xffb36b, sunColor: 0xffd9a0,
    sunDir: [-0.55, 0.28, -0.75],          // low golden sun, off to the left
    hemiSky: 0x9db8d9, hemiGround: 0x5a4a38, ambient: 0.55,
    fogColor: 0xe8b98a, fogDensity: 0.0028,
    roadColor: 0x35343c, stripeColor: 0xd8c46a, shoulderColor: 0x9a7f56,
    terrainColor: 0x6f8a4f, terrainFar: 0x3f5a7a,
    props: ['palm', 'rock', 'sign'], propPerKm: 70, barriers: false,
    water: true, night: false,
  },
  desert: {
    name: 'Mojave Run',
    skyTop: 0x6a3f8e, skyBottom: 0xff8e4d, sunColor: 0xffb066,
    sunDir: [0.6, 0.22, -0.75],
    hemiSky: 0xc9a0d9, hemiGround: 0x7a5030, ambient: 0.5,
    fogColor: 0xdd9a6a, fogDensity: 0.0022,
    roadColor: 0x3a3438, stripeColor: 0xd8c46a, shoulderColor: 0xb08a58,
    terrainColor: 0xb5854e, terrainFar: 0x8a4f6a,
    props: ['cactus', 'rock', 'sign'], propPerKm: 55, barriers: false,
    water: false, night: false,
  },
  redwood: {
    name: 'Redwood Pass',
    skyTop: 0x1e3a4a, skyBottom: 0xc97a3a, sunColor: 0xe8a060,
    sunDir: [-0.4, 0.18, -0.85],
    hemiSky: 0x5a7a6a, hemiGround: 0x2a3020, ambient: 0.42,
    fogColor: 0x9a8a6a, fogDensity: 0.0042,
    roadColor: 0x2e2d33, stripeColor: 0xc8b45a, shoulderColor: 0x6a5a40,
    terrainColor: 0x3a5a34, terrainFar: 0x22382e,
    props: ['redwood', 'rock', 'fern'], propPerKm: 120, barriers: false,
    water: false, night: false,
  },
  city: {
    name: 'Neon Sprawl',
    skyTop: 0x0a0a1e, skyBottom: 0x3a1a4e, sunColor: 0x8a7ae8,
    sunDir: [0.3, 0.5, -0.8],               // cold moon
    hemiSky: 0x4a3a7a, hemiGround: 0x18141e, ambient: 0.3,
    fogColor: 0x1a1030, fogDensity: 0.0036,
    roadColor: 0x232228, stripeColor: 0xe8e05a, shoulderColor: 0x2e2c34,
    terrainColor: 0x14121a, terrainFar: 0x0c0a12,
    props: ['building', 'lamppost', 'sign'], propPerKm: 140, barriers: true,
    water: false, night: true,
  },
  storm: {
    name: 'Sierra Storm',
    skyTop: 0x26303e, skyBottom: 0x8a7a5a, sunColor: 0xc8c0a8,
    sunDir: [-0.2, 0.35, -0.9],
    hemiSky: 0x6a7a8a, hemiGround: 0x3a3a34, ambient: 0.4,
    fogColor: 0x8a8a80, fogDensity: 0.005,
    roadColor: 0x2a2a30, stripeColor: 0xc8c46a, shoulderColor: 0x6a6a58,
    terrainColor: 0x4f5a44, terrainFar: 0x2e3640,
    props: ['pine', 'rock', 'sign'], propPerKm: 95, barriers: true,
    water: false, night: false, rain: true,
  },

  // --- new themes (levels 6-9) -------------------------------------------
  beach: {
    name: 'Sunset Strand',
    skyTop: 0x1f6fae, skyBottom: 0xffd08a, sunColor: 0xfff0c8,
    sunDir: [0.5, 0.16, -0.82],             // low sun skimming the water
    hemiSky: 0xbfe0f0, hemiGround: 0xd8c090, ambient: 0.62,
    fogColor: 0xf2d4a6, fogDensity: 0.0024,
    roadColor: 0x3a3a40, stripeColor: 0xf0e0a0, shoulderColor: 0xe0cf94,
    terrainColor: 0xe8d29a, terrainFar: 0x4a9cc0,   // sand → sea
    props: ['palm', 'umbrella', 'sign'], propPerKm: 85, barriers: false,
    water: true, night: false,
    bankFactor: 0.15, boostPads: false,
  },
  mountain: {
    name: 'Highland Climb',
    skyTop: 0x2a6ab0, skyBottom: 0xcfe4e0, sunColor: 0xffefc0,
    sunDir: [-0.5, 0.42, -0.7],
    hemiSky: 0xa8c8d8, hemiGround: 0x4a5838, ambient: 0.5,
    fogColor: 0xc8d6d0, fogDensity: 0.0032,
    roadColor: 0x33322f, stripeColor: 0xe0d090, shoulderColor: 0x7a6f4c,
    terrainColor: 0x5a7040, terrainFar: 0x6a7f9a,   // green slopes → far peaks
    props: ['pine', 'rock', 'barn', 'sign'], propPerKm: 110, barriers: false,
    water: false, night: false,
    bankFactor: 0.2, boostPads: false,
  },
  hotwheels: {
    name: 'Orange Track',
    skyTop: 0x1a4ec8, skyBottom: 0x7ac8ff, sunColor: 0xffffff,
    sunDir: [0.35, 0.55, -0.6],
    hemiSky: 0x8fd0ff, hemiGround: 0x2a2a3a, ambient: 0.7,
    fogColor: 0x8fd0ff, fogDensity: 0.0016,
    roadColor: 0xc85410, stripeColor: 0xffffff, shoulderColor: 0x1030a0,   // mid-orange base lights to plastic; blue clip rails
    terrainColor: 0x2a8f4a, terrainFar: 0x1a5a8a,
    props: ['cone', 'toyblock', 'loopprop', 'sign'], propPerKm: 60, barriers: true,
    water: false, night: false,
    bankFactor: 0.6, boostPads: true, loops: true, toy: true,
  },
  trackmania: {
    name: 'Stadium',
    skyTop: 0x101a3a, skyBottom: 0x3a4a8a, sunColor: 0xffffff,
    sunDir: [0.2, 0.8, -0.55],              // stadium floodlight, near-overhead
    hemiSky: 0x4a5a9a, hemiGround: 0x1a1c26, ambient: 0.45,
    fogColor: 0x141a30, fogDensity: 0.0026,
    roadColor: 0x2b2f3a, stripeColor: 0xf0f040, shoulderColor: 0xd02040,   // grey deck + red kerbs
    terrainColor: 0x14161e, terrainFar: 0x0c0e14,
    props: ['pillar', 'grandstand', 'loopprop', 'sign'], propPerKm: 120, barriers: true,
    water: false, night: true,
    bankFactor: 0.95, boostPads: true, loops: true,
  },
};

// One track definition per level; each of the 3 races per level is a variant
// (seed offset → different curves, longer each race).
// features: authored stunt placements as fractions of track length (0..1) so
// they scale with race length. kind 'ramp' (big jump), 'loop' (fake loop),
// 'boost' (speed pad). tracks.js resolves fractions → arc-length s.
export const TRACKS = [
  { id: 'coast',   theme: 'coast',   seed: 101, lengthBase: 3600, curviness: 0.55, hilliness: 0.5 },
  { id: 'desert',  theme: 'desert',  seed: 202, lengthBase: 4000, curviness: 0.4,  hilliness: 0.35 },
  { id: 'redwood', theme: 'redwood', seed: 303, lengthBase: 4200, curviness: 0.8,  hilliness: 0.7 },
  { id: 'city',    theme: 'city',    seed: 404, lengthBase: 4400, curviness: 0.65, hilliness: 0.25 },
  { id: 'storm',   theme: 'storm',   seed: 505, lengthBase: 4800, curviness: 0.9,  hilliness: 0.9 },
  // --- levels 6-9 ---
  { id: 'beach',   theme: 'beach',   seed: 606, lengthBase: 4200, curviness: 0.5,  hilliness: 0.3,
    features: [{ kind: 'boost', at: 0.3 }, { kind: 'ramp', at: 0.55, height: 3.2 }, { kind: 'boost', at: 0.78 }] },
  { id: 'mountain', theme: 'mountain', seed: 707, lengthBase: 4600, curviness: 0.95, hilliness: 1.0,
    features: [{ kind: 'ramp', at: 0.4, height: 4.0 }, { kind: 'ramp', at: 0.72, height: 3.4 }] },
  { id: 'hotwheels', theme: 'hotwheels', seed: 808, lengthBase: 4400, curviness: 0.8, hilliness: 0.35,
    features: [{ kind: 'boost', at: 0.18 }, { kind: 'loop', at: 0.33, radius: 9 },
               { kind: 'ramp', at: 0.52, height: 4.5 }, { kind: 'boost', at: 0.66 },
               { kind: 'loop', at: 0.82, radius: 10 }] },
  { id: 'trackmania', theme: 'trackmania', seed: 909, lengthBase: 4800, curviness: 1.0, hilliness: 0.5,
    features: [{ kind: 'boost', at: 0.22 }, { kind: 'ramp', at: 0.44, height: 4.2 },
               { kind: 'loop', at: 0.6, radius: 10 }, { kind: 'boost', at: 0.75 },
               { kind: 'ramp', at: 0.88, height: 3.8 }] },
];
export const RACE_LENGTH_STEP = 400;  // each race in a level adds this many meters
export const TRACK_SAMPLE_STEP = 4;   // m between centerline samples

// ---------------------------------------------------------------------------
// Feel
// ---------------------------------------------------------------------------
export const SLOWMO_TIME = 0.15;      // s of real time
export const SLOWMO_SCALE = 0.25;
export const FOV_BASE = 68;
export const FOV_SPEED_GAIN = 18;     // added at top speed
export const CAM_BACK = 7.5;          // chase cam distance
export const CAM_UP = 3.1;
export const CAM_LAG = 5.5;           // damp lambda for cam position
export const SHAKE_HIT = 0.35;        // shake impulse magnitudes
export const SHAKE_CRASH = 1.0;
export const SHAKE_SCRAPE = 0.12;

// Music intensity: layer fades in above this fraction of top speed, or in combat
export const MUSIC_INTENSITY_SPEED = 0.8;
export const COMBAT_HEAT_TIME = 3.0;  // s of "in combat" after an attack event

// ---------------------------------------------------------------------------
// Storage keys / URL params
// ---------------------------------------------------------------------------
export const SAVE_KEY = 'roadwrath_save_v1';
export const SETTINGS_KEY = 'roadwrath_settings_v1';
// URL params handled by main.js: ?race=N (1..15) ?god=1 ?fast=1 ?nomusic=1
//   ?quality=low|high ?seed=N ?reset=1 ?fps=1

// ---------------------------------------------------------------------------
// SHARED STATE CONTRACT — the single source of truth for cross-module shapes.
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} Rider
 * @prop {string}  id          'player' | rival id ('sledge', ...) — see rivals.js
 * @prop {string}  name        display name
 * @prop {boolean} isPlayer
 * @prop {number}  color       0xRRGGBB accent for bike/leathers
 * @prop {string}  bikeId      BIKES id
 * @prop {number}  s           distance along track (m)
 * @prop {number}  x           lateral offset (m), negative = left/oncoming side
 * @prop {number}  y           height ABOVE road surface (0 = on road)
 * @prop {number}  vy          vertical velocity (airborne)
 * @prop {number}  speed       forward speed m/s (bike speed; while 'running' this is run speed)
 * @prop {number}  vx          lateral velocity m/s
 * @prop {number}  lean        physical lean −1..1 (used by sim for steering)
 * @prop {number}  leanVis     smoothed lean for rendering
 * @prop {'grid'|'riding'|'down'|'running'|'finished'} state
 * @prop {number}  health      0..100
 * @prop {number}  stamina     0..100
 * @prop {number}  bikeDamage  0..100 (only enforced for player)
 * @prop {?('club'|'chain')} weapon
 * @prop {number}  attackCd    s until next attack allowed
 * @prop {number}  punchT      >0 while punch anim active, counts down from 1
 * @prop {number}  kickT       ditto for kick
 * @prop {number}  attackSide  -1 attack to the left, +1 to the right (render reads with punchT/kickT)
 * @prop {number}  hitT        >0 flinch after being hit, counts down from 1
 * @prop {number}  tumbleT     seconds spent tumbling (state 'down'), for ragdoll anim
 * @prop {number}  downS       where the rider fell (m); bike rests at bikeS
 * @prop {number}  bikeS       where the bike is waiting while running back
 * @prop {number}  bikeX       lateral position of waiting bike
 * @prop {boolean} skidding    true while sliding (renderer: skid marks, audio: skid loop)
 * @prop {boolean} offroad     true while on shoulder
 * @prop {boolean} airborne
 * @prop {boolean} tucking     boost/draft tuck pose
 * @prop {boolean} drafting    currently in a draft wake
 * @prop {number}  place       1..8, updated every step
 * @prop {number}  finishTime  race.time at finish, else 0
 * @prop {?Object} ai          null for player: { personality:'aggressive'|'dirty'|'racer'|'wildcard',
 *                             skill:0..1, aggression:0..1, grudge:?string (rider id),
 *                             targetX:number, decideT:number, rubber:number }
 */

/**
 * @typedef {Object} TrafficCar
 * @prop {number} id
 * @prop {string} kind   TRAFFIC_KINDS entry
 * @prop {number} s
 * @prop {number} x      lane centre it drives at
 * @prop {1|-1}   dir    +1 = same direction as race (drives on x>0 side), −1 oncoming (x<0)
 * @prop {number} speed  m/s (always positive; dir gives sign of ds/dt)
 * @prop {number} color  0xRRGGBB body color
 */

/**
 * @typedef {Object} Cop
 * @prop {string} id
 * @prop {number} s
 * @prop {number} x
 * @prop {number} speed
 * @prop {'idle'|'chase'} state
 */

/**
 * SimEvent — sim pushes these into race.events during stepRace; main.js drains
 * them each frame and fans them out to renderer/audio/hud. Types & payloads:
 *   {type:'countdown', n:3|2|1|0}                        // 0 = GO
 *   {type:'attack',   rider, target:?Rider, kind:'punch'|'kick'|'club'|'chain', hit:boolean}
 *   {type:'hit',      rider, from, dmg, weapon:?string}  // rider took damage
 *   {type:'steal',    rider, from, weapon}               // rider stole from's weapon
 *   {type:'down',     rider, cause:'combat'|'crash'|'obstacle'|'slide', by:?Rider}
 *   {type:'remount',  rider}
 *   {type:'boost',    rider}                             // crossed a boost pad
 *   {type:'loop',     rider, phase:'enter'|'exit'}       // fake-loop scripted arc
 *   {type:'scrape',   rider, side:-1|1, what:'car'|'rider'|'barrier'}
 *   {type:'combo',    kind:'nearmiss'|'draft'|'knockdown', mult:number}  // player only
 *   {type:'combo_break'}
 *   {type:'overtake', rider, target}                     // rider passed target
 *   {type:'taunt',    rider, line:string}
 *   {type:'cop',      on:boolean}                        // chase started/ended
 *   {type:'busted'}
 *   {type:'wrecked'}
 *   {type:'finish',   rider, place}
 *   {type:'race_over', place:number, cause:'finish'|'busted'|'wrecked',
 *    payout:number, scoreCash:number, fee:number}
 * All rider fields are Rider object references, not ids.
 * @typedef {Object} SimEvent
 */

/**
 * @typedef {Object} Track                (built by tracks.js — see getTrack())
 * @prop {string} id, name; @prop {string} theme  THEMES key
 * @prop {number} length      finish line s (m)
 * @prop {number} sampleStep  TRACK_SAMPLE_STEP
 * @prop {Float32Array} px,py,pz   centerline world position per sample
 * @prop {Float32Array} tx,tz      horizontal tangent (normalized) per sample
 * @prop {Float32Array} curv       signed curvature (1/m), + = curving right
 * @prop {Float32Array} bank       signed road roll (radians), + = outer edge up on a right curve
 * @prop {Array<{kind:string,s:number,x:number,scale:number,collide:boolean}>} props  sorted by s
 * @prop {boolean} barriers
 * @prop {Array<{s0:number,s1:number}>} copZones
 * @prop {Array<{s0:number,s1:number}>} boostZones   speed pads (empty if theme has none)
 * @prop {Array<{s:number,radius:number}>} loops      fake-loop trigger points (empty if none)
 */

/**
 * @typedef {Object} RaceState             (created by sim.createRace)
 * @prop {Track}  track
 * @prop {number} level        1..5
 * @prop {number} raceIndex    0..2 within level
 * @prop {number} time         s since GO (negative during countdown)
 * @prop {'countdown'|'racing'|'over'} status
 * @prop {number} finishS      == track.length
 * @prop {Rider[]} riders      riders[0] is ALWAYS the player
 * @prop {TrafficCar[]} traffic
 * @prop {Cop[]}  cops
 * @prop {SimEvent[]} events   cleared at the start of every stepRace
 * @prop {number} intensity    0..1 for music (speed/combat driven)
 * @prop {number} combatHeat   s remaining of "recently fighting"
 * @prop {boolean} copChase    a cop is actively chasing the player
 * @prop {{mult:number,timer:number,best:number,score:number}} combo   player combo
 * @prop {?{place:number,cause:string,payout:number,scoreCash:number,fee:number}} result
 * @prop {{god:boolean,fast:boolean}} opts
 * @prop {function():number} rng   seeded PRNG owned by the sim
 */

/**
 * @typedef {Object} PlayerInput           (produced by input.js readGame())
 * @prop {number} steer     −1..1 (negative = left)
 * @prop {number} throttle  0..1
 * @prop {number} brake     0..1
 * @prop {boolean} punch    edge-triggered (true for exactly one read after press, buffered 150ms)
 * @prop {boolean} kick     edge-triggered, buffered
 * @prop {boolean} boost    held (Shift = tuck)
 */

/**
 * @typedef {Object} Career                 (owned by career.js)
 * @prop {number} level      1..LEVEL_COUNT
 * @prop {number} raceIndex  0..RACES_PER_LEVEL-1 — next race to run
 * @prop {number} cash
 * @prop {string} bikeId
 * @prop {string[]} ownedBikes
 * @prop {number} totalRaces, totalWins, totalKnockdowns, bestCombo
 * @prop {Object<string,number>} rivalScore   rival id → net knockdowns (grudge bookkeeping)
 * @prop {boolean} finished  beat all 5 levels
 */
