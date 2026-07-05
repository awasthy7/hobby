// DOOMED — procedural textures baked to raw RGBA buffers. Layouts are
// authored in 64-space; everything bakes at 128x128 with a fine grain pass
// on top, so surfaces read as material instead of mosaic.
(function () {
  const SIZE = 128;

  const mix = (c1, c2, t) => [
    c1[0] + (c2[0] - c1[0]) * t,
    c1[1] + (c2[1] - c1[1]) * t,
    c1[2] + (c2[2] - c1[2]) * t,
  ];
  const shade = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

  // fn receives 64-space integer coords; grain is applied at full 128 res
  function make(fn, grainAmt = 0.1) {
    const data = new Uint8ClampedArray(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        let [r, g, b] = fn(x >> 1, y >> 1);
        const gr = 1 - grainAmt / 2 + D.hash(x, y, 97) * grainAmt;
        const i = (y * SIZE + x) * 4;
        data[i] = r * gr; data[i + 1] = g * gr; data[i + 2] = b * gr; data[i + 3] = 255;
      }
    }
    return { data, size: SIZE };
  }

  // ---- base color functions (composable) ----
  function brickAt(x, y) {
    const row = Math.floor(y / 8);
    const off = (row % 2) * 8;
    const bx = (x + off) % 16, by = y % 8;
    if (bx < 1 || by < 1) return shade([48, 36, 33], 0.8 + D.hash(x, y, 1) * 0.4);
    const base = mix([126, 50, 35], [92, 38, 29], D.hash(Math.floor((x + off) / 16), row, 2));
    const grain = 0.72 + D.fbm(x * 0.35, y * 0.35, 3) * 0.5;
    const edge = (bx === 1 || by === 1) ? 1.18 : (bx === 15 || by === 7) ? 0.78 : 1;
    return shade(base, grain * edge);
  }

  function doorAt(x, y) {
    let c = mix([106, 108, 116], [74, 76, 84], D.fbm(x * 0.15, y * 0.4, 23));
    if (x < 2 || x > 61) c = shade(c, 0.5);
    if (y % 22 < 2) c = shade(c, 0.62);
    if (y > 52) {
      c = ((x + y) % 16 < 8) ? [172, 134, 40] : [28, 27, 25];
      c = shade(c, 0.8 + D.hash(x, y, 25) * 0.3);
    }
    const rx = (x % 60) - 5, ry = (y % 20) - 4;
    if (x > 3 && x < 60 && rx * rx + ry * ry < 3) c = shade(c, 1.45);
    return c;
  }

  const brick = make(brickAt);

  const tech = make((x, y) => {
    let c = mix([92, 96, 106], [66, 68, 78], D.fbm(x * 0.2, y * 0.2, 5));
    const px = x % 32, py = y % 32;
    if (px < 1 || py < 1) c = shade(c, 0.52);
    else if (px === 1 || py === 1) c = shade(c, 1.3);
    const rx = px - 27, ry = py - 5;
    if (rx * rx + ry * ry < 4) c = shade(c, px > 26 ? 1.55 : 0.55);
    if (x >= 20 && x < 44 && y >= 34 && y < 54) {
      c = shade([58, 60, 66], (Math.floor((y - 34) / 4) % 2) ? 0.42 : 0.98);
      if (x === 20 || x === 43) c = shade(c, 0.6);
    }
    return c;
  });

  const comp = make((x, y) => {
    let c = mix([32, 38, 47], [24, 28, 36], D.hash(0, Math.floor(y / 16), 7));
    if (y % 16 < 2) c = shade([94, 100, 112], 0.9);
    const cellX = Math.floor(x / 8), cellY = Math.floor(y / 16);
    const lx = x % 8, ly = y % 16;
    if (lx >= 2 && lx < 6 && ly >= 5 && ly < 8) {
      const on = D.hash(cellX, cellY, 9);
      c = on > 0.72 ? [200, 62, 50] : on > 0.5 ? [72, 178, 92] : on > 0.35 ? [208, 176, 70] : [20, 24, 29];
    }
    if (lx >= 2 && lx < 6 && ly >= 10 && ly < 13 && D.hash(cellX, cellY, 11) > 0.6) {
      c = [40 + D.hash(x, y, 13) * 55, 94, 62];
    }
    return c;
  }, 0.06);

  const stone = make((x, y) => {
    const row = Math.floor(y / 16);
    const off = (row % 2) * 16;
    const bx = (x + off) % 32, by = y % 16;
    if (bx < 2 || by < 2) return shade([28, 28, 30], 0.9 + D.hash(x, y, 15) * 0.3);
    const base = mix([102, 100, 96], [70, 70, 71], D.hash(Math.floor((x + off) / 32), row, 17));
    return shade(base, 0.66 + D.fbm(x * 0.3, y * 0.3, 19) * 0.6);
  });

  const crack = make((x, y) => {
    let col = brickAt(x, y);
    const wob = Math.sin(y * 0.55) * 4 + (D.hash(0, y, 21) - 0.5) * 4;
    const d = Math.abs(x - 32 - wob);
    if (d < 1.4) col = [18, 13, 11];
    else if (d < 2.6) col = shade(col, 0.55);
    return col;
  });

  const door = make(doorAt, 0.07);

  const keyDoor = (stripe) => make((x, y) => {
    let col = doorAt(x, y);
    if (y > 24 && y < 40 && x > 8 && x < 56) {
      const inner = y > 26 && y < 38 && x > 10 && x < 54;
      col = inner ? shade(stripe, 0.72 + D.hash(x, y, 27) * 0.5) : [18, 18, 21];
    }
    return col;
  }, 0.07);
  const doorBlue = keyDoor([44, 96, 220]);
  const doorRed = keyDoor([200, 42, 36]);

  const exitSwitch = make((x, y) => {
    let c = mix([72, 68, 62], [50, 48, 44], D.fbm(x * 0.2, y * 0.2, 29));
    if (x < 3 || x > 60 || y < 3 || y > 60) c = shade([38, 34, 30], 0.9);
    if (x >= 18 && x < 46 && y >= 14 && y < 50) {
      c = [24, 22, 20];
      if (x >= 26 && x < 38 && y >= 20 && y < 44) {
        const lever = y >= 22 && y < 32;
        c = lever ? [198, 42, 30] : [58, 19, 15];
        if (y === 22 || y === 31) c = shade(c, 1.35);
      }
    }
    if (y >= 49 && y < 63 && x >= 8 && x < 56) {
      c = shade([154, 22, 14], 0.85 + D.hash(x, y, 43) * 0.25);
      const F = {
        E: ['111', '100', '110', '100', '111'],
        X: ['101', '101', '010', '101', '101'],
        I: ['111', '010', '010', '010', '111'],
        T: ['111', '010', '010', '010', '010'],
      };
      const lx = x - 12, ly = y - 51;
      const li = Math.floor(lx / 11);
      const cx = Math.floor((lx % 11) / 3);
      const cy = Math.floor(ly / 2);
      if (li >= 0 && li < 4 && lx % 11 < 9 && cy >= 0 && cy < 5) {
        if (F['EXIT'[li]][cy][cx] === '1') c = [255, 240, 195];
      }
    }
    return c;
  }, 0.06);

  const floor = make((x, y) => {
    const t = D.fbm(x * 0.22, y * 0.22, 31);
    let c = mix([60, 56, 52], [38, 36, 35], t);
    if ((x % 32 < 1) || (y % 32 < 1)) c = shade(c, 0.72);
    return shade(c, 0.82 + D.hash(x, y, 33) * 0.34);
  });

  const ceil = make((x, y) => {
    let c = mix([40, 38, 43], [24, 23, 27], D.fbm(x * 0.18, y * 0.18, 35));
    const px = x % 16, py = y % 16;
    if (px < 1 || py < 1) c = shade(c, 0.68);
    const rx = px - 8, ry = py - 8;
    if (rx * rx + ry * ry < 2 && D.hash(Math.floor(x / 16), Math.floor(y / 16), 37) > 0.75) {
      c = [190, 158, 92];
    }
    return c;
  });

  const lava = make((x, y) => {
    const t = D.fbm(x * 0.15, y * 0.15, 39, 5);
    const c = t > 0.62 ? [252, 214, 92] : t > 0.5 ? [234, 122, 40] : t > 0.38 ? [162, 50, 24] : [66, 21, 13];
    return shade(c, 0.9 + D.hash(x, y, 41) * 0.2);
  }, 0.05);

  D.tex = {
    list: [null, brick, tech, comp, stone, crack, door, doorBlue, doorRed, exitSwitch],
    BRICK: 1, TECH: 2, COMP: 3, STONE: 4, CRACK: 5, DOOR: 6, DOOR_B: 7, DOOR_R: 8, EXIT: 9,
    flats: { floor, ceil, lava },
    SIZE,
  };
})();
