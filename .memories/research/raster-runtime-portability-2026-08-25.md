# Raster Runtime Portability

Last updated: 2026-08-25

## Decisions

- `RasterHand` is immutable and scoped to a rig, cache, audit, or direct bake;
  there is no global active-hand switch.
- Hand selection happens once per baked frame. Authored layers continue to use
  `Sketch`, so the default path adds no per-mark polymorphism or frame-loop work.
- `RasterFrameCache` is owned by a bounded scene or asset pool. It caches by the
  exact blueprint and layer objects plus state and boil frame, not by `assetId`.
- Cached canvases are immutable and borrowed by rigs. Each `SpriteRig` owns its
  texture wrappers, while wrappers over the same canvas share one `THREE.Source`.
  Three.js therefore reference-counts one compatible GPU allocation; disposing
  a rig or calling `cache.clear()` cannot invalidate another live rig.
- Cache diagnostics expose retained pixels, frames, hits, and misses. Prefer an
  explicit lifecycle and measured budget to an unbounded global cache.
- Art direction remains separate from `MediumId`. `ArtDirectionRecipe` is now
  public after three directions proved the boundary across four families.

## Measurements

`pnpm benchmark:raster-runtime` constructs eight character rigs with two boil
frames against a no-op Canvas context. The post-appearance run measured:

- independent bake: 23.28 ms mean;
- cold shared cache: 5.30 ms mean;
- warm shared cache: 3.60 ms mean;
- warm cache speed-up: 6.46x.

This isolates deterministic path generation, rig allocation, cache lookup, and
texture construction. It excludes real browser rasterization and GPU upload.
Use ratios as a regression signal, not as a frame-rate promise.

## Renderer Direction

1. Worker-owned `OffscreenCanvas` is implemented for frame bake and full audit.
   Projection Studio consumes the audit path with synchronous fallback.
2. Prefer PixiJS v8 for the first external 2D renderer spike. Consume
   `bakeRasterLayerFrame`, map bones to containers and frames to sprites, and
   leave sockets/colliders in the core.
3. Treat Three.js `WebGPURenderer` as a Doodle compositor rewrite in TSL, not a
   configuration toggle. Start only after GPU telemetry identifies a target.
4. Test CanvasKit only for a demonstrated Skia fidelity or consistency need.
   It does not natively satisfy the current Canvas 2D `Sketch` surface contract;
   a spike must justify an intermediate composite or a separate adapter, plus
   its WASM payload and explicit resource lifecycle.
5. Draw-on reveal is implemented with immutable normalized stroke progress,
   deterministic stagger, and one shader uniform.

## Verification

- `pnpm verify`: 15 test files, 196 tests, 209 public exports, all experiment
  builds passed after the portability work.

The complete public contract and usage examples are in
`docs/raster-rendering.md`.
