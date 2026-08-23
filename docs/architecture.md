# Architecture

## Source ownership and dependency direction

```text
src/assets/
|-- building/{identity,raster,solid}
|-- character/{identity,raster,solid,runtime}
`-- vehicle/{identity,raster,solid,runtime}

src/contracts/                      shared raster, solid, and capability contracts
src/projections/inked-solid/        representation blueprint, policy, and runtime
src/runtime/                        family-agnostic renderer infrastructure
```

The repository is organized by semantic family first. Representation and
runtime folders are nested below the family that owns their vocabulary; shared
contracts and cross-family projections have explicit roots instead of posing as
asset families.

The physical vertical slices do not relax dependency direction:

- identity depends only on core, materials, and authoring contracts;
- raster and solid adapters depend on their identity and shared asset contracts;
- family runtimes depend on their family plus the generic rigs in `src/runtime`;
- generic runtimes depend on core, materials, and asset contracts, never on a family;
- experiments depend only on the public barrel exported by `src/index.ts`.

`core`, `materials`, asset recipes, layouts, and blueprints do not import
Three.js. Only runtime adapters consume immutable asset blueprints and own GPU
resources.
Experiments may depend only on the public barrel exported by `src/index.ts`.

Projection Studio keeps customization, playback, camera, and renderer state
outside the drawing library. Asset construction crosses the boundary through a
catalog that maps authoring values to public identity and blueprint factories.
Family-specific controls and runtime adapters are declarative catalog metadata;
the shell and its rendering stages do not branch on family IDs.

Shared blueprint contracts expose namespaced `AssetCapability` entries as an
extension boundary. A family owns the capability ID, payload type, constructor,
and reader. Generic rigs carry those entries without interpreting them. This
keeps expressions, rolling wheels, fluid effects, and future family vocabulary
out of `AssetBlueprint`, `SolidAssetBlueprint`, `SpriteRig`, and `SolidRig`.

Transparent layers are ordered in contiguous per-rig blocks. `drawRank` selects
the block (background, terrain, props, actors); each blueprint layer order is
local to that block. Raw layer orders must never be used as global scene order,
or two assets can interleave part by part.

Consumers that own a scene document keep its object array as the canonical
back-to-front painter stack. Reordering assigns every rig a fresh contiguous
`drawRank`; there is deliberately no duplicate numeric depth property.

## Determinism

Every semantic decision is generated from a namespaced seed. Adding one random
draw to a window generator must not alter a character, a neighbouring building,
or the line boil. Semantic parameters and visual redraw noise use separate seed
namespaces.

Recipes persist generated parameters rather than relying on the current
generator implementation to recreate historical content. Identity and
representation recipes expose `schemaVersion`; blueprints expose
`blueprintVersion`. These fields version data contracts, not generator releases.

The package is currently greenfield and unpublished. Obsolete contracts are
removed together with their call sites; compatibility factories, aliases, and
legacy document migrations are not maintained before a released format exists.

For characters, `CharacterIdentityRecipe` owns semantic identity once. Raster
and solid recipes reference that same immutable object and add only
representation style. Changing graphite to watercolour or skin to ceramic must
not reroll eyes, palette, proportions, hair, or species.

Pixel-identical output across browser rasterizers is not promised. Equivalent
recipes do promise equivalent geometry, layer structure, sockets, and colliders.

## Canonical asset envelopes

Every public asset stage uses one explicit header vocabulary:

- identities expose `schemaVersion`, `family`, and `seed`;
- representation recipes expose `schemaVersion`, `family`, `representation`,
  `identity`, and `style`;
- raster, solid, and inked-solid blueprints expose `blueprintVersion`, `family`,
  `representation`, `assetId`, and `seed`.

`family` is a family-owned string literal, so adding a family does not require
editing a closed core union. `representation` identifies the adapter and never
needs to be inferred from a family name. `assetId` identifies deterministic
authored content and remains equal across complete projections of the same
identity. It is not a runtime instance identifier.

The library is greenfield. The removed `version`, `kind`, and blueprint `id`
headers have no aliases or compatibility adapters.

## Validation and persistence boundaries

Unknown JSON enters a family only through its explicit identity decoder:
`decodeCharacterIdentity`, `decodeBuildingIdentity`, or `decodeVehicleIdentity`.
Each decoder validates the common envelope before family fields, rejects unknown
fields and unsupported versions, accumulates structured `AssetValidationIssue`
values, and returns a detached deeply immutable identity. Loading never reruns
the generator. `encodeAssetIdentity` creates a detached immutable JSON value
from an already trusted identity.

`validateRasterAssetBlueprint` and `validateSolidAssetBlueprint` are pure,
renderer-free boundaries. They validate hierarchies, identifiers, references,
geometry, capabilities, interactions, colliders, sockets, and materials while
preserving valid blueprint references. `AssetValidationError` exposes every
useful issue with a stable path and code rather than hiding the first useful
fact behind a generic constructor exception.

The public `blueprint-validation.ts` module is a deliberately thin facade.
Manifest, raster, solid, and cross-representation parity validation live in
separate internal modules over a small shared validation toolkit. This keeps
representation rules independent without exposing extra package entry points or
duplicating structured issue semantics.

`SpriteRig` and `SolidRig` invoke these validators before canvas, material, or
geometry allocation. If construction fails later for a renderer reason, each
constructor releases everything it allocated before rethrowing. Runtime checks
may still defend mutable state commands, but they are no longer the first
blueprint validation boundary.

## Representation-neutral asset contract

The library does not equate an asset with a sprite. Recipe and layout express
identity, dimensions, semantic parts, sockets, and collision. A representation
blueprint then describes how those decisions become renderable data:

Each multi-representation family owns one immutable `AssetSemanticManifest`
beside its identity. The manifest contains only generic spatial vocabulary,
stable semantic part IDs, socket and collider inventories, and shared
`InteractionSpec` values. Raster and solid blueprints from one complete asset
reference the same manifest object. Their layers and meshes publish
`semanticPartId`; their interaction bindings contain only renderer-specific
layer states or node transforms.

`validateAssetBlueprintParity` compares those contracts generically. It detects
missing semantic parts, sockets, colliders, interaction specs, and bindings
without switching on character, building, vehicle, or any future family ID.

| Representation | Blueprint payload | Runtime adapter |
| --- | --- | --- |
| Hand-drawn raster | Canvas draw callbacks grouped into named layers | `SpriteRig` |
| Smooth solid | Serialisable superellipsoids, extruded profiles, and meshes | `SolidRig` |
| Inked solid | An invisible smooth-solid carrier plus semantic strokes, multipass contour, material-aware pigment deposition, and paper policy | `InkedSolidScenePass` registrations around `SolidRig` |

The inked-solid projection is implemented as a representation adapter around
the exact smooth-solid blueprint. The mesh contributes occlusion, normals, and
semantic material masks, but its continuous surface is not composited. It adds
physical-finish-independent pigment, camera-derived contours,
camera-conditioned view marks, and authored spatial semantic marks without
copying geometry or semantic state. A mouth, seam, or
cornice has named ownership rather than being guessed by edge detection. See
[`3d-stroke-rendering.md`](3d-stroke-rendering.md) for the rendering boundary.

Semantic material RGB is the exact pigment source shared with raster output.
The inked-solid pass may change deposited opacity and mark density to describe
volume, but it must not darken, light, fog, or mix that source colour with
paper or contour ink before compositing. Medium-specific view-mark density is
compiled from the same tone vocabulary and calibrated against the raster
medium; it is not an independent collection of attractive-looking numbers.

Three.js belongs to runtime adapters, not recipes or geometry contracts. A game
can use the same solid blueprint with another renderer by implementing its own
geometry/material adapter. A future voxel representation should preserve the
same boundary instead of pretending a voxel field is a smooth mesh recipe.

```text
CharacterIdentityRecipe
  ├─ RasterCharacterStyle -> CharacterRecipe -> AssetBlueprint -> SpriteRig
  └─ SolidCharacterStyle  -> SolidCharacterRecipe -> SolidAssetBlueprint -> SolidRig
                                                          └─ InkedSolidBlueprint -> InkedSolidScenePass registration

