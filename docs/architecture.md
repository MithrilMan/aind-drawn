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

The package is currently greenfield and unpublished. Obsolete contracts are
removed together with their call sites; compatibility factories, aliases, and
legacy document migrations are not maintained before a released format exists.

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
| Inked solid | A smooth-solid blueprint plus doodle fill, semantic strokes, contour, hatch, and paper policy | `InkedSolidPass` and `InkedSolidStrokeRig` around `SolidRig` |

The inked-solid projection is implemented as a representation adapter around
the exact smooth-solid blueprint. It adds physical-finish-independent pigment,
camera-derived contours, stable object-local surface hatching, and authored
semantic marks without copying geometry or semantic state. A mouth, seam, or
cornice has named ownership rather than being guessed by edge detection. See
[`3d-stroke-rendering.md`](3d-stroke-rendering.md) for the rendering boundary.

Three.js belongs to runtime adapters, not recipes or geometry contracts. A game
can use the same solid blueprint with another renderer by implementing its own
geometry/material adapter. A future voxel representation should preserve the
same boundary instead of pretending a voxel field is a smooth mesh recipe.

```text
CharacterIdentityRecipe
  ├─ RasterCharacterStyle -> CharacterRecipe -> AssetBlueprint -> SpriteRig
  └─ SolidCharacterStyle  -> SolidCharacterRecipe -> SolidAssetBlueprint -> SolidRig
                                                          └─ InkedSolidBlueprint -> InkedSolidPass + InkedSolidStrokeRig

BuildingIdentityRecipe
  ├─ RasterBuildingStyle  -> RasterBuildingRecipe -> AssetBlueprint -> SpriteRig
  └─ SolidBuildingStyle   -> SolidBuildingRecipe  -> SolidAssetBlueprint -> SolidRig
                                                          └─ InkedSolidBlueprint -> InkedSolidPass + InkedSolidStrokeRig
```

Identity includes spatial topology when it changes meaning across projections.
A crown is a `wrap`, not merely the front outline visible in a drawing; a door
is `articulated`, not a dark rectangle. Raster adapters may collapse hidden
dimensions, while solid adapters must preserve them.

Representation layouts share normalized semantic intent, not renderer
coordinates. Eye spacing is measured from the face centre as a fraction of the
head half-width. Hair and mouth profiles are expressed in head-radius units.
Canvas pixels and solid surface anchors remain adapter-specific derivations,
but both consume those same dimensionless contracts.

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
colliders, sockets, and node-transform interactions. Supported geometry
primitives are boxes, superellipsoids, extruded 2D profiles, and indexed or flat
triangle meshes.

`pointOnSuperellipsoid` is shared by layout and mesh generation. It evaluates
the same serialisable radial field used by the raster head outline. Base
superellipsoids use analytic normals and deformed fields use stable surface
differentials; `surfaceFrame` derives the tangent basis used to mount a feature.
Projected eye and mouth coordinates are solved against that surface instead of
being remapped by representation-specific constants.

`SolidRig` resolves pure specifications to Three.js geometry and physical
materials. Each semantic part remains an independent mesh. Mouth expressions
are authored profile variants selected by `SolidFaceAnimator`, not scale-only
distortions of one neutral mouth. The animator also owns blink, gaze, and head
follow; `SolidCharacterAnimator` adds rest-pose body nodes, locomotion,
breathing, and tail motion. Both reset their targets before applying transforms,
so animation never accumulates drift or rebuilds geometry. The rig owns and
disposes all generated GPU resources.

Buildings use the same boundary without character concepts. A shared building
identity owns archetype, dimensions, depth, floors, bays, roof, door, balconies,
chimney, and palette. The raster adapter emits semantic drawing layers; the
solid adapter emits facade volume, roof geometry, windows, spatial balconies,
an articulated door node, matching colliders, and the same entry socket.

`createInkedSolidBlueprint` wraps any `SolidAssetBlueprint` by reference and
adds immutable drawing policy only. It requires the same `MediumId` used by
raster recipes; `inkedSolidMediumDefaults` compiles that medium into volumetric
coverage, surface marks, contour, and paper policy. Physical `SolidFinishId`
remains an orthogonal smooth-rendering concern. `InkedSolidPass` renders unlit semantic
albedo with depth, normals, and an object-local position buffer. The composite shader derives
camera-dependent silhouettes and creases from depth/normals while building
medium-specific pigment and triplanar surface character from local coordinates. Smooth-solid
roughness, metalness, and clearcoat never enter this path. `InkedSolidStrokeRig`
resolves family-authored paths into small ink volumes parented to their owner
parts, so marks remain attached when a rig, limb, roof, or door moves. Both
runtimes own and dispose their generated GPU resources.

Raster and solid character animators consume the same transient
`CharacterMotion` vocabulary (`idle`, `walk`, `run`, `airborne`, `sit`, `sleep`,
and `play`). Motion is not part of the immutable identity or blueprint. Each
runtime adapter is free to interpolate according to its medium while preserving
the same semantic pose.
