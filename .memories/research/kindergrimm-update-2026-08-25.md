# KinderGrimm Reference Update

Last updated: 2026-08-25

## Summary

KinderGrimm is pinned at `5857b1e1cae2713d6714ad7dd7f89626bb242f0f`.
The 2026-08-25 review covers the new p5.brush hand, nine art styles,
style comparison/timeline pages, and the 2.5D pipes experiment.

## Reusable Findings

- Keep asset identity, deposition medium, raster hand, and art direction as
  distinct axes. Do not add art styles to `MediumId`.
- The first useful adaptation is a deterministic visual audit: fixed identities,
  cross-product build audit, contact sheets, and low-resolution boil-frame
  flicker comparison.
- `RasterHand` is now scoped to a rig, cache, audit, or direct bake. The runtime
  borrows the immutable hand; a resource-owning external implementation keeps
  its own lifecycle. Never copy KinderGrimm's process-global `setHand()`.
- p5.brush is an opt-in experiment candidate, not a default runtime: upstream
  measures roughly 9.1x rasterization cost and needs one shared WebGL plate plus
  per-mark compositing. Its vendored code remains MIT-licensed independently.
- Art-style structural choices belong in immutable seeded style recipes and
  should consume semantic part IDs. Do not infer faces or other roles from path
  size, overshoot, or taper.
- The `pipes` arc-length/delay shader is a useful draw-on technique for semantic
  strokes when a consumer requests it. The monolithic experiment is not a core
  family to port.

## Reuse When

Use this note when planning visual regression tooling, a second raster renderer,
art-direction contracts, draw-on stroke effects, or another KinderGrimm update.
The full rationale and prioritised plan are in `docs/kindergrimm-study.md`.
The implemented runtime boundary and backend roadmap are in
`docs/raster-rendering.md` and `raster-runtime-portability-2026-08-25.md`.
