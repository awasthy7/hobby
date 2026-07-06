// render/renderer.js — Three.js orchestration. The only render file main.js
// imports. World/bike/effect internals live in world.js / bikes.js / effects.js.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import {
  THEMES, BIKES, RIDER_COUNT, TUCK_TOP_BONUS, DOWN_TIME,
  FOV_BASE, FOV_SPEED_GAIN, CAM_BACK, CAM_UP, CAM_LAG,
  SHAKE_HIT, SHAKE_CRASH, SHAKE_SCRAPE,
} from '../config.js';
import { clamp, lerp, damp } from '../util.js';
import { sampleAt } from '../logic/tracks.js';
import { buildBike, poseRider, buildCar, buildCop, setCopFlash } from './bikes.js';
import { buildWorldInto, updateWorld } from './world.js';
import {
  createEffects, disposeEffects, fxUpdate, fxReset,
  sparkBurst, dustPuff, smokeBurst, debrisBurst, skidSeg, setStreaks, setRain,
} from './effects.js';

// local tunables
// Sized for worst-case SIM traffic: L5 runs ~18 concurrent cars and per-kind
// counts reach 7-8 (measured). An exhausted pool used to mean an INVISIBLE
// car — physically present in the sim, never rendered, a phantom wall.
const CAR_POOL = { sedan: 10, pickup: 10, van: 10, bus: 10 };
const LOOK_AHEAD = 14;
const SHAKE_DECAY = 5.5;
const FOV_LAMBDA = 4.5;

// scratch — zero per-frame allocation
const _sm = { x: 0, y: 0, z: 0, tx: 0, tz: 1, curv: 0, bank: 0 };
const _sm2 = { x: 0, y: 0, z: 0, tx: 0, tz: 1, curv: 0, bank: 0 };
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();

function riderWorld(track, s, x, y, out) {
  sampleAt(track, s, _sm);
  // sit ON the banked surface: outer (+x) edge lifts by sin(bank)*x, lateral
  // spacing compresses by cos(bank). y-above-road stays vertical.
  const cb = Math.cos(_sm.bank), sb = Math.sin(_sm.bank);
  const lat = x * cb;
  out.set(_sm.x + _sm.tz * lat, _sm.y + y + sb * x, _sm.z - _sm.tx * lat);
  return out;
}

// ---------------------------------------------------------------------------
export function initRenderer(canvas, quality) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV_BASE, 16 / 9, 0.1, 3200);
  camera.position.set(0, 4, -10);
  scene.add(camera);            // effects (speed lines, rain) parent to it

  const rd = {
    canvas, renderer, scene, camera,
    quality: null, composer: null, bloom: null, fxaa: null,
    world: null, track: null, race: null,
    rigs: [], carPool: [], carMap: new Map(), copRigs: [],
    fx: null,
    topSpeed: 50, fov: FOV_BASE, shake: 0, time: 0, frameStamp: 0,
    camPos: new THREE.Vector3(0, 5, -12), camInit: false,
    skidPrev: new Float32Array(RIDER_COUNT * 3),   // x,z,roadY per rider
    skidOn: new Uint8Array(RIDER_COUNT),
    dustT: new Float32Array(RIDER_COUNT),
  };
  setQuality(rd, quality);
  resizeRenderer(rd);
  return rd;
}

export function setQuality(rd, q) {
  if (q === rd.quality) return;
  rd.quality = q;
  if (rd.composer) {
    rd.composer.dispose();
    rd.bloom && rd.bloom.dispose();
    rd.composer = rd.bloom = rd.fxaa = null;
  }
  if (q === 'high') {
    const w = window.innerWidth, h = window.innerHeight;
    rd.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const composer = new EffectComposer(rd.renderer);
    composer.addPass(new RenderPass(rd.scene, rd.camera));
    // threshold high enough that lit asphalt/terrain don't bloom — only the
    // sun, neon, sparks, brake-lights should. strength kept punchy for those.
    rd.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.5, 0.45, 0.9);
    composer.addPass(rd.bloom);
    rd.fxaa = new ShaderPass(FXAAShader);
    composer.addPass(rd.fxaa);
    composer.addPass(new OutputPass());
    rd.composer = composer;
  } else {
    rd.renderer.setPixelRatio(1);
  }
  resizeRenderer(rd);
}

