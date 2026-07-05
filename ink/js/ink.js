// INKWELL — ink diffusing through still water, following the cursor.
// A GPU stable-fluids solver (Stam): velocity + dye fields, semi-Lagrangian
// advection, vorticity confinement, Jacobi pressure projection. No libraries.
(function () {
  'use strict';

  const canvas = document.getElementById('stage');
  const errBox = document.getElementById('err');
  const hint = document.getElementById('hint');
  const fail = (m) => { errBox.textContent += m + '\n'; };

  const config = {
    SIM_RESOLUTION: 144,      // velocity grid
    DYE_RESOLUTION: 1024,     // ink grid
    DENSITY_DISSIPATION: 0.28,  // how fast ink fades (per second-ish)
    VELOCITY_DISSIPATION: 0.24, // how fast the water calms
    PRESSURE: 0.8,
    PRESSURE_ITERATIONS: 22,
    CURL: 26,                 // vorticity: swirl strength
    SPLAT_RADIUS: 0.005,
    SPLAT_FORCE: 5600,
    IDLE_DRIPS: true,
  };

  // ---------------- WebGL context ----------------
  const ctxParams = { alpha: false, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let gl = canvas.getContext('webgl2', ctxParams);
  const isWebGL2 = !!gl;
  if (!gl) gl = canvas.getContext('webgl', ctxParams) || canvas.getContext('experimental-webgl', ctxParams);
  if (!gl) { fail('WebGL is not available in this browser.'); return; }

  let halfFloatExt = null, supportLinearFiltering = false;
  if (isWebGL2) {
    gl.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_float_linear');
  } else {
    halfFloatExt = gl.getExtension('OES_texture_half_float');
    supportLinearFiltering = !!gl.getExtension('OES_texture_half_float_linear');
  }
  const texType = isWebGL2 ? gl.HALF_FLOAT : (halfFloatExt ? halfFloatExt.HALF_FLOAT_OES : null);
  if (texType == null) { fail('Half-float textures unsupported; the ink cannot flow here.'); return; }

  function renderable(internalFormat, format, type) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    return ok;
  }
  function pickFormat(internalFormat, format) {
    if (renderable(internalFormat, format, texType)) return { internalFormat, format };
    // walk up to RGBA which everything supports
    if (isWebGL2) {
      if (internalFormat === gl.R16F && renderable(gl.RG16F, gl.RG, texType)) return { internalFormat: gl.RG16F, format: gl.RG };
      if (renderable(gl.RGBA16F, gl.RGBA, texType)) return { internalFormat: gl.RGBA16F, format: gl.RGBA };
    }
    if (renderable(gl.RGBA, gl.RGBA, texType)) return { internalFormat: gl.RGBA, format: gl.RGBA };
    return null;
  }
  const fmtRGBA = isWebGL2 ? pickFormat(gl.RGBA16F, gl.RGBA) : pickFormat(gl.RGBA, gl.RGBA);
  const fmtRG = isWebGL2 ? pickFormat(gl.RG16F, gl.RG) : fmtRGBA;
  const fmtR = isWebGL2 ? pickFormat(gl.R16F, gl.RED) : fmtRGBA;
  if (!fmtRGBA || !fmtRG || !fmtR) { fail('No renderable float texture format found.'); return; }

  // ---------------- shaders ----------------
  function compile(type, src, defines = '') {
    const s = gl.createShader(type);
    gl.shaderSource(s, defines + src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      fail('Shader error:\n' + gl.getShaderInfoLog(s));
    }
    return s;
  }
  function program(fragSrc, defines = '') {
    const p = gl.createProgram();
    gl.attachShader(p, baseVertex);
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fragSrc, defines));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      fail('Link error:\n' + gl.getProgramInfoLog(p));
    }
    const uniforms = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const name = gl.getActiveUniform(p, i).name;
      uniforms[name] = gl.getUniformLocation(p, name);
    }
    return { p, u: uniforms, bind() { gl.useProgram(p); } };
  }

  const baseVertex = compile(gl.VERTEX_SHADER, `
    precision highp float;
    attribute vec2 aPosition;
    varying vec2 vUv;
    varying vec2 vL, vR, vT, vB;
    uniform vec2 texelSize;
    void main () {
      vUv = aPosition * 0.5 + 0.5;
      vL = vUv - vec2(texelSize.x, 0.0);
      vR = vUv + vec2(texelSize.x, 0.0);
      vT = vUv + vec2(0.0, texelSize.y);
      vB = vUv - vec2(0.0, texelSize.y);
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `);

  const copyFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    void main () { gl_FragColor = texture2D(uTexture, vUv); }
  `;
  const clearFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv;
    uniform sampler2D uTexture;
    uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }
  `;
  const splatFrag = `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTarget;
    uniform float aspectRatio;
    uniform vec3 color;
    uniform vec2 point;
    uniform float radius;
    void main () {
      vec2 p = vUv - point.xy;
      p.x *= aspectRatio;
      vec3 splat = exp(-dot(p, p) / radius) * color;
      vec3 base = texture2D(uTarget, vUv).xyz;
      gl_FragColor = vec4(base + splat, 1.0);
    }
  `;
  const advectionFrag = `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uVelocity;
    uniform sampler2D uSource;
    uniform vec2 texelSize;
    uniform vec2 dyeTexelSize;
    uniform float dt;
    uniform float dissipation;
    vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
      vec2 st = uv / tsize - 0.5;
      vec2 iuv = floor(st);
      vec2 fuv = fract(st);
      vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
      vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
      vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
      vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
      return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      float decay = 1.0 + dissipation * dt;
      gl_FragColor = result / decay;
    }
  `;
  const divergenceFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x;
      float R = texture2D(uVelocity, vR).x;
      float T = texture2D(uVelocity, vT).y;
      float B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) { L = -C.x; }
      if (vR.x > 1.0) { R = -C.x; }
      if (vT.y > 1.0) { T = -C.y; }
      if (vB.y < 0.0) { B = -C.y; }
      float div = 0.5 * (R - L + T - B);
      gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
    }
  `;
  const curlFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y;
      float R = texture2D(uVelocity, vR).y;
      float T = texture2D(uVelocity, vT).x;
      float B = texture2D(uVelocity, vB).x;
      float vorticity = R - L - T + B;
      gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
    }
  `;
  const vorticityFrag = `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uVelocity;
    uniform sampler2D uCurl;
    uniform float curl;
    uniform float dt;
    void main () {
      float L = texture2D(uCurl, vL).x;
      float R = texture2D(uCurl, vR).x;
      float T = texture2D(uCurl, vT).x;
      float B = texture2D(uCurl, vB).x;
      float C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force /= length(force) + 0.0001;
      force *= curl * C;
      force.y *= -1.0;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity += force * dt;
      velocity = min(max(velocity, -1000.0), 1000.0);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;
  const pressureFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure;
    uniform sampler2D uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      float divergence = texture2D(uDivergence, vUv).x;
      float pressure = (L + R + B + T - divergence) * 0.25;
      gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
    }
  `;
  const gradientSubtractFrag = `
    precision mediump float; precision mediump sampler2D;
    varying highp vec2 vUv, vL, vR, vT, vB;
    uniform sampler2D uPressure;
    uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x;
      float R = texture2D(uPressure, vR).x;
      float T = texture2D(uPressure, vT).x;
      float B = texture2D(uPressure, vB).x;
      vec2 velocity = texture2D(uVelocity, vUv).xy;
      velocity.xy -= vec2(R - L, T - B);
      gl_FragColor = vec4(velocity, 0.0, 1.0);
    }
  `;
  const displayFrag = `
    precision highp float; precision highp sampler2D;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    void main () {
      vec3 c = texture2D(uTexture, vUv).rgb;
      // deep water base + gentle vignette + soft gamma
      float d = distance(vUv, vec2(0.5, 0.5));
      float vig = 1.0 - 0.28 * smoothstep(0.35, 0.85, d);
      c = pow(max(c, 0.0), vec3(0.92)) * vig;
      vec3 bg = vec3(0.016, 0.02, 0.032) * vig;
      gl_FragColor = vec4(bg + c, 1.0);
    }
  `;

  const filteringDefine = supportLinearFiltering ? '' : '#define MANUAL_FILTERING\n';
  const progCopy = program(copyFrag);
  const progClear = program(clearFrag);
  const progSplat = program(splatFrag);
  const progAdvect = program(advectionFrag, filteringDefine);
  const progDivergence = program(divergenceFrag);
  const progCurl = program(curlFrag);
  const progVorticity = program(vorticityFrag);
  const progPressure = program(pressureFrag);
  const progGradient = program(gradientSubtractFrag);
  const progDisplay = program(displayFrag);

  // ---------------- fullscreen quad ----------------
  const quadVBO = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  const quadIBO = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadIBO);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);

  function blit(target) {
    if (target == null) {
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    } else {
      gl.viewport(0, 0, target.w, target.h);
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }

  // ---------------- FBOs ----------------
  const filter = supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
  function createFBO(w, h, fmt) {
    const tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internalFormat, w, h, 0, fmt.format, texType, null);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    return {
      tex, fbo, w, h,
      texelX: 1 / w, texelY: 1 / h,
      attach(unit) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        return unit;
      },
    };
  }
  function createDoubleFBO(w, h, fmt) {
    return {
      w, h, texelX: 1 / w, texelY: 1 / h,
      read: createFBO(w, h, fmt),
      write: createFBO(w, h, fmt),
      swap() { const t = this.read; this.read = this.write; this.write = t; },
    };
  }

  function getRes(base) {
    const aspect = gl.drawingBufferWidth / gl.drawingBufferHeight;
    const asp = aspect < 1 ? 1 / aspect : aspect;
    const min = Math.round(base), max = Math.round(base * asp);
    return gl.drawingBufferWidth > gl.drawingBufferHeight ? { w: max, h: min } : { w: min, h: max };
  }

  let dye, velocity, divergence, curl, pressure;
  function initFBOs() {
    const simRes = getRes(config.SIM_RESOLUTION);
    const dyeRes = getRes(Math.min(config.DYE_RESOLUTION, Math.max(gl.drawingBufferWidth, gl.drawingBufferHeight)));
    dye = createDoubleFBO(dyeRes.w, dyeRes.h, fmtRGBA);
    velocity = createDoubleFBO(simRes.w, simRes.h, fmtRG);
    divergence = createFBO(simRes.w, simRes.h, fmtR);
    curl = createFBO(simRes.w, simRes.h, fmtR);
    pressure = createDoubleFBO(simRes.w, simRes.h, fmtR);
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(canvas.clientWidth * dpr);
    const h = Math.floor(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      initFBOs();
    }
  }

  // ---------------- ink colors ----------------
  function hsv(h, s, v) {
    h = ((h % 1) + 1) % 1;
    const i = Math.floor(h * 6), f = h * 6 - i;
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const rgb = [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
    return { r: rgb[0], g: rgb[1], b: rgb[2] };
  }
  let hue = Math.random();
  const GOLDEN = 0.61803398875;

  // ---------------- sim passes ----------------
  function splat(x, y, dx, dy, color, radius) {
    progSplat.bind();
    gl.uniform1i(progSplat.u.uTarget, velocity.read.attach(0));
    gl.uniform1f(progSplat.u.aspectRatio, canvas.width / canvas.height);
    gl.uniform2f(progSplat.u.point, x, y);
    gl.uniform3f(progSplat.u.color, dx, dy, 0);
    gl.uniform1f(progSplat.u.radius, radius / 100);
    blit(velocity.write);
    velocity.swap();

    gl.uniform1i(progSplat.u.uTarget, dye.read.attach(0));
    gl.uniform3f(progSplat.u.color, color.r, color.g, color.b);
    blit(dye.write);
    dye.swap();
  }

  function step(dt) {
    gl.disable(gl.BLEND);

    progCurl.bind();
    gl.uniform2f(progCurl.u.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progCurl.u.uVelocity, velocity.read.attach(0));
    blit(curl);

    progVorticity.bind();
    gl.uniform2f(progVorticity.u.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progVorticity.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progVorticity.u.uCurl, curl.attach(1));
    gl.uniform1f(progVorticity.u.curl, config.CURL);
    gl.uniform1f(progVorticity.u.dt, dt);
    blit(velocity.write);
    velocity.swap();

    progDivergence.bind();
    gl.uniform2f(progDivergence.u.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progDivergence.u.uVelocity, velocity.read.attach(0));
    blit(divergence);

    progClear.bind();
    gl.uniform1i(progClear.u.uTexture, pressure.read.attach(0));
    gl.uniform1f(progClear.u.value, config.PRESSURE);
    blit(pressure.write);
    pressure.swap();

    progPressure.bind();
    gl.uniform2f(progPressure.u.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progPressure.u.uDivergence, divergence.attach(0));
    for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
      gl.uniform1i(progPressure.u.uPressure, pressure.read.attach(1));
      blit(pressure.write);
      pressure.swap();
    }

    progGradient.bind();
    gl.uniform2f(progGradient.u.texelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progGradient.u.uPressure, pressure.read.attach(0));
    gl.uniform1i(progGradient.u.uVelocity, velocity.read.attach(1));
    blit(velocity.write);
    velocity.swap();

    progAdvect.bind();
    gl.uniform2f(progAdvect.u.texelSize, velocity.texelX, velocity.texelY);
    if (!supportLinearFiltering) gl.uniform2f(progAdvect.u.dyeTexelSize, velocity.texelX, velocity.texelY);
    gl.uniform1i(progAdvect.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progAdvect.u.uSource, velocity.read.attach(0));
    gl.uniform1f(progAdvect.u.dt, dt);
    gl.uniform1f(progAdvect.u.dissipation, config.VELOCITY_DISSIPATION);
    blit(velocity.write);
    velocity.swap();

    if (!supportLinearFiltering) gl.uniform2f(progAdvect.u.dyeTexelSize, dye.texelX, dye.texelY);
    gl.uniform1i(progAdvect.u.uVelocity, velocity.read.attach(0));
    gl.uniform1i(progAdvect.u.uSource, dye.read.attach(1));
    gl.uniform1f(progAdvect.u.dissipation, config.DENSITY_DISSIPATION);
    blit(dye.write);
    dye.swap();
  }

  function render() {
    progDisplay.bind();
    gl.uniform1i(progDisplay.u.uTexture, dye.read.attach(0));
    blit(null);
  }

  // ---------------- pointers ----------------
  const pointers = new Map();
  let lastInteraction = performance.now();
  let hintFaded = false;

  function pointerXY(e) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: 1 - (e.clientY - rect.top) / rect.height,
    };
  }
  function touchInteraction() {
    lastInteraction = performance.now();
    if (!hintFaded) { hintFaded = true; hint.classList.add('faded'); }
  }

  function pointerMove(id, x, y, down) {
    let p = pointers.get(id);
    if (!p) {
      p = { x, y, hue: (hue += GOLDEN * 0.13), travel: 0 };
      pointers.set(id, p);
      return;
    }
    const dx = x - p.x, dy = y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= 0) return;
    touchInteraction();
    p.travel += dist;
    p.hue += dist * 0.22;                       // ink hue drifts as you swim
    const speed = Math.min(dist * 24, 1);
    const c = hsv(p.hue, 0.92, 1);
    const amt = down ? 0.55 : 0.16 + speed * 0.2;
    const radius = config.SPLAT_RADIUS * (down ? 2.6 : 1 + speed * 0.8);
    splat(x, y, dx * config.SPLAT_FORCE, dy * config.SPLAT_FORCE,
      { r: c.r * amt, g: c.g * amt, b: c.b * amt }, radius);
    p.x = x; p.y = y;
  }

  canvas.addEventListener('mousemove', (e) => {
    const { x, y } = pointerXY(e);
    pointerMove('mouse', x, y, e.buttons > 0);
  });
  canvas.addEventListener('mousedown', (e) => {
    const { x, y } = pointerXY(e);
    touchInteraction();
    hue += GOLDEN;                              // a fresh ink for each pour
    const p = pointers.get('mouse');
    if (p) p.hue = hue;
    const c = hsv(hue, 0.95, 1);
    splat(x, y, 0, 0, { r: c.r * 0.9, g: c.g * 0.9, b: c.b * 0.9 }, config.SPLAT_RADIUS * 4.5);
  });
  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const { x, y } = pointerXY(t);
      hue += GOLDEN * 0.5;
      pointers.set(t.identifier, { x, y, hue, travel: 0 });
      const c = hsv(hue, 0.95, 1);
      splat(x, y, 0, 0, { r: c.r * 0.7, g: c.g * 0.7, b: c.b * 0.7 }, config.SPLAT_RADIUS * 3.5);
    }
    touchInteraction();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      const { x, y } = pointerXY(t);
      pointerMove(t.identifier, x, y, true);
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    for (const t of e.changedTouches) pointers.delete(t.identifier);
  });
  canvas.addEventListener('mouseleave', () => pointers.delete('mouse'));

  let paused = false;
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'c') { initFBOs(); }              // still water again
    if (k === 'p') paused = !paused;
  });

  // ---------------- idle drips ----------------
  let nextDrip = performance.now() + 2200;
  function maybeDrip(now) {
    if (!config.IDLE_DRIPS || now < nextDrip) return;
    if (now - lastInteraction < 3500) { nextDrip = now + 1800; return; }
    nextDrip = now + 1600 + Math.random() * 2400;
    hue += GOLDEN * 0.31;
    const c = hsv(hue, 0.9, 1);
    const x = 0.15 + Math.random() * 0.7;
    const y = 0.15 + Math.random() * 0.7;
    const a = Math.random() * Math.PI * 2;
    const f = 120 + Math.random() * 320;
    const amt = 0.24 + Math.random() * 0.3;
    splat(x, y, Math.cos(a) * f, Math.sin(a) * f,
      { r: c.r * amt, g: c.g * amt, b: c.b * amt }, config.SPLAT_RADIUS * (1.6 + Math.random() * 2.2));
  }

  // ---------------- loop ----------------
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  // opening pour: three quiet blooms so the first frame isn't empty
  for (let i = 0; i < 3; i++) {
    hue += GOLDEN * 0.5;
    const c = hsv(hue, 0.9, 1);
    splat(0.3 + Math.random() * 0.4, 0.35 + Math.random() * 0.3,
      (Math.random() - 0.5) * 400, (Math.random() - 0.5) * 400,
      { r: c.r * 0.35, g: c.g * 0.35, b: c.b * 0.35 }, config.SPLAT_RADIUS * 3);
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.0333);
    last = now;
    resizeCanvas();
    maybeDrip(now);
    if (!paused && dt > 0) step(dt);
    render();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
