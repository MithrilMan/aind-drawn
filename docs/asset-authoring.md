# Procedural asset authoring

The library separates a generated asset into six contracts when one semantic
identity has more than one representation:

1. An **identity recipe** owns representation-independent semantic choices.
2. A **representation recipe** references that identity and adds only medium,
   finish, mesh density, or other representation-specific policy.
3. A **semantic manifest** names representation-neutral parts, sockets, colliders,
   and interaction intent.
4. A **layout** derives world geometry, bounds, anchors, and part dimensions.
5. A **blueprint** binds concrete visual parts and interaction bindings to that manifest.
6. A **runtime** adapts those parts to a renderer and applies transient state.

Drawing code consumes a complete recipe. It must not make new semantic random
choices while rasterizing; otherwise boil frames can change the identity of the
asset rather than only the character of its line.

## Family-first source layout

Multi-representation families own one vertical slice under
`src/assets/<family>/`: `identity/`, `raster/`, `solid/`, and, when transient
family-specific behavior exists, `runtime/`. Focused solid components remain
inside their owning representation, such as `character/solid/face/`.

Shared blueprint contracts live under `src/contracts/`. Cross-family
representation policy lives under `src/projections/`. Generic Three.js
rigs remain under `src/runtime/`; a family animator belongs beside its family.

## Canonical envelopes

Use the shared contracts from `contracts/asset-envelope.ts`; do not invent a
family-local header:

- extend `AssetIdentityEnvelope<TFamily>` for resolved identity data;
- extend `AssetRecipeEnvelope<TFamily, TRepresentation, TIdentity, TStyle>` for
  raster or solid projection policy;
- return `AssetBlueprint<TFamily>` or `SolidAssetBlueprint<TFamily>` from family
  blueprint factories;
- preserve the source `family`, `assetId`, and `seed` when wrapping a solid in
  `InkedSolidBlueprint<TFamily>`.

Family literals describe semantic ownership. Representation literals describe
the adapter. Do not combine them in a `kind` string. Representation policy
belongs under `style`; a recipe must not duplicate its identity seed or lift
family-specific style fields into its envelope.

## Codecs and blueprint validation

Every persisted multi-representation identity needs a strict family-owned
decoder beside its identity recipe. The decoder accepts `unknown`, validates the
common envelope before family vocabulary, rejects unknown fields and impossible
combinations, and returns a detached deeply frozen value. Do not regenerate an
identity from its seed while loading, and do not turn a type assertion into a
codec with better branding.

Factory output must pass `validateRasterAssetBlueprint` or
`validateSolidAssetBlueprint`. Generic validators own structural invariants;
family codecs own domain invariants. Rigs validate again at their public runtime
boundary before allocation, so consumers cannot bypass safety by skipping
factory-level tests.

Families with raster and solid output publish one immutable
`AssetSemanticManifest` from `identity/semantics.ts`. Both complete projections
reference that exact object. Run `validateAssetBlueprintParity` in authoring
tests: it checks semantic part definitions, complete socket and collider
inventories, interaction specs, and projection bindings without importing any
family vocabulary.

## Choose the smallest honest model

First choose the representation: use raster layers for hand-drawn planes and
semantic solid parts for real volume. Consumer choice is not representation
choice: a `SpriteRig` can live in a Three.js scene, while a `SolidRig` can be
rendered orthographically in a 2.5D game.

When an existing solid needs a three-dimensional hand-drawn projection, wrap
its completed `SolidAssetBlueprint` with `createInkedSolidBlueprint` and pass an
explicit shared `MediumId`. Pigment,
contour, semantic strokes, view-synthesized marks, paper grain, anchoring policy,
and boil timing are representation policy; they must not
reroll geometry or enter the family identity. The same public runtime is used
for characters, buildings, vehicles, and props with real volume. Do not create
a family-specific post-process shader or a parallel set of 3D-only drawing
media. Use `inkedSolidMediumDefaults` only when a consumer needs to derive an
advanced override such as a line-weight multiplier.