export function resizeRenderer(rd) {
  const w = window.innerWidth, h = window.innerHeight;
  rd.renderer.setSize(w, h, false);
  rd.camera.aspect = w / h;
  rd.camera.updateProjectionMatrix();
  if (rd.composer) {
    rd.composer.setSize(w, h);
    const pr = rd.renderer.getPixelRatio();
    rd.fxaa.material.uniforms.resolution.value.set(1 / (w * pr), 1 / (h * pr));
  }
}

// ---------------------------------------------------------------------------
function disposeAll(rd) {
  if (rd.fx) { disposeEffects(rd.fx); rd.fx = null; }
  const doomed = [];
  for (const c of rd.scene.children) if (c !== rd.camera) doomed.push(c);
  for (const c of doomed) {
    c.traverse((o) => {
      if (o.isMesh || o.isPoints || o.isLine) {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (m && m.map) m.map.dispose();
          if (m) m.dispose();
        }
      }
      if (o.isInstancedMesh) o.dispose();
    });
    rd.scene.remove(c);
  }
  rd.scene.fog = null;
}

export function buildWorld(rd, track) {
  disposeAll(rd);
  const theme = THEMES[track.theme];
  rd.world = buildWorldInto(rd.scene, rd.camera, track, theme);

  rd.rigs = [];
  for (let i = 0; i < RIDER_COUNT; i++) {
    const rig = buildBike(0xffffff);
    rig.head.visible = theme.night;
    rd.scene.add(rig.bike, rig.man);
    rd.rigs.push(rig);
  }

  rd.carPool = [];
  rd.carMap.clear();
  for (const kind of Object.keys(CAR_POOL)) {
    for (let i = 0; i < CAR_POOL[kind]; i++) {
      const entry = buildCar(kind, theme.night);
      entry.root.visible = false;
      rd.scene.add(entry.root);
      rd.carPool.push(entry);
    }
  }
  rd.copRigs = [];
  for (let i = 0; i < 2; i++) {
    const cop = buildCop(theme.night);
    cop.root.visible = false;
    rd.scene.add(cop.root);
    rd.copRigs.push(cop);
  }

  rd.fx = createEffects(rd.scene, rd.camera);
  rd.track = track;
  rd.race = null;
  rd.camInit = false;
}

// ---------------------------------------------------------------------------
function bindRace(rd, race) {
  rd.race = race;
  for (let i = 0; i < rd.rigs.length; i++) {
    const rig = rd.rigs[i];
    const has = i < race.riders.length;
    rig.bike.visible = rig.man.visible = has;
    if (!has) continue;
    const r = race.riders[i];
    rig.mat.color.setHex(r.color);
    rig.manMat.color.setHex(r.color).multiplyScalar(0.8);
  }
  const bike = BIKES.find((b) => b.id === race.riders[0].bikeId);
  rd.topSpeed = (bike ? bike.topSpeed : 50) * (1 + TUCK_TOP_BONUS);
  for (const e of rd.carPool) { e.id = -1; e.root.visible = false; }
  rd.carMap.clear();
  for (const c of rd.copRigs) c.root.visible = false;
  fxReset(rd.fx);
  rd.skidOn.fill(0);
  rd.dustT.fill(0);
  rd.shake = 0;
  rd.camInit = false;
  setRain(rd.fx, !!rd.world.rain);
}

