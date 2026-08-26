# Asset extensions and fitted wearables

## Decisions

- Structural customization uses deterministic `AssetExtensionIdentity` values,
  family-owned typed slots, an explicit immutable registry, and one compiled
  extension plan shared by raster and solid projections. There is no process
  global registration and no speculative extension version field while the
  package is greenfield.
- Reusable equipment owns a standalone identity and solid blueprint. A worn
  extension mounts that exact geometry with a uniform node `restScale`; a held
  item remains a separate rig until the product-specific equip animation swaps
  ownership.
- Solid containment precompiles original/contained geometry variants selected
  by semantic part ID. Runtime only swaps visibility. Hair, ears, and eyewear
  remain in character identity; parts fully outside the container are hidden
  only while containment is active.
- Rest-relative pose patches are idempotent. `applySolidRigPoseDelta` exists for
  short extension gestures layered after family motion, such as reaching for a
  visor.
- Raster media expose `Medium.glaze`. Inked Solid excludes physical surfaces
  with opacity below one from its opaque G-buffer carrier and uses explicit
  semantic outline/glaze strokes, while Smooth uses the physical glass surface.

## Geometry and rendering pitfalls

- Define a helmet face aperture once in front-plane slope coordinates and use
  it for both shell cutting and visor sampling. Mixing sphere coordinates with
  tangent-plane slopes creates the visually obvious corner gaps seen in the
  early helmet.
- A raster hole must clear alpha through a clipped `clearRect`. Using
  `destination-out` with the medium's leftover translucent fill style only
  partially erases the shell and hides facial features.
- Transparent visor geometry cannot enter the current single-layer Inked Solid
  carrier without replacing the face behind it. Keep it out of the carrier and
  express paper opacity with sparse diagonal glaze strokes.

## Reference implementation and verification

- Reference: `experiments/doodle-racing/src/extensions/paper-circuit-helmet/`.
  The Grandstand explorer holds the item, equips it, activates containment, and
  reaches for the animated visor. The chosen menu identity flows into Explore.
- `npm run verify` passes 220 tests, validates the 224-export package surface,
  and builds all three experiments. Large Vite chunk warnings remain pre-existing
  advisory output.
