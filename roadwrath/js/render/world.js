// render/world.js — road/terrain/sky/props construction + per-frame world anim.
// Internal to the render team; only renderer.js imports this.

import * as THREE from 'three';
import { ROAD_HALF_W, SHOULDER_W } from '../config.js';
import { makeRng, lerp } from '../util.js';
import { mergeParts } from './bikes.js';
import { sampleAt } from '../logic/tracks.js';

// local tunables
const SKY_R = 1300;
const SUN_DIST = 980;
const ROAD_TILE_M = 12;             // meters of road per texture repeat
const TERRAIN_ROW_STEP = 3;         // use every Nth centerline sample
const TERRAIN_OFF = [0, 8, 26, 60, 130, 250];
const TERRAIN_AMP = [0, 0.8, 3, 9, 22, 42];
const TERRAIN_FADE = [0, 0.1, 0.35, 0.65, 0.85, 1];
const HILL_FACTOR = {
  coast: 0.8, desert: 0.55, redwood: 1.2, city: 0.22, storm: 1.5,
  beach: 0.5, mountain: 1.7, hotwheels: 0.35, trackmania: 0.28,
};

const _s = { x: 0, y: 0, z: 0, tx: 0, tz: 1, curv: 0 };

// smooth deterministic 1D-ish noise (no allocation)
function tnoise(s, k) {
  return Math.sin(s * 0.011 + k * 7.1) * 0.55 + Math.sin(s * 0.0047 + k * 2.3) * 0.3
    + Math.sin(s * 0.031 + k * 13.7) * 0.15;
}

function cssHex(hex) { return '#' + hex.toString(16).padStart(6, '0'); }

// ---------------------------------------------------------------------------
// Canvas textures
// ---------------------------------------------------------------------------
function roadTexture(theme, rng) {
  const W = 256, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const fullW = (ROAD_HALF_W + SHOULDER_W) * 2;
  const shPx = Math.round((SHOULDER_W / fullW) * W);
  g.fillStyle = cssHex(theme.shoulderColor);
  g.fillRect(0, 0, W, H);
  g.fillStyle = cssHex(theme.roadColor);
  g.fillRect(shPx, 0, W - shPx * 2, H);
  // asphalt speckle + shoulder grit — dark-biased so it never reads as snow
  // and never trips bloom; on-road specks are 1px and low-alpha.
  for (let i = 0; i < 700; i++) {
    const x = rng() * W, y = rng() * H;
    const onRoad = x > shPx && x < W - shPx;
    g.fillStyle = rng() < 0.28 ? 'rgba(210,210,220,0.04)' : 'rgba(0,0,0,0.11)';
    g.fillRect(x, y, onRoad ? 1 : 2, onRoad ? 1 : 2);
  }
  // shoulders must read as NOT-ROAD at a glance — players were riding them
  // thinking they were pavement and blaming the offroad drag on a bug.
  // (1) darken the whole shoulder band, (2) diagonal rumble hatching.
  g.fillStyle = 'rgba(0,0,0,0.16)';
  g.fillRect(0, 0, shPx, H);
  g.fillRect(W - shPx, 0, shPx, H);
  g.strokeStyle = 'rgba(0,0,0,0.28)';
  g.lineWidth = 3;
  for (let y = -shPx; y < H + shPx; y += 10) {
    g.beginPath(); g.moveTo(0, y); g.lineTo(shPx, y + shPx); g.stroke();
    g.beginPath(); g.moveTo(W, y); g.lineTo(W - shPx, y + shPx); g.stroke();
  }
  // bold edge lines (white) right at the pavement boundary
  const laneW = 5;
  g.fillStyle = 'rgba(240,240,232,0.95)';
  g.fillRect(shPx, 0, laneW, H);
  g.fillRect(W - shPx - laneW, 0, laneW, H);
  // double yellow dashed centerline: dash 3m over ROAD_TILE_M tile
  const dashH = Math.round(H * (3 / ROAD_TILE_M));
  g.fillStyle = cssHex(theme.stripeColor);
  for (const off of [-5, 2]) {
    g.fillRect(W / 2 + off, 0, 3, dashH);
    g.fillRect(W / 2 + off, H / 2, 3, dashH);
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = THREE.ClampToEdgeWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.anisotropy = 4;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function sunTexture(theme) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const c = new THREE.Color(theme.sunColor);
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, `rgba(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0},0.9)`);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function signTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 64;
  const g = cv.getContext('2d');
  g.fillStyle = '#4a4a4e'; g.fillRect(0, 0, 128, 64);          // pole patch corner
  g.fillStyle = '#1d6a38'; g.fillRect(10, 6, 112, 52);
  g.strokeStyle = '#e8e8e0'; g.lineWidth = 3;
  g.strokeRect(13, 9, 106, 46);
  g.fillStyle = '#e8e8e0';
  g.font = 'bold 15px sans-serif'; g.textAlign = 'center';
  g.fillText('WRATH 500', 66, 30);
  g.font = 'bold 12px sans-serif';
  g.fillText('NEXT EXIT', 66, 48);
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function buildingTexture(rng) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  g.fillStyle = '#0c0c14'; g.fillRect(0, 0, 128, 128);
  for (let y = 8; y < 120; y += 12) {
    for (let x = 8; x < 120; x += 10) {
      if (rng() < 0.42) {
        g.fillStyle = rng() < 0.2 ? '#ffd890' : rng() < 0.5 ? '#9ac8ff' : '#ffb060';
        g.fillRect(x, y, 5, 7);
      }
    }
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function chevronTexture(hex) {
  // upward-pointing chevrons on transparent — additive so it reads as a glow
  const W = 64, H = 128;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, W, H);
  const c = new THREE.Color(hex);
  g.strokeStyle = `rgb(${(c.r * 255) | 0},${(c.g * 255) | 0},${(c.b * 255) | 0})`;
  g.lineWidth = 10; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let k = 0; k < 3; k++) {
    const y = 18 + k * 40;                 // three stacked arrows up the tile
    g.beginPath();
    g.moveTo(8, y + 22);
    g.lineTo(W / 2, y);
    g.lineTo(W - 8, y + 22);
    g.stroke();
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.wrapS = THREE.ClampToEdgeWrapping;
  tx.wrapT = THREE.RepeatWrapping;
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

function checkerTexture() {
  const cv = document.createElement('canvas');
  cv.width = 128; cv.height = 32;
  const g = cv.getContext('2d');
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) {
    g.fillStyle = (x + y) % 2 ? '#101010' : '#f0f0e8';
    g.fillRect(x * 8, y * 8, 8, 8);
  }
  const tx = new THREE.CanvasTexture(cv);
  tx.colorSpace = THREE.SRGBColorSpace;
  return tx;
}

// ---------------------------------------------------------------------------
// Sky
// ---------------------------------------------------------------------------
const SKY_VS = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
  }`;
const SKY_FS = /* glsl */`
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 sunColor;
  uniform vec3 sunDir;
  uniform float flash;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(bottomColor, topColor, smoothstep(0.48, 0.75, h));
    float sunAmt = pow(max(dot(d, sunDir), 0.0), 5.0);
    col += sunColor * sunAmt * 0.4;
    col = mix(col, vec3(1.0, 1.0, 1.08), flash * 0.75);
    gl_FragColor = vec4(col, 1.0);
  }`;

// ---------------------------------------------------------------------------
// Water (coast)
// ---------------------------------------------------------------------------
const WATER_VS = /* glsl */`
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const WATER_FS = /* glsl */`
  uniform float time;
  uniform vec3 deepColor;
  uniform vec3 skyColor;
  uniform vec3 sunColor;
  uniform vec3 fogColor;
  uniform float fogDensity;
  uniform vec3 camPos;
  varying vec3 vWorld;
  void main() {
    float d = distance(vWorld, camPos);
    float far = clamp(d / 900.0, 0.0, 1.0);
    vec3 col = mix(deepColor, skyColor, far * 0.7);
    // cheap moving specular shimmer
    float s1 = sin(vWorld.x * 0.9 + time * 2.1) * sin(vWorld.z * 1.1 - time * 1.7);
    float s2 = sin(vWorld.x * 0.23 - time * 0.9) * sin(vWorld.z * 0.31 + time * 1.1);
    float sp = pow(max(0.0, s1 * s2), 8.0);
    col += sunColor * sp * (1.0 - far) * 1.6;
    float fog = 1.0 - exp(-d * fogDensity);
    col = mix(col, fogColor, fog);
    gl_FragColor = vec4(col, 1.0);
  }`;

