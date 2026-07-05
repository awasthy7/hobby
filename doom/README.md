# DOOMED

A DOOM homage that runs on nothing but a `<canvas>` — no engine, no assets,
no WADs. Every texture, sprite, sound, and the soundtrack are generated in
code at boot.

## Changelog

**Phase 5 — THE UNBELIEVABLES (2026-07-05).**
**Multiplayer, no server.** Press **N** on the title: host CO-OP or
DEATHMATCH over WebRTC — the invite is a copy-paste code (a free STUN
address helps NATs meet; nothing else touches a server). The host runs the
world and streams ~12 snapshots/sec over a DataChannel; guests send inputs
and render. Marines have their own sprite, monsters hunt whichever player
is nearest, co-op disables friendly fire, deathmatch counts frags and
respawns everyone — host included — in 2.5s.
**The editor.** Open [editor.html](editor.html): paint floors, walls,
doors, heights, pits; drop monsters, weapons, keys, a player and an exit;
press PLAY. The whole level serializes into the URL — **the link IS the
map** (`index.html?custom=…`), and `editor.html?edit=…` reopens it.
**Everywhere.** Full gamepad support (sticks aim and strafe, d-pad cycles
weapons) and mobile twin-stick touch controls with on-screen fire/jump/
use buttons that appear at first touch.

**Phase 4 — THE CAMPAIGN (2026-07-05).** The dig is a full episode now:
**eight maps** — Hangar Bay, Waste Tunnels, Processing (time the presses),
The Overseer, Catacombs (bring a crouch), The Vaults, Spire Approach
(hellsky overhead), The Machine Heart — plus a **secret ninth**, the
Boneyard, found by shooting the right crack in the Catacombs and using an
exit that was never on the map. Typed **story cards** carry the plot at
the start, after the Overseer falls, before the finale, and at the end.
Both bosses have **phases**: the Overseer widens his spread and summons
at half health; MOTHER guards M8 with a rotating fireball nova, two
phase shifts, and flyer summons — none of which pollute your kill tally.
**Medals** (★ par beat · ☠ full carnage · ◉ nothing hidden) are awarded
at the exit switch and persist in localStorage, shown on the level-select.
And below it all: **ENDLESS DESCENT** — seeded, procedurally generated
floors that grow bigger and meaner forever, red-key gates from floor 3,
a boss every fifth floor, deterministic per seed and shareable as
`?endless=1&seed=yourseed`. Death sends the run back to floor 1; your
best floor is remembered.

