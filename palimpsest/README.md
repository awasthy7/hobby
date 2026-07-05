# PALIMPSEST

*an excavation of one mind — yours*

A soothing browser game for people who love words. Seven folios, each a chamber
of a mind — flux, memory, shadow, desire, impermanence, doubt, and the self —
each with its own world, its own mechanic, and its own philosophy (Heraclitus,
Borges, Jung, the Stoics, Camus).

The game watches you the whole way — which words you choose, which shadow you
greet first, what you water longest, whether you grasp or release when the tide
comes for what you gathered, why you say you keep going. It never tells you.

Then, at the last desk, **the manuscript writes you**: a poem about the person
who just played, assembled from everything you did, typed letter by letter under
a lamp. You can keep the page.

No fail states. No timers you can lose to. Mouse or touch only. 15–25 minutes.
Headphones recommended — all sound is generated live (warm pads, pentatonic
chimes, a breathing sea).

## Run it

Any static server from this folder, e.g.:

```
python -m http.server 8123
# then open http://localhost:8123
```

It also works by simply opening `index.html` in a browser (no build, no
dependencies, no assets — everything is code).

## The folios

| Folio | Place        | You do                                            | It asks                          |
|-------|--------------|---------------------------------------------------|----------------------------------|
| I     | The River    | gather drifting words; keep one of each pair      | are you stone or current?        |
| II    | The Archive  | re-ink faded memory-lines with your light         | which book of your life?         |
| III   | The Shadow   | approach the unsaid words slowly enough           | which shadow do you greet first? |
| IV    | The Garden   | plant five of eight seed-words; water them        | what do you grow?                |
| V     | The Tide     | the sea comes for your gathered words             | can you open your hands?         |
| VI    | The Night    | walk toward a light that does not approach        | why do you keep going?           |
| VII   | The Manuscript | nothing. it writes you.                         | —                                |

## Dev notes

- `?folio=<name>` jumps to a folio (`river`, `archive`, `shadow`, `garden`,
  `tide`, `night`, `finale`) with a plausible mock profile if no save exists.
- `?fast=1` shortens every folio's requirements for quick playtesting.
- Progress saves to `localStorage` after each folio; the title screen offers
  *resume* / *begin again*.
- Plain scripts, no modules, one global `P`:
  `util → audio → words → profile → engine → scenes → main`.
  The poem lives in `js/profile.js` (`P.poem.compose`).
