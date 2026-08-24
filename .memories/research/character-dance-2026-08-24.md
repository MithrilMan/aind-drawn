# Character Dance Motion

Last updated: 2026-08-24

## Summary

The character runtime now exposes a shared `dance` pose alongside `play`. It is sampled once in `sampleCharacterMotion` and applied unchanged by raster and solid adapters, so Projection Studio gets the new choice automatically from `CHARACTER_POSES` and Doodle Racing can reuse it for crowd cues. The loop is a deliberately goofy Macarena-style sequence rather than generic flailing.

## Details

- The choreography is a sixteen-count Macarena-style sequence: sequential outward/upward arm gestures, shoulder/head/hip transitions, alternating knee lifts, end-of-loop hip sway, squash-and-stretch, off-beat head wobble, and an energetic tail.
- Raster character arms render behind the head at their authored draw rank. The dance keeps raised arms outward rather than straight over the skull so the gesture remains visible; solid arms also receive foreground articulation.
- `experiments/doodle-racing/src/game/crowd-field.ts` includes `dance` in seeded spectator cues.
- Focused checks: `pnpm test -- tests/motion-sampling.test.ts tests/doodle-racing.test.ts`, targeted ESLint on changed TypeScript files, and both experiment builds pass.
- Full `pnpm verify` is currently stopped by the pre-existing `@typescript-eslint/no-unnecessary-condition` error at `experiments/doodle-racing/src/main.ts:87` in unrelated worktree changes. The full Vitest suite passes independently: 12 files, 146 tests.

## Reuse When

Use this note when adding character emotes or changing raster/solid pose parity. Keep new poses in the shared motion vocabulary and check raster draw order before authoring gestures that cross the head.
