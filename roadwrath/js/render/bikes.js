// render/bikes.js — procedural bike/rider/car meshes + pose animation.
// Internal to the render team; only renderer.js/world.js import from here.
// Accent parts are painted WHITE in vertex colors so material.color tints them.

import * as THREE from 'three';

const WHEEL_R = 0.32;

// ---------------------------------------------------------------------------
// Geometry merge helper — manual (BufferGeometryUtils is not vendored).
// parts: [{g, color, x,y,z, rx,ry,rz, sx,sy,sz, uvRect:[u0,v0,u1,v1]}]
// Consumes (disposes) each part.g. Returns a non-indexed BufferGeometry with
// position/normal/color/uv.
// ---------------------------------------------------------------------------
const _m4 = new THREE.Matrix4();
const _eu = new THREE.Euler();
const _q = new THREE.Quaternion();
const _sc = new THREE.Vector3();
const _pv = new THREE.Vector3();

export function mergeParts(parts) {
  const geoms = [];
  let total = 0;
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g;
    _eu.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _q.setFromEuler(_eu);
    _sc.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
    _pv.set(p.x || 0, p.y || 0, p.z || 0);
    _m4.compose(_pv, _q, _sc);
    g.applyMatrix4(_m4);
    geoms.push({ g, p });
    total += g.attributes.position.count;
    if (g !== p.g) p.g.dispose();
  }
  const pos = new Float32Array(total * 3);
  const nrm = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  const c = new THREE.Color();
  let o = 0;
  for (const { g, p } of geoms) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    nrm.set(g.attributes.normal.array, o * 3);
    c.setHex(p.color ?? 0xffffff);
    for (let i = 0; i < n; i++) {
      col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b;
    }
    if (g.attributes.uv) {
      const src = g.attributes.uv.array;
      if (p.uvRect) {
        const [u0, v0, u1, v1] = p.uvRect;
        for (let i = 0; i < n; i++) {
          uv[(o + i) * 2] = u0 + src[i * 2] * (u1 - u0);
          uv[(o + i) * 2 + 1] = v0 + src[i * 2 + 1] * (v1 - v0);
        }
      } else uv.set(src, o * 2);
    }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 8) => new THREE.CylinderGeometry(rt, rb, h, seg);

// ---------------------------------------------------------------------------
// Shared textures / materials
// ---------------------------------------------------------------------------
export function radialShadowTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 30);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

let _shadowMat = null;
function shadowMat() {
  if (!_shadowMat) {
    _shadowMat = new THREE.MeshBasicMaterial({
      map: radialShadowTexture(), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
  }
  return _shadowMat;
}
const _shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

function blobShadow(sx, sz) {
  const m = new THREE.Mesh(_shadowGeo, shadowMat());
  m.scale.set(sx, 1, sz);
  m.position.y = 0.06;
  m.renderOrder = 1;
  return m;
}

// glow quad materials (headlights/taillights) — bright enough to bloom
const headlightMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(2.2, 2.1, 1.7), blending: THREE.AdditiveBlending,
  transparent: true, depthWrite: false,
});
const taillightMat = new THREE.MeshBasicMaterial({
  color: new THREE.Color(2.0, 0.12, 0.08), blending: THREE.AdditiveBlending,
  transparent: true, depthWrite: false,
});
export const copRedMat = new THREE.MeshBasicMaterial({ color: 0x660808 });
export const copBlueMat = new THREE.MeshBasicMaterial({ color: 0x081a66 });

/** Flash cop light bars (shared mats — all cops flash in sync, fine). */
export function setCopFlash(time, chasing) {
  if (chasing) {
    const on = Math.sin(time * 18) > 0;
    copRedMat.color.setRGB(on ? 3.0 : 0.25, 0.03, 0.03);
    copBlueMat.color.setRGB(0.05, 0.08, on ? 0.25 : 3.0);
  } else {
    copRedMat.color.setHex(0x660808);
    copBlueMat.color.setHex(0x081a66);
  }
}

