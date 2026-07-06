// render/effects.js — pooled particles & decals. Internal; only renderer.js
// imports this. Everything preallocated: zero per-frame allocation.

import * as THREE from 'three';

// local tunables
const N_SPARK = 220;
const N_PUFF = 160;       // dust + smoke share one soft-particle system pair
const N_DEBRIS = 22;
const N_SKID = 150;       // skid quads
const N_STREAK = 30;      // speed lines
const N_RAIN = 240;
const SKID_LIFE = 5.0;

// soft round point sprite with per-particle size/alpha
const PARTICLE_VS = /* glsl */`
  attribute float aSize;
  attribute float aAlpha;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vColor = color;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (240.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const PARTICLE_FS = /* glsl */`
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.12, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }`;

function makeParticleSys(n, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) pos[i * 3 + 1] = -1000;   // park dead below world
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
    vertexColors: true, transparent: true, depthWrite: false, blending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 8;
  return {
    mesh: pts, geo, n, head: 0,
    pos, col, size, alpha,
    vel: new Float32Array(n * 3),
    life: new Float32Array(n),
    maxLife: new Float32Array(n),
    grav: new Float32Array(n),
    grow: new Float32Array(n),
    baseA: new Float32Array(n),
  };
}

function spawn(sys, x, y, z, vx, vy, vz, life, size, r, g, b, grav, grow, a) {
  const i = sys.head; sys.head = (i + 1) % sys.n;
  sys.pos[i * 3] = x; sys.pos[i * 3 + 1] = y; sys.pos[i * 3 + 2] = z;
  sys.vel[i * 3] = vx; sys.vel[i * 3 + 1] = vy; sys.vel[i * 3 + 2] = vz;
  sys.col[i * 3] = r; sys.col[i * 3 + 1] = g; sys.col[i * 3 + 2] = b;
  sys.life[i] = life; sys.maxLife[i] = life;
  sys.size[i] = size; sys.grav[i] = grav; sys.grow[i] = grow; sys.baseA[i] = a;
  sys.alpha[i] = a;
}

function stepParticles(sys, dt) {
  const { pos, vel, life, maxLife, alpha, size, grav, grow, baseA, n } = sys;
  let any = false;
  for (let i = 0; i < n; i++) {
    if (life[i] <= 0) continue;
    any = true;
    life[i] -= dt;
    if (life[i] <= 0) { alpha[i] = 0; pos[i * 3 + 1] = -1000; continue; }
    vel[i * 3 + 1] -= grav[i] * dt;
    pos[i * 3] += vel[i * 3] * dt;
    pos[i * 3 + 1] += vel[i * 3 + 1] * dt;
    pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
    if (pos[i * 3 + 1] < 0.02 && grav[i] > 0) { pos[i * 3 + 1] = 0.02; vel[i * 3 + 1] *= -0.4; }
    const f = life[i] / maxLife[i];
    alpha[i] = baseA[i] * f;
    size[i] += grow[i] * dt;
  }
  if (any) {
    sys.geo.attributes.position.needsUpdate = true;
    sys.geo.attributes.aAlpha.needsUpdate = true;
    sys.geo.attributes.aSize.needsUpdate = true;
    sys.geo.attributes.color.needsUpdate = true;
  }
}

// ---------------------------------------------------------------------------
export function createEffects(scene, camera) {
  const sparks = makeParticleSys(N_SPARK, THREE.AdditiveBlending);
  const puffs = makeParticleSys(N_PUFF, THREE.NormalBlending);
  scene.add(sparks.mesh, puffs.mesh);

  // debris chunks
  const debrisGeo = new THREE.BoxGeometry(0.16, 0.1, 0.2);
  const debrisMat = new THREE.MeshLambertMaterial({ color: 0x33322f });
  const debris = new THREE.InstancedMesh(debrisGeo, debrisMat, N_DEBRIS);
  debris.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  debris.frustumCulled = false;
  scene.add(debris);
  const dArr = {
    pos: new Float32Array(N_DEBRIS * 3), vel: new Float32Array(N_DEBRIS * 3),
    rot: new Float32Array(N_DEBRIS * 3), life: new Float32Array(N_DEBRIS), head: 0,
  };

  // skid marks: pooled quads, dark rubber over the road via normal alpha blend.
  // Per-vertex alpha (sCol channel, reused) drives the fade — avoids the r185
  // MultiplyBlending+premultipliedAlpha console warning entirely.
  const skidGeo = new THREE.BufferGeometry();
  const sPos = new Float32Array(N_SKID * 4 * 3);
  const sCol = new Float32Array(N_SKID * 4);       // alpha per vertex (0 = gone)
  const sIdx = new Uint16Array(N_SKID * 6);
  for (let i = 0; i < N_SKID; i++) {
    const v = i * 4, o = i * 6;
    sIdx[o] = v; sIdx[o + 1] = v + 2; sIdx[o + 2] = v + 1;
    sIdx[o + 3] = v + 2; sIdx[o + 4] = v + 3; sIdx[o + 5] = v + 1;
  }
  skidGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  skidGeo.setAttribute('aAlpha', new THREE.BufferAttribute(sCol, 1).setUsage(THREE.DynamicDrawUsage));
  skidGeo.setIndex(new THREE.BufferAttribute(sIdx, 1));
  const skidMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    vertexShader: 'attribute float aAlpha; varying float vA; void main(){ vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying float vA; void main(){ if(vA < 0.01) discard; gl_FragColor = vec4(0.05, 0.05, 0.06, vA * 0.5); }',
  });
  const skidMesh = new THREE.Mesh(skidGeo, skidMat);
  skidMesh.frustumCulled = false;
  skidMesh.renderOrder = 2;
  scene.add(skidMesh);
  const skidLife = new Float32Array(N_SKID);

  // speed lines: additive line segments parented to the camera
  const stGeo = new THREE.BufferGeometry();
  const stPos = new Float32Array(N_STREAK * 2 * 3);
  const stData = new Float32Array(N_STREAK * 4);   // x,y,z,len per streak
  for (let i = 0; i < N_STREAK; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = 2 + Math.random() * 4.5;
    stData[i * 4] = Math.cos(a) * rr;
    stData[i * 4 + 1] = Math.sin(a) * rr * 0.7;
    stData[i * 4 + 2] = -4 - Math.random() * 26;
    stData[i * 4 + 3] = 2 + Math.random() * 4;
  }
  stGeo.setAttribute('position', new THREE.BufferAttribute(stPos, 3));
  const stMat = new THREE.LineBasicMaterial({
    color: 0xfff4dd, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthTest: false, depthWrite: false,
  });
  const streaks = new THREE.LineSegments(stGeo, stMat);
  streaks.frustumCulled = false;
  streaks.renderOrder = 20;
  camera.add(streaks);

  // rain (storm): short vertical line segments cycling around the camera
  const rnGeo = new THREE.BufferGeometry();
  const rnPos = new Float32Array(N_RAIN * 2 * 3);
  const rnBase = new Float32Array(N_RAIN * 3);
  for (let i = 0; i < N_RAIN; i++) {
    rnBase[i * 3] = (Math.random() - 0.5) * 30;
    rnBase[i * 3 + 1] = Math.random() * 14 - 2;
    rnBase[i * 3 + 2] = -3 - Math.random() * 26;
  }
  rnGeo.setAttribute('position', new THREE.BufferAttribute(rnPos, 3));
  const rnMat = new THREE.LineBasicMaterial({
    color: 0xaab4c4, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rnGeo, rnMat);
  rain.frustumCulled = false;
  rain.renderOrder = 19;
  rain.visible = false;
  camera.add(rain);

  return {
    scene, camera, sparks, puffs,
    debris, dArr, debrisGeo, debrisMat,
    skidGeo, skidMat, skidMesh, sPos, sCol, skidLife, skidHead: 0,
    streaks, stGeo, stMat, stPos, stData, streakI: 0,
    rain, rnGeo, rnMat, rnPos, rnBase,
    _m: new THREE.Matrix4(), _q: new THREE.Quaternion(), _e: new THREE.Euler(), _v: new THREE.Vector3(),
    _s1: new THREE.Vector3(1, 1, 1),
  };
}

// ---------------------------------------------------------------------------
// Bursts
// ---------------------------------------------------------------------------
export function sparkBurst(fx, x, y, z, nx, nz, n) {
  for (let i = 0; i < n; i++) {
    const sp = 2 + Math.random() * 6;
    // small, short-lived, hot-orange sparks: size ~0.8, life ~0.3s, color
    // stays under 1.3 on green/blue so bloom tints them amber, not white.
    spawn(fx.sparks, x, y + Math.random() * 0.4, z,
      nx * sp + (Math.random() - 0.5) * 3, 1 + Math.random() * 3.5, nz * sp + (Math.random() - 0.5) * 3,
      0.18 + Math.random() * 0.22, 0.7 + Math.random() * 0.5,
      1.5, 0.7 + Math.random() * 0.35, 0.18, 12, -1.2, 1);
  }
}

export function dustPuff(fx, x, y, z, n, big) {
  const s = big ? 2.2 : 1;
  for (let i = 0; i < n; i++) {
    spawn(fx.puffs, x + (Math.random() - 0.5) * 0.8, y + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.8,
      (Math.random() - 0.5) * 2.5 * s, 0.8 + Math.random() * 1.4 * s, (Math.random() - 0.5) * 2.5 * s,
      0.5 + Math.random() * 0.6 * s, (2 + Math.random() * 2) * s,
      0.62, 0.54, 0.42, -0.6, 4 * s, 0.5);
  }
}

export function smokeBurst(fx, x, y, z, n) {
  for (let i = 0; i < n; i++) {
    spawn(fx.puffs, x + (Math.random() - 0.5), y + Math.random() * 0.6, z + (Math.random() - 0.5),
      (Math.random() - 0.5) * 3, 1.5 + Math.random() * 2.5, (Math.random() - 0.5) * 3,
      0.8 + Math.random() * 0.9, 2.5 + Math.random() * 2,
      0.16, 0.15, 0.14, -1.2, 6, 0.65);
  }
}

export function debrisBurst(fx, x, y, z, tx, tz, n) {
  const d = fx.dArr;
  for (let i = 0; i < n; i++) {
    const j = d.head; d.head = (j + 1) % N_DEBRIS;
    d.pos[j * 3] = x; d.pos[j * 3 + 1] = y + 0.4; d.pos[j * 3 + 2] = z;
    d.vel[j * 3] = tx * (3 + Math.random() * 6) + (Math.random() - 0.5) * 5;
    d.vel[j * 3 + 1] = 3 + Math.random() * 5;
    d.vel[j * 3 + 2] = tz * (3 + Math.random() * 6) + (Math.random() - 0.5) * 5;
    d.rot[j * 3] = Math.random() * 6; d.rot[j * 3 + 1] = Math.random() * 6; d.rot[j * 3 + 2] = Math.random() * 6;
    d.life[j] = 1.2 + Math.random() * 0.8;
  }
}

/** Lay one skid quad from (x0,z0) to (x1,z1) at road height y. */
export function skidSeg(fx, x0, z0, x1, z1, y, w) {
  const dx = x1 - x0, dz = z1 - z0;
  const len = Math.hypot(dx, dz);
  if (len < 0.05 || len > 4) return;
  const px = (-dz / len) * w * 0.5, pz = (dx / len) * w * 0.5;
  const i = fx.skidHead; fx.skidHead = (i + 1) % N_SKID;
  const o = i * 12;
  const yy = y + 0.04;
  fx.sPos[o] = x0 - px; fx.sPos[o + 1] = yy; fx.sPos[o + 2] = z0 - pz;
  fx.sPos[o + 3] = x0 + px; fx.sPos[o + 4] = yy; fx.sPos[o + 5] = z0 + pz;
  fx.sPos[o + 6] = x1 - px; fx.sPos[o + 7] = yy; fx.sPos[o + 8] = z1 - pz;
  fx.sPos[o + 9] = x1 + px; fx.sPos[o + 10] = yy; fx.sPos[o + 11] = z1 + pz;
  fx.skidLife[i] = SKID_LIFE;
  fx.skidGeo.attributes.position.needsUpdate = true;
}

/** Speed-line intensity 0..1 (renderer feeds speed frac + draft boost). */
export function setStreaks(fx, intensity) {
  fx.stMat.opacity = intensity * 0.55;
}

export function setRain(fx, on) {
  fx.rain.visible = on;
}

// ---------------------------------------------------------------------------
export function fxUpdate(fx, dt, dtReal, playerSpeed) {
  stepParticles(fx.sparks, dt);
  stepParticles(fx.puffs, dt);

  // debris
  const d = fx.dArr;
  let anyD = false;
  for (let i = 0; i < N_DEBRIS; i++) {
    if (d.life[i] <= 0) continue;
    anyD = true;
    d.life[i] -= dt;
    d.vel[i * 3 + 1] -= 9.8 * dt;
    d.pos[i * 3] += d.vel[i * 3] * dt;
    d.pos[i * 3 + 1] += d.vel[i * 3 + 1] * dt;
    d.pos[i * 3 + 2] += d.vel[i * 3 + 2] * dt;
    if (d.pos[i * 3 + 1] < 0.06) { d.pos[i * 3 + 1] = 0.06; d.vel[i * 3 + 1] *= -0.35; d.vel[i * 3] *= 0.7; d.vel[i * 3 + 2] *= 0.7; }
    d.rot[i * 3] += dt * 7; d.rot[i * 3 + 2] += dt * 5;
    fx._e.set(d.rot[i * 3], d.rot[i * 3 + 1], d.rot[i * 3 + 2]);
    fx._q.setFromEuler(fx._e);
    fx._v.set(d.pos[i * 3], d.pos[i * 3 + 1], d.pos[i * 3 + 2]);
    fx._m.compose(fx._v, fx._q, fx._s1);
    fx.debris.setMatrixAt(i, fx._m);
  }
  if (anyD) fx.debris.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < N_DEBRIS; i++) {
    if (d.life[i] <= 0 && d.pos[i * 3 + 1] > -500) {
      d.pos[i * 3 + 1] = -1000;
      fx._v.set(0, -1000, 0);
      fx._m.compose(fx._v, fx._q, fx._s1);
      fx.debris.setMatrixAt(i, fx._m);
      fx.debris.instanceMatrix.needsUpdate = true;
    }
  }

  // skid fade — alpha per vertex, fresh = 1, decays to 0 over SKID_LIFE
  let anyS = false;
  for (let i = 0; i < N_SKID; i++) {
    if (fx.skidLife[i] <= 0) continue;
    anyS = true;
    fx.skidLife[i] -= dt;
    const a = Math.max(0, fx.skidLife[i] / SKID_LIFE);
    const o = i * 4;
    fx.sCol[o] = a; fx.sCol[o + 1] = a; fx.sCol[o + 2] = a; fx.sCol[o + 3] = a;
  }
  if (anyS) fx.skidGeo.attributes.aAlpha.needsUpdate = true;

  // speed lines rush toward the camera (camera-local space)
  if (fx.stMat.opacity > 0.01) {
    const v = Math.max(20, playerSpeed) * 2.2;
    for (let i = 0; i < N_STREAK; i++) {
      let z = fx.stData[i * 4 + 2] + v * dtReal;
      if (z > 1) z -= 31;
      fx.stData[i * 4 + 2] = z;
      const o = i * 6;
      fx.stPos[o] = fx.stData[i * 4]; fx.stPos[o + 1] = fx.stData[i * 4 + 1]; fx.stPos[o + 2] = z;
      fx.stPos[o + 3] = fx.stData[i * 4]; fx.stPos[o + 4] = fx.stData[i * 4 + 1]; fx.stPos[o + 5] = z - fx.stData[i * 4 + 3];
    }
    fx.stGeo.attributes.position.needsUpdate = true;
  }

  // rain falls in camera space
  if (fx.rain.visible) {
    for (let i = 0; i < N_RAIN; i++) {
      let y = fx.rnBase[i * 3 + 1] - 20 * dtReal;
      if (y < -3) y += 15;
      fx.rnBase[i * 3 + 1] = y;
      const o = i * 6;
      fx.rnPos[o] = fx.rnBase[i * 3]; fx.rnPos[o + 1] = y; fx.rnPos[o + 2] = fx.rnBase[i * 3 + 2];
      fx.rnPos[o + 3] = fx.rnBase[i * 3] + 0.06; fx.rnPos[o + 4] = y - 0.7; fx.rnPos[o + 5] = fx.rnBase[i * 3 + 2];
    }
    fx.rnGeo.attributes.position.needsUpdate = true;
  }
}

/** Kill all live effects (race restart) without reallocating. */
export function fxReset(fx) {
  fx.sparks.life.fill(0); fx.sparks.alpha.fill(0);
  fx.puffs.life.fill(0); fx.puffs.alpha.fill(0);
  fx.sparks.pos.fill(0); fx.puffs.pos.fill(0);
  for (let i = 0; i < fx.sparks.n; i++) fx.sparks.pos[i * 3 + 1] = -1000;
  for (let i = 0; i < fx.puffs.n; i++) fx.puffs.pos[i * 3 + 1] = -1000;
  fx.sparks.geo.attributes.position.needsUpdate = true;
  fx.puffs.geo.attributes.position.needsUpdate = true;
  fx.dArr.life.fill(0);
  fx.skidLife.fill(0);
  fx.sCol.fill(0);
  fx.skidGeo.attributes.aAlpha.needsUpdate = true;
  fx.stMat.opacity = 0;
}

export function disposeEffects(fx) {
  fx.scene.remove(fx.sparks.mesh, fx.puffs.mesh, fx.debris, fx.skidMesh);
  fx.camera.remove(fx.streaks, fx.rain);
  fx.sparks.geo.dispose(); fx.sparks.mesh.material.dispose();
  fx.puffs.geo.dispose(); fx.puffs.mesh.material.dispose();
  fx.debrisGeo.dispose(); fx.debrisMat.dispose(); fx.debris.dispose();
  fx.skidGeo.dispose(); fx.skidMat.dispose();
  fx.stGeo.dispose(); fx.stMat.dispose();
  fx.rnGeo.dispose(); fx.rnMat.dispose();
}
