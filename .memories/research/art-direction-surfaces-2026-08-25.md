# Art Direction and Semantic Surfaces

Last updated: 2026-08-27

## Decisions

- Identity, `MediumId`, `RasterHand`, art direction, semantic substance,
  physical substrate, and physical finish are independent axes.
- Every blueprint carries immutable `AssetAppearance`: one resolved
  `ArtDirectionRecipe`, an appearance fingerprint, and explicit
  `semanticPartId` to `ArtRole` bindings.
- Generic appearance code must not branch on family names or infer meaning from
  path geometry. Character, building, vehicle, and tree own their role tables.
- Built-in `authored`, `storybook`, `cut-paper`, and `aged-paper` directions compile across
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
- Paper scene treatments use separate structural, crease, and owner edge
  weights. Their contour pickup is continuous; paper variation belongs inside
  the sheet or in a low-frequency boundary displacement, never in a thresholded
  bright rim that becomes moving white dashes.
- A compact collage material class is packed into the integral half of the
  existing mark-scale channel. It is derived from generic art roles and surface
  substance, costs no new vertex attribute or MRT attachment, and prevents
  dark neutral cars from being mistaken for asphalt.
- Cut shadows require a different owner or policy slot plus a relative depth
  step. An owner boundary alone makes sloped sheets self-shadow into a grid.
- Drawing media and represented material use different temporal spaces.
  Graphite and other deposited fills remain view-oriented and redraw as the
  camera changes; Paper Cut and Aged Paper fibre, patina, abrasion, and torn
  edges sample part-local material coordinates stored in the surface MRT.
- The surface attachment stores local position in RGB and one signed owner key
  in alpha. Negative keys retain the authored-ink/stroke distinction. This
  replaces the projected two-dimensional owner anchor, needs no fifth MRT, and
  reduces the compiled owner attribute from two floats to one.
- Dominant local-plane projection keeps paper stock fixed to moving and
  articulated meshes with one 2D noise sample per field. Triplanar noise was
  rejected because its three samples per field added unjustified mobile cost.

## Performance

- 2026-08-27 material-anchor revision: the Inked Solid benchmark renders 48
  animated instances at 3,581.68 iterations/s (0.2792 ms mean), with the same
  two draw calls, four render targets, and zero steady-state per-mesh
  allocations.
- 2026-08-27 paper-visualization audit: the Inked Solid benchmark renders 48
  animated instances across six media at 3,607.48 iterations/s (0.2772 ms
  mean) with two draw calls, four render targets, and zero steady-state
  per-mesh allocations. The solid compiled-geometry path averaged 11.29 ms,
  20.06x faster than independent resource construction in the same run.
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

- 2026-08-27: `pnpm verify` passed 22 files / 267 tests, verified 231 public
  exports, and built all experiments. Browser QA covered camera rotation on
  Aged Diorama, the raised course edge, layered ramps, desktop Explore, and
  390x844 mobile with no WebGL errors.
- 2026-08-27: `pnpm verify` passed 22 files / 266 tests, verified 231
  public exports, and built all experiments. Desktop 1440x900 and mobile
  390x844 browser QA covered both paper styles. A mobile reroll exposed seed
  4191 beard-ring degeneracy; the ring now chooses the safer quad diagonal,
  omits zero-area triangles, and has a permanent regression.
- `pnpm verify`: 15 test files, 196 tests, 209 public exports, all three
  experiment builds passed.
- Worker build emitted as a separate Projection Studio chunk.

See `docs/art-direction-and-surfaces.md`, `docs/raster-rendering.md`, and
`docs/3d-stroke-rendering.md`.
