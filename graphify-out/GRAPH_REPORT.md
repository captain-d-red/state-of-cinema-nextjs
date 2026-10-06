# Graph Report - state-of-cinema-nextjs  (2026-10-06)

## Corpus Check
- 82 files · ~391,406 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 495 nodes · 971 edges · 30 communities (21 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 3 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `be94fecd`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]

## God Nodes (most connected - your core abstractions)
1. `Engine` - 25 edges
2. `Cloth` - 23 edges
3. `compilerOptions` - 20 edges
4. `smoothstep()` - 14 edges
5. `Film` - 13 edges
6. `Curtain` - 13 edges
7. `glsl()` - 13 edges
8. `scripts` - 12 edges
9. `Banner` - 11 edges
10. `Mirror` - 11 edges

## Surprising Connections (you probably didn't know these)
- `stats()` --calls--> `at()`  [INFERRED]
  tools/gpu.mjs → src/engine/cloth.test.ts
- `EngineFrame` --references--> `Grip`  [EXTRACTED]
  src/engine/Engine.ts → src/engine/hand.ts
- `TrailerDialogProps` --references--> `Film`  [EXTRACTED]
  src/components/cinema/TrailerDialog.tsx → src/data/parse.ts
- `Engine` --references--> `Station`  [EXTRACTED]
  src/engine/Engine.ts → src/data/story.ts
- `band()` --calls--> `filmTint()`  [EXTRACTED]
  src/data/story.ts → src/lib/thinFilm.ts

## Import Cycles
- None detected.

## Communities (30 total, 9 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (44): metadata, viewport, chooseQuality(), Cinema(), CURTAIN, Status, story, Hud() (+36 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (32): Banner, loadPoster(), MOUNTS, SPEC, ClothSpec, Poke, STIFFNESS, TURBULENCE (+24 more)

### Community 2 - "Community 2"
Cohesion: 0.08
Nodes (30): ATLAS, BANK, Engine, EngineFrame, EngineInput, KICK, OPENING, createFullscreenGeometry() (+22 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (31): RIVER, TERRAIN, beamFragment, beamVertex, clothFragment, dissolve, lamps, lensFragment (+23 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (16): createHalfFloatTarget(), createScreenPass(), PingPong, TargetOptions, Lens, Mirror, dotGrid(), dustCloud() (+8 more)

### Community 5 - "Community 5"
Cohesion: 0.05
Nodes (38): dependencies, lenis, next, react, react-dom, three, devDependencies, babel-plugin-react-compiler (+30 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (10): Cloth, ClothForces, at(), SPEC, STILL, Drape, Reachable, args (+2 more)

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (24): clamp01(), formatOklch(), hexToLinear(), inGamut(), linearSrgbToOklab(), linearToHex(), linearToSrgb(), mixOklch() (+16 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (23): compilerOptions, allowImportingTsExtensions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (6): CHIME_EVERY, CHORDS, hz(), impulse(), Sound, SoundFrame

### Community 10 - "Community 10"
Cohesion: 0.27
Nodes (11): assertFilm(), fail(), isHex(), isNumber(), isRecord(), isString(), parseCatalogue(), argSrc (+3 more)

### Community 11 - "Community 11"
Cohesion: 0.25
Nodes (7): AK47 · The State of Experiences, Checks with real input, How a frame is drawn, License, Performance, Run it, The journey

### Community 12 - "Community 12"
Cohesion: 0.25
Nodes (6): args, outDir, settle, SIZES, stir, stops

### Community 13 - "Community 13"
Cohesion: 0.25
Nodes (4): args, outDir, play, problems

### Community 14 - "Community 14"
Cohesion: 0.40
Nodes (4): frames, outDir, pick, t0

### Community 15 - "Community 15"
Cohesion: 0.50
Nodes (3): AK47 · The State of Experiences, Checks, Invariants

### Community 16 - "Community 16"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Knowledge Gaps
- **134 isolated node(s):** `singleQuote`, `printWidth`, `trailingComma`, `eslintConfig`, `nextConfig` (+129 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Cloth` connect `Community 6` to `Community 1`?**
  _High betweenness centrality (0.061) - this node is a cross-community bridge._
- **Why does `Engine` connect `Community 2` to `Community 0`, `Community 1`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **Why does `Film` connect `Community 0` to `Community 1`, `Community 10`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `singleQuote`, `printWidth`, `trailingComma` to the rest of the system?**
  _134 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.0546583850931677 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06758832565284179 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.07562008469449485 - nodes in this community are weakly interconnected._