function processEvents(rd, race, events) {
  const track = race.track;
  for (const ev of events) {
    if (ev.type === 'scrape') {
      const r = ev.rider;
      riderWorld(track, r.s, r.x + ev.side * 0.6, r.y + 0.3, _v1);
      sparkBurst(rd.fx, _v1.x, _v1.y, _v1.z, _sm.tz * ev.side, -_sm.tx * ev.side, 7);
      if (r.isPlayer) rd.shake = Math.max(rd.shake, SHAKE_SCRAPE);
    } else if (ev.type === 'hit') {
      const r = ev.rider;
      riderWorld(track, r.s, r.x, r.y + 1.1, _v1);
      sparkBurst(rd.fx, _v1.x, _v1.y, _v1.z, 0, 0, ev.weapon ? 8 : 4);
      if (r.isPlayer) rd.shake = Math.max(rd.shake, SHAKE_HIT);
      else if (ev.from && ev.from.isPlayer) rd.shake = Math.max(rd.shake, SHAKE_HIT * 0.5);
    } else if (ev.type === 'down') {
      const r = ev.rider;
      riderWorld(track, r.s, r.x, r.y + 0.4, _v1);
      smokeBurst(rd.fx, _v1.x, _v1.y, _v1.z, 10);
      dustPuff(rd.fx, _v1.x, _v1.y, _v1.z, 8, true);
      debrisBurst(rd.fx, _v1.x, _v1.y, _v1.z, _sm.tx, _sm.tz, 8);
      rd.shake = Math.max(rd.shake, r.isPlayer ? SHAKE_CRASH : 0.25);
    } else if (ev.type === 'remount') {
      const r = ev.rider;
      riderWorld(track, r.s, r.x, 0.2, _v1);
      dustPuff(rd.fx, _v1.x, _v1.y, _v1.z, 4, false);
    } else if (ev.type === 'attack' && ev.hit && ev.target && (ev.kind === 'club' || ev.kind === 'chain')) {
      const t = ev.target;
      riderWorld(track, t.s, t.x, t.y + 1.2, _v1);
      sparkBurst(rd.fx, _v1.x, _v1.y, _v1.z, 0, 0, 6);
    } else if (ev.type === 'boost') {
      // speed-pad kick: a streak of sparks off the rear wheel + FOV/streak pop
      const r = ev.rider;
      riderWorld(track, r.s - 0.7, r.x, r.y + 0.2, _v1);
      sparkBurst(rd.fx, _v1.x, _v1.y, _v1.z, -_sm.tx, -_sm.tz, 10);
      if (r.isPlayer) {
        rd.shake = Math.max(rd.shake, SHAKE_SCRAPE * 1.4);
        setStreaks(rd.fx, 1);
      }
    } else if (ev.type === 'loop' && ev.phase === 'enter') {
      const r = ev.rider;
      riderWorld(track, r.s, r.x, r.y + 0.5, _v1);
      dustPuff(rd.fx, _v1.x, _v1.y, _v1.z, 5, false);
      if (r.isPlayer) rd.shake = Math.max(rd.shake, SHAKE_HIT * 0.5);
    }
  }
}