Author semantic strokes in the family adapter. Use a
`superellipsoid-surface` path when the mark follows an analytic host and a
`part-local` path when it belongs to a box, profile, mesh, or deliberately
leaves the surface. Every stroke names its owner part. Do not store Three.js
curves or world coordinates in the blueprint; `InkedSolidStrokeRig` resolves
and parents the runtime geometry.

Create a dedicated asset family when any of these are true:

- parts need distinct pivots or draw order;
- the object has animation or interaction states;
- several variants share a semantic layout;
- consumers need meaningful anchors for its parts;
- collision changes by state.

A car is therefore a `vehicle`, not one static silhouette. Its body, wheels, and
doors are independent parts; it needs wheel, seat, and entry sockets; a door has
open and closed states; motion rotates wheels. Forcing that model into a single
draw callback would save a folder and spend the rest of the project paying for it.

`src/assets/character` is the multi-representation reference. A single
`CharacterIdentityRecipe` owns species, proportions, palette, facial features,
hair, outfit, and body semantics under `character/identity`. `character/raster`
adds raster-medium policy, while `character/solid` adds solid finish, depth,
body topology, articulated nodes, colliders, and sockets.
`character/solid/face` is the focused face projection reused by the complete
character. The face
layout places shared facial intent on an analytic surface and both blueprints
emit serialisable geometry and explicit drawing applications. Three.js objects exist only
after `SolidRig` consumes a blueprint.

The shared character contract includes more than categorical labels. Head
shapes evaluate one dimensionless radial field in raster and solid adapters;
eye spacing is a half-width ratio; hair and mouth profiles use head-radius
units. Expression variants derive from the same mouth profile factory. Add a
new hairstyle or mouth family there first, then make each representation consume
it. Do not add a second adapter-local silhouette table.

Character accessories are a typed discriminated union in the identity recipe,
not renderer callbacks or a generic bag of geometry. Each accessory owns stable
measurements, colour, semantic subparts, and spatial intent such as `wrap`.
Eyewear is the reference: raster projects its frontal construction while solid
emits open rims, bridge, hinges, and temples that reach around the head. Anatomy
and styling remain separate concepts; ears, noses, and facial hair do not become
accessories merely because an authoring panel can switch them on.

Eye and eyebrow expression also come from the shared
`CharacterExpressionProfile`. Name pose values by their visible meaning, not by
one renderer's coordinate sign: positive `innerRaise` raises both brow ends
nearest the nose. Adapters may convert that intent into different local
rotations, but must preserve the same eye openness and brow reading. Keep the
brow clear of the pupil; use eye openness or an authored eyelid when an
expression needs to cover the upper eye.

`src/assets/building` is the non-character multi-representation reference.
Its `identity`, `raster`, and `solid` folders share archetypes such as cottage,
townhouse, apartment, and high-rise;
the term is deliberately not `species`. Raster and solid building recipes
reference the same identity. Balconies, roof volume, door hinge, colliders, and
entry sockets therefore remain structurally aligned across projections.

Identity-derived feature profiles must also preserve spatial topology. Use an
honest intent such as `surface`, `head-shell`, `surface-cluster`, `wrap`,
`volume`, or `articulated` where a front silhouette would discard meaning.
`front-extrusion` is reserved for deliberately planar parts. Character hair is
the reference: a bob is a conforming shell, a tuft is a cluster of volumes
anchored to the head surface, and a crown is a closed wrap. The raster adapter
may use their front outlines; the solid adapter must not turn them into plates.

## Deterministic recipes

Allocate one seed namespace per semantic feature:

```ts
const bodyRandom = tree.random('vehicle:body');
const wheelRandom = tree.random('vehicle:wheels');
const doorRandom = tree.random('vehicle:door');
```

Persist the resulting values in the recipe. Adding a roof rack must not reroll
the wheel size of every existing vehicle. Boil noise is already namespaced by
asset, layer, state, and frame in `SpriteRig`.

