// DOOMED — WebGL2 renderer. The map rides to the GPU as data textures and a
// fragment shader raymarches every pixel: per-pixel lightmap pools, dynamic
// lights, animated lava, sky sectors, bullet decals. Sprites are depth-
// tested quads. A bloom pass makes the muzzle flashes bleed. If anything
// here fails, the software renderer carries on unbothered.
(function () {
  const MAX_LIGHTS = 8;
  const MAX_DECALS = 24;
  const FAR = 48.0;

  const gl2 = {
    ok: false, glcv: null, gl: null,
    W: 960, H: 540,
    decals: [], motes: [],

    init(glCanvas) {
      try {
        this.glcv = glCanvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.W = Math.min(1920, Math.round(960 * dpr));
        this.H = Math.min(1080, Math.round(540 * dpr));
        glCanvas.width = this.W; glCanvas.height = this.H;
        const gl = glCanvas.getContext('webgl2', { alpha: false, antialias: false, depth: true, preserveDrawingBuffer: true });
        if (!gl) return false;
        this.gl = gl;
        this.buildAtlas();
        this.buildSpriteAtlas();
        this.buildPrograms();
        this.buildBuffers();
        this.buildTargets();
        this.ok = true;
        console.info(`DOOMED: WebGL2 renderer online at ${this.W}x${this.H}`);
      } catch (err) {
        console.error('DOOMED: WebGL init failed, using software renderer.', err);
        this.ok = false;
      }
      return this.ok;
    },

    // ---------- texture atlases ----------
    buildAtlas() {
      const gl = this.gl, TS = D.tex.SIZE;
      // 4x4 grid of 128px tiles: indices 1..9 walls, 12=floor 13=ceil 14=lava
      const data = new Uint8Array(512 * 512 * 4);
      const put = (tex, slot) => {
        const ox = (slot % 4) * TS, oy = ((slot / 4) | 0) * TS;
        for (let y = 0; y < TS; y++) {
          for (let x = 0; x < TS; x++) {
            const s = ((y * TS) + x) * 4, d = ((oy + y) * 512 + ox + x) * 4;
            data[d] = tex.data[s]; data[d + 1] = tex.data[s + 1];
            data[d + 2] = tex.data[s + 2]; data[d + 3] = 255;
          }
        }
      };
      for (let i = 1; i <= 9; i++) put(D.tex.list[i], i);
      put(D.tex.flats.floor, 12);
      put(D.tex.flats.ceil, 13);
      put(D.tex.flats.lava, 14);
      this.atlasTex = this.makeTex(512, 512, data, gl.NEAREST);
    },

    buildSpriteAtlas() {
      const gl = this.gl;
      // shelf-pack every baked sprite into 1024x1024
      const A = 1024;
      const data = new Uint8Array(A * A * 4);
      this.sprUV = {};
      let cx = 0, cy = 0, rowH = 0;
      for (const [name, spr] of Object.entries(D.sprites.all)) {
        if (cx + spr.w + 2 > A) { cx = 0; cy += rowH + 2; rowH = 0; }
        rowH = Math.max(rowH, spr.h);
        for (let y = 0; y < spr.h; y++) {
          for (let x = 0; x < spr.w; x++) {
            const s = (y * spr.w + x) * 4, d = ((cy + y) * A + cx + x) * 4;
            data[d] = spr.data[s]; data[d + 1] = spr.data[s + 1];
            data[d + 2] = spr.data[s + 2]; data[d + 3] = spr.data[s + 3];
          }
        }
        this.sprUV[name] = [cx / A, cy / A, spr.w / A, spr.h / A];
        cx += spr.w + 2;
      }
      this.spriteTex = this.makeTex(A, A, data, gl.NEAREST);
    },

    makeTex(w, h, data, filter, internal, format, type) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, internal || gl.RGBA, w, h, 0, format || gl.RGBA, type || gl.UNSIGNED_BYTE, data);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    },

    // ---------- shaders ----------
    compile(type, src) {
      const gl = this.gl;
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).slice(0, 40).join('\n'));
      }
      return s;
    },
    program(vs, fs) {
      const gl = this.gl;
      const p = gl.createProgram();
      gl.attachShader(p, this.compile(gl.VERTEX_SHADER, vs));
      gl.attachShader(p, this.compile(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
      const u = {};
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const nm = gl.getActiveUniform(p, i).name.replace('[0]', '');
        u[nm] = gl.getUniformLocation(p, gl.getActiveUniform(p, i).name);
      }
      return { p, u };
    },

    buildPrograms() {
      const QUAD_VS = `#version 300 es
      layout(location=0) in vec2 aPos;
      out vec2 vUv;
      void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

      // ---- the world: per-pixel sector raymarch ----
      const WORLD_FS = `#version 300 es
      precision highp float;
      in vec2 vUv;
      out vec4 outC;
      uniform sampler2D uMap;      // R floorH, G ceilH, B cellTex*32+stepTex, A doorOpen
      uniform sampler2D uLight;    // rgb lightmap *0.5, a stain
      uniform sampler2D uAtlas;
      uniform vec2 uMapSize;
      uniform vec2 uRes;
      uniform vec3 uPos;           // x, y, eyeZ
      uniform vec4 uDir;           // dirX dirY planeX planeY
      uniform float uPitch;        // horizon shift in NDC-ish rows
      uniform float uBoost;
      uniform float uTime;
      uniform int uNL;
      uniform vec3 uLPos[${MAX_LIGHTS}];   // x, y, strength
      uniform vec4 uLCol[${MAX_LIGHTS}];   // rgb, k
      uniform int uND;
      uniform vec4 uDecal[${MAX_DECALS}];  // x, y, z, axis(0=x wall,1=y wall)

      const float CEIL_STD = ${(1.4).toFixed(2)};

      vec4 cellAt(ivec2 c){
        if (c.x < 0 || c.y < 0 || c.x >= int(uMapSize.x) || c.y >= int(uMapSize.y))
          return vec4(0.0, 0.0, 4.0*32.0, 1.0); // outside: solid stone
        return texelFetch(uMap, c, 0);
      }
      vec3 lightAt(vec2 w){
        vec3 l = texture(uLight, w / uMapSize).rgb * 3.0;
        for (int i = 0; i < ${MAX_LIGHTS}; i++){
          if (i >= uNL) break;
          vec2 d = w - uLPos[i].xy;
          float f = uLPos[i].z / (1.0 + dot(d,d) * uLCol[i].a);
          l += uLCol[i].rgb * f;
        }
        return min(l, vec3(1.7));
      }
      float fogAt(float t){ return min(1.25 / (1.0 + t*t*0.035) + uBoost, 1.2); }

      vec3 tileUV(float tex, vec2 uv){
        float slot = tex;
        vec2 o = vec2(mod(slot, 4.0), floor(slot / 4.0)) * 0.25;
        return texture(uAtlas, o + fract(uv) * 0.25).rgb;
      }
      vec3 sampleWall(float tex, vec2 uv){
        // animated computer wall: blink the little lights
        if (tex > 2.5 && tex < 3.5) {
          vec2 cell = floor(fract(uv) * vec2(8.0, 4.0));
          float ph = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453 + uTime * 0.3);
          vec3 c = tileUV(tex, uv);
          if (ph > 0.94 && c.g > 0.4) c *= 2.2;
          return c;
        }
        return tileUV(tex, uv);
      }
      vec3 skyColor(vec2 rd, float up){
        // parallax hellsky over open sectors
        float a = atan(rd.y, rd.x);
        vec3 base = mix(vec3(0.16, 0.03, 0.03), vec3(0.45, 0.10, 0.06), clamp(up*1.6+0.4, 0.0, 1.0));
        float clouds = sin(a * 3.0 + uTime * 0.05) * sin(up * 9.0 + a * 5.0 - uTime * 0.11);
        base += vec3(0.10, 0.02, 0.01) * smoothstep(0.2, 0.9, clouds);
        base += vec3(0.5, 0.25, 0.1) * pow(max(0.0, sin(a*1.0 - 0.8) * (0.4 - up)), 6.0);
        return base;
      }

      void main(){
        vec2 frag = vUv * uRes;
        float camX = (2.0 * frag.x / uRes.x) - 1.0;
        vec2 rd = uDir.xy + uDir.zw * camX;
        float horizon = uRes.y * 0.5 + uPitch;
        // shear ray: vertical slope per unit of perpendicular distance
        float slope = (frag.y - horizon) / (uRes.y);
        // note: gl frag y is up; software y was down. flip handled by caller pitch sign.

        vec2 pos = uPos.xy;
        float eyeZ = uPos.z;
        ivec2 cell = ivec2(floor(pos));
        vec2 dd = abs(1.0 / max(abs(rd), vec2(1e-6)));
        ivec2 stp = ivec2(rd.x < 0.0 ? -1 : 1, rd.y < 0.0 ? -1 : 1);
        vec2 sd = (vec2(rd.x < 0.0 ? pos.x - float(cell.x) : float(cell.x) + 1.0 - pos.x,
                        rd.y < 0.0 ? pos.y - float(cell.y) : float(cell.y) + 1.0 - pos.y)) * dd;
        float tIn = 0.001;
        vec3 col = vec3(0.0);
        float tHit = ${FAR.toFixed(1)};
        bool hit = false;

        for (int i = 0; i < 64 && !hit; i++){
          vec4 c = cellAt(cell);
          float cTexP = c.b;
          float cellTex = floor(cTexP / 32.0);
          float stepTex = mod(cTexP, 32.0);
          float tOut = min(sd.x, sd.y);
          bool solid = cellTex > 0.5 && c.a >= 1.0;   // doors: a<1 handled below

          if (cellTex > 0.5 && c.a < 1.0) {
            // door cell: recessed plane at cell center
            float tMid;
            vec2 hitW;
            bool xside = false;
            // choose the axis whose midplane the ray crosses inside this cell
            float tmx = (float(cell.x) + 0.5 - pos.x) / (abs(rd.x) < 1e-6 ? 1e9 : rd.x);
            float tmy = (float(cell.y) + 0.5 - pos.y) / (abs(rd.y) < 1e-6 ? 1e9 : rd.y);
            tMid = -1.0;
            if (tmx > tIn - 0.001 && tmx < tOut + 0.001) { tMid = tmx; xside = true; }
            if (tmy > tIn - 0.001 && tmy < tOut + 0.001 && (tMid < 0.0 || tmy < tMid)) { tMid = tmy; xside = false; }
            if (tMid > 0.0) {
              hitW = pos + rd * tMid;
              float coord = xside ? fract(hitW.y) : fract(hitW.x);
              if (coord >= c.a) {
                float h = eyeZ + slope * tMid;
                if (h > 0.0 && h < CEIL_STD) {
                  vec2 uv = vec2(coord - c.a, CEIL_STD - h);
                  col = sampleWall(cellTex, uv) * lightAt(hitW - rd * 0.02) * fogAt(tMid) * (xside ? 1.0 : 0.76);
                  tHit = tMid; hit = true; break;
                }
              }
            }
            // passes through the opening: continue the march
          } else if (solid) {
            float h = eyeZ + slope * tIn;
            vec2 hitW = pos + rd * tIn;
            float texU = uvwSide > 0.9 ? fract(hitW.y) : fract(hitW.x);
            vec3 base = sampleWall(cellTex, vec2(texU, CEIL_STD - h));
            col = base * lightAt(hitW - rd * 0.02) * fogAt(tIn) * uvwSide;
            // decals: bullet holes on this wall plane
            for (int dgi = 0; dgi < ${MAX_DECALS}; dgi++){
              if (dgi >= uND) break;
              vec3 dp = uDecal[dgi].xyz;
              float dd2 = dot(hitW - dp.xy, hitW - dp.xy) + (h - dp.z) * (h - dp.z);
              if (dd2 < 0.0012) col *= 0.35;
              else if (dd2 < 0.003) col *= 0.75;
            }
            tHit = tIn; hit = true; break;
          } else {
            float fH = c.r, cH = c.g;
            float h0 = eyeZ + slope * tIn;
            float h1 = eyeZ + slope * tOut;
            // arriving below the floor or above the ceiling: step face at tIn
            if (h0 < fH - 0.0005 || h0 > cH + 0.0005) {
              vec2 hitW = pos + rd * tIn;
              float texU = uvwSide > 0.9 ? fract(hitW.y) : fract(hitW.x);
              float anchor = h0 < fH ? fH : cH;
              vec3 base = sampleWall(stepTex, vec2(texU, anchor - h0));
              col = base * lightAt(hitW - rd * 0.02) * fogAt(tIn) * uvwSide;
              for (int dgi = 0; dgi < ${MAX_DECALS}; dgi++){
                if (dgi >= uND) break;
                vec3 dp = uDecal[dgi].xyz;
                float dd2 = dot(hitW - dp.xy, hitW - dp.xy) + (h0 - dp.z) * (h0 - dp.z);
                if (dd2 < 0.0012) col *= 0.35;
              }
              tHit = tIn; hit = true; break;
            }
            // floor hit inside this cell? (looking down: slope < 0)
            if (slope < -0.0001 && h1 <= fH) {
              float tF = (fH - eyeZ) / slope;
              vec2 w = pos + rd * tF;
              float ftex = fH < -0.01 ? 14.0 : 12.0;
              vec2 uv = w;
              if (ftex > 13.5) uv += vec2(uTime * 0.06, sin(uTime * 0.4 + w.x) * 0.05); // lava creeps
              vec3 base = tileUV(ftex, uv);
              if (ftex > 13.5) base *= 1.3 + 0.3 * sin(uTime * 2.0 + w.x * 3.0 + w.y * 2.0);
              vec4 lst = texture(uLight, w / uMapSize);
              vec3 l = lightAt(w);
              float st = lst.a;
              base *= vec3(1.0 - st * 0.25, 1.0 - st * 0.72, 1.0 - st * 0.72);
              col = base * l * fogAt(tF);
              tHit = tF; hit = true; break;
            }
            // ceiling hit? sky sectors have cH >= 2.5 (looking up: slope > 0)
            if (slope > 0.0001 && h1 >= cH) {
              float tC = (cH - eyeZ) / slope;
              if (cH >= 2.5) {
                col = skyColor(normalize(rd), slope);
                tHit = ${FAR.toFixed(1)} * 0.99; hit = true; break;
              }
              vec2 w = pos + rd * tC;
              col = tileUV(13.0, w) * lightAt(w) * fogAt(tC) * 0.72;
              tHit = tC; hit = true; break;
            }
          }

          // advance DDA
          if (sd.x < sd.y) { tIn = sd.x; sd.x += dd.x; cell.x += stp.x; uvwSide = 1.0; }
          else { tIn = sd.y; sd.y += dd.y; cell.y += stp.y; uvwSide = 0.76; }
        }
        if (!hit) col = vec3(0.01, 0.008, 0.008);
        outC = vec4(col, 1.0);
        gl_FragDepth = clamp(tHit / ${FAR.toFixed(1)}, 0.0, 0.9999);
      }`;

      // side-shading needs a mutable global in GLSL: declare and thread it
      const WORLD_FS_FIXED = WORLD_FS.replace(
        'void main(){',
        'float uvwSide = 1.0;\n      void main(){'
      );

      const SPRITE_VS = `#version 300 es
      layout(location=0) in vec4 aPos;    // ndc x, ndc y, depth t, pad
      layout(location=1) in vec4 aUV;     // u, v, lightscale, flash
      layout(location=2) in vec4 aTint;
      out vec2 vUv; out vec4 vTint; out float vFlash;
      void main(){
        vUv = aUV.xy; vTint = aTint; vFlash = aUV.w;
        float z = clamp(aPos.z / ${FAR.toFixed(1)}, 0.0, 0.9999) * 2.0 - 1.0;
        gl_Position = vec4(aPos.x, aPos.y, z, 1.0);
      }`;
      const SPRITE_FS = `#version 300 es
      precision highp float;
      in vec2 vUv; in vec4 vTint; in float vFlash;
      uniform sampler2D uSpr;
      out vec4 outC;
      void main(){
        vec4 c = texture(uSpr, vUv);
        if (c.a < 0.5) discard;
        outC = vec4(c.rgb * vTint.rgb + vFlash, vTint.a);
      }`;

      const BLUR_FS = `#version 300 es
      precision highp float;
      in vec2 vUv; out vec4 outC;
      uniform sampler2D uT;
      uniform vec2 uDirPx;
      void main(){
        vec3 s = texture(uT, vUv).rgb * 0.294;
        s += texture(uT, vUv + uDirPx * 1.333).rgb * 0.353;
        s += texture(uT, vUv - uDirPx * 1.333).rgb * 0.353;
        outC = vec4(s, 1.0);
      }`;
      const BRIGHT_FS = `#version 300 es
      precision highp float;
      in vec2 vUv; out vec4 outC;
      uniform sampler2D uT;
      void main(){
        vec3 c = texture(uT, vUv).rgb;
        float l = dot(c, vec3(0.3, 0.55, 0.15));
        outC = vec4(c * smoothstep(0.62, 0.95, l), 1.0);
      }`;
      const COMPOSITE_FS = `#version 300 es
      precision highp float;
      in vec2 vUv; out vec4 outC;
      uniform sampler2D uT;
      uniform sampler2D uBloom;
      void main(){
        vec3 c = texture(uT, vUv).rgb + texture(uBloom, vUv).rgb * 0.85;
        // gentle filmic-ish curve + vignette
        c = c / (c + vec3(0.55)) * 1.55;
        float d = distance(vUv, vec2(0.5));
        c *= 1.0 - 0.32 * smoothstep(0.42, 0.85, d);
        outC = vec4(c, 1.0);
      }`;

      this.pWorld = this.program(QUAD_VS, WORLD_FS_FIXED);
      this.pSprite = this.program(SPRITE_VS, SPRITE_FS);
      this.pBlur = this.program(QUAD_VS, BLUR_FS);
      this.pBright = this.program(QUAD_VS, BRIGHT_FS);
      this.pComposite = this.program(QUAD_VS, COMPOSITE_FS);
    },

    buildBuffers() {
      const gl = this.gl;
      this.quadVBO = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      // sprite batch: dynamic
      this.sprVBO = gl.createBuffer();
      this.sprData = new Float32Array(4096 * 12);
    },

    buildTargets() {
      const gl = this.gl;
      const mk = (w, h, depth) => {
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        const tex = this.makeTex(w, h, null, gl.LINEAR);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        if (depth) {
          const rb = gl.createRenderbuffer();
          gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
          gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
          gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb);
        }
        return { fb, tex, w, h };
      };
      this.rtScene = mk(this.W, this.H, true);
      const bw = this.W >> 2, bh = this.H >> 2;
      this.rtA = mk(bw, bh, false);
      this.rtB = mk(bw, bh, false);
    },

    // ---------- per-frame map/light upload ----------
    syncMap(view) {
      const gl = this.gl;
      const map = view.map, MW = map.w, MH = map.h;
      if (!this.mapData || this.mapMW !== MW || this.mapMH !== MH) {
        this.mapMW = MW; this.mapMH = MH;
        this.mapData = new Float32Array(MW * MH * 4);
        this.lightData = new Uint8Array(MW * MH * 4);
        if (this.mapTex) { gl.deleteTexture(this.mapTex); gl.deleteTexture(this.lightTex); }
        this.mapTex = this.makeTex(MW, MH, null, gl.NEAREST, gl.RGBA32F, gl.RGBA, gl.FLOAT);
        this.lightTex = this.makeTex(MW, MH, null, gl.LINEAR, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
      }
      const md = this.mapData, ld = this.lightData;
      for (let i = 0; i < MW * MH; i++) {
        const cellTex = map.grid[i] || 0;
        const door = view.doors[i];
        md[i * 4] = map.floorH[i];
        md[i * 4 + 1] = map.ceilH[i];
        md[i * 4 + 2] = cellTex * 32 + (map.wallT[i] || 4);
        md[i * 4 + 3] = door ? door.open : 1.0;
        // door cells use a<1 to mean "door"; sealed non-door cells a=1
        if (door) md[i * 4 + 3] = Math.min(door.open, 0.999);
        ld[i * 4] = Math.min(255, D.light.r[i] / 3 * 255);
        ld[i * 4 + 1] = Math.min(255, D.light.g[i] / 3 * 255);
        ld[i * 4 + 2] = Math.min(255, D.light.b[i] / 3 * 255);
        ld[i * 4 + 3] = view.stains ? Math.min(255, view.stains[i] * 255) : 0;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.mapTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, MW, MH, 0, gl.RGBA, gl.FLOAT, md);
      gl.bindTexture(gl.TEXTURE_2D, this.lightTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, MW, MH, 0, gl.RGBA, gl.UNSIGNED_BYTE, ld);
    },

    addDecal(x, y, z, axis) {
      this.decals.push([x, y, z, axis]);
      if (this.decals.length > MAX_DECALS) this.decals.shift();
    },

    // ---------- render ----------
    render(view, time) {
      const gl = this.gl;
      this.syncMap(view);

      // WORLD into scene target
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtScene.fb);
      gl.viewport(0, 0, this.W, this.H);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.ALWAYS);
      gl.disable(gl.BLEND);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const P = this.pWorld;
      gl.useProgram(P.p);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.mapTex); gl.uniform1i(P.u.uMap, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.lightTex); gl.uniform1i(P.u.uLight, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.atlasTex); gl.uniform1i(P.u.uAtlas, 2);
      gl.uniform2f(P.u.uMapSize, this.mapMW, this.mapMH);
      gl.uniform2f(P.u.uRes, this.W, this.H);
      gl.uniform3f(P.u.uPos, view.x, view.y, view.eyeZ ?? 0.46);
      gl.uniform4f(P.u.uDir, view.dirX, view.dirY, view.planeX, view.planeY);
      // gl y is up: positive pitch (look up) raises the horizon downward in
      // buffer space; convert from the software convention
      gl.uniform1f(P.u.uPitch, -(view.pitch || 0) * (this.H / 405));
      gl.uniform1f(P.u.uBoost, view.boost || 0);
      gl.uniform1f(P.u.uTime, time || 0);
      const lights = view.lights || [];
      const nL = Math.min(lights.length, MAX_LIGHTS);
      gl.uniform1i(P.u.uNL, nL);
      if (nL) {
        const lp = new Float32Array(MAX_LIGHTS * 3), lc = new Float32Array(MAX_LIGHTS * 4);
        for (let i = 0; i < nL; i++) {
          lp[i * 3] = lights[i].x; lp[i * 3 + 1] = lights[i].y; lp[i * 3 + 2] = lights[i].s;
          lc[i * 4] = lights[i].r; lc[i * 4 + 1] = lights[i].g; lc[i * 4 + 2] = lights[i].b; lc[i * 4 + 3] = lights[i].k;
        }
        gl.uniform3fv(P.u.uLPos, lp);
        gl.uniform4fv(P.u.uLCol, lc);
      }
      gl.uniform1i(P.u.uND, this.decals.length);
      if (this.decals.length) {
        const dd = new Float32Array(MAX_DECALS * 4);
        this.decals.forEach((d, i) => { dd[i * 4] = d[0]; dd[i * 4 + 1] = d[1]; dd[i * 4 + 2] = d[2]; dd[i * 4 + 3] = d[3]; });
        gl.uniform4fv(P.u.uDecal, dd);
      }
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // SPRITES: depth-tested quads
      this.drawSprites(view);

      // BLOOM chain
      gl.disable(gl.DEPTH_TEST);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtA.fb);
      gl.viewport(0, 0, this.rtA.w, this.rtA.h);
      gl.useProgram(this.pBright.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rtScene.tex);
      gl.uniform1i(this.pBright.u.uT, 0);
      this.fsTri();
      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtB.fb);
        gl.useProgram(this.pBlur.p);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rtA.tex);
        gl.uniform1i(this.pBlur.u.uT, 0);
        gl.uniform2f(this.pBlur.u.uDirPx, 1 / this.rtA.w, 0);
        this.fsTri();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.rtA.fb);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rtB.tex);
        gl.uniform2f(this.pBlur.u.uDirPx, 0, 1 / this.rtA.h);
        this.fsTri();
      }
      // COMPOSITE to screen
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, this.W, this.H);
      gl.useProgram(this.pComposite.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.rtScene.tex);
      gl.uniform1i(this.pComposite.u.uT, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.rtA.tex);
      gl.uniform1i(this.pComposite.u.uBloom, 1);
      this.fsTri();
    },

    fsTri() {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVBO);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },

    drawSprites(view) {
      const gl = this.gl;
      const { x: posX, y: posY, dirX, dirY, planeX, planeY } = view;
      const eyeZ = view.eyeZ ?? 0.46;
      // top-down screen coords here (flipped to NDC at the end), so the
      // horizon uses the software convention: half + pitch
      const horizon = 0.5 * this.H + (view.pitch || 0) * (this.H / 405);
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const lights = view.lights || [];
      let n = 0;
      const dat = this.sprData;
      const push = (ndx, ndy, t, u, v, lr, lg, lb, flash) => {
        const o = n * 12;
        dat[o] = ndx; dat[o + 1] = ndy; dat[o + 2] = t; dat[o + 3] = 0;
        dat[o + 4] = u; dat[o + 5] = v; dat[o + 6] = 0; dat[o + 7] = flash;
        dat[o + 8] = lr; dat[o + 9] = lg; dat[o + 10] = lb; dat[o + 11] = 1;
        n++;
      };
      const ents = view.ents;
      for (const e of ents) {
        if (e.gone || n > 4000) continue;
        const uv = this.sprUV[e.sprite];
        if (!uv) continue;
        const sx = e.x - posX, sy = e.y - posY;
        const tY = invDet * (-planeY * sx + planeX * sy);
        if (tY < 0.08 || tY > FAR) continue;
        const tX = invDet * (dirY * sx - dirX * sy);
        const spr = D.sprites.get(e.sprite);
        const wh = e.sprH || 0.7;
        const sprHpx = (this.H / tY) * wh;
        const sprWpx = sprHpx * spr.w / spr.h;
        const scrX = (this.W / 2) * (1 + tX / tY);
        const baseZ = (e.z || 0) + (e.lift || 0);
        const yBot = horizon + (eyeZ - baseZ) * this.H / tY;   // gl-flipped below
        const yTop = yBot - sprHpx;
        // to NDC (flip y)
        const nx0 = (scrX - sprWpx / 2) / this.W * 2 - 1;
        const nx1 = (scrX + sprWpx / 2) / this.W * 2 - 1;
        const ny0 = 1 - (yTop / this.H) * 2;
        const ny1 = 1 - (yBot / this.H) * 2;
        let lr, lg, lb;
        if (e.bright) { lr = lg = lb = Math.min(1.45, 1.25 / (1 + tY * tY * 0.035) * 1.6); }
        else {
          const s = D.light.sample(e.x, e.y, lights, lights.length);
          const f = Math.min(1.25 / (1 + tY * tY * 0.035) + (view.boost || 0), 1.05);
          lr = s[0] * f; lg = s[1] * f; lb = s[2] * f;
        }
        const flash = e.flash > 0 ? 0.35 : 0;
        const u0 = uv[0], v0 = uv[1], u1 = uv[0] + uv[2], v1 = uv[1] + uv[3];
        push(nx0, ny0, tY, u0, v0, lr, lg, lb, flash);
        push(nx1, ny0, tY, u1, v0, lr, lg, lb, flash);
        push(nx1, ny1, tY, u1, v1, lr, lg, lb, flash);
        push(nx0, ny0, tY, u0, v0, lr, lg, lb, flash);
        push(nx1, ny1, tY, u1, v1, lr, lg, lb, flash);
        push(nx0, ny1, tY, u0, v1, lr, lg, lb, flash);
      }
      if (!n) return;
      gl.useProgram(this.pSprite.p);
      gl.depthFunc(gl.LESS);
      gl.enable(gl.DEPTH_TEST);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.sprVBO);
      gl.bufferData(gl.ARRAY_BUFFER, dat.subarray(0, n * 12), gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 48, 0);
      gl.enableVertexAttribArray(1);
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 48, 16);
      gl.enableVertexAttribArray(2);
      gl.vertexAttribPointer(2, 4, gl.FLOAT, false, 48, 32);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.spriteTex);
      gl.uniform1i(this.pSprite.u.uSpr, 0);
      gl.drawArrays(gl.TRIANGLES, 0, n);
    },
  };

  D.gl = gl2;
})();