// ---------------------------------------------------------------------------
// Bike + rider — geometry cached module-level, tint via material.color.
// Models face +z; ground at y=0.
// ---------------------------------------------------------------------------
let _bikeGeo = null, _wheelGeo = null, _torsoGeo = null, _armGeo = null, _legGeo = null;

function bikeGeo() {
  if (_bikeGeo) return _bikeGeo;
  _bikeGeo = mergeParts([
    { g: box(0.16, 0.2, 1.15), y: 0.6, color: 0xffffff },                      // spine
    { g: box(0.3, 0.26, 0.52), y: 0.79, z: 0.22, color: 0xffffff },            // tank
    { g: box(0.3, 0.09, 0.55), y: 0.76, z: -0.32, color: 0x1c1c1e },           // seat
    { g: box(0.26, 0.12, 0.34), y: 0.78, z: -0.66, rx: 0.18, color: 0xffffff },// tail
    { g: box(0.36, 0.3, 0.5), y: 0.4, z: 0.02, color: 0x4a4a50 },              // engine
    { g: cyl(0.05, 0.06, 0.95, 7), x: 0.19, y: 0.34, z: -0.3, rx: Math.PI / 2, color: 0x9a9aa0 }, // exhaust
    { g: cyl(0.035, 0.035, 0.8, 6), x: 0.09, y: 0.55, z: 0.62, rx: 0.42, color: 0xb8b8c0 },  // fork R
    { g: cyl(0.035, 0.035, 0.8, 6), x: -0.09, y: 0.55, z: 0.62, rx: 0.42, color: 0xb8b8c0 }, // fork L
    { g: box(0.54, 0.05, 0.05), y: 0.97, z: 0.45, color: 0x1c1c1e },           // handlebar
    { g: box(0.15, 0.14, 0.1), y: 0.87, z: 0.58, rx: 0.4, color: 0xd8d8cc },   // headlamp
    { g: box(0.2, 0.05, 0.5), y: 0.72, z: 0.72, rx: -0.15, color: 0xffffff },  // front fender
  ]);
  return _bikeGeo;
}

function wheelGeo() {
  if (_wheelGeo) return _wheelGeo;
  _wheelGeo = mergeParts([
    { g: cyl(WHEEL_R, WHEEL_R, 0.12, 10), rz: Math.PI / 2, color: 0x161618 },  // tire (axis → x)
    { g: box(0.05, 0.56, 0.06), color: 0xc8c8d0 },                             // spoke (spin read)
    { g: box(0.05, 0.06, 0.56), color: 0x8a8a92 },                             // cross spoke
    { g: cyl(0.09, 0.09, 0.14, 8), rz: Math.PI / 2, color: 0x9a9aa2 },         // hub
  ]);
  return _wheelGeo;
}

function torsoGeo() {
  if (_torsoGeo) return _torsoGeo;
  // origin at hip pivot height baked in — mesh sits at group origin (bike origin)
  _torsoGeo = mergeParts([
    { g: box(0.3, 0.2, 0.28), y: 0.84, z: -0.22, color: 0x26262c },            // hips
    { g: box(0.36, 0.46, 0.26), y: 1.08, z: -0.1, rx: 0.42, color: 0xffffff }, // chest (lean baked)
    { g: box(0.4, 0.12, 0.2), y: 1.28, z: 0.0, rx: 0.42, color: 0x26262c },    // shoulders
    { g: new THREE.SphereGeometry(0.15, 8, 6), y: 1.44, z: 0.1, color: 0xffffff },  // helmet
    { g: box(0.2, 0.09, 0.1), y: 1.42, z: 0.24, color: 0x101014 },             // visor
  ]);
  return _torsoGeo;
}

function armGeo() {
  if (_armGeo) return _armGeo;
  // origin at shoulder; limb extends -y, gets posed by rotation
  _armGeo = mergeParts([
    { g: box(0.1, 0.36, 0.11), y: -0.18, color: 0xffffff },                    // upper
    { g: box(0.09, 0.3, 0.1), y: -0.44, z: 0.05, rx: -0.25, color: 0x26262c }, // forearm
    { g: box(0.1, 0.12, 0.12), y: -0.6, z: 0.1, color: 0x111116 },             // glove
  ]);
  return _armGeo;
}

