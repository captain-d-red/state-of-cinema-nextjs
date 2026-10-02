# AK47 · The State of Experiences

An immersive entry journey for a streaming platform, the first thing a visitor sees before they sign up. A stage curtain opens on a river of light, the platform counts what it streams, three films picked for the visitor hang as banners in the water, and every title waits on a reel at the end.

- Live at [state-of-cinema-nextjs.vercel.app](https://state-of-cinema-nextjs.vercel.app), and it fills any screen from a phone to 4K.
- Built with Next.js 16, React 19, strict TypeScript, Three.js and raw GLSL3 shaders.
- The score is synthesised in Web Audio, so nothing is downloaded and every sound follows the scene.

## Run it

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm check        # typecheck, lint, tests and production build
pnpm atlas        # rebuild public/films/atlas.webp from the poster sources
```

Add `?fps` to the address for a live frame meter, and `?quality=full` or `?quality=handheld` to force a profile.

## The journey

```
 curtain ──► live channels ──► leagues ──► news ──► the best films ──► three picks ──► the reel
 foil title  each figure built from tiny prints of the posters      banners in       every title
 opens on    rising out of the river, one colour band each          the water        in a tunnel
 the first                                                          that dissolve    of stars,
 scroll                                                             as you pass      any one plays
```

## How a frame is drawn

```
 input ─► scroll position ─► dwell ─► camera ─┬─► curtain hooks, banner lamps and dissolve, figure rise, reel
 pointer ─────────────────────────────────────┴─► wake on the water, cloth pinch and press, star deflection

 valley   bake the haze filaments, step the wave equation of the river's surface
 mirror   draw the scene from the eye mirrored through the water, with an oblique near plane
 scene    sky, banks, river, figures, banners, curtain and reel into a half-float multisampled target
 lens     bloom at a quarter size, then lens, halation and grain, encoded to sRGB exactly once
```

| Module                  | Job                                                                                       |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| `src/lib/thinFilm.ts`   | Thin-film interference integrated against the CIE observer, the colour of every sheen     |
| `src/engine/cloth.ts`   | A Verlet cloth with driven clips, a weighted hem, wind as a force and a pinch             |
| `src/engine/hand.ts`    | The pointer's pinch, which catches the nearest thread and drags it until released         |
| `src/engine/Curtain.ts` | The opening's two foil-printed drapes, opened by sliding their hooks along the rail       |
| `src/engine/Banner.ts`  | A pick printed on satin in a steel gantry with uplights, dissolving as the camera passes  |
| `src/engine/Wake.ts`    | The river's surface as a height field the pointer stirs and a click drops into            |
| `src/engine/Mirror.ts`  | The reflection pass, the scene seen from the mirrored eye                                 |
| `src/engine/Valley.ts`  | Sky, banks, river, dust and the haze filaments, sharing one set of uniforms               |
| `src/engine/Numbers.ts` | Figures sampled from glyphs, built from prints of the posters they count                  |
| `src/engine/Reel.ts`    | The finale's reel of every film, wound through the tunnel and pickable                    |
| `src/engine/quality.ts` | The full and handheld profiles and the frame governor                                     |
| `src/engine/Engine.ts`  | Camera, input, loading, station colour in OKLCh and the order of the passes               |
| `src/lib/sound.ts`      | A chord pad per station in a large reverb, the river, the air and glass chimes            |
| `src/data`              | The validated catalogue, the platform's figures and the story of stations                 |
| `src/components/cinema` | The page, the loader, the interface over the scene, the camera instruments and the player |

## Performance

- Phones and tablets take a handheld profile with lighter haze, reflection and antialiasing.
- A frame governor lowers the pixel ratio in steps if a device falls behind sixty frames.
- Every shader and image is prepared under the loader, so no first sight stalls a frame.

| Measure                                             | Full            | Handheld |
| --------------------------------------------------- | --------------- | -------- |
| Scene and post, median in flight, per render pass   | 1.32 ms         | 0.49 ms  |
| Scene and post, 95th percentile in flight           | 2.56 ms         | 1.32 ms  |
| Reflection pass, median                             | 0.12 ms         | 0.07 ms  |
| 4K over the whole route, frame rate and worst frame | 60 fps, 16.9 ms |          |

Pass timings come from GPU timer queries on an iPhone 16 Pro Max viewport, emulated in desktop Chrome.

## Checks with real input

| Tool                 | What it proves                                                             |
| -------------------- | -------------------------------------------------------------------------- |
| `tools/capture.mjs`  | Every station renders at each device size, from small phones to 4K         |
| `tools/fps.mjs`      | Mean, 95th percentile and worst frame over the whole route                 |
| `tools/gpu.mjs`      | GPU time per frame at rest and in flight on any device size                |
| `tools/interact.mjs` | River ripples, figure push, banner press, lens kick and the trailer player |
| `tools/reel.mjs`     | Sound toggle and reel picking, with and without reduced motion             |
| `tools/sound.mjs`    | The real output level, silent when off and audible at rest and in flight   |
| `tools/boot.mjs`     | The loader handing over to the intro                                       |
| `tools/og.mjs`       | The share images, rendered from the live opening                           |

## License

The code is MIT licensed. The film posters belong to their studios and are shown here as a design study. The platform's channel, league and news figures are illustrative.
