# Architecture

## Dependency direction

```text
core <- materials <- assets <- runtime <- experiments
```

`core`, `materials`, asset recipes, layouts, and blueprints do not import
Three.js. Runtime adapters consume immutable asset blueprints and own GPU
resources.
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

For characters, `CharacterIdentityRecipe` owns semantic identity once. Raster
and solid recipes reference that same immutable object and add only
representation style. Changing graphite to watercolour or skin to ceramic must
not reroll eyes, palette, proportions, hair, or species.

Pixel-identical output across browser rasterizers is not promised. Equivalent
recipes do promise equivalent geometry, layer structure, sockets, and colliders.

## Representation-neutral asset contract

The library does not equate an asset with a sprite. Recipe and layout express
identity, dimensions, semantic parts, sockets, and collision. A representation
blueprint then describes how those decisions become renderable data:

| Representation | Blueprint payload | Runtime adapter |
| --- | --- | --- |
| Hand-drawn raster | Canvas draw callbacks grouped into named layers | `SpriteRig` |
| Smooth solid | Serialisable superellipsoids, extruded profiles, and meshes | `SolidRig` |

Three.js belongs to runtime adapters, not recipes or geometry contracts. A game
can use the same solid blueprint with another renderer by implementing its own
geometry/material adapter. A future voxel representation should preserve the
same boundary instead of pretending a voxel field is a smooth mesh recipe.

```text
CharacterIdentityRecipe
  ├─ RasterCharacterStyle -> CharacterRecipe -> AssetBlueprint -> SpriteRig
  └─ SolidCharacterStyle  -> SolidFaceRecipe -> SolidAssetBlueprint -> SolidRig
```

Representation layouts share normalized semantic intent, not coordinates. Eye
spacing is an identity value; Canvas pixels and superellipsoid surface anchors
are adapter-specific derivations. Sharing one coordinate system here would be
coupling disguised as reuse.

## Raster asset contract

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

## Solid geometry and runtime

`SolidAssetBlueprint` is JSON-compatible data. It publishes a node hierarchy,
named parts, geometry specifications, physical material roles, 3D bounds,
colliders, and sockets. Supported geometry primitives are superellipsoids,
extruded 2D profiles, and indexed or flat triangle meshes.

`pointOnSuperellipsoid` is shared by layout and mesh generation. It returns an
exact surface point and analytic normal; `surfaceFrame` derives the tangent
basis used to mount a feature. Eyes and mouths therefore cannot drift away from
the head when its exponent changes from round to block-like.

`SolidRig` resolves pure specifications to Three.js geometry and physical
materials. Each semantic part remains an independent mesh. `SolidFaceAnimator`
resets those meshes to their rest transforms before applying blink, gaze, head
follow, and expression offsets, so animation never accumulates drift or
rebuilds geometry. The rig owns and disposes all generated GPU resources.