BuildingIdentityRecipe
  ├─ RasterBuildingStyle  -> RasterBuildingRecipe -> AssetBlueprint -> SpriteRig
  └─ SolidBuildingStyle   -> SolidBuildingRecipe  -> SolidAssetBlueprint -> SolidRig
                                                          └─ InkedSolidBlueprint -> InkedSolidScenePass registration

VehicleIdentityRecipe
  ├─ RasterVehicleStyle  -> RasterVehicleRecipe  -> AssetBlueprint -> SpriteRig
  └─ SolidVehicleStyle   -> SolidVehicleRecipe   -> SolidAssetBlueprint -> SolidRig
                                                          └─ InkedSolidBlueprint -> InkedSolidScenePass registration
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

A mouth profile is a representation-neutral construction rather than a single
curve. Named layers describe lip ink, interior, teeth, and tongue; named strokes
describe tooth separators, stitches, and other internal marks. Raster and solid
adapters project the same construction, while expression selects a complete
profile without rerolling identity.

Facial expression is representation-neutral too. `CharacterExpressionProfile`
owns eye scale, eye openness, vertical brow lift, and inner-end brow raise.
Positive inner raise always means that both eyebrow endpoints nearest the nose
move upward; raster and solid adapters translate that meaning into their local
rotation signs. Eyebrows remain clear of the pupil volume. A narrowed eye or an
authored eyelid supplies occlusion pressure instead of pushing a brow mesh
through the eye.

