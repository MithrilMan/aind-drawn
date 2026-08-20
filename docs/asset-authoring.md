# Procedural asset authoring

The library separates a generated asset into five contracts when one semantic
identity has more than one representation:

1. An **identity recipe** owns representation-independent semantic choices.
2. A **representation recipe** references that identity and adds only medium,
   finish, mesh density, or other representation-specific policy.
3. A **layout** derives world geometry, bounds, anchors, and part dimensions.
4. A **blueprint** binds named visual parts to geometry, colliders, sockets, states, and interactions.
5. A **runtime** adapts those parts to a renderer and applies transient state.

Drawing code consumes a complete recipe. It must not make new semantic random
choices while rasterizing; otherwise boil frames can change the identity of the
asset rather than only the character of its line.

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

Use the static prop registry when all of these are true:

- the object has one visual layer;
- its parts never move independently;
- it has no visual state transition;
- its gameplay contract needs only fixed colliders and sockets.

The registry lives in `src/assets/prop/definition.ts`. A prop definition owns its
base size, draw callback, collider builder, and socket builder. Adding a crate,
lamp, rock, or bottle should normally require one definition plus catalog and
test updates.

Create a dedicated asset family when any of these are true:

- parts need distinct pivots or draw order;
- the object has animation or interaction states;
- several variants share a semantic layout;
- consumers need meaningful anchors for its parts;
- collision changes by state.

A car is therefore a `vehicle`, not an oversized prop. Its body, wheels, and
doors are independent parts; it needs wheel, seat, and entry sockets; a door has
open and closed states; motion rotates wheels. Forcing that model into a single
draw callback would save a folder and spend the rest of the project paying for it.

Plants are the static multipart reference. `src/assets/plant` keeps mound, stem,
leaves, and bloom in separate semantic layers even though they do not animate.
The parts share root and crown anchors through one layout, while tree collision
comes from the same stem geometry used by the drawing.

`src/assets/character-identity` is the multi-representation reference. A single
`CharacterIdentityRecipe` owns species, proportions, palette, facial features,
hair, outfit, and body semantics. `src/assets/character` adds raster-medium
policy, while `src/assets/solid-character` adds solid finish, depth, body
topology, articulated nodes, colliders, and sockets. `src/assets/solid-face`
is the focused face projection reused by the complete character. The face
layout places shared facial intent on an analytic surface and both blueprints
emit serialisable geometry and material roles. Three.js objects exist only
after `SolidRig` consumes a blueprint.

The shared character contract includes more than categorical labels. Head
shapes evaluate one dimensionless radial field in raster and solid adapters;
eye spacing is a half-width ratio; hair and mouth profiles use head-radius
units. Expression variants derive from the same mouth profile factory. Add a
new hairstyle or mouth family there first, then make each representation consume
it. Do not add a second adapter-local silhouette table.

`src/assets/building-identity` is the non-character multi-representation
reference. Its archetypes are cottage, townhouse, apartment, and high-rise;
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
- Derive visual placement, bounds, colliders, and sockets from the same layout.
- Keep independently stateful parts in separate layers.
- Use a sensor collider and activation socket for each interaction.
- Bind interaction states to layer states through `InteractionDefinition`.
- Bind solid interaction states to semantic nodes through
  `SolidInteractionDefinition`; state changes transform the node at its real
  pivot and never replace renderer objects.
- Never infer physics or interaction regions from texture alpha.
- Choose pivots at the physical joint: wheel center, door hinge, limb shoulder.
- Keep local layer order small; `SpriteRig.drawRank` assigns the global block.
- For solids, use stable node and part IDs and mount features through a shared
  `SurfaceAnchor`; do not hand-tune Three.js transforms in the consumer.
- Keep material intent in `SolidMaterialSpec` and lighting/environment policy in
  the runtime or scene. When tonal hierarchy is part of cross-representation
  identity, author `drawing.tone`; do not let each projection reroll it.
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
- Reserve part-local or surface-following stroke paths for marks with real
  spatial meaning: whiskers, wires, seams, scars, raised outlines, and paths that
  deliberately leave a host. Do not use them to simulate generic medium fill.
- Do not feed physical finish into pigment deposition. Let the inked runtime
  own paper response, mark coverage, and discrete volume tone.
- Use the same `MediumId` for raster and inked-solid projections of one preview.
  `skin`, `glass`, `metal`, and other physical finishes belong only to smooth
  solid rendering; they are not drawing media and must not leak into doodle policy.
- Add a new drawing medium once in `src/materials/medium.ts` and its volumetric
  policy in `src/assets/inked-solid/medium-projection.ts`; add a new generic
  shader field in `InkedSolidPass` only when its paper-space statistics cannot reuse
  an existing one. Do not add asset-family-specific medium presets.
- Model expressive and decorative features as shared normalized constructions
  when they contain semantic subparts or ratios. Eyes, hair, outfit marks, and
  mouths live in identity profiles and are projected by raster and solid
  adapters; do not reroll pupil size or redraw a motif independently.

The building door is the cross-representation interaction reference. Raster
binds `closed` and `open` layer states; solid binds those states to the hinged
`door` node. Both use `door:sensor`, `door:entry`, and the same portal intent.

## Integration checklist

1. Export the new public types and factories from `src/index.ts`.
2. Register the asset in the consumer catalog rather than importing internals.
3. Extend the serializable experiment document only for authored parameters.
4. Add deterministic recipe tests and blueprint contract tests.
5. Test state validation and animation in the runtime when applicable.
6. Test every public medium through both raster and inked-solid projections;
   both outputs must retain the same `MediumId` and distinct deterministic policy.
7. Dispose generated resources through `SpriteRig.dispose()`, `SolidRig.dispose()`,
   `InkedSolidPass.dispose()`, and `InkedSolidStrokeRig.dispose()` when that
   representation is active. Dispose strokes before their owner solid rig.
8. Run `pnpm verify`.
9. Inspect representative seeds in the internal browser at every width the
   experiment claims to support; desktop-only labs require desktop QA only.

Repository agents can follow the local `aind-asset-authoring` skill under
`.codex/skills` for the step-by-step implementation workflow.
