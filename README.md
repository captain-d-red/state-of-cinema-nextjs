# AK47 · The State of Cinema

A scroll-driven Three.js flight through a catalogue of seventy-two films from 2010 to 2025, told in numbers and picks. The camera flies down a valley of glowing dust whose colour follows the film each station is about, figures rise out of the ground in the poster colours of the films they count, the top picks turn in on walls of glass tiles with a trailer one click away, and the flight ends in a spiral tunnel.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # typecheck, lint, tests and production build
```

## How it is built

```
scroll ─► Lenis ─► station position ─► dwell ─► camera z ─┬─► valley tint, figure forms, wall turns, tunnel
pointer ─────────────────────────────────────────────────┴─► ground bump, click rings, particle push, tile flips

frame:  ridge bake (512²) ─► scene into a half-float MSAA target ─► bloom (¼ res) ─► lens, grain, sRGB
```

| Module                        | Job                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `src/data`                    | Validates the catalogue, computes its statistics and builds the story of stations    |
| `src/engine/shaders/field.ts` | The one height function every layer calls, with dunes, valley walls, hover and rings |
| `src/engine/Valley.ts`        | Terrain, dots, dust and the filament texture that lights the ground and its haze     |
| `src/engine/Numbers.ts`       | Figures sampled from glyphs, rising out of the ground in their films' colours        |
| `src/engine/GlassWall.ts`     | A top pick's poster held in a wall of instanced glass tiles                          |
| `src/engine/Engine.ts`        | Camera, input, tint blending and the render passes                                   |
| `src/components/cinema`       | The page, the interface over the scene and the trailer player                        |

## License

The code is MIT licensed. The film posters belong to their studios and are shown here as a design study.