## Raster asset contract

An asset generator returns an immutable blueprint containing:

- explicit `RasterBoneDefinition` entries with parent IDs and serialisable local rest poses;
- named layers in stable draw order;
- layer bounds, pivots, bone references, semantic ownership, states, and draw functions;
- semantic sockets with stable IDs, owner bones, and local position plus orientation;
- gameplay colliders with owner bones and local poses, derived from the same layout as the drawing;
- a shared semantic manifest plus raster-only interaction bindings.

Layer pivots use world-space orientation: `[0, 0]` is the bottom-left and
`[1, 1]` is the top-right of the plane. Canvas drawing still uses its native
top-left origin; `CanvasTexture` performs the texture-space conversion.

Physics never reads texture alpha. A visible feature and its gameplay meaning
share parameters; neither is reverse-engineered from the other.

`SpriteRig.getSocketWorldPose` and `SpriteRig.getColliderWorldShape` resolve
attachments after the complete bone and root transform, including mirrored
facing. They return frozen renderer-neutral data. Collider queries preserve the
authored shape and expose its exact world affine matrix rather than approximating
a rotated or mirrored shape as an axis-aligned box.

See [`asset-authoring.md`](asset-authoring.md) for the static-prop versus asset-family
decision and the integration checklist.

## Rasterization and runtime

The baker creates a small canvas per layer/state/boil frame, then uploads the
result as a `THREE.CanvasTexture`. `SpriteRig` is the public instance and spatial
query boundary. It delegates bone topology and mutable pose to `RasterSkeleton`,
layer baking, texture state, draw order, and GPU disposal to
`SpriteLayerRenderer`, and idempotent interaction state to
`InteractionStateController`. These collaborators remain internal runtime
infrastructure; consumers still use one rig API. Static world layers may be
baked as composites; interactive layers remain independent.

The canvas factory is injected. Browser canvases are the default adapter, while
the drawing core remains compatible with `OffscreenCanvas` and test doubles.

## Solid geometry and runtime

`SolidAssetBlueprint` is JSON-compatible data. It publishes a node hierarchy,
named parts, geometry specifications, physical material intent, 3D bounds,
colliders, sockets, semantic ownership, and node-transform interaction bindings. Supported geometry
primitives are boxes, superellipsoids, extruded 2D profiles, and indexed or flat
triangle meshes.

Every solid node owns a complete `Pose3` rest transform with a quaternion, not
an implicit identity orientation plus a position. `SolidSocketDefinition` and
solid collider definitions name their owner node and store a local `Pose3`.
Boxes, spheres, and capsules form the deliberately small collision vocabulary.
Moving a node therefore carries every owned attachment without rebuilding the
blueprint or exposing Three.js objects.