function legGeo() {
  if (_legGeo) return _legGeo;
  // origin at hip; bent-knee bake
  _legGeo = mergeParts([
    { g: box(0.13, 0.38, 0.15), y: -0.14, z: 0.1, rx: -0.7, color: 0xffffff }, // thigh forward
    { g: box(0.12, 0.36, 0.13), y: -0.4, z: 0.14, rx: 0.15, color: 0x26262c }, // shin down
    { g: box(0.11, 0.1, 0.26), y: -0.6, z: 0.16, color: 0x111116 },            // boot
  ]);
  return _legGeo;
}

/**
 * Build one rider assembly. Returns a rig; renderer adds rig.bike and rig.man
 * to the scene and places both in world space each frame (they separate when
 * the rider is down/running).
 */
export function buildBike(color) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, color });
  const manMat = new THREE.MeshLambertMaterial({ vertexColors: true, color });
  const wheelMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  const bike = new THREE.Group();
  const tiltB = new THREE.Group();
  bike.add(tiltB);
  const body = new THREE.Mesh(bikeGeo(), mat);
  const wheelF = new THREE.Mesh(wheelGeo(), wheelMat);
  const wheelR = new THREE.Mesh(wheelGeo(), wheelMat);
  wheelF.position.set(0, WHEEL_R, 0.74);
  wheelR.position.set(0, WHEEL_R, -0.72);
  tiltB.add(body, wheelF, wheelR);
  const head = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.16), headlightMat);
  head.position.set(0, 0.87, 0.66);
  const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.08), taillightMat);
  tail.position.set(0, 0.78, -0.85);
  tail.rotation.y = Math.PI;
  tiltB.add(head, tail);
  bike.add(blobShadow(1.2, 2.3));

  const man = new THREE.Group();
  const tiltM = new THREE.Group();
  man.add(tiltM);
  const torso = new THREE.Mesh(torsoGeo(), manMat);
  const armL = new THREE.Mesh(armGeo(), manMat);
  const armR = new THREE.Mesh(armGeo(), manMat);
  armL.position.set(-0.22, 1.28, 0.02);
  armR.position.set(0.22, 1.28, 0.02);
  const legL = new THREE.Mesh(legGeo(), manMat);
  const legR = new THREE.Mesh(legGeo(), manMat);
  legL.position.set(-0.16, 0.86, -0.2);
  legR.position.set(0.16, 0.86, -0.2);
  tiltM.add(torso, armL, armR, legL, legR);
  const shadowM = blobShadow(0.9, 0.9);
  shadowM.visible = false;
  man.add(shadowM);

  return {
    bike, man, tiltB, tiltM, wheelF, wheelR, torso, armL, armR, legL, legR,
    head, tail, shadowM, mat, manMat, spin: 0, tuck: 0,
  };
}

// arm/leg rest rotations (riding grip / pegs)
const ARM_REST_X = -1.15, LEG_REST_X = 0.0;

/**
 * Pose a rig from rider state. dt is sim dt (0 when paused/menus), time is
 * wall-clock seconds for cycles. World placement is renderer.js's job.
 */