For a multi-representation family, generate each semantic choice once in the
identity recipe. Adapters may translate normalized intent into different
coordinate systems, but must not reroll eyes, palette, proportions, or other
identity data.

## Blueprint rules

- Give layers stable semantic IDs such as `body`, `wheel:front`, and `door:left`.
- Give every raster layer and solid part a `semanticPartId` declared by the
  family manifest. Concrete granularity may differ across projections.
- Publish raster bones explicitly. Each bone owns its parent and local `Pose2`;
  layers reference bones and never repeat hierarchy or anchor coordinates.
- Give every solid node a local `Pose3` rest transform with a unit quaternion.
- Derive visual placement, bounds, colliders, and sockets from the same layout.
- Attach every socket and collider to its physical bone or node with a local
  pose. Static data uses the semantic root; hands, door leaves, wheels, and
  effects use their articulated owner.
- Keep activation sensors on the stable approach region when the moving leaf
  should not carry them. A collider for the leaf itself belongs to the hinge.
- Keep independently stateful parts in separate layers.
- Use a sensor collider and activation socket for each interaction.
- Declare interaction ID, kind, states, sensor, and activation socket once as an
  `InteractionSpec` in the shared manifest.
- Bind raster state through `RasterInteractionBinding.layers` and solid state
  through `SolidInteractionBinding.nodes`; adapters must not restate semantic
  interaction definitions. Solid state changes transform the node at its real
  pivot and never replace renderer objects.
- Never infer physics or interaction regions from texture alpha.
- Use `getSocketWorldPose` and `getColliderWorldShape` for runtime integration;
  do not reconstruct hierarchy transforms or require Three.js access.
- Treat `assetId` as immutable content identity and `instanceId` as runtime
  identity. Provide stable instance IDs for persisted scenes; generated IDs are
  process-local conveniences only.
- Read serialisable runtime state through `getInstanceState()` and apply root
  movement through `setWorldPose()`. Never write transforms, interaction state,
  or playback time back into a blueprint, identity, or recipe.
- When using `AssetComposition`, declare each rig `owned` or `borrowed`, keep
  attachments within one spatial dimension, and let the composition assign the
  complete raster draw order. Physics and gameplay remain consumer concerns.
- Choose pivots at the physical joint: wheel center, door hinge, limb shoulder.
- Keep local layer order small; `SpriteRig.drawRank` assigns the global block.
- For solids, use stable node and part IDs and mount features through a shared
  `SurfaceAnchor`; do not hand-tune Three.js transforms in the consumer.
- Keep material intent in `SolidMaterialSpec` and lighting/environment policy in
  the runtime or scene. Every material declares both a generic
  `drawing.application` and `drawing.tone`. The application describes deposition
  (`pigment`, `tint`, `paper`, `ink`, `wash`, or `glaze`), never an asset role.
  When tonal hierarchy is part of cross-representation identity, author
  `drawing.tone`; do not let each projection reroll it.
- Select physical appearance from `SOLID_FINISH_CATALOG`. The runtime
  `SolidMaterialProvider` is the only place that maps a finish to Three.js
  parameters and procedural maps. Add a finish once to the catalog, its
  exhaustive provider recipe, and focused provider tests; do not construct
  materials or textures inside an asset family. The provider owns generated
  maps, shares them within one rig, and disposes them with that rig.
- Treat runtime `detail` as tessellation policy. It may scale authored segment
  counts but must not alter serialized geometry, gameplay bounds, sockets,
  colliders, or identity. Hand-authored mesh topology is preserved.
- Keep inked-solid policy in `InkedSolidBlueprint`; screen-space contours belong
  to the camera pass. Procedural medium marks are synthesized in paper space for
  the current projection and clipped by semantic material masks.
- Keep physical and gameplay geometry exact. Express hand-drawn imprecision in
  the projected contour policy: static low-frequency wander, pressure variation,
  broken pickup, echoes, and optional quantized boil. Never bake decorative
  wobble into colliders or duplicate it in an individual asset family.