`pointOnSuperellipsoid` is shared by layout and mesh generation. It evaluates
the same serialisable radial field used by the raster head outline. Base
superellipsoids use analytic normals and deformed fields use stable surface
differentials; `surfaceFrame` derives the tangent basis used to mount a feature.
Projected eye and mouth coordinates are solved against that surface instead of
being remapped by representation-specific constants.

`SolidRig` resolves pure specifications to Three.js geometry and physical
materials. Each semantic part remains an independent mesh. Mouth expressions
are authored profile variants selected by the solid character motion
applicator, not scale-only distortions of one neutral mouth. `SolidRig` owns the
authored rest transforms and exposes focused node and part reset operations;
projection applicators therefore remain idempotent without caching renderer
state outside the rig. The rig owns and disposes all generated GPU resources.

## Pure family motion

Transient motion is evaluated before either renderer mutates. Character
commands are reduced into a frozen `CharacterMotionState` whose pose transition
stores absolute start time and source weights. `sampleCharacterMotion` combines
that state, the shared identity, and an absolute time into one immutable
`CharacterMotionSample`. Body articulation, face schedules, and flowing
secondary effects are separate pure collaborators behind that sampler.

Blink and gaze use namespaced, seed-derived absolute time windows instead of a
hidden random cursor. Sampling a time directly therefore produces the same
result as inspecting every preceding frame. Reapplying an equal command returns
the same state object and does not restart a transition or autonomic schedule.

`applyRasterCharacterMotion` and `applySolidCharacterMotion` consume the same
semantic sample. They translate joint swing, planar roll, foreground crossing,
face intent, and flow phase into their own bone, layer, node, and part
operations. Both restore authored targets before application, so applying one
sample repeatedly cannot accumulate transforms. Raster line boil is selected
from the sample's absolute time.

Vehicle motion follows the same boundary. `sampleVehicleMotion` derives one
wheel angle from identity-owned radius and cumulative signed travel, plus
steering and suspension intent. Separate raster and solid applicators select
their family capability targets without inspecting or discriminating the other
rig representation.

Physical material resolution is centralized in `SolidMaterialProvider`.
`SolidMaterialSpec.finish` selects a renderer policy from the complete public
catalog; the provider lazily creates and shares deterministic normal,
roughness, and iridescence maps where a finish needs them. One provider belongs
to one rig and disposes every material and generated texture it owns. Asset
families declare material intent only; they neither construct Three.js
materials nor duplicate procedural texture generators. Runtime geometry detail
is likewise a `SolidRig` option, scaling authored tessellation without changing
identity, bounds, sockets, colliders, or serialized mesh topology.

`SolidRig.getSocketWorldPose` returns a serialisable position and quaternion;
`SolidRig.getColliderWorldShape` returns the immutable authored collider plus
its exact column-major world transform. Both include interaction, animation,
root translation, rotation, scale, and mirrored facing. Missing IDs return
`null`, so ordinary consumers do not need to inspect the renderer scene graph.

## Runtime instances and composition

`assetId` identifies immutable generated content; `instanceId` identifies one
mutable runtime projection of that content. `SpriteRig` and `SolidRig` accept an
explicit `instanceId` and generate a process-local ID when none is supplied.
Persisted scenes must provide their own stable IDs rather than storing generated
ones. Instance metadata is written to renderer roots and parts without mutating
the blueprint, identity, or recipe.

Both rigs implement the renderer-neutral `AssetInstance` contract. Their frozen
`getInstanceState()` snapshots contain the world-space root pose, interaction
states, and playback time. `setWorldPose()` converts a world pose through any
existing renderer parent while preserving root scale. `SpriteRig.setPlaybackTime()`
also samples boil frames; family motion sampling remains a separate concern.

`AssetComposition` is an optional coordinator, not a scene graph replacement.
It inserts and removes instances, assigns complete back-to-front raster draw
order, applies same-dimension socket attachments, visits parents before attached
children, and returns deterministic serialisable snapshots. Inserted runtime
resources are explicitly `owned` or `borrowed`: removal and composition disposal
release only owned rigs, and every disposal path is idempotent.

Blueprints are shared immutable references, while GPU resources remain owned by
individual rigs. Geometry, material, or texture sharing is intentionally deferred
until measurements justify a reference-counted cache with exact disposal tests.
The composition service does not own physics, navigation, gameplay, ECS storage,
or persistence policy.