// ---------------------------------------------------------------------------
function updateRiders(rd, race, dtSim) {
  const track = race.track;
  for (let i = 0; i < rd.rigs.length && i < race.riders.length; i++) {
    const r = race.riders[i], rig = rd.rigs[i];
    const st = r.state;
    let bankMan = 0, bankBike = 0;   // per-entity: man and bike can sit at different s
    if (st === 'down') {
      // man tumbles at his own s; bike slides ahead toward its rest spot
      riderWorld(track, r.s, r.x, r.y + 0.6, _v1);
      const heading = Math.atan2(_sm.tx, _sm.tz);
      bankMan = _sm.bank;
      rig.man.position.copy(_v1);
      rig.man.rotation.y = heading;
      const f = clamp(r.tumbleT / DOWN_TIME, 0, 1);
      const ease = 1 - (1 - f) * (1 - f);
      const bs = lerp(r.downS, r.bikeS, ease);
      const bx = lerp(r.x, r.bikeX, ease);
      riderWorld(track, bs, bx, 0, _v2);
      bankBike = _sm.bank;
      rig.bike.position.copy(_v2);
      rig.bike.rotation.y = Math.atan2(_sm.tx, _sm.tz);
    } else if (st === 'running') {
      riderWorld(track, r.s, r.x, 0, _v1);
      bankMan = _sm.bank;
      rig.man.position.copy(_v1);
      rig.man.rotation.y = Math.atan2(_sm.tx, _sm.tz);
      riderWorld(track, r.bikeS, r.bikeX, 0, _v2);
      bankBike = _sm.bank;
      rig.bike.position.copy(_v2);
      rig.bike.rotation.y = Math.atan2(_sm.tx, _sm.tz);
    } else {
      riderWorld(track, r.s, r.x, r.y, _v1);
      const heading = Math.atan2(_sm.tx, _sm.tz);
      bankMan = bankBike = _sm.bank;
      rig.bike.position.copy(_v1);
      rig.bike.rotation.y = heading;
      rig.man.position.copy(_v1);
      rig.man.rotation.y = heading;
    }
    poseRider(rig, r, dtSim, rd.time);

    // banked road: roll each entity onto its own patch of banked surface
    // (composes with the lean/tumble set by poseRider). Downed/running riders
    // roll too — otherwise they clip into the raised edge of banked corners.
    if (bankBike) rig.tiltB.rotation.z += bankBike;
    if (bankMan) rig.tiltM.rotation.z += bankMan;

    // fake loop: while looping, pitch the whole rig up-and-over so it visibly
    // climbs the inside of the tube (sim drives r.y along the arc + advances s).
    const loopT = r.loopT || 0;
    if (loopT > 0 && (st === 'riding' || st === 'grid')) {
      const t = 1 - clamp(loopT, 0, 1);         // 0→1 across the loop
      const pitch = -t * Math.PI * 2;           // nose lifts up, over the top, back
      rig.tiltB.rotation.x = pitch;
      rig.tiltM.rotation.x = pitch;
    } else {
      // clear any residual loop pitch on the frame the loop ends
      if (rig.tiltB.rotation.x) rig.tiltB.rotation.x = 0;
      if (rig.tiltM.rotation.x) rig.tiltM.rotation.x = 0;
    }
  }
}

function acquireCar(rd, kind) {
  for (const e of rd.carPool) if (e.kind === kind && e.id === -1) return e;
  // kind pool exhausted: fall back to ANY free mesh — a wrong body shape is
  // infinitely better than an invisible car you crash into
  for (const e of rd.carPool) if (e.id === -1) return e;
  return null;
}

function updateTraffic(rd, race) {
  const track = race.track;
  rd.frameStamp++;
  for (const car of race.traffic) {
    let entry = rd.carMap.get(car.id);
    if (!entry) {
      entry = acquireCar(rd, car.kind);
      if (!entry) continue;                      // pool exhausted; skip (rare)
      entry.id = car.id;
      entry.mat.color.setHex(car.color);
      entry.root.visible = true;
      rd.carMap.set(car.id, entry);
    }
    entry.stamp = rd.frameStamp;
    riderWorld(track, car.s, car.x, 0, _v1);
    entry.root.position.copy(_v1);
    entry.root.rotation.y = Math.atan2(_sm.tx, _sm.tz) + (car.dir < 0 ? Math.PI : 0);
  }
  for (const [id, entry] of rd.carMap) {
    if (entry.stamp !== rd.frameStamp) {
      entry.id = -1;
      entry.root.visible = false;
      rd.carMap.delete(id);
    }
  }

  for (let j = 0; j < rd.copRigs.length; j++) {
    const rig = rd.copRigs[j];
    if (j < race.cops.length) {
      const cop = race.cops[j];
      rig.root.visible = true;
      riderWorld(track, cop.s, cop.x, 0, _v1);
      rig.root.position.copy(_v1);
      rig.root.rotation.y = Math.atan2(_sm.tx, _sm.tz);
    } else rig.root.visible = false;
  }
}