export function poseRider(rig, r, dt, time) {
  const st = r.state;
  const riding = st === 'grid' || st === 'riding' || st === 'finished';

  // wheels
  const spinRate = riding ? r.speed : (st === 'down' ? Math.max(0, 4 - r.tumbleT * 3) : 0);
  rig.spin += (spinRate / WHEEL_R) * dt;
  rig.wheelF.rotation.x = rig.spin;
  rig.wheelR.rotation.x = rig.spin * 1.02;

  if (riding) {
    rig.man.visible = true;
    rig.shadowM.visible = false;
    const lean = -r.leanVis;
    rig.tiltB.rotation.set(0, 0, lean * 0.5);
    rig.tiltB.position.y = 0;

    // tuck: whole rider crouches forward (damped so it eases in/out)
    const tuckTgt = r.tucking ? 1 : 0;
    rig.tuck += (tuckTgt - rig.tuck) * Math.min(1, dt * 8);
    const tk = rig.tuck;

    rig.tiltM.rotation.set(0, 0, lean * 0.75);
    rig.tiltM.position.y = 0;
    rig.torso.rotation.set(tk * 0.55, 0, 0);
    rig.torso.position.y = -tk * 0.16;
    rig.torso.position.z = tk * 0.1;

    // flinch overrides tuck lean-forward
    if (r.hitT > 0) {
      rig.torso.rotation.x = -r.hitT * 0.8;
      rig.torso.rotation.z = Math.sin(r.hitT * 26) * 0.18 * r.hitT;
    }

    // rest limbs (limb points -y; +rotation.z swings its tip toward +x/right)
    rig.armL.rotation.set(ARM_REST_X - tk * 0.3, 0, -0.15);
    rig.armR.rotation.set(ARM_REST_X - tk * 0.3, 0, 0.15);
    rig.legL.rotation.set(LEG_REST_X, 0, -0.1);
    rig.legR.rotation.set(LEG_REST_X, 0, 0.1);

    // punch: wind-up then a fast lateral haymaker toward attackSide
    if (r.punchT > 0) {
      const side = r.attackSide >= 0 ? 1 : -1;
      const arm = side > 0 ? rig.armR : rig.armL;
      const t = 1 - r.punchT;                     // 0 → 1 over the swing
      let ext;
      if (t < 0.3) ext = -(t / 0.3) * 0.5;        // wind up (pull back)
      else if (t < 0.55) ext = -0.5 + ((t - 0.3) / 0.25) * 1.5;  // strike
      else ext = 1 - (t - 0.55) / 0.45;           // recover
      arm.rotation.x = ARM_REST_X + 0.9;
      arm.rotation.z = side * (0.4 + Math.max(0, ext) * 1.35);
      arm.rotation.y = side * Math.min(0, ext) * 0.8;
      rig.tiltM.rotation.z += side * -Math.max(0, ext) * 0.22;
    }

    // kick: leg swings out to the side
    if (r.kickT > 0) {
      const side = r.attackSide >= 0 ? 1 : -1;
      const leg = side > 0 ? rig.legR : rig.legL;
      const t = 1 - r.kickT;
      let ext;
      if (t < 0.25) ext = (t / 0.25) * 0.3;
      else if (t < 0.5) ext = 0.3 + ((t - 0.25) / 0.25) * 0.7;
      else ext = 1 - (t - 0.5) / 0.5;
      leg.rotation.x = -0.5 - ext * 0.4;
      leg.rotation.z = side * (ext * 1.5);
    }

    if (st === 'grid') {
      // feet down, upright, idle sway
      rig.legL.rotation.set(0.25, 0, -0.32);
      rig.legR.rotation.set(0.25, 0, 0.32);
      rig.tiltB.rotation.z = Math.sin(time * 0.8) * 0.02;
      rig.tiltM.rotation.z = rig.tiltB.rotation.z;
    }
  } else if (st === 'down') {
    // ragdoll tumble: man spins with decaying rate, limbs splayed, bouncing
    rig.man.visible = true;
    rig.shadowM.visible = true;
    const T = r.tumbleT;
    const decay = Math.exp(-T * 1.1);
    rig.tiltM.rotation.x = 11 * (1 - Math.exp(-T * 1.3));
    rig.tiltM.rotation.y = 4 * (1 - Math.exp(-T * 0.9));
    rig.tiltM.rotation.z = Math.sin(T * 7) * 0.5 * decay;
    rig.tiltM.position.y = Math.abs(Math.sin(T * 8)) * 0.55 * decay - 0.55;
    const spl = 1.6 + Math.sin(T * 21) * 0.5 * decay;
    rig.armL.rotation.set(-0.6, 0, -spl);
    rig.armR.rotation.set(-0.9, 0, spl);
    rig.legL.rotation.set(-0.5, 0, -spl * 0.5);
    rig.legR.rotation.set(-0.8, 0, spl * 0.55);
    rig.torso.rotation.set(0, 0, 0);
    rig.torso.position.y = 0; rig.torso.position.z = 0;
    // bike sliding away on its side
    rig.tiltB.rotation.z = Math.min(1.35, T * 6);
    rig.tiltB.rotation.y = Math.min(1.1, T * 1.8);
    rig.tiltB.position.y = 0;
  } else if (st === 'running') {
    // run cycle back to the waiting bike (kickstand lean)
    rig.man.visible = true;
    rig.shadowM.visible = true;
    const c = time * (2 + r.speed * 1.4);
    const sw = Math.min(1, r.speed / 4);
    rig.tiltM.rotation.set(0, 0, 0);
    rig.tiltM.position.y = Math.abs(Math.sin(c)) * 0.07 * sw - 0.06;
    rig.torso.rotation.set(0.15 * sw, Math.sin(c) * 0.08 * sw, 0);
    rig.torso.position.y = 0; rig.torso.position.z = 0;
    rig.armL.rotation.set(Math.sin(c) * 0.9 * sw - 0.3, 0, -0.2);
    rig.armR.rotation.set(-Math.sin(c) * 0.9 * sw - 0.3, 0, 0.2);
    rig.legL.rotation.set(-Math.sin(c) * 1.0 * sw + 0.5, 0, -0.06);
    rig.legR.rotation.set(Math.sin(c) * 1.0 * sw + 0.5, 0, 0.06);
    // waiting bike on kickstand
    rig.tiltB.rotation.set(0, 0, 0.24);
    rig.tiltB.position.y = 0;
  }
}