Buildings use the same boundary without character concepts. A shared building
identity owns archetype, dimensions, depth, floors, bays, roof, door, balconies,
chimney, and palette. Its identity-adjacent facade geometry owns normalized wall,
roof, window, balcony, chimney, and door profiles. Raster and solid adapters
consume those exact profiles and differ only in projection and medium policy.
Door identity includes hinge side and opening angle so raster and solid
projections cannot silently choose opposite pivots. The raster adapter emits semantic drawing layers; the
solid adapter emits facade volume, roof geometry, windows, spatial balconies,
an articulated door node, a recessed opening, matching colliders, and the same entry socket.

`createInkedSolidBlueprint` wraps any `SolidAssetBlueprint` by reference and
adds immutable drawing policy only. It requires the same `MediumId` used by
raster recipes; `inkedSolidMediumDefaults` compiles that medium into volumetric
coverage, view-synthesized marks, contour, and paper policy. Every material
declares a generic `SolidMaterialSpec.drawing` application and tone.
Applications such as `pigment`, `tint`, `paper`, `ink`, `wash`, and `glaze`
describe deposition rather than asset semantics; the selected medium provider
resolves them without inspecting family, material, or part names. Physical
`SolidFinishId` remains an orthogonal smooth-rendering concern.
`InkedSolidScenePass` registers exact blueprint/rig/instance triples and precomputes part,
material, topology, owner-anchor, semantic-stroke, and pass-material mappings. The service renders
all registered carriers into shared unlit semantic albedo, depth, normal/topology, material-mark,
and owner-anchor buffers. Its composite shader treats each mesh as an invisible G-buffer
carrier and synthesizes a fresh two-dimensional drawing for the current camera
projection. Carrier pixels start from opaque paper, receive an irregular
semantic-colour pigment bed, then gesture marks and contours. Mark fields live
in view-oriented drawing space, are translated with the projected origin of
their owning semantic part, and are clipped by the projected material masks.
On explicitly faceted carriers, the visible normal continuously rotates and
foreshortens directional fields; drawing-light response changes mark density
and pressure so adjacent planes do not collapse into one uniform hatch. Smooth
carrier topology keeps curved regions in a view-oriented 2D field and uses only
density and pressure to describe volume. This decision comes from authored
geometry smoothing rather than screen-space curvature derivatives, so camera
distance and viewport resolution cannot reclassify a surface. Camera rotation
changes projection and occlusion without rerolling pigment colour or noise at a
discrete view threshold. Paper grain alone remains stationary in screen space.
Smooth-solid roughness, metalness, and clearcoat never enter this path.
Every visible carrier encodes a registration policy slot, allowing media and contour policy to
vary per instance while paper remains one immutable scene-level choice. Unregistered geometry is
excluded by default; the explicit `depth-only` scene policy may let it occlude carriers without
entering semantic colour or material buffers. Internal proxy scenes share source geometry and
update preallocated matrices, avoiding source-material mutation, unrelated scene traversal, and
per-frame swap records.

Normal-derived crease contours use that same topology bit. They are evaluated only across
explicitly faceted carrier pixels; smooth analytic surfaces retain silhouettes without exposing
curvature bands or tessellation. A faceted mesh publishes one face normal per authored polygon,
not per generated fan triangle, so renderer triangulation diagonals cannot leak into the drawing.

Each registration owns an `InkedSolidStrokeRig`, which resolves family-authored paths into small
ink volumes parented to their owner parts. These volumes are reserved for genuinely spatial marks
such as whiskers, wires, lifted seams, and other strokes that must leave or follow a surface.
Disposing the registration releases its proxy materials and stroke resources before the caller
disposes the `SolidRig`; disposing the scene pass releases every remaining registration and shared
G-buffer resource.

Raster and solid character animators consume the same transient
`CharacterMotion` vocabulary (`idle`, `walk`, `run`, `airborne`, `sit`, `sleep`,
and `play`). Motion is not part of the immutable identity or blueprint. Each
runtime adapter is free to interpolate according to its medium while preserving
the same semantic pose.