**Phase 3 — BESTIARY & COMBAT (2026-07-05).** Monsters have backs now:
directional sprites (front/back/profiles) mean flanking is real. Three new
enemies — the **wretch** (a flyer that hovers at chest height and spits
fire from above the trenches), the **sentinel** (a shell turret that only
opens when it wakes), and the **gravewalker** (it raises your kills at 60%
health; corpses you gib stay gibbed). **INFIGHTING**: any monster hurt by
another monster takes the grudge and turns on it — herd them into each
other's crossfire. New arsenal: **rocket launcher** (4: splash damage,
chains barrels, hurts you at point blank), **plasma rifle** (5: rapid blue
bolts that light the walls), **berserk fists** (6: find the black-red kit;
one punch gibs). Levels grew teleporter pads, ambush closets that spring
when you take the bait (the hangar shotgun, the waste-tunnel red key, the
Overseer's pit), and secret cracks now also open to gunfire. Kill tallies
stay honest: raised corpses don't double-count.

**Phase 2 — RENDERER (2026-07-05).** A WebGL2 renderer ([js/gl.js](js/gl.js))
now carries the world when the GPU allows it (up to 1920×1080; `?gl=0`
forces software, and any GL failure falls back automatically). The map
rides to the GPU as data textures and a fragment shader raymarches every
pixel: smooth per-pixel lightmap pools, up to 8 dynamic lights evaluated
per fragment, distance fog, and side shading. Sprites are depth-tested
quads — pixel-perfect occlusion behind steps and through windows. On top:
a bright-pass bloom chain (muzzle flashes and lamps bleed light), filmic
tone curve and vignette, creeping animated lava, blinking computer walls,
bullet-hole decals where your shots land, dust motes hanging in lamplight,
and a parallax hellsky — the Overseer's arena now fights under an open
red sky. The software renderer remains fully supported as the fallback.

**Phase 1 — GEOMETRY (2026-07-05).** The flat grid is gone: every cell now
has floor and ceiling heights. The renderer marches each column cell by
cell, drawing floor/ceiling spans and step faces through a narrowing clip
window, with per-column depth snapshots so sprites occlude correctly
behind ledges and through windows. Player physics grew a z-axis: gravity,
SPACE to jump, C to crouch, auto-step stairs, fall damage past a safe
height. Ballistics are 3D — bullets and fireballs strike floors, ceilings,
sills and lintels; window slits pass gunfire but not bodies. Lifts ride
you up (comp-room mezzanine, E2), crushers bite (the exit corridor, E2;
the stone maw, E3). All three levels rebuilt: loading platform + stairs
and a sunken pit in Hangar Bay, waste trenches with a bridge in the
Tunnels, and the Overseer now looms out of a pit between gallery ledges.
Frame cost with a per-cell light cache: ~11 ms at 720×405 (budget 16 ms).

## Run it

Any static server from this folder:

```
npx http-server . -p 8126 -g
```

Then open http://localhost:8126. The `doom` entry in `../.claude/launch.json`
does the same thing.

## Controls

| Input | Action |
|---|---|
| WASD | move / strafe |
| Mouse (click to lock) or ← → | turn |
| Click / Ctrl | fire |
| E / Space | use — doors, switches |
| 1 2 3 | pistol · shotgun · chaingun |
| Tab (hold) | automap |
| Enter | menus |

Type `iddqd` or `idkfa` mid-game. You know what they do.

## What's inside

- **Renderer** ([js/raycast.js](js/raycast.js)) — software raycaster at
  720×405 (auto-drops to 480×270 on slow machines; `?res=960` for full HD
  crunch). Textured walls via DDA, per-row floor/ceiling casting, recessed
  sliding doors, z-buffered billboard sprites.
- **Lighting** ([js/light.js](js/light.js)) — a lightmap baked per level
  (lamps pool warm light, the exit switch glows red, each level has its own
  ambient mood) plus dynamic point lights every frame: muzzle flashes,
  fireballs, and explosions light the walls around them. Floors carry blood
  stains where things die.
- **Textures** ([js/tex.js](js/tex.js)) — ten 64×64 surfaces (brick, tech,
  computers, stone, doors, the suspicious cracked wall) from hash noise.
- **Sprites** ([js/sprites.js](js/sprites.js)) — four monsters with walk /
  attack / pain / death frames, pickups, projectiles, gibs — all drawn with
  canvas shapes at low res and baked to pixel data.
- **Monsters** ([js/entities.js](js/entities.js)) — grunts (hitscan), imps
  (fireballs), brutes (melee rush), and the Overseer (triple spread). They
  sleep until they see you or hear gunfire, open doors, and take detours
  when they bump into things. Exploding barrels chain.
- **Game feel** ([js/game.js](js/game.js)) — the status-bar face that
  bloodies as you drop, screen melt between levels, DOOM-fire title screen,
  intermission tally (kills / items / secrets / par), difficulty tiers from
  *I'm Too Young to Die* to *Nightmare!*.
- **Audio** ([js/audio.js](js/audio.js)) — WebAudio synthesis: shotgun boom
  with pump-action clacks, demon growls per species, and a six-track
  original score played by a tracker-style sequencer. Guitars are detuned
  saw stacks through a tanh waveshaper; each level has its own theme
  (150 BPM gallop, 104 BPM sludge, 132 BPM boss march) plus title dread,
  intermission groove, and victory themes. The score is dynamic — hi-hats,
  leads, choirs, and double-kick layers gate in as the fight heats up, and
  the full arrangement only opens up when the Overseer is awake.

## Levels

| # | Name | Beats |
|---|---|---|
| 1 | Hangar Bay | pistol start, find the shotgun, one secret |
| 2 | Waste Tunnels | blue + red keycards, chaingun, brutes, two secrets |
| 3 | The Overseer | boss arena, four barrel corners, one secret |

Dev shortcuts: `?level=2` jumps straight to a level, `?god=1` starts
invulnerable.