// ---------------------------------------------------------------------------
// Prop geometry (origin at ground, meters)
// ---------------------------------------------------------------------------
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, seg = 7) => new THREE.CylinderGeometry(rt, rb, h, seg);
const cone = (r, h, seg = 7) => new THREE.ConeGeometry(r, h, seg);

function propGeo(kind, toy) {
  switch (kind) {
    case 'palm': {
      const parts = [
        { g: cyl(0.16, 0.32, 6.2, 6), y: 3.1, rz: 0.09, color: 0x8a6a48 },
      ];
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        parts.push({
          g: box(0.35, 0.08, 2.6), x: Math.cos(a) * 1.1 + 0.3, y: 6.3 - Math.abs(Math.sin(a)) * 0.2, z: Math.sin(a) * 1.1,
          ry: -a, rz: Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5, color: 0x4a8a3c,
        });
      }
      return mergeParts(parts);
    }
    case 'cactus': return mergeParts([
      { g: cyl(0.32, 0.38, 3.8, 7), y: 1.9, color: 0x4a7a44 },
      { g: cyl(0.2, 0.22, 1.5, 6), x: 0.75, y: 2.6, rz: Math.PI / 2, color: 0x4a7a44 },
      { g: cyl(0.2, 0.22, 1.3, 6), x: 1.35, y: 3.3, color: 0x4a7a44 },
      { g: cyl(0.18, 0.2, 1.1, 6), x: -0.65, y: 2.1, rz: Math.PI / 2, color: 0x548a4c },
      { g: cyl(0.18, 0.2, 1.0, 6), x: -1.1, y: 2.6, color: 0x548a4c },
    ]);
    case 'redwood': return mergeParts([
      { g: cyl(0.55, 1.0, 9, 7), y: 4.5, color: 0x6a3a26 },
      { g: cone(3.4, 7, 7), y: 10, color: 0x2a4a2c },
      { g: cone(2.6, 6, 7), y: 14, color: 0x315636 },
      { g: cone(1.7, 5, 7), y: 17.5, color: 0x2a4a2c },
    ]);
    case 'pine': return mergeParts([
      { g: cyl(0.3, 0.5, 4, 6), y: 2, color: 0x5a4030 },
      { g: cone(2.2, 4.5, 7), y: 5.5, color: 0x35543a },
      { g: cone(1.5, 3.6, 7), y: 8.2, color: 0x2e4a34 },
    ]);
    case 'rock': return mergeParts([
      { g: new THREE.IcosahedronGeometry(1.5, 0), y: 0.7, sy: 0.7, color: 0x8a8478 },
      { g: new THREE.IcosahedronGeometry(0.9, 0), x: 1.2, y: 0.4, sy: 0.6, color: 0x7a7468 },
    ]);
    case 'fern': {
      const parts = [];
      for (let i = 0; i < 4; i++) {
        parts.push({ g: cone(0.7, 1.8, 4), x: Math.cos(i * 1.9) * 0.3, y: 0.8, z: Math.sin(i * 1.9) * 0.3, rx: 0.3 * Math.cos(i * 2.4), rz: 0.3 * Math.sin(i * 2.1), color: i % 2 ? 0x3a6a34 : 0x4a7a3c });
      }
      return mergeParts(parts);
    }
    case 'sign': return mergeParts([
      { g: cyl(0.09, 0.09, 3.4, 6), y: 1.7, color: 0xffffff, uvRect: [0, 0, 0.05, 0.05] },
      { g: box(2.6, 1.4, 0.1), y: 3.6, color: 0xffffff, uvRect: [0.02, 0.02, 0.98, 0.98] },
    ]);
    case 'lamppost': return mergeParts([
      { g: cyl(0.09, 0.13, 6, 6), y: 3, color: 0x2e2e34 },
      { g: box(1.6, 0.09, 0.09), x: -0.7, y: 5.95, color: 0x2e2e34 },
      { g: box(0.55, 0.14, 0.28), x: -1.4, y: 5.86, color: 0xfff2c8 },
    ]);
    case 'building': {
      const g = new THREE.BoxGeometry(11, 26, 11);
      g.translate(0, 13, 0);
      return g;
    }
    case 'umbrella': {
      // beach parasol: thin pole + tilted canvas cone, striped by two cone caps
      const parts = [
        { g: cyl(0.05, 0.06, 2.6, 6), y: 1.3, color: 0xb8b0a0 },
        { g: cone(1.9, 0.9, 10), y: 2.7, color: 0xe23a3a },
        { g: cone(1.55, 0.55, 10), y: 2.86, color: 0xf5f2ea },
        { g: new THREE.SphereGeometry(0.09, 6, 5), y: 3.2, color: 0xf5f2ea },
      ];
      return mergeParts(parts);
    }
    case 'barn': {
      // countryside barn: red body + darker gable roof + white door
      return mergeParts([
        { g: box(6, 3.4, 8), y: 1.7, color: 0x9e3226 },
        { g: box(6.4, 0.2, 8.4), y: 3.4, color: 0x7a241a },
        { g: cyl(2.15, 2.15, 8.2, 4), y: 4.55, rx: Math.PI / 2, ry: Math.PI / 4, color: 0x6a4a34 }, // gable ridge
        { g: box(1.6, 2.2, 0.15), y: 1.1, z: 4.02, color: 0xd8d2c4 },   // door
        { g: box(4.4, 0.14, 8.2), y: 3.42, z: 0, rz: 0.62, x: -1.8, color: 0x5a3a28 },
        { g: box(4.4, 0.14, 8.2), y: 3.42, z: 0, rz: -0.62, x: 1.8, color: 0x5a3a28 },
      ]);
    }
    case 'cone': {
      // traffic cone: orange cone on a square base, white reflective band
      const c1 = toy ? 0xff7a10 : 0xe8621a;
      return mergeParts([
        { g: box(0.7, 0.08, 0.7), y: 0.04, color: 0x2a2a2e },
        { g: cone(0.34, 1.0, 8), y: 0.55, color: c1 },
        { g: cyl(0.24, 0.3, 0.16, 8), y: 0.55, color: 0xf2f2ea },
      ]);
    }
    case 'toyblock': {
      // bright plastic building block with four studs on top
      const cols = [0xe23838, 0x2a8fe2, 0xf2c020, 0x38c060];
      const col = cols[(Math.random() * cols.length) | 0];
      const parts = [{ g: box(1.6, 1.0, 1.6), y: 0.5, color: col }];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        parts.push({ g: cyl(0.28, 0.28, 0.24, 10), x: sx * 0.42, y: 1.12, z: sz * 0.42, color: col });
      }
      return mergeParts(parts);
    }
    case 'pillar': {
      // stadium light pillar: tall grey column + floodlight head
      return mergeParts([
        { g: box(1.0, 0.5, 1.0), y: 0.25, color: 0x2a2c34 },
        { g: cyl(0.32, 0.46, 12, 8), y: 6.2, color: 0x53575f },
        { g: box(2.6, 1.2, 0.5), y: 12.4, z: -0.3, rx: -0.4, color: 0x1c1e24 },   // lamp housing
        { g: box(2.3, 0.9, 0.2), y: 12.3, z: -0.05, rx: -0.4, color: 0xfff6d8 },  // lit face
      ]);
    }
    case 'grandstand': {
      // tiered spectator stand: three stepped decks with a dark crowd band
      const parts = [];
      const tiers = 3;
      for (let t = 0; t < tiers; t++) {
        const w = 14, d = 2.2, h = 1.1;
        parts.push({ g: box(w, h, d), x: 0, y: 0.55 + t * 1.0, z: t * 1.9, color: 0x8a8f9a }); // deck
        parts.push({ g: box(w - 0.6, 0.7, 0.7), x: 0, y: 1.2 + t * 1.0, z: t * 1.9 - 0.7, color: 0x1c2230 }); // crowd
      }
      parts.push({ g: box(14.6, 0.3, tiers * 1.9 + 1), x: 0, y: 0.15, z: (tiers - 1) * 0.95, color: 0x33363e });
      return mergeParts(parts);
    }
    case 'loopprop': {
      // roadside loop-marker signpost: a small vertical ring on a short mast so
      // the theme's loop motif reads even away from the real stunt loops
      const ringR = 1.2, tube = 0.16, seg = 18;
      const ring = new THREE.TorusGeometry(ringR, tube, 6, seg);
      const c = toy ? 0xff6a1a : 0xc85028;
      return mergeParts([
        { g: cyl(0.12, 0.16, 2.4, 6), y: 1.2, color: 0x3a3c44 },
        { g: ring, y: 3.6, color: c },
      ]);
    }
    default: return mergeParts([{ g: box(1, 1, 1), y: 0.5, color: 0x888888 }]);
  }
}

