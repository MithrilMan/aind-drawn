# Architecture

## Dependency direction

```text
core <- materials <- assets <- runtime <- experiments
```

`core`, `materials`, and asset recipe generation do not import Three.js.
Runtime adapters consume immutable asset blueprints and own GPU resources.
Experiments may depend only on the public barrel exported by `src/index.ts`.

The playground keeps its serializable scene document, history, selection and
transform tools outside the drawing library. Asset construction crosses the
boundary through a catalog that maps document kinds to public recipe and
blueprint factories.

Transparent layers are ordered in contiguous per-rig blocks. `drawRank` selects
the block (background, terrain, props, actors); each blueprint layer order is
local to that block. Raw layer orders must never be used as global scene order,
or two assets can interleave part by part.

In the playground document, the object array is the canonical back-to-front
painter stack. Reordering an object updates that array and then assigns every
rig a fresh contiguous `drawRank`; there is deliberately no duplicate numeric
depth property.

## Determinism

Every semantic decision is generated from a namespaced seed. Adding one random
draw to a window generator must not alter a character, a neighbouring building,
or the line boil. Semantic parameters and visual redraw noise use separate seed
namespaces.

Recipes persist generated parameters rather than relying on the current
generator implementation to recreate historical content. A version field makes
future migrations explicit.

Pixel-identical output across browser rasterizers is not promised. Equivalent
recipes do promise equivalent geometry, layer structure, sockets, and colliders.

## Asset contract

An asset generator returns an immutable blueprint containing:

- named layers in stable draw order;
- layer bounds, pivots, bones, states, and draw functions;
- semantic sockets such as hand, door, and item anchors;
- gameplay colliders derived from the same layout as the drawing.
- declarative interactions that bind sensors and sockets to visual layer states.

Layer pivots use world-space orientation: `[0, 0]` is the bottom-left and
`[1, 1]` is the top-right of the plane. Canvas drawing still uses its native
top-left origin; `CanvasTexture` performs the texture-space conversion.

Physics never reads texture alpha. A visible feature and its gameplay meaning
share parameters; neither is reverse-engineered from the other.

See [`asset-authoring.md`](asset-authoring.md) for the static-prop versus asset-family
decision and the integration checklist.

## Rasterization and runtime

The baker creates a small canvas per layer/state/boil frame, then uploads the
result as a `THREE.CanvasTexture`. `SpriteRig` owns planes, materials, texture
state, transforms, and disposal. Static world layers may be baked as composites;
interactive layers remain independent.

The canvas factory is injected. Browser canvases are the default adapter, while
the drawing core remains compatible with `OffscreenCanvas` and test doubles.
