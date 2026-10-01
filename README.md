# AK47 · The State of Cinema

A scroll-driven Three.js flight through a catalogue of seventy-two films from 2010 to 2025, told in numbers and picks. The camera flies down a valley of glowing dust whose light follows the film each station is about. Each figure rises out of the ground built from tiny prints of the very posters it counts. The top picks turn in on walls of glass blocks with a trailer one click away. The flight ends in a tunnel lined with every film as a frame on a reel, and any frame plays its trailer.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # typecheck, lint, tests and production build
pnpm atlas        # rebuild public/films/atlas.webp from the poster sources
```

## How it is built

```
scroll ─► Lenis ─► station position ─► dwell ─► camera z ─┬─► valley light, figure rise, wall turn, tunnel, reel
pointer ─────────────────────────────────────────────────┴─► ground trail, click rings, figure push, tile flips, reel pick

frame:  ridge bake (512²) + pointer trail ─► scene into a half-float MSAA target ─► bloom (¼ res) ─► lens, grain, sRGB
```

| Module                        | Job                                                                                    |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `src/data`                    | Validates the catalogue, computes its statistics and builds the story of stations      |
| `src/engine/shaders/field.ts` | The one height function every layer calls, with dunes, valley walls, hover and rings   |
| `src/engine/Valley.ts`        | Terrain, dots, dust, the filament texture and the pointer trail that lights the ground |
| `src/engine/Numbers.ts`       | Figures sampled from glyphs, built from poster prints of the films they count          |
| `src/engine/GlassWall.ts`     | A top pick's poster held in a wall of instanced, lensing glass blocks                  |
| `src/engine/Reel.ts`          | The finale's reel of every film, wound through the tunnel and pickable                 |
| `src/engine/Engine.ts`        | Camera, input, loading, light blending in OKLCh and the render passes                  |
| `src/lib/sound.ts`            | A synthesised drone and rush of air that follow the stations and the camera's speed    |
| `src/components/cinema`       | The page, the loader, the interface over the scene and the trailer player              |

## Checks with real input

| Tool                 | What it proves                                                          |
| -------------------- | ----------------------------------------------------------------------- |
| `tools/capture.mjs`  | Every station renders at each device size, with the frame rate          |
| `tools/fps.mjs`      | Mean, 95th percentile and worst frame over the whole route              |
| `tools/interact.mjs` | Ground trail, click ring, figure push, tile flips, lens kick and player |
| `tools/reel.mjs`     | Sound toggle and reel picking, with and without reduced motion          |
| `tools/motion.mjs`   | The rise of a figure and the turn of a wall, frame by frame             |
| `tools/boot.mjs`     | The loader handing over to the intro                                    |
| `tools/og.mjs`       | The share images, rendered from the live title station                  |

## License

The code is MIT licensed. The film posters belong to their studios and are shown here as a design study.