- Treat the solid mesh as an invisible Doodle 3D carrier. It supplies depth,
  normals, occlusion, semantic material colour, and material membership;
  continuous mesh albedo must never reach the composite. Carrier regions begin
  as drawing paper; semantic colour supplies the irregular pigment bed and
  view-synthesized marks.
- Preserve semantic material RGB as the exact pigment source. Express volume by
  changing deposition opacity and density; never pre-mix pigment with paper,
  contour ink, fog, or normal lighting. Those layers are composited separately.
- Compile view-mark density, opacity, and style from the shared raster medium
  semantics. Calibrate representative tones against their raster spacing and
  alpha ratios; an authored `light` tone must not silently become a hatch, and
  a `black` pencil region must remain substantially denser than ordinary hatch.
- Keep only paper grain stationary in screen space. Translate pigment and
  view-synthesized gesture fields with each visible semantic part's projected
  origin so articulation carries its marks. Camera and root rotation must
  update projection continuously without a discrete seed or colour reroll.
- Condition directional gesture fields by the visible surface normal only on
  explicitly faceted carrier topology. Adjacent planes sharing one material
  must still separate through continuous hatch orientation, foreshortening,
  density, and pressure; never assign arbitrary camera-facing style buckets
  that flicker as the camera rotates. Smooth meshes and superellipsoids keep
  view-oriented 2D strokes at light-invariant deposited density; occlusion may
  reveal their volume, but drawing light must not turn filler into shadow.
  A geometric crease belongs in mesh smoothing topology, not in a
  screen-resolution-dependent curvature test.
- Keep a synthesized field's frequency and phase invariant across one carrier
  region. On faceted topology, lighting may modulate pressure or opacity, or
  reveal an additional fixed-frequency pass; it must not rescale the field per
  pixel because tone boundaries would become visible stroke seams. Smooth
  topology treats medium marks as deposited filler and ignores drawing light.
- Reserve part-local or surface-following stroke paths for marks with real
  spatial meaning: whiskers, wires, seams, scars, raised outlines, and paths that
  deliberately leave a host. Do not use them to simulate generic medium fill.
- Do not feed physical finish into pigment deposition. Let the inked runtime
  own paper response, mark coverage, and discrete volume tone.
- Use the same `MediumId` for raster and inked-solid projections of one preview.
  `skin`, `wood`, `chrome`, `ceramic`, and other physical finishes belong only
  to smooth solid rendering; they are not drawing media and must not leak into
  doodle policy.
- Add a new drawing medium once in `src/materials/medium.ts`, implement one
  provider under `src/projections/inked-solid/projection-providers/`, and register it
  in `medium-projection.ts`; add a new generic
  shader field in `InkedSolidPass` only when its paper-space statistics cannot reuse
  an existing one. Do not add asset-family-specific medium presets.
- Derive that volumetric policy from the raster operation itself. Watercolour
  remains layered translucent coverage rather than directional bands; Ink uses
  its restrained hatch only at the same tone densities as raster; Oil preserves
  its opaque pigment bed and broken daubs; Charcoal remains granular pickup;
  Marker remains broad translucent passes. `ToneStyle` expresses density, not
  a renderer command: a shared `hatch` tone does not authorize literal hatch
  lines in a medium whose raster operation never draws them.
- Secondary effects own normalized attachment, component topology, clearance,
  and flow intent in shared identity profiles. A wet tear, for example, is an
  attached stream plus independently flowing drop and bead rather than one
  sprite or plate translated as a block. Each adapter projects those same
  components and includes their extent when placing the visible tip below an
  eyelid, nozzle, socket, or emitting surface; centre-to-centre adapter offsets
  are not a semantic attachment contract.
- Raster and solid character runtimes use the same temporal pose-weight blend.
  Solid limbs that cross a planar silhouette must articulate in front of the
  carrier volume around their real joint, never pass through the torso mesh.
