@AGENTS.md

# AK47 · The State of Experiences

An immersive pre-sign-up entry journey through a streaming catalogue. Read `README.md` for the architecture.

## Invariants

- Every layer reads its heights from `shaders/field.ts`, so ground, water, dust and figures stay together.
- Valley uniforms are shared objects across materials, so mutate their values and never replace them.
- Per-frame values never go through React state. React only learns the station in view.
- Colour work is linear. Posters upload as sRGB textures, and only the post pass encodes.
- Every sheen reads the thin-film lookup built by `lib/thinFilm.ts`, so all surfaces share one series.
- The cloth core in `engine/cloth.ts` stays pure arithmetic, with its behaviour pinned in tests.
- `LETTERBOX` in `Cinema.tsx` frames the stage at 16:9 for screen recording, and stays false otherwise.

## Checks

- `pnpm check` must stay green, and CI runs the same gates plus a format check.
- Visual changes are verified with `node tools/capture.mjs` against the dev server on port 4444.
- The autosave watcher commits and pushes `main` every ten minutes, and `main` deploys to Vercel.