const PROP_HEIGHT = {                 // for baked shadow length
  palm: 6.5, cactus: 3.8, redwood: 18, pine: 9, rock: 1.6,
  fern: 1.2, sign: 4, lamppost: 6, building: 26,
  umbrella: 3.2, barn: 5, cone: 1.2, toyblock: 1.3, pillar: 13,
  grandstand: 4, loopprop: 4.8,
};

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function buildWorldInto(scene, camera, track, theme) {
  const rng = makeRng(9127);
  const group = new THREE.Group();
  scene.add(group);
  const night = !!theme.night;
  const n = track.px.length;
  const W = ROAD_HALF_W + SHOULDER_W;

  scene.fog = new THREE.FogExp2(theme.fogColor, theme.fogDensity);

  // --- lights
  const sunDir = new THREE.Vector3(...theme.sunDir).normalize();
  const dir = new THREE.DirectionalLight(theme.sunColor, night ? 0.7 : 1.6);
  dir.position.copy(sunDir).multiplyScalar(120);
  const hemi = new THREE.HemisphereLight(theme.hemiSky, theme.hemiGround, theme.ambient * 1.7);
  // Per-theme render polish: the new themes read pale with their high ambient +
  // thin fog, so restore contrast/mood render-side (key light vs. fill). Only
  // the render interpretation is tuned here — palette constants stay in config.
  if (track.theme === 'beach') {
    dir.intensity = 2.1;                     // hard low sun glinting off sand/sea
    hemi.intensity = theme.ambient * 1.35;
  } else if (track.theme === 'mountain') {
    dir.intensity = 2.0;                     // crisp alpine key light
    hemi.intensity = theme.ambient * 1.4;
  } else if (track.theme === 'hotwheels') {
    // Plastic colours are vivid; a strong key light drives them past 1.0 and
    // ACES desaturates to white. Moderate sun + bright ambient so the mid-orange
    // road (config) lights up to saturated plastic without clipping.
    dir.intensity = 1.5;
    hemi.intensity = theme.ambient * 1.5;
  } else if (track.theme === 'trackmania') {
    dir.intensity = 2.6;                     // stadium floodlight blaze
    dir.color.setHex(0xf4f6ff);              // cool white floods
    hemi.intensity = theme.ambient * 1.5;
  }
  group.add(dir, dir.target, hemi);

  // --- sky group (follows camera)
  const skyGroup = new THREE.Group();
  group.add(skyGroup);
  const skyU = {
    topColor: { value: new THREE.Color(theme.skyTop) },
    bottomColor: { value: new THREE.Color(theme.skyBottom) },
    sunColor: { value: new THREE.Color(theme.sunColor) },
    sunDir: { value: sunDir },
    flash: { value: 0 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_R, 20, 12),
    new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms: skyU, side: THREE.BackSide, depthWrite: false }),
  );
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  skyGroup.add(sky);

  // fat glowing sun billboard — bright enough to bloom
  const sun = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      map: sunTexture(theme), transparent: true, depthWrite: false, fog: false,
      blending: THREE.AdditiveBlending, color: new THREE.Color(1.6, 1.5, 1.35),
    }),
  );
  const sunScale = night ? 120 : 300;
  sun.scale.set(sunScale, sunScale, 1);
  sun.position.copy(sunDir).multiplyScalar(SUN_DIST);
  sun.lookAt(0, 0, 0);
  sun.renderOrder = -9;
  skyGroup.add(sun);

  let stars = null;
  if (night) {
    const sp = new Float32Array(420 * 3);
    for (let i = 0; i < 420; i++) {
      const a = rng() * Math.PI * 2, e = 0.06 + rng() * 0.9;
      const ce = Math.cos(e * Math.PI / 2);
      sp[i * 3] = Math.cos(a) * ce * 1150;
      sp[i * 3 + 1] = Math.sin(e * Math.PI / 2) * 1150;
      sp[i * 3 + 2] = Math.sin(a) * ce * 1150;
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    stars = new THREE.Points(sg, new THREE.PointsMaterial({
      color: 0xcdd8ff, size: 2.4, sizeAttenuation: false, fog: false,
      transparent: true, opacity: 0.85, depthWrite: false,
    }));
    stars.frustumCulled = false;
    stars.renderOrder = -8;
    skyGroup.add(stars);
  }

  // --- road ribbon (pavement + shoulders in one textured strip)
  {
    const pos = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2);
    const idx = new (n * 2 > 65000 ? Uint32Array : Uint16Array)((n - 1) * 6);
    for (let i = 0; i < n; i++) {
      const nx = track.tz[i], nz = -track.tx[i];
      const jit = (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.09; // shoulder jitter
      const bk = track.bank ? track.bank[i] : 0;
      const cb = Math.cos(bk), sb = Math.sin(bk);
      for (let e = 0; e < 2; e++) {
        const sgn = e === 0 ? -1 : 1;
        const o = (i * 2 + e) * 3;
        // roll the cross-section: outer edge lifts by sin(bank)*W, lateral by cos(bank)
        const lat = sgn * W * cb;
        pos[o] = track.px[i] + nx * lat;
        pos[o + 1] = track.py[i] + jit * 0.5 + sgn * sb * W;
        pos[o + 2] = track.pz[i] + nz * lat;
        uv[(i * 2 + e) * 2] = e;
        uv[(i * 2 + e) * 2 + 1] = (i * track.sampleStep) / ROAD_TILE_M;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const o = i * 6, v = i * 2;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2;
      idx[o + 3] = v + 1; idx[o + 4] = v + 3; idx[o + 5] = v + 2;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const road = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ map: roadTexture(theme, rng) }));
    road.frustumCulled = false;
    group.add(road);
  }

  // --- barriers (jersey walls both edges, one mesh)
  if (track.barriers) {
    const bx = ROAD_HALF_W + 0.6, bh = 0.85;
    const vpr = 4;                                  // verts per row per side
    const pos = new Float32Array(n * vpr * 2 * 3);
    const col = new Float32Array(n * vpr * 2 * 3);
    const idx = new (n * vpr * 2 > 65000 ? Uint32Array : Uint16Array)((n - 1) * (vpr - 1) * 6 * 2);
    const cBase = new THREE.Color(night ? 0x55555e : 0x9a968c);
    let ii = 0;
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const base = side * n * vpr;
      const bk = track.bank ? track.bank : null;
      for (let i = 0; i < n; i++) {
        const nx = track.tz[i], nz = -track.tx[i];
        const b = bk ? bk[i] : 0;
        const cb = Math.cos(b), sb = Math.sin(b);
        // profile: outer base, outer top, inner top, inner base
        const prof = [[bx + 0.28, 0], [bx + 0.06, bh], [bx - 0.06, bh], [bx - 0.28, 0]];
        for (let v = 0; v < vpr; v++) {
          const o = (base + i * vpr + v) * 3;
          // roll the profile point (lat,height) about the road centre so the
          // wall stays glued to the banked shoulder and tilts with it
          const pl = sgn * prof[v][0], ph = prof[v][1];
          const rl = pl * cb - ph * sb;                 // lateral after roll
          const ry = pl * sb + ph * cb;
          pos[o] = track.px[i] + nx * rl;
          pos[o + 1] = track.py[i] + ry;
          pos[o + 2] = track.pz[i] + nz * rl;
          const sh = v === 1 || v === 2 ? 1 : 0.72;   // fake AO at base
          col[o] = cBase.r * sh; col[o + 1] = cBase.g * sh; col[o + 2] = cBase.b * sh;
        }
        if (i < n - 1) {
          for (let v = 0; v < vpr - 1; v++) {
            const a = base + i * vpr + v, b = base + (i + 1) * vpr + v;
            idx[ii++] = a; idx[ii++] = b; idx[ii++] = a + 1;
            idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = a + 1;
          }
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    const wall = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    wall.frustumCulled = false;
    group.add(wall);
  }

  // --- terrain strips (both sides, per-vertex color to terrainFar)
  let minPy = Infinity;
  for (let i = 0; i < n; i++) if (track.py[i] < minPy) minPy = track.py[i];
  const waterY = minPy - 4;
  const hillF = HILL_FACTOR[track.theme] ?? 0.8;
  const coast = !!theme.water;
  {
    const rows = Math.floor((n - 1) / TERRAIN_ROW_STEP) + 1;
    const cols = TERRAIN_OFF.length;
    const cNear = new THREE.Color(theme.terrainColor);
    const cFar = new THREE.Color(theme.terrainFar);
    for (let side = 0; side < 2; side++) {
      const sgn = side === 0 ? -1 : 1;
      const pos = new Float32Array(rows * cols * 3);
      const col = new Float32Array(rows * cols * 3);
      const idx = new (rows * cols > 65000 ? Uint32Array : Uint16Array)((rows - 1) * (cols - 1) * 6);
      for (let r = 0; r < rows; r++) {
        const i = Math.min(n - 1, r * TERRAIN_ROW_STEP);
        const s = i * track.sampleStep;
        const nx = track.tz[i], nz = -track.tx[i];
        const bk = track.bank ? track.bank[i] : 0;
        for (let c = 0; c < cols; c++) {
          // innermost column hugs the road's outer edge — roll it with the bank
          // so the shoulder stays welded to the banked ribbon (outer edge lifts)
          const rollLat = c === 0 ? Math.cos(bk) : 1;
          const lat = sgn * (W * rollLat + TERRAIN_OFF[c]);
          let h = tnoise(s + c * 61, c * 3 + side * 11) * TERRAIN_AMP[c] * hillF;
          let y = lerp(track.py[i], track.py[i] * 0.3, TERRAIN_FADE[c]) + (c === 0 ? -0.04 : h);
          if (c === 0) y += sgn * Math.sin(bk) * W;
          if (c > 0 && !(coast && sgn < 0)) y = Math.max(y, waterY + 3);
          if (coast && sgn < 0 && c >= 2) {
            y = lerp(track.py[i] * 0.4, waterY - 2, (c - 2) / (cols - 3)) + h * 0.15;
          }
          const o = (r * cols + c) * 3;
          pos[o] = track.px[i] + nx * lat;
          pos[o + 1] = y;
          pos[o + 2] = track.pz[i] + nz * lat;
          const f = TERRAIN_FADE[c];
          const shade = 0.9 + tnoise(s * 3.7, c * 5 + 2) * 0.12;
          col[o] = lerp(cNear.r, cFar.r, f) * shade;
          col[o + 1] = lerp(cNear.g, cFar.g, f) * shade;
          col[o + 2] = lerp(cNear.b, cFar.b, f) * shade;
        }
      }
      let ii = 0;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c, b = (r + 1) * cols + c;
          if (side === 0) { idx[ii++] = a; idx[ii++] = a + 1; idx[ii++] = b; idx[ii++] = a + 1; idx[ii++] = b + 1; idx[ii++] = b; }
          else { idx[ii++] = a; idx[ii++] = b; idx[ii++] = a + 1; idx[ii++] = b; idx[ii++] = b + 1; idx[ii++] = a + 1; }
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeVertexNormals();
      const terr = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
      terr.frustumCulled = false;
      group.add(terr);
    }
  }

  // --- ocean (coast)
  let water = null, waterU = null;
  if (coast) {
    // centroid of the track for plane placement
    let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { cx += track.px[i]; cz += track.pz[i]; }
    cx /= n; cz /= n;
    waterU = {
      time: { value: 0 },
      deepColor: { value: new THREE.Color(0x1a4a6a) },
      skyColor: { value: new THREE.Color(theme.skyBottom) },
      sunColor: { value: new THREE.Color(theme.sunColor) },
      fogColor: { value: new THREE.Color(theme.fogColor) },
      fogDensity: { value: theme.fogDensity * 0.6 },
      camPos: { value: camera.position },
    };
    water = new THREE.Mesh(
      new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2),
      new THREE.ShaderMaterial({ vertexShader: WATER_VS, fragmentShader: WATER_FS, uniforms: waterU }),
    );
    water.position.set(cx, waterY, cz);
    water.frustumCulled = false;
    water.renderOrder = -5;
    group.add(water);
  }

  // --- props: InstancedMesh per kind + one shadow-quad InstancedMesh
  {
    const byKind = {};
    for (const p of track.props) (byKind[p.kind] ||= []).push(p);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const shadowMats = [];
    const toy = !!theme.toy;
    for (const kind of Object.keys(byKind)) {
      const list = byKind[kind];
      const geo = propGeo(kind, toy);
      let mat;
      if (kind === 'building') {
        mat = new THREE.MeshBasicMaterial({ map: buildingTexture(rng), color: new THREE.Color(1.35, 1.3, 1.25) });
      } else if (kind === 'sign') {
        mat = new THREE.MeshLambertMaterial({ map: signTexture(), vertexColors: true });
      } else {
        // toy themes: nudge vertex colors brighter so plastic reads saturated
        mat = new THREE.MeshLambertMaterial({ vertexColors: true });
        if (toy) mat.color.setRGB(1.18, 1.18, 1.18);
      }
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      let glow = null;
      if (kind === 'lamppost' && night) {
        glow = new THREE.InstancedMesh(
          new THREE.ConeGeometry(2.1, 5.6, 6, 1, true).translate(0, -2.8, 0),
          new THREE.MeshBasicMaterial({ color: 0x8a7a3a, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
          list.length,
        );
        glow.renderOrder = 5;
      }
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        sampleAt(track, p.s, _s);
        const nx = _s.tz, nz = -_s.tx;
        v.set(_s.x + nx * p.x, _s.y, _s.z + nz * p.x);
        e.set(0, rng() * Math.PI * 2, 0);
        if (kind === 'sign') e.y = Math.atan2(_s.tx, _s.tz) + Math.PI;   // face riders
        q.setFromEuler(e);
        sc.setScalar(p.scale);
        if (kind === 'building') sc.y = p.scale * (0.6 + rng() * 1.2);
        m4.compose(v, q, sc);
        im.setMatrixAt(i, m4);
        if (glow) {
          v.y = _s.y + 5.8 * p.scale;
          v.x += -1.4 * Math.cos(e.y) * p.scale;
          v.z += 1.4 * Math.sin(e.y) * p.scale;
          m4.compose(v, q, sc);
          glow.setMatrixAt(i, m4);
        }
        shadowMats.push({ p, kind });
      }
      im.frustumCulled = false;
      group.add(im);
      if (glow) { glow.frustumCulled = false; group.add(glow); }
    }
    // baked long shadows stretched along -sunDir (skip when moonlit night)
    if (!night && shadowMats.length) {
      const sdx = -sunDir.x, sdz = -sunDir.z;
      const sl = Math.hypot(sdx, sdz) || 1;
      const ang = Math.atan2(sdx / sl, sdz / sl);
      const shGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2).translate(0, 0, 0.5);
      const sh = new THREE.InstancedMesh(
        shGeo,
        new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
        shadowMats.length,
      );
      for (let i = 0; i < shadowMats.length; i++) {
        const { p, kind } = shadowMats[i];
        sampleAt(track, p.s, _s);
        const nx = _s.tz, nz = -_s.tx;
        v.set(_s.x + nx * p.x, _s.y + 0.05, _s.z + nz * p.x);
        e.set(0, ang, 0);
        q.setFromEuler(e);
        const hgt = (PROP_HEIGHT[kind] || 3) * p.scale;
        sc.set(Math.max(1, hgt * 0.35), 1, hgt * (0.9 / Math.max(0.25, sunDir.y)) * 0.35);
        m4.compose(v, q, sc);
        sh.setMatrixAt(i, m4);
      }
      sh.frustumCulled = false;
      sh.renderOrder = 1;
      group.add(sh);
    }
  }

  // --- start line + finish gate
  {
    const m4 = new THREE.Matrix4();
    sampleAt(track, 2, _s);
    const start = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF_W * 2, 1.2).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xd8d8d0, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    );
    start.position.set(_s.x, _s.y + 0.03, _s.z);
    start.rotation.y = Math.atan2(_s.tx, _s.tz);
    group.add(start);

    sampleAt(track, track.length, _s);
    // posts sample one dark checker cell so they read as plain metal
    const gateGeo = mergeParts([
      { g: cyl(0.18, 0.18, 6, 7), x: -ROAD_HALF_W - 0.8, y: 3, color: 0xd8d8d0, uvRect: [0.001, 0.001, 0.02, 0.02] },
      { g: cyl(0.18, 0.18, 6, 7), x: ROAD_HALF_W + 0.8, y: 3, color: 0xd8d8d0, uvRect: [0.001, 0.001, 0.02, 0.02] },
      { g: box((ROAD_HALF_W + 1) * 2, 1.4, 0.15), y: 5.6, color: 0xffffff, uvRect: [0, 0, 1, 1] },
    ]);
    const gate = new THREE.Mesh(gateGeo, new THREE.MeshLambertMaterial({ map: checkerTexture(), vertexColors: true }));
    gate.position.set(_s.x, _s.y, _s.z);
    gate.rotation.y = Math.atan2(_s.tx, _s.tz);
    group.add(gate);
  }

  // --- boost pads: glowing chevron strips laid on the road through each zone
  let boostMat = null;
  const zones = track.boostZones || [];
  if (zones.length) {
    // toy tracks pop cyan, everything else warm orange
    const glowHex = theme.toy ? 0x18d8ff : 0xff9422;
    boostMat = new THREE.MeshBasicMaterial({
      map: chevronTexture(glowHex), color: new THREE.Color(2.0, 1.6, 0.9),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3,
    });
    if (theme.toy) boostMat.color.setRGB(0.9, 1.7, 2.2);
    const padStep = 4;                       // one quad row per centerline sample-ish
    const half = ROAD_HALF_W * 0.62;
    let rows = 0;
    for (const z of zones) rows += Math.floor((z.s1 - z.s0) / padStep) + 1;
    const pos = new Float32Array(rows * 4 * 3);
    const uv = new Float32Array(rows * 4 * 2);
    const idx = new (rows * 4 > 65000 ? Uint32Array : Uint16Array)(rows * 6);
    let vo = 0, io = 0, vbase = 0, urow = 0;
    for (const z of zones) {
      const count = Math.floor((z.s1 - z.s0) / padStep) + 1;
      for (let k = 0; k < count; k++) {
        const s0 = z.s0 + k * padStep;
        const s1 = Math.min(z.s1, s0 + padStep * 0.92);
        // roll each row with the road bank (same convention as the ribbon:
        // +x edge lifts sin(bank), lateral compresses cos(bank)) — a flat
        // strip floats on one side and buries on the other in banked corners
        sampleAt(track, s0, _s);
        const nx0 = _s.tz, nz0 = -_s.tx, x0 = _s.x, y0 = _s.y, z0 = _s.z;
        const cb0 = Math.cos(_s.bank), sb0 = Math.sin(_s.bank);
        sampleAt(track, s1, _s);
        const nx1 = _s.tz, nz1 = -_s.tx, x1 = _s.x, y1 = _s.y, z1 = _s.z;
        const cb1 = Math.cos(_s.bank), sb1 = Math.sin(_s.bank);
        // quad: near-left, near-right, far-left, far-right
        pos[vo] = x0 - nx0 * half * cb0; pos[vo + 1] = y0 - sb0 * half + 0.05; pos[vo + 2] = z0 - nz0 * half * cb0;
        pos[vo + 3] = x0 + nx0 * half * cb0; pos[vo + 4] = y0 + sb0 * half + 0.05; pos[vo + 5] = z0 + nz0 * half * cb0;
        pos[vo + 6] = x1 - nx1 * half * cb1; pos[vo + 7] = y1 - sb1 * half + 0.05; pos[vo + 8] = z1 - nz1 * half * cb1;
        pos[vo + 9] = x1 + nx1 * half * cb1; pos[vo + 10] = y1 + sb1 * half + 0.05; pos[vo + 11] = z1 + nz1 * half * cb1;
        uv[urow] = 0; uv[urow + 1] = k; uv[urow + 2] = 1; uv[urow + 3] = k;
        uv[urow + 4] = 0; uv[urow + 5] = k + 1; uv[urow + 6] = 1; uv[urow + 7] = k + 1;
        idx[io] = vbase; idx[io + 1] = vbase + 2; idx[io + 2] = vbase + 1;
        idx[io + 3] = vbase + 1; idx[io + 4] = vbase + 2; idx[io + 5] = vbase + 3;
        vo += 12; urow += 8; io += 6; vbase += 4;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    const pads = new THREE.Mesh(g, boostMat);
    pads.frustumCulled = false;
    pads.renderOrder = 3;
    group.add(pads);
  }

  // --- fake loops: decorative vertical torus at each trigger, ring in the
  // TRAVEL plane (a loop you ride up the inside of — matches the sim's y-arc
  // and the rig's 2π pitch), not a face-on hoop. Centered R past the trigger
  // so the rider's arc starts right at the ring's mouth. Free-standing like a
  // real Hot Wheels loop — no posts (they stood in the middle of the road).
  const loops = track.loops || [];
  for (const lp of loops) {
    const R = lp.radius || 9;
    sampleAt(track, lp.s + R, _s);
    const tubeR = Math.max(0.6, R * 0.11);
    const torus = new THREE.TorusGeometry(R, tubeR, 10, 30);
    // bright orange plastic for toy tracks, brushed metal for the stadium
    const mat = theme.toy
      ? new THREE.MeshLambertMaterial({ color: 0xff6a1a, emissive: 0x431400 })
      : new THREE.MeshLambertMaterial({ color: 0x9aa0aa, emissive: 0x0a0c12 });
    const loop = new THREE.Mesh(torus, mat);
    // TorusGeometry lies in local XY (hole along +Z): yaw by heading+90° so the
    // ring plane CONTAINS the travel direction and the hole faces sideways.
    const heading = Math.atan2(_s.tx, _s.tz);
    loop.position.set(_s.x, _s.y + R, _s.z);
    loop.rotation.y = heading + Math.PI / 2;
    loop.frustumCulled = false;
    group.add(loop);
  }

  return {
    group, dir, hemi, skyGroup, skyU, sun, stars, water, waterU,
    night, rain: !!theme.rain, boostMat,
    lightning: { next: 3 + Math.random() * 5, flash: 0, dirBase: dir.intensity },
    theme,
  };
}

// ---------------------------------------------------------------------------
/** Per-frame world animation: sky follows camera, water time, storm lightning. */
export function updateWorld(world, dtReal, camera) {
  world.skyGroup.position.copy(camera.position);
  if (world.waterU) world.waterU.time.value += dtReal;
  if (world.boostMat && world.boostMat.map) {
    // scroll chevrons forward so the pads read as "flowing" toward the finish
    world.boostMat.map.offset.y -= dtReal * 1.6;
  }
  const L = world.lightning;
  if (world.theme.rain) {
    L.flash *= Math.exp(-7 * dtReal);
    L.next -= dtReal;
    if (L.next <= 0) {
      L.flash = 0.8 + Math.random() * 0.4;
      L.next = Math.random() < 0.3 ? 0.12 : 2.5 + Math.random() * 6;  // double strikes
    }
    world.skyU.flash.value = Math.min(1, L.flash);
    world.dir.intensity = L.dirBase + L.flash * 2.2;
  }
}