// ---------------------------------------------------------------------------
function continuousFx(rd, race, dtSim) {
  const track = race.track;
  for (let i = 0; i < race.riders.length && i < RIDER_COUNT; i++) {
    const r = race.riders[i];
    // skid marks from the rear wheel while sliding on pavement
    if (r.skidding && !r.airborne && r.state === 'riding') {
      riderWorld(track, r.s - 0.7, r.x, 0, _v1);
      if (rd.skidOn[i]) {
        skidSeg(rd.fx, rd.skidPrev[i * 3], rd.skidPrev[i * 3 + 1], _v1.x, _v1.z, _v1.y, 0.3);
      }
      rd.skidPrev[i * 3] = _v1.x; rd.skidPrev[i * 3 + 1] = _v1.z; rd.skidPrev[i * 3 + 2] = _v1.y;
      rd.skidOn[i] = 1;
    } else rd.skidOn[i] = 0;

    // dust: offroad wheels, and the tumble trail while down
    rd.dustT[i] -= dtSim;
    if (rd.dustT[i] <= 0) {
      if (r.offroad && r.speed > 6 && r.state === 'riding') {
        riderWorld(track, r.s - 0.6, r.x, 0.1, _v1);
        dustPuff(rd.fx, _v1.x, _v1.y, _v1.z, 2, false);
        rd.dustT[i] = 0.05;
      } else if (r.state === 'down' && r.tumbleT < 1.1) {
        riderWorld(track, r.s, r.x, 0.2, _v1);
        dustPuff(rd.fx, _v1.x, _v1.y, _v1.z, 2, false);
        rd.dustT[i] = 0.06;
      }
    }
  }
  // speed lines: streak past the camera above ~75% speed; drafting boosts them
  const p = race.riders[0];
  const frac = clamp(p.speed / rd.topSpeed, 0, 1.2);
  let streak = clamp((frac - 0.75) * 4, 0, 1) * 0.8;
  if (p.drafting) streak = Math.min(1, streak + 0.4);
  setStreaks(rd.fx, streak);
}

