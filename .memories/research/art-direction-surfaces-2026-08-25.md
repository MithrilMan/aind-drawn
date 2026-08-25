# Art Direction and Semantic Surfaces

Last updated: 2026-08-25

## Decisions

- Identity, `MediumId`, `RasterHand`, art direction, semantic substance,
  physical substrate, and physical finish are independent axes.
- Every blueprint carries immutable `AssetAppearance`: one resolved
  `ArtDirectionRecipe`, an appearance fingerprint, and explicit
  `semanticPartId` to `ArtRole` bindings.
- Generic appearance code must not branch on family names or infer meaning from
  path geometry. Character, building, vehicle, and tree own their role tables.
- Built-in `authored`, `storybook`, and `cut-paper` directions compile across
  raster, smooth solid, and Doodle 3D without changing `assetId`, manifest,
  geometry, sockets, colliders, or interactions.
- `SemanticSurfaceSpec` separates `substance`, drawing application plus
  `DrawingIntent`, and `PhysicalSurfaceTreatment` (`substrate` plus `finish`).
- `SolidSurfaceResourceCache` is scene-scoped and reference-counted across rigs.
  Materials are released after the last lease; procedural texture profiles live
  until the scene cache is disposed.
- Doodle physical response never reads substrate or finish. It resolves drawing
  policy per `(semanticPartId, surfaceId)` and preserves the exact solid
  appearance reference.
- Semantic stroke reveal stores normalized vertex progress once and advances
  one shader uniform through `setStrokeReveal`; no frame-loop geometry rebuild.

## Performance

- `pnpm benchmark:raster-runtime`: eight rigs averaged 23.28 ms independently,
  5.30 ms with a cold scene cache, and 3.60 ms warm (6.46x warm speed-up).
- `pnpm benchmark:solid-runtime`: sixteen rigs averaged 244.74 ms independently,
  153.92 ms sharing concurrent surface resources, and 147.90 ms with resident
  resources (1.65x speed-up). Geometry still dominates CPU construction.
- Projection Studio runs six-medium boil audits through a worker-owned
  `OffscreenCanvas`, reports worker duration, and falls back synchronously.
- Browser QA confirmed Storybook across raster and smooth solid, Cut Paper in
  Doodle 3D, physical controls hidden in Doodle, a six-medium worker audit in
  281 ms, and no runtime warnings or errors.

## Verification

- `pnpm verify`: 15 test files, 196 tests, 209 public exports, all three
  experiment builds passed.
- Worker build emitted as a separate Projection Studio chunk.

See `docs/art-direction-and-surfaces.md`, `docs/raster-rendering.md`, and
`docs/3d-stroke-rendering.md`.
