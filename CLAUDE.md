@AGENTS.md

# AK47 · The State of Cinema

A scroll-driven Three.js flight through a film catalogue. Read `README.md` for the architecture.

## Invariants

- Every layer reads `terrainHeight` from `shaders/field.ts`, so the ground, dots, dust and figures move together.
- Valley uniforms are shared objects across materials, so mutate their values and never replace them.
- Per-frame values never go through React state. React only learns the station in view.
- Colour work is linear. Posters upload as sRGB textures, and only the post pass encodes.

## Checks

- `pnpm check` must stay green, and CI runs the same gates plus a format check.
- Visual changes are verified with `node tools/capture.mjs` against the dev server on port 4444.
- The autosave watcher commits and pushes `main` every ten minutes, and `main` deploys to Vercel.
