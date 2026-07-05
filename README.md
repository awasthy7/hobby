# HOBBY.SYS

Five games for the browser, built by hand in vanilla JavaScript. **No engines.
No frameworks. No image or audio files. No build step.** Every texture, every
sound, every world is generated in code the moment the page opens.

**▶ Play them all: https://awasthy7.github.io/hobby/**

Open [`index.html`](index.html) locally, or serve the folder with any static
server (`npx http-server .`) and visit the games below.

| Game | What it is |
|------|-----------|
| **[DOOMED](doom/)** | A full DOOM in a `<canvas>` — sector geometry with jump/crouch, a WebGL renderer with per-pixel lighting and bloom, seven monster types with infighting, six weapons, an 8-map campaign with phased bosses, seeded endless mode, an in-browser level editor (levels serialize into the URL), and peer-to-peer co-op & deathmatch over WebRTC with no server. [Play](doom/index.html) · [Editor](doom/editor.html) |
| **[SOUNDCLASH](soundclash/)** | A Street-Fighter-style versus game where the music *is* the fight — hits on the beat do 1.5× damage and build your groove to a super. Three fighters, three synthesized genres, music-reactive stages. [Play](soundclash/index.html) |
| **[INKWELL](ink/)** | Ink diffusing through water, following your cursor — a real GPU Navier–Stokes fluid solver (velocity + dye fields, vorticity confinement, pressure projection) in WebGL shaders. [Open](ink/index.html) |
| **[PALIMPSEST](palimpsest/)** | A soothing seven-folio game for writers that watches how you play, then writes you a personalized poem at the end. [Enter](palimpsest/index.html) |
| **[AMOR FATI](amorfati/)** | A game designed after Nietzsche: you live one life across six chapters, then a demon asks if you'd live it all again. It remembers every loop. [Begin](amorfati/index.html) |

## How

Everything is `<canvas>` 2D, WebGL, and WebAudio. Textures and sprites are
drawn procedurally and baked to pixel buffers; music is scheduled note-by-note
through the WebAudio graph; DOOMED's renderer raymarches the world on the GPU.
There is no asset pipeline because there are no assets.

Each game folder has its own README with the details.

## Run locally

```bash
git clone https://github.com/awasthy7/hobby.git
cd hobby
npx http-server .          # or: python -m http.server
# open http://localhost:8080
```

No install, no build — it's static files all the way down.

## License

MIT — see [LICENSE](LICENSE). Read the source, fork it, break it.

Built with [Claude Code](https://claude.com/claude-code).