// ---------------------------------------------------------------------------
// Traffic cars & cops — body geometry cached per kind, tint via material.
// ---------------------------------------------------------------------------
const _carGeo = {};

function carWheelParts(w, l, r) {
  const out = [];
  const xs = w / 2 - 0.12, zs = l / 2 - r * 1.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push({ g: cyl(r, r, 0.24, 8), x: sx * xs, y: r, z: sz * zs, rz: Math.PI / 2, color: 0x141416 });
  }
  return out;
}

function carGeo(kind, dims) {
  if (_carGeo[kind]) return _carGeo[kind];
  const { w, l } = dims;
  let parts;
  if (kind === 'bus') {
    parts = [
      { g: box(w, 2.2, l), y: 1.45, color: 0xffffff },
      { g: box(w + 0.02, 0.55, l * 0.82), y: 1.95, color: 0x1e2630 },   // window strip
      { g: box(w * 0.9, 0.3, 0.3), y: 0.55, z: l / 2 - 0.1, color: 0x55555c },
      ...carWheelParts(w, l * 0.8, 0.42),
    ];
  } else if (kind === 'van') {
    parts = [
      { g: box(w, 1.5, l), y: 1.05, color: 0xffffff },
      { g: box(w * 0.92, 0.5, 0.5), y: 1.55, z: l / 2 - 0.75, rx: -0.35, color: 0x1e2630 },
      { g: box(w, 0.3, 0.25), y: 0.45, z: l / 2, color: 0x55555c },
      ...carWheelParts(w, l, 0.36),
    ];
  } else if (kind === 'pickup') {
    parts = [
      { g: box(w, 0.7, l), y: 0.75, color: 0xffffff },                  // base + bed walls
      { g: box(w * 0.94, 0.75, l * 0.4), y: 1.35, z: l * 0.14, color: 0xffffff }, // cab
      { g: box(w * 0.86, 0.42, l * 0.34), y: 1.62, z: l * 0.14, color: 0x1e2630 },
      { g: box(w - 0.35, 0.12, l * 0.42), y: 0.72, z: -l * 0.26, color: 0x2a2a2e }, // bed floor
      ...carWheelParts(w, l, 0.38),
    ];
  } else { // sedan
    parts = [
      { g: box(w, 0.62, l), y: 0.62, color: 0xffffff },
      { g: box(w * 0.88, 0.5, l * 0.48), y: 1.15, z: -l * 0.05, color: 0xffffff },
      { g: box(w * 0.8, 0.4, l * 0.42), y: 1.2, z: -l * 0.05, sx: 1.02, color: 0x1e2630 },
      { g: box(w, 0.22, 0.3), y: 0.42, z: l / 2 - 0.05, color: 0x55555c },
      { g: box(w, 0.22, 0.3), y: 0.42, z: -l / 2 + 0.05, color: 0x55555c },
      ...carWheelParts(w, l, 0.34),
    ];
  }
  _carGeo[kind] = mergeParts(parts);
  return _carGeo[kind];
}

