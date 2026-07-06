# ROAD WRATH

A Road Rash-style motorcycle combat racer. Punch, kick, and club seven
grudge-holding rivals across **nine worlds** — golden-hour coast, desert,
redwoods, a neon city, a mountain storm, a beach, an alpine climb, a
**Hot-Wheels loop track**, and a **banked Trackmania stadium** — with two-way
traffic, cops, wipeouts you run back from, five buyable bikes, and a fully
synthesized synthwave-rock soundtrack.

**[▶ Ride](index.html)** — or serve the repo root with any static server and
open `roadwrath/`. Pick any race from **FREE PLAY** on the title screen, or grind
the career from level 1.

## The one exception

Every other game in HOBBY.SYS is dependency-free. ROAD WRATH renders in true 3D
with **Three.js r185**, pinned and vendored in [`vendor/three/`](vendor/three/)
— no CDN, works offline. Everything else keeps the house rules: every mesh,
texture, particle, and note is generated in code. No image files, no audio
files, no build step.

## How to play

|            | Keyboard              | Gamepad        |
|------------|-----------------------|----------------|
| Steer      | A/D or ←/→            | left stick     |
| Throttle   | W or ↑                | RT / A         |
| Brake      | S or ↓                | LT             |
| Punch      | J or X                | X              |
| Kick       | K or C                | B              |
| Tuck/draft | Shift                 | —              |
| Restart    | R                     | —              |
| Pause      | Esc                   | Start          |
| Mute       | M                     | —              |

Place **top 3** to advance. Winning pays; punching pays more (combo multiplier
on near-misses, drafting, and knockdowns). Knock a rival down and they hold a
grudge next race. Fight in front of a cop and you'd better not fall — getting
arrested while you're down means a fine; running out of money ends the career.
Cash buys faster bikes in the shop (five tiers, RAT 250 → TITAN 1200). Beat all
nine levels to finish the career.

- **Weapons:** punch a rider who's holding a club or chain and you might take
  it from them.
- **Wipeouts:** crash and you tumble — run back to your bike (hold throttle to
  run faster) before the law catches up.
- **Stunts** (levels 6–9): **boost pads** slingshot you forward, **ramps**
  launch you clear over traffic, banked stadium curves let you carry speed, and
  the Hot-Wheels and Trackmania tracks have **loops** — hit them fast enough and
  the camera barrel-rolls as you ride up and over.

## Structure

```
index.html         importmap + canvas + containers
js/config.js       every tuning constant + the shared state contract
js/main.js         fixed-step loop, state machine, module wiring
js/logic/          pure headless sim: physics, combat, AI, traffic, cops,
                   tracks (seeded splines), rivals, career/economy
js/render/         Three.js: world building, procedural meshes, effects, post
js/audio/          WebAudio: engine, SFX, and a 16-step synthwave sequencer
js/ui/             DOM HUD + screens; input (keyboard/gamepad)
test/              node --test: logic unit tests + 30s headless smoke sim
vendor/three/      Three.js 0.185.1 + postprocessing addons (pinned)
```

The simulation is fully headless — `node --test test/` runs races without a
browser, checking physics invariants, economy math, determinism (same seed →
same race), and 30 simulated seconds of play per level for NaN-free stability.

## URL params

`?race=N` (1–15, jump straight to a race) · `?god=1` · `?fast=1` (quarter-length
races) · `?nomusic=1` · `?quality=low|high` · `?seed=N` · `?fps=1` · `?reset=1`
(wipe save)