- Model expressive and decorative features as shared normalized constructions
  when they contain semantic subparts or ratios. Eyes, hair, outfit marks, and
  mouths live in identity profiles and are projected by raster and solid
  adapters; do not reroll pupil size or redraw a motif independently.
- Do not add adapter-only facial decoration to make one projection look richer.
  An eyelid, eye bag, wrinkle, scar, or cheek mark must come from a shared
  identity profile and be emitted only by the eye or face styles that own it.
  A solid surface coordinate is a projection of that semantic mark, not its
  source of truth.

Building elevations use one identity-derived local-space facade construction.
Roof, wall, window, balcony, chimney, and door profiles are not independently
redrawn by raster and solid adapters. Raster maps the profiles to canvas space
and applies medium wobble; solid extrudes or places the same profiles. Doodle
strokes may add authored details such as a window mullion, but never adapter-only
floor seams, random facade scratches, or duplicate roof and door outlines.

The building door is the cross-representation interaction reference. Raster
binds `closed` and `open` layer states; solid binds those states to the hinged
`door` node. Both use the identity-authored hinge side and opening angle,
`door:sensor`, `door:entry`, and the same shared `InteractionSpec`. An open leaf must reveal
an authored aperture or recess; rotating a plate in front of an intact wall is
not an opening.

Family-specific animation metadata is published as namespaced capabilities.
The generic layer and solid-part contracts do not contain a growing union of
character, vehicle, or effect roles. Define a capability ID, payload, constructor,
and reader beside the owning family; its animator consumes that reader while
generic rigs remain unaware of the payload.

The vehicle family is the articulated machinery reference. One
`VehicleIdentityRecipe` owns body archetype, proportions, cabin, wheelbase,
tyres, door sides, hinge intent, window-frame mode, opening angle, details,
palette, and useful sockets. Vehicle-local axes point the front along `+X` and
up along `+Y`, with the right side along `+Z`; adapters derive every side sign
from that right-handed convention.
Raster wheels and solid
torus tyres publish family-owned rolling capabilities consumed by
`VehicleAnimator`; rotation is
derived from cumulative signed travel, so frames cannot accumulate drift.
The door panel, its glass, frame, handle, and drawing marks share the hinged
node, while the chassis owns the revealed aperture. Doors, bonnet, and cargo
remain declarative rig interactions. Projection Studio
registers these controls through family metadata and does not branch on the
`vehicle` family ID.

## Integration checklist

1. Use the canonical identity, recipe, and blueprint envelopes and verify that
   all complete projections share the same `family`, `assetId`, and `seed`.
2. Add an identity-adjacent semantic manifest, map every concrete part through
   `semanticPartId`, and verify complete projections with `validateAssetBlueprintParity`.
3. Add and export a strict identity decoder, then run every representative
   factory output through the matching public blueprint validator.
4. Export the new public types and factories from `src/index.ts`.
5. If generic editors customize the family, publish and validate an
   `AssetFamilyAuthoringSchema` beside identity. The schema owns safe parameter
   metadata, defaults, choices, and semantic preview layers; the family adapter
   still maps values to typed recipe options explicitly.
6. Register the asset in the consumer catalog rather than importing internals.
7. Extend the serializable experiment document only for authored parameters.
8. Add deterministic recipe tests, authoring-schema validation, and blueprint contract tests.
9. Test state validation and animation in the runtime when applicable.
10. Test every public medium through both raster and inked-solid projections;
   both outputs must retain the same `MediumId` and distinct deterministic policy.
11. Dispose generated resources through `SpriteRig.dispose()`, `SolidRig.dispose()`,
   `InkedSolidPass.dispose()`, and `InkedSolidStrokeRig.dispose()` when that
   representation is active. Dispose strokes before their owner solid rig.
11. Run `pnpm verify`.
12. Inspect representative seeds in the internal browser at every width the
   experiment claims to support; desktop-only labs require desktop QA only.

Repository agents can follow the local `aind-asset-authoring` skill under
`.codex/skills` for the step-by-step implementation workflow.
