// DOOMED — sector renderer. Every open cell has a floor and ceiling height;
// each screen column marches the ray cell by cell, drawing floor/ceiling
// spans and step faces while narrowing a clip window. Depth snapshots per
// column give sprites correct occlusion behind steps and through windows.
(function () {
  const MAXSNAP = 12;

  const rc = {
    RW: 720, RH: 405,
    img: null, px: null,
    zclose: new Float32Array(1024),
    snapD: null, snapT: null, snapB: null, snapN: null,
    cv: document.createElement('canvas'),

    setRes(w, h) {
      this.RW = w; this.RH = h;
      this.cv.width = w; this.cv.height = h;
      this.g2 = this.cv.getContext('2d');
      this.img = this.g2.createImageData(w, h);
      this.px = this.img.data;
      this.snapD = new Float32Array(w * MAXSNAP);
      this.snapT = new Float32Array(w * MAXSNAP);
      this.snapB = new Float32Array(w * MAXSNAP);
      this.snapN = new Uint8Array(w);
    },

    init() { this.setRes(this.RW, this.RH); },

    // per-frame, per-cell light cache: one lightmap+dynamics sample per cell
    // per frame instead of two per span per column
    lcFrame: 0, lcStamp: null, lcData: null, lcSize: 0,
    cellLight(ci, cx, cy, lights, nL) {
      if (this.lcStamp[ci] !== this.lcFrame) {
        this.lcStamp[ci] = this.lcFrame;
        const s = D.light.sample(cx, cy, lights, nL);
        this.lcData[ci * 3] = s[0];
        this.lcData[ci * 3 + 1] = s[1];
        this.lcData[ci * 3 + 2] = s[2];
      }
      return ci * 3;
    },

    fog(dist, boost) {
      const f = 1.25 / (1 + dist * dist * 0.035) + boost;
      return f > 1.2 ? 1.2 : f;
    },

    render(view) {
      if (!this.img) this.init();
      const RW = this.RW, RH = this.RH;
      const TS = D.tex.SIZE, TM = TS - 1;
      const { x: posX, y: posY, dirX, dirY, planeX, planeY, map, doors, boost } = view;
      const eyeZ = view.eyeZ ?? 0.5;
      const lights = view.lights || [];
      const nL = lights.length;
      const stains = view.stains;
      const px = this.px;
      const grid = map.grid, MW = map.w, MH = map.h;
      const floorH = map.floorH, ceilH = map.ceilH, wallT = map.wallT;
      const texList = D.tex.list;
      const flats = D.tex.flats;
      const floorTexDef = flats[view.floorFlat || 'floor'].data;
      const ceilTexDef = flats[view.ceilFlat || 'ceil'].data;
      const half = RH >> 1;
      const horizon = half + ((view.pitch || 0) | 0);
      const light = D.light;
      const zclose = this.zclose;
      const snapD = this.snapD, snapT = this.snapT, snapB = this.snapB, snapN = this.snapN;

      if (this.lcSize !== MW * MH) {
        this.lcSize = MW * MH;
        this.lcStamp = new Int32Array(this.lcSize).fill(-1);
        this.lcData = new Float32Array(this.lcSize * 3);
      }
      this.lcFrame++;
      const lcData = this.lcData;
      this._MW = MW; this._MH = MH; this._lights = lights; this._nL = nL;

      // background: the void (visible over pits at map edge / bad geometry)
      px.fill(0);
      for (let i = 3; i < px.length; i += 4) px[i] = 255;

      const screenY = (h, d) => horizon + (eyeZ - h) * RH / d;

      for (let x = 0; x < RW; x++) {
        const camX = 2 * x / RW - 1;
        const rdx = dirX + planeX * camX;
        const rdy = dirY + planeY * camX;
        let mapX = posX | 0, mapY = posY | 0;
        const ddx = Math.abs(1 / (rdx || 1e-9));
        const ddy = Math.abs(1 / (rdy || 1e-9));
        const stpX = rdx < 0 ? -1 : 1, stpY = rdy < 0 ? -1 : 1;
        let sdx = rdx < 0 ? (posX - mapX) * ddx : (mapX + 1 - posX) * ddx;
        let sdy = rdy < 0 ? (posY - mapY) * ddy : (mapY + 1 - posY) * ddy;

        let clipT = 0, clipB = RH;
        let distIn = 0.01;
        let sn = 0;
        const sBase = x * MAXSNAP;
        snapD[sBase] = 0; snapT[sBase] = 0; snapB[sBase] = RH; sn = 1;
        let closed = false;

        for (let iter = 0; iter < 96 && !closed; iter++) {
          const inBounds = mapX >= 0 && mapY >= 0 && mapX < MW && mapY < MH;
          const ci = mapY * MW + mapX;
          const isOpen = inBounds && grid[ci] === 0;
          const fH = isOpen ? floorH[ci] : 0;
          const cH = isOpen ? ceilH[ci] : D.CEIL;
          const dExit = Math.min(sdx, sdy);

          if (isOpen) {
            // ---- floor span of this cell ----
            if (eyeZ > fH) {
              const hF = eyeZ - fH;
              const K = hF * RH;
              let yNear = horizon + K / distIn;
              let yFar = horizon + K / dExit;
              let y0 = Math.max(Math.ceil(yFar), Math.ceil(clipT));
              let y1 = Math.min(yNear, clipB);
              if (y1 > y0) {
                const ftex = fH < -0.01 ? flats.lava.data : floorTexDef;
                // one cached light per cell; fog lerped across the span
                const li = this.cellLight(ci, mapX + 0.5, mapY + 0.5, lights, nL);
                const Lr = lcData[li], Lg = lcData[li + 1], Lb = lcData[li + 2];
                const dFar = K / (Math.max(y0, horizon + 1) - horizon);
                const dNearD = K / (y1 - horizon);
                let f = this.fog(dFar, boost);
                const rows = y1 - y0;
                const df = (this.fog(dNearD, boost) - f) / rows;
                const st = stains ? stains[ci] : 0;
                const sr = st ? 1 - st * 0.25 : 1, sg = st ? 1 - st * 0.72 : 1;
                let i = ((y0 | 0) * RW + x) * 4;
                for (let y = y0 | 0; y < y1; y++) {
                  const d = K / (y - horizon);
                  const wx = posX + rdx * d, wy = posY + rdy * d;
                  const tx = ((wx - (wx | 0)) * TS) | 0;
                  const ty = ((wy - (wy | 0)) * TS) | 0;
                  const t = ((ty & TM) * TS + (tx & TM)) * 4;
                  px[i] = ftex[t] * Lr * f * sr;
                  px[i + 1] = ftex[t + 1] * Lg * f * sg;
                  px[i + 2] = ftex[t + 2] * Lb * f * sg;
                  f += df;
                  i += RW * 4;
                }
              }
              if (yFar > clipT && yFar < clipB) clipB = Math.min(clipB, yFar);
              else if (yFar <= clipT) clipB = clipT;
            } else {
              // eye below this floor: it closes the window from below
              const yEdge = screenY(fH, dExit);
              if (yEdge < clipB) clipB = Math.max(clipT, yEdge);
            }

            // ---- ceiling span ----
            if (eyeZ < cH) {
              const hC = cH - eyeZ;
              const K = hC * RH;
              let yFarC = horizon - K / dExit;
              let y0 = Math.max(Math.ceil(horizon - K / distIn), Math.ceil(clipT));
              let y1 = Math.min(yFarC, clipB);
              if (y1 > y0) {
                const li = this.cellLight(ci, mapX + 0.5, mapY + 0.5, lights, nL);
                const Lr = lcData[li] * 0.72, Lg = lcData[li + 1] * 0.72, Lb = lcData[li + 2] * 0.72;
                const rows = y1 - y0;
                const dA = K / (horizon - y0);
                const dB = K / Math.max(horizon - y1, 1);
                let f = this.fog(dA, boost);
                const df = (this.fog(dB, boost) - f) / rows;
                let i = ((y0 | 0) * RW + x) * 4;
                for (let y = y0 | 0; y < y1; y++) {
                  const d = K / (horizon - y);
                  const wx = posX + rdx * d, wy = posY + rdy * d;
                  const tx = ((wx - (wx | 0)) * TS) | 0;
                  const ty = ((wy - (wy | 0)) * TS) | 0;
                  const t = ((ty & TM) * TS + (tx & TM)) * 4;
                  px[i] = ceilTexDef[t] * Lr * f;
                  px[i + 1] = ceilTexDef[t + 1] * Lg * f;
                  px[i + 2] = ceilTexDef[t + 2] * Lb * f;
                  f += df;
                  i += RW * 4;
                }
              }
              if (yFarC < clipB && yFarC > clipT) clipT = Math.max(clipT, yFarC);
              else if (yFarC >= clipB) clipT = clipB;
            } else {
              const yEdge = screenY(cH, dExit);
              if (yEdge > clipT) clipT = Math.min(clipB, yEdge);
            }
          }

          if (clipT >= clipB - 0.25) { closed = true; zclose[x] = dExit; break; }

          // ---- advance to next cell ----
          let side;
          if (sdx < sdy) { sdx += ddx; mapX += stpX; side = 0; }
          else { sdy += ddy; mapY += stpY; side = 1; }
          const dWall = side === 0 ? sdx - ddx : sdy - ddy;
          if (mapX < 0 || mapY < 0 || mapX >= MW || mapY >= MH) {
            this.wallFace(x, dWall, 4, 0, side, posX, posY, rdx, rdy, clipT, clipB, D.CEIL, 0, eyeZ, horizon, boost, lights, nL, view);
            closed = true; zclose[x] = dWall; break;
          }
          const ni = mapY * MW + mapX;
          const ncell = grid[ni];
          const door = doors[ni];

          if (door) {
            // recessed sliding door, full height
            let dperp, hitCoord;
            if (side === 0) {
              dperp = (mapX - posX + (1 - stpX) / 2 + stpX * 0.5) / rdx;
              hitCoord = posY + dperp * rdy;
              if (Math.floor(hitCoord) === mapY) {
                const wx = hitCoord - Math.floor(hitCoord);
                if (wx >= door.open) {
                  this.doorFace(x, dperp, ncell, wx - door.open, clipT, clipB, eyeZ, horizon, boost, lights, nL, view, posX + rdx * dperp, posY + rdy * dperp, side);
                  closed = true; zclose[x] = dperp;
                  break;
                }
              }
            } else {
              dperp = (mapY - posY + (1 - stpY) / 2 + stpY * 0.5) / rdy;
              hitCoord = posX + dperp * rdx;
              if (Math.floor(hitCoord) === mapX) {
                const wx = hitCoord - Math.floor(hitCoord);
                if (wx >= door.open) {
                  this.doorFace(x, dperp, ncell, wx - door.open, clipT, clipB, eyeZ, horizon, boost, lights, nL, view, posX + rdx * dperp, posY + rdy * dperp, side);
                  closed = true; zclose[x] = dperp;
                  break;
                }
              }
            }
            distIn = dWall;
            if (sn < MAXSNAP) { snapD[sBase + sn] = dWall; snapT[sBase + sn] = clipT; snapB[sBase + sn] = clipB; sn++; }
            continue;
          }

          if (ncell !== 0) {
            // solid wall: fills the remaining window
            let wallX = side === 0 ? posY + dWall * rdy : posX + dWall * rdx;
            wallX -= Math.floor(wallX);
            let texX = (wallX * TS) | 0;
            if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TS - texX - 1;
            this.wallFace(x, dWall, ncell, texX & TM, side, posX, posY, rdx, rdy, clipT, clipB, D.CEIL, 0, eyeZ, horizon, boost, lights, nL, view);
            closed = true; zclose[x] = dWall;
            break;
          }

          // open cell: draw the step faces where heights differ
          const ci2 = mapY * MW + mapX;
          const nF = floorH[ci2], nC = ceilH[ci2];
          const curF = isOpen ? fH : 0, curC = isOpen ? cH : 1;
          let wallX = side === 0 ? posY + dWall * rdy : posX + dWall * rdx;
          wallX -= Math.floor(wallX);
          let texX = (wallX * TS) | 0;
          if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) texX = TS - texX - 1;
          texX &= TM;
          const stepTex = wallT[ci2] || 4;

          if (nF > curF + 0.001) {
            // riser face from curF up to nF
            this.wallFace(x, dWall, stepTex, texX, side, posX, posY, rdx, rdy,
              Math.max(clipT, screenY(nF, dWall)), Math.min(clipB, screenY(curF, dWall)),
              nF, nF - Math.min(curF, nF - 1), eyeZ, horizon, boost, lights, nL, view);
            const yEdge = screenY(nF, dWall);
            if (yEdge < clipB) clipB = Math.max(clipT, yEdge);
          }
          if (nC < curC - 0.001) {
            this.wallFace(x, dWall, stepTex, texX, side, posX, posY, rdx, rdy,
              Math.max(clipT, screenY(curC, dWall)), Math.min(clipB, screenY(nC, dWall)),
              curC, curC - nC, eyeZ, horizon, boost, lights, nL, view);
            const yEdge = screenY(nC, dWall);
            if (yEdge > clipT) clipT = Math.min(clipB, yEdge);
          }

          if (clipT >= clipB - 0.25) { closed = true; zclose[x] = dWall; break; }
          distIn = dWall;
          if (sn < MAXSNAP) { snapD[sBase + sn] = dWall; snapT[sBase + sn] = clipT; snapB[sBase + sn] = clipB; sn++; }
        }
        if (!closed) zclose[x] = 64;
        snapN[x] = sn;
      }

      // ---------- sprites ----------
      const ents = view.ents;
      const invDet = 1 / (planeX * dirY - dirX * planeY);
      const order = [];
      for (const e of ents) {
        if (e.gone) continue;
        const sx = e.x - posX, sy = e.y - posY;
        const tY = invDet * (-planeY * sx + planeX * sy);
        if (tY < 0.08) continue;
        order.push([tY, e, invDet * (dirY * sx - dirX * sy)]);
      }
      order.sort((a, b) => b[0] - a[0]);

      for (const [tY, e, tX] of order) {
        const spr = D.sprites.get(e.sprite);
        if (!spr) continue;
        const screenX = (RW / 2) * (1 + tX / tY);
        const wh = e.sprH || 0.7;
        const sprH = Math.abs((RH / tY) * wh) | 0;
        const sprW = (sprH * spr.w / spr.h) | 0;
        if (sprW <= 0) continue;
        const baseZ = (e.z || 0) + (e.lift || 0);
        const yEnd = screenY(baseZ, tY) | 0;
        const yStart = yEnd - sprH;
        const xStart = (screenX - sprW / 2) | 0;
        const xEnd = xStart + sprW;

        let lr, lg, lb;
        if (e.bright) {
          lr = lg = lb = Math.min(this.fog(tY, boost) * 1.6, 1.45);
        } else {
          const sE = light.sample(e.x, e.y, lights, nL);
          const f = Math.min(this.fog(tY, boost), 1.05);
          lr = sE[0] * f; lg = sE[1] * f; lb = sE[2] * f;
        }
        const flash = e.flash > 0 ? 90 : 0;

        const x0 = Math.max(xStart, 0), x1 = Math.min(xEnd, RW);
        for (let x = x0; x < x1; x++) {
          // beyond the wall that closed this column: hidden, no exceptions
          if (tY >= zclose[x]) continue;
          // otherwise clip to the window that was active at this depth
          const sBase2 = x * MAXSNAP;
          const n = snapN[x];
          let wT = 0, wB = RH;
          for (let s = 0; s < n; s++) {
            if (snapD[sBase2 + s] > tY) break;
            wT = snapT[sBase2 + s]; wB = snapB[sBase2 + s];
          }
          if (wT >= wB - 0.25) continue;
          const y0 = Math.max(yStart, Math.ceil(wT), 0);
          const y1 = Math.min(yEnd, wB, RH);
          if (y1 <= y0) continue;
          const sxp = ((x - xStart) * spr.w / sprW) | 0;
          for (let y = y0; y < y1; y++) {
            const syp = ((y - yStart) * spr.h / sprH) | 0;
            const t = (syp * spr.w + sxp) * 4;
            if (spr.data[t + 3] < 128) continue;
            const i = (y * RW + x) * 4;
            px[i] = spr.data[t] * lr + flash;
            px[i + 1] = spr.data[t + 1] * lg + flash;
            px[i + 2] = spr.data[t + 2] * lb + flash;
          }
        }
      }

      this.g2.putImageData(this.img, 0, 0);
    },

    // textured vertical face at distance d, world heights hTop downward,
    // clipped to [top, bot) screen rows
    wallFace(x, d, tex, texX, side, posX, posY, rdx, rdy, top, bot, hTop, faceH, eyeZ, horizon, boost, lights, nL, view) {
      const RW = this.RW, RH = this.RH;
      const TS = D.tex.SIZE, TM = TS - 1;
      const px = this.px;
      const tdata = (D.tex.list[tex] || D.tex.list[1]).data;
      let y0 = Math.max(0, Math.ceil(top));
      let y1 = Math.min(RH, bot);
      if (y1 <= y0) return;
      const hitX = posX + rdx * d, hitY = posY + rdy * d;
      // light from the cell in front of the face (cached per frame)
      let bx = hitX - rdx * 0.02, by = hitY - rdy * 0.02;
      if (bx < 0) bx = 0; if (by < 0) by = 0;
      if (bx >= this._MW) bx = this._MW - 0.01;
      if (by >= this._MH) by = this._MH - 0.01;
      const wci = (by | 0) * this._MW + (bx | 0);
      const li = this.cellLight(wci, (bx | 0) + 0.5, (by | 0) + 0.5, this._lights, this._nL);
      let f = this.fog(d, boost);
      if (side === 1) f *= 0.76;
      const lr = this.lcData[li] * f, lg = this.lcData[li + 1] * f, lb = this.lcData[li + 2] * f;
      // world height per row: h(y) = eyeZ - (y - horizon) * d / RH
      const dh = d / RH;
      let h = eyeZ - (y0 - horizon) * dh;
      let i = (y0 * RW + x) * 4;
      for (let y = y0; y < y1; y++) {
        const texY = (((hTop - h) * TS) | 0) & TM;
        const t = (texY * TS + texX) * 4;
        px[i] = tdata[t] * lr; px[i + 1] = tdata[t + 1] * lg; px[i + 2] = tdata[t + 2] * lb;
        h -= dh;
        i += RW * 4;
      }
    },

    doorFace(x, d, tex, slid, top, bot, eyeZ, horizon, boost, lights, nL, view, hitX, hitY, side) {
      const TS = D.tex.SIZE, TM = TS - 1;
      let texX = (slid * TS) | 0;
      texX &= TM;
      this.wallFace(x, d, tex, texX, side, hitX, hitY, 0, 0, top, bot, D.CEIL, 0, eyeZ, horizon, boost, lights, nL, view);
    },

    blit(g) {
      g.imageSmoothingEnabled = false;
      g.drawImage(this.cv, 0, 0, this.RW, this.RH, 0, 0, 960, 540);
    },
  };

  D.rc = rc;
})();
