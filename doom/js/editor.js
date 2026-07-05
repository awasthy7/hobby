// DOOMED — level editor. Paint cells, drop things, press play. The whole
// level serializes into the URL: your map IS the link.
(function () {
  const W = 28, H = 22, CELL = 24;
  const T = D.tex;
  const grid = new Array(W * H).fill(1);      // rock by default; paint to carve
  const floorH = new Float32Array(W * H);
  const doors = {};                            // idx -> kind
  let things = [];                             // {type, x, y} cell coords + .5

  const cv = document.getElementById('grid');
  const g = cv.getContext('2d');
  const msg = document.getElementById('msg');

  const TEX_COLORS = { 0: '#3a3632', 1: '#7a3222', 2: '#5c6068', 3: '#22303e', 4: '#5a5a58', 9: '#a01812' };
  const THING_GLYPH = {
    player: '@', exit: 'X',
    grunt: 'g', imp: 'i', brute: 'B', flyer: 'f', turret: 'T', rezzer: 'R', boss: 'Ø', mother: 'M',
    barrel: 'o', lamp: '¡',
    stim: '+', medkit: '✚', clip: 'a', shells: 's', rockets: 'r', cells: 'c',
    armor: 'A', soul: '☼', berserk: '!',
    wshotgun: '2', wchaingun: '3', wrocket: '4', wplasma: '5',
    keyB: 'k', keyR: 'K',
  };

  const TOOLS = [
    ['— carve —'],
    ['floor', 'FLOOR'], ['pit', 'PIT ▼'], ['plat3', 'LEDGE .3'], ['plat5', 'LEDGE .5'],
    ['— walls —'],
    ['w1', 'BRICK'], ['w2', 'TECH'], ['w3', 'COMP'], ['w4', 'STONE'],
    ['— doors —'],
    ['dd', 'DOOR'], ['db', 'BLUE'], ['dr', 'RED'], ['ds', 'SECRET'],
    ['— vital —'],
    ['t:player', '@ START'], ['exit', 'X EXIT'],
    ['— monsters —'],
    ['t:grunt', 'grunt'], ['t:imp', 'imp'], ['t:brute', 'brute'], ['t:flyer', 'flyer'],
    ['t:turret', 'turret'], ['t:rezzer', 'rezzer'], ['t:boss', 'OVERSEER'], ['t:mother', 'MOTHER'],
    ['— stuff —'],
    ['t:barrel', 'barrel'], ['t:lamp', 'lamp'], ['t:stim', 'stim'], ['t:medkit', 'medkit'],
    ['t:clip', 'clip'], ['t:shells', 'shells'], ['t:rockets', 'rockets'], ['t:cells', 'cells'],
    ['t:armor', 'armor'], ['t:soul', 'soul'], ['t:berserk', 'berserk'],
    ['t:wshotgun', 'shotgun'], ['t:wchaingun', 'chaingun'], ['t:wrocket', 'launcher'], ['t:wplasma', 'plasma'],
    ['t:keyB', 'blue key'], ['t:keyR', 'red key'],
    ['— misc —'],
    ['erase', 'ERASE THING'],
  ];
  let tool = 'floor';

  const toolsDiv = document.getElementById('tools');
  for (const t of TOOLS) {
    if (t.length === 1) {
      const h4 = document.createElement('h4');
      h4.textContent = t[0];
      toolsDiv.appendChild(h4);
      continue;
    }
    const b = document.createElement('button');
    b.textContent = t[1];
    b.dataset.tool = t[0];
    if (t[0] === tool) b.classList.add('sel');
    b.onclick = () => {
      tool = t[0];
      toolsDiv.querySelectorAll('button').forEach(x => x.classList.toggle('sel', x.dataset.tool === tool));
    };
    toolsDiv.appendChild(b);
  }

  function apply(cx, cy, erase) {
    const i = cy * W + cx;
    if (cx <= 0 || cy <= 0 || cx >= W - 1 || cy >= H - 1) return; // keep the border
    if (erase) {
      grid[i] = 1; floorH[i] = 0; delete doors[i];
      things = things.filter(t => (t.x | 0) !== cx || (t.y | 0) !== cy);
      return;
    }
    if (tool === 'floor') { grid[i] = 0; floorH[i] = 0; delete doors[i]; }
    else if (tool === 'pit') { grid[i] = 0; floorH[i] = -0.55; delete doors[i]; }
    else if (tool === 'plat3') { grid[i] = 0; floorH[i] = 0.3; delete doors[i]; }
    else if (tool === 'plat5') { grid[i] = 0; floorH[i] = 0.5; delete doors[i]; }
    else if (tool[0] === 'w') { grid[i] = +tool[1]; floorH[i] = 0; delete doors[i]; things = things.filter(t => (t.x | 0) !== cx || (t.y | 0) !== cy); }
    else if (tool[0] === 'd') {
      const kind = { d: 'door', b: 'blue', r: 'red', s: 'secret' }[tool[1]];
      grid[i] = kind === 'blue' ? T.DOOR_B : kind === 'red' ? T.DOOR_R : kind === 'secret' ? T.CRACK : T.DOOR;
      doors[i] = kind;
      floorH[i] = 0;
    }
    else if (tool === 'exit') {
      grid[i] = T.EXIT; delete doors[i];
      // only one exit
      for (let k = 0; k < grid.length; k++) if (k !== i && grid[k] === T.EXIT) grid[k] = 1;
    }
    else if (tool === 'erase') things = things.filter(t => (t.x | 0) !== cx || (t.y | 0) !== cy);
    else if (tool.startsWith('t:')) {
      const type = tool.slice(2);
      if (grid[i] !== 0) { grid[i] = 0; floorH[i] = 0; }
      if (type === 'player') things = things.filter(t => t.type !== 'player');
      else things = things.filter(t => (t.x | 0) !== cx || (t.y | 0) !== cy);
      things.push({ type, x: cx + 0.5, y: cy + 0.5 });
    }
  }

  let painting = 0;
  cv.addEventListener('mousedown', (e) => {
    painting = e.button === 2 ? 2 : 1;
    paintAt(e);
    e.preventDefault();
  });
  window.addEventListener('mouseup', () => painting = 0);
  cv.addEventListener('mousemove', (e) => { if (painting) paintAt(e); });
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  function paintAt(e) {
    const r = cv.getBoundingClientRect();
    const cx = Math.floor((e.clientX - r.left) / r.width * W);
    const cy = Math.floor((e.clientY - r.top) / r.height * H);
    apply(cx, cy, painting === 2);
    draw();
  }

  function draw() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const v = grid[i];
        g.fillStyle = TEX_COLORS[v] || (v >= 5 && v <= 8 ? '#8a7c30' : '#5a5a58');
        if (v === 0) {
          g.fillStyle = floorH[i] < -0.1 ? '#181410' : floorH[i] > 0.4 ? '#565048' : floorH[i] > 0.1 ? '#48423a' : '#302c28';
        }
        g.fillRect(x * CELL, y * CELL, CELL - 1, CELL - 1);
        if (doors[i]) {
          g.fillStyle = { door: '#b8a060', blue: '#3050c8', red: '#c02418', secret: '#6a4428' }[doors[i]];
          g.fillRect(x * CELL + 4, y * CELL + 4, CELL - 9, CELL - 9);
        }
        if (v === T.EXIT) {
          g.fillStyle = '#3ae83a'; g.font = 'bold 14px monospace';
          g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText('X', x * CELL + CELL / 2, y * CELL + CELL / 2);
        }
      }
    }
    g.font = 'bold 13px monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const t of things) {
      g.fillStyle = t.type === 'player' ? '#7ce080' : D.ent && 0 ? '' : '#ffd870';
      g.fillText(THING_GLYPH[t.type] || '?', (t.x | 0) * CELL + CELL / 2, (t.y | 0) * CELL + CELL / 2);
    }
  }

  function validate() {
    const player = things.find(t => t.type === 'player');
    if (!player) return 'place a PLAYER start (@)';
    let exitIdx = -1;
    for (let i = 0; i < grid.length; i++) if (grid[i] === T.EXIT) exitIdx = i;
    if (exitIdx < 0) return 'place an EXIT switch (X)';
    // flood fill: player must reach the exit
    const seen = new Set();
    const q = [[player.x | 0, player.y | 0]];
    let found = false;
    while (q.length) {
      const [x, y] = q.pop();
      const i = y * W + x;
      if (seen.has(i)) continue;
      seen.add(i);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (grid[ni] === T.EXIT) found = true;
        const open = (k) => grid[k] === 0 || doors[k];
        if (open(i) && open(ni) && floorH[ni] - floorH[i] <= 0.8) q.push([nx, ny]);
      }
    }
    if (!found) return 'the EXIT is not reachable from the PLAYER';
    return null;
  }

  function serialize() {
    const doorsObj = {};
    for (const [i, kind] of Object.entries(doors)) doorsObj[i] = { kind };
    return D.customCodec.encode({
      name: document.getElementById('name').value || 'CUSTOM',
      w: W, h: H, grid, floorH, doors: doorsObj, things,
    });
  }

  document.getElementById('play').onclick = () => {
    const err = validate();
    if (err) { msg.textContent = '✗ ' + err; return; }
    location.href = 'index.html?custom=' + serialize();
  };
  document.getElementById('copy').onclick = () => {
    const err = validate();
    if (err) { msg.textContent = '✗ ' + err; return; }
    const url = location.origin + location.pathname.replace('editor.html', 'index.html') + '?custom=' + serialize();
    document.getElementById('shareout').value = url;
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => msg.textContent = '✓ URL copied — that link IS the level');
    else msg.textContent = '✓ URL in the box below';
  };
  document.getElementById('clear').onclick = () => {
    grid.fill(1); floorH.fill(0);
    for (const k of Object.keys(doors)) delete doors[k];
    things = [];
    draw();
  };
  document.getElementById('share').style.display = 'none';

  // re-edit an existing map: editor.html?edit=<code>
  const params = new URLSearchParams(location.search);
  const edit = params.get('edit') || params.get('custom');
  if (edit) {
    try {
      const m = D.customCodec.decode(edit);
      if (m.w === W && m.h === H) {
        for (let i = 0; i < W * H; i++) { grid[i] = m.grid[i]; floorH[i] = m.floorH[i]; }
        for (const [i, d] of Object.entries(m.doors)) doors[i] = d.kind;
        things = m.things;
        document.getElementById('name').value = m.meta.name;
        msg.textContent = '✓ loaded from URL';
      }
    } catch (e) { msg.textContent = '✗ could not load map from URL'; }
  } else {
    // starter room so the canvas isn't a slab of rock
    for (let y = 8; y <= 13; y++) for (let x = 3; x <= 10; x++) { grid[y * W + x] = 0; }
    things.push({ type: 'player', x: 4.5, y: 10.5 });
    grid[10 * W + 11] = T.EXIT;
  }
  draw();
})();