// front-white + rear-red glow quads merged; additive vertex-colored
let _lightsMat = null;
function lightsMat() {
  if (!_lightsMat) {
    _lightsMat = new THREE.MeshBasicMaterial({
      vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false,
    });
  }
  return _lightsMat;
}
const _lightsGeo = {};
function lightsGeo(kind, dims) {
  if (_lightsGeo[kind]) return _lightsGeo[kind];
  const { w, l } = dims;
  const y = kind === 'bus' ? 0.8 : 0.62;
  const parts = [];
  for (const sx of [-1, 1]) {
    parts.push({ g: new THREE.PlaneGeometry(0.3, 0.16), x: sx * (w / 2 - 0.3), y, z: l / 2 + 0.02, color: 0xfff2cc });
    parts.push({ g: new THREE.PlaneGeometry(0.28, 0.14), x: sx * (w / 2 - 0.3), y, z: -l / 2 - 0.02, ry: Math.PI, color: 0xff1808 });
  }
  _lightsGeo[kind] = lg(parts);
  return _lightsGeo[kind];
}
const lg = mergeParts; // alias keeps table above tidy

// headlight cones for night (additive, both sides merged)
let _coneGeo = null, _coneMat = null;
function coneGeo(dims) {
  if (!_coneGeo) {
    _coneGeo = mergeParts([
      { g: new THREE.ConeGeometry(1.6, 9, 6, 1, true), x: -0.55, y: 0.0, z: 4.5, rx: -Math.PI / 2, color: 0xffeebb },
      { g: new THREE.ConeGeometry(1.6, 9, 6, 1, true), x: 0.55, y: 0.0, z: 4.5, rx: -Math.PI / 2, color: 0xffeebb },
    ]);
  }
  return _coneGeo;
}
function coneMat() {
  if (!_coneMat) {
    _coneMat = new THREE.MeshBasicMaterial({
      color: 0x554a22, blending: THREE.AdditiveBlending, transparent: true,
      opacity: 0.35, depthWrite: false, side: THREE.DoubleSide,
    });
  }
  return _coneMat;
}

import { TRAFFIC_DIMS } from '../config.js';

/** Build a traffic car of `kind`; tint later via rig.mat.color. */
export function buildCar(kind, night) {
  const dims = TRAFFIC_DIMS[kind];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const root = new THREE.Group();
  const body = new THREE.Mesh(carGeo(kind, dims), mat);
  root.add(body);
  const lights = new THREE.Mesh(lightsGeo(kind, dims), lightsMat());
  root.add(lights);
  let cones = null;
  if (night) {
    cones = new THREE.Mesh(coneGeo(dims), coneMat());
    cones.position.set(0, 0.62, dims.l / 2);
    root.add(cones);
  }
  root.add(blobShadow(dims.w * 1.25, dims.l * 1.05));
  return { root, mat, kind, id: -1, stamp: 0 };
}

/** Cop cruiser: white sedan + red/blue light bar. */
export function buildCop(night) {
  const dims = TRAFFIC_DIMS.sedan;
  const rig = buildCar('sedan', night);
  rig.mat.color.setHex(0xf2f2f5);
  const barR = new THREE.Mesh(box(0.5, 0.16, 0.3), copRedMat);
  const barB = new THREE.Mesh(box(0.5, 0.16, 0.3), copBlueMat);
  barR.position.set(-0.28, 1.5, -dims.l * 0.05);
  barB.position.set(0.28, 1.5, -dims.l * 0.05);
  rig.root.add(barR, barB);
  // black hood/trunk accents
  const hood = new THREE.Mesh(box(dims.w * 0.6, 0.06, 1.1), new THREE.MeshLambertMaterial({ color: 0x18181c }));
  hood.position.set(0, 0.94, dims.l * 0.3);
  rig.root.add(hood);
  return rig;
}
