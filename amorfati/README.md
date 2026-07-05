# AMOR FATI

*a game designed after Friedrich Nietzsche*

You live one short life: a rope, a desert, a dragon, a market square, an
abyss, a meadow at noon. Then a demon asks you the only question the game
has: **would you live all of it again — unchanged, innumerable times?**

Saying *no* is allowed. The game honestly starts over, and remembers how
many times you've refused. Saying *yes* is the only ending.

## Run it

```
npx http-server . -p 8128 -g
```

Open http://localhost:8128. Dev shortcuts: `?scene=dragon` jumps to a scene,
`?reset=1` erases all recurrences.

## Controls

A/D move · W jump / rise · E use · SPACE roar · mouse = your gaze

## The life you will live (once more, and innumerable times more)

| | Scene | The idea, played |
|--|--|--|
| ∅ | **The Rope** | *Man is a rope over an abyss.* Balance against the wind. The jester comes. Everyone falls — that is not the question. |
| I | **The Desert** (camel) | *Thou shalt.* Kneel, carry GUILT, DUTY, SHAME, MEEKNESS, THE PAST, GOD. Gates open only for the laden. Obedience is the sole mechanic. |
| II | **The Dragon** (lion) | The dragon THOU SHALT, golden-scaled with commandments. The game gives you orders in large letters. **Disobey every one of them.** The sacred No. |
| III | **The Market** | *God is dead.* A town of painted smiles. Inside your lantern's light, things are what they are. Say what you came to say, in the church that is a tomb. |
| IV | **The Abyss** | Your gaze lays the stones — ledges harden only while looked at. But stare too long and the abyss gazes back (it has an eye, and it inverts you). At the bottom: a shadow with your outline. Fighting it feeds it. |
| V | **Noon** (child) | No goals. Walking paints flowers. Then the bell, the demon, and the question — walk to your answer on the hills. |

## The recurrence is real

The game counts your loops in localStorage. The jester recognizes you. The
tablets change their inscriptions. The demon shortens its speech — it knows
you know. The title screen keeps the ledger: how many lives, how many
yeses. Nothing resets unless you `?reset=1`, and the demon disapproves.

## Nothing loaded, everything made

No assets: every scene is drawn in canvas (moonlight, heat shimmer, gold
dust, the eye), and the score is synthesized WebAudio per scene — night
wind and crowd murmur, desert drone, the dragon's brass, a detuned music
box for the market, sub-bass and whispers below, warm noon pads. The film
grain, vignette, and letterbox are painted over every frame.