// ---------------------------------------------------------------------------
function updateCamera(rd, race, camMode, dtReal) {
  const cam = rd.camera;
  const track = race.track;
  const p = race.riders[0];
  let fovTgt = FOV_BASE;
  let roll = 0;
  let lag = CAM_LAG;

  if (camMode === 'chase') {
    sampleAt(track, p.s, _sm);
    const nx = _sm.tz, nz = -_sm.tx;
    const tuck = rd.rigs.length ? rd.rigs[0].tuck : 0;
    const loopT = p.loopT || 0;
    // lift the cam more during a loop so it rides up the arc with the player
    const yLift = loopT > 0 ? p.y * 0.85 : p.y * 0.5;
    // Countdown: rise and swing aside so the whole staggered grid reads —
    // a dead-astern low camera hides the pack behind the nearest bikes.
    // Eases back to the normal chase framing as GO approaches (time -> 0).
    const cd = race.status === 'countdown' ? clamp(-race.time * 0.55, 0, 1) : 0;
    // bank lift at the camera's own lateral offset — without it the camera can
    // dip to/below the raised road edge on max-bank corners
    const camLat = p.x + cd * 5.5;
    _v1.set(
      _sm.x + nx * camLat - _sm.tx * (CAM_BACK + cd * 2.5),
      _sm.y + Math.sin(_sm.bank) * camLat + yLift + CAM_UP + cd * 2.6 - tuck * 0.8,
      _sm.z + nz * camLat - _sm.tz * (CAM_BACK + cd * 2.5),
    );
    sampleAt(track, p.s + LOOK_AHEAD, _sm2);
    _v2.set(
      _sm2.x + _sm2.tz * p.x * 0.5,
      _sm2.y + Math.sin(_sm2.bank) * p.x * 0.5 + 1.4,
      _sm2.z - _sm2.tx * p.x * 0.5,
    );
    const frac = clamp(p.speed / rd.topSpeed, 0, 1.1);
    fovTgt = FOV_BASE + FOV_SPEED_GAIN * frac * frac;
    // lean roll + horizon tilt into banked corners
    roll = -p.leanVis * 0.07 + _sm.bank * 0.5;
    // fake-loop barrel roll: sweep cam.rotation.z through a full 2π over loopT
    if (loopT > 0) roll += (1 - clamp(loopT, 0, 1)) * Math.PI * 2;
  } else if (camMode === 'title') {
    sampleAt(track, 10, _sm);
    const a = rd.time * 0.14;
    _v1.set(_sm.x + Math.sin(a) * 16, _sm.y + 4.5 + Math.sin(rd.time * 0.23) * 1.2, _sm.z + Math.cos(a) * 16);
    sampleAt(track, 6, _sm2);
    _v2.set(_sm2.x, _sm2.y + 1.2, _sm2.z);
    lag = 20;                                   // effectively direct
  } else if (camMode === 'grid') {
    // Sit behind the player (who starts at the BACK of the grid) and look
    // forward down the pack, so all riders are framed during the countdown —
    // a slow lateral drift adds life. Previously the cam sat mid-pack looking
    // back, showing only the 1-2 nearest bikes until GO.
    sampleAt(track, p.s, _sm);
    const nx = _sm.tz, nz = -_sm.tx;
    const drift = Math.sin(rd.time * 0.3) * 4;
    _v1.set(
      _sm.x + nx * drift - _sm.tx * (CAM_BACK + 1),
      _sm.y + CAM_UP + 0.4,
      _sm.z + nz * drift - _sm.tz * (CAM_BACK + 1),
    );
    sampleAt(track, p.s + 16, _sm2);   // look ahead into the pack
    _v2.set(_sm2.x, _sm2.y + 1.2, _sm2.z);
    lag = 6;
  } else { // 'over' — pull-back orbit of the player
    riderWorld(track, p.s, p.x, 0, _v2);
    _v2.y += 1.0;
    const a = rd.time * 0.35;
    _v1.set(_v2.x + Math.sin(a) * 13, _v2.y + 5.5, _v2.z + Math.cos(a) * 13);
    lag = 2.5;
  }

  if (!rd.camInit) { rd.camPos.copy(_v1); rd.camInit = true; }
  rd.camPos.x = damp(rd.camPos.x, _v1.x, lag, dtReal);
  rd.camPos.y = damp(rd.camPos.y, _v1.y, lag, dtReal);
  rd.camPos.z = damp(rd.camPos.z, _v1.z, lag, dtReal);

  // shake: exponential-decay impulse as positional + roll noise
  rd.shake *= Math.exp(-SHAKE_DECAY * dtReal);
  const sh = rd.shake;
  _v3.copy(rd.camPos);
  if (sh > 0.002) {
    const t = rd.time;
    _v3.x += Math.sin(t * 47.3) * sh * 0.35;
    _v3.y += Math.sin(t * 61.7 + 2.1) * sh * 0.28;
    _v3.z += Math.sin(t * 53.1 + 4.2) * sh * 0.2;
  }
  cam.position.copy(_v3);
  cam.lookAt(_v2);
  cam.rotation.z += roll + (sh > 0.002 ? Math.sin(rd.time * 71) * sh * 0.05 : 0);

  rd.fov = damp(rd.fov, fovTgt, FOV_LAMBDA, dtReal);
  if (Math.abs(cam.fov - rd.fov) > 0.01) {
    cam.fov = rd.fov;
    cam.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------------------
export function updateRender(rd, race, dtReal, dtSim, camMode, events) {
  if (!rd.world || rd.track !== race.track) return;   // world not built yet
  rd.time += dtReal;
  if (rd.race !== race) bindRace(rd, race);

  processEvents(rd, race, events);
  updateWorld(rd.world, dtReal, rd.camera);
  updateRiders(rd, race, dtSim);
  updateTraffic(rd, race);
  setCopFlash(rd.time, race.copChase);
  continuousFx(rd, race, dtSim);
  fxUpdate(rd.fx, dtSim, dtReal, race.riders[0].speed);
  updateCamera(rd, race, camMode, dtReal);

  if (rd.composer) rd.composer.render();
  else rd.renderer.render(rd.scene, rd.camera);
}
