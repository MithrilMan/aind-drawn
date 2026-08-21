---
name: aind-asset-authoring
description: Design, implement, or revise procedural asset types in aind-drawn, including deterministic identity, raster and solid projections, Doodle 3D, spatial topology, semantic parts, interactions, animation, catalog integration, and authoring tests.
---

# AIND asset authoring

Build the smallest asset model that preserves semantic parts, deterministic
identity, gameplay metadata, and runtime state. Do not hide multipart behavior
inside one canvas callback.

## Detailed workflow routing

Always read [references/family-workflow.md](references/family-workflow.md) when
adding a new asset type. It contains the classification decision, concrete
folder shapes, recipe/layout/blueprint steps, geometry choices, export work,
and acceptance checklist.

Then read only the applicable focused reference:

- stateful or animated parts: [references/interactions-and-motion.md](references/interactions-and-motion.md);
- smooth-solid or Doodle 3D output: [references/inked-solid.md](references/inked-solid.md);
- playground/editor registration: [references/playground-integration.md](references/playground-integration.md);
- vehicles and comparable articulated machinery: [references/vehicle-family.md](references/vehicle-family.md).

Do not force every family through every representation. A decal may remain
raster-only; an arbitrary-view machine may begin solid-only; a family expected
to span projections must begin with representation-neutral identity.

## Read the local contracts

Before editing, read:

- `docs/architecture.md`
- `docs/asset-authoring.md`
- the existing family closest to the requested asset
- `src/assets/types.ts`

For a real-volume asset, also read `src/assets/solid-types.ts`,
`src/core/geometry3.ts`, and the `src/assets/solid-character/` reference family.
Read `src/assets/solid-face/` as the reusable surface-mounted feature component.
Read `src/assets/building-identity/` and `src/assets/solid-building/` when the
asset is architectural, modular, or needs a non-character multi-representation
reference.

For three-dimensional hand-drawn rendering, also read
`docs/3d-stroke-rendering.md`, `src/assets/inked-solid/blueprint.ts`,
`src/runtime/inked-solid-pass.ts`, and `src/runtime/inked-solid-stroke-rig.ts`.
Ink policy wraps a completed solid blueprint;
it is not a replacement solid family.

For a character representation, also read
`src/assets/character-identity/recipe.ts`. Character adapters must consume that
shared identity instead of generating a second set of semantic choices.

For a vehicle or another multipart prop-like object, also read
`references/vehicle-family.md` in this skill.

Use `src/assets/plant/` as the reference for a deterministic multipart family
whose semantic layers share layout anchors without requiring animation.

## Classify the asset

Classify both its semantic family and its representation. Raster layers are
appropriate for hand-drawn planes; `SolidAssetBlueprint` is appropriate for
real volume. Do not choose based on whether the consumer happens to use
Three.js: both representations can coexist in a 2.5D or 3D scene.

Use `src/assets/prop/definition.ts` only when the asset is a single static
silhouette with fixed geometry and no independently moving or stateful parts.

Create `src/assets/<family>/` when the asset has multiple semantic parts,
animation, interaction states, family-specific layout, or state-dependent
gameplay. Prefer a dedicated family for vehicles, doors, machinery, and
containers that open.

State the classification and the concrete reason before implementation.

## Model identity before representation

When an asset family has or plausibly needs more than one representation,
create `src/assets/<family>-identity/` before authoring adapters. Identity owns
all deterministic semantic and spatial choices that must survive projection:
archetype, proportions, part inventory, palette roles, topology, attachment,
interaction intent, and normalized feature placement.

Each representation recipe references that exact immutable identity and adds
only representation policy:

- raster: medium, tone, line pressure, bake policy;
- solid: finish, mesh density, physical material policy;
- inked solid: contour, spatial semantic stroke, and material-role
  view-synthesized mark policy.

If a seeded tonal choice must remain recognisable across representations,
derive it once in an identity-adjacent drawing-style profile and place the
resolved intent on `SolidMaterialSpec.drawing.tone`. Do not bury it in the
raster recipe and ask the inked-solid compiler to guess it from colour or part
names.

Do not put a drawing medium in shared identity. Do not rerun an identity factory
inside an adapter. A seed shared by two independent generators is not shared
identity; it is two implementations hoping never to drift.

Use domain vocabulary for archetypes. Characters may have a biological or
fictional `species`; buildings have an `archetype` such as cottage, townhouse,
apartment, or high-rise. Reuse the architectural pattern, not the biological
word.

## Preserve spatial topology

A front silhouette is insufficient whenever a feature has meaningful volume.
Classify each such feature before selecting geometry:

- `surface`: follows a host surface, such as an eyelid, seam, or painted mark;
- `front-extrusion`: intentionally camera-facing or plate-like; never use it as a fallback for hair, hats, roofs, wheels, or another part that visibly occupies depth;
- `head-shell` / surface shell: follows a host surface with authored coverage, lower boundary, clearance, thickness, and relief;
- `surface-cluster`: a localized set of true volumes anchored to a host surface; use it for tufts, thorns, knobs, or other details that must not become a clipped partial shell;
- `wrap`: surrounds or follows a host circumference, such as a crown, collar,
  gutter, bracelet, or pipe;
- `volume`: occupies independent three-dimensional space;
- `articulated`: owns a pivot or node and changes transform by state.

Store that intent in the identity-derived profile or layout. Raster adapters
may collapse it to a 2D outline, but solid adapters must not reconstruct it from
that outline. Use stable surface coordinates, sockets, or normalized host radii
instead of adapter-local world-space guesses.

## Add a static prop

1. Add the literal to `PropKind` in `src/assets/prop/definition.ts`.
2. Implement one focused draw function using `Sketch` and the selected `Medium`.
3. Add one `PropDefinition` entry with base size, draw callback, colliders, and sockets.
4. Keep semantic random choices in `createPropRecipe`; the draw callback only renders recipe data.
5. Export no new internal draw helpers.
6. Register the public kind in the playground document and catalog.
7. Add recipe determinism and blueprint geometry tests.

## Add a dedicated family

Create one concept per file where the family needs it:

- `recipe.ts`: immutable serializable identity and namespaced random streams,
  or representation-only policy when a shared family identity already exists.
- `layout.ts`: one derivation for part dimensions, bounds, sockets, and collider geometry.
- `blueprint.ts`: stable named layers, joints, pivots, states, draw callbacks, colliders, sockets, and interactions.
- `authoring.ts`: public semantic parameter metadata, defaults, choices, and
  focused raster preview layer IDs when a generic editor must customize the family.
- an animator under `src/runtime/` only for transient motion that is not authored recipe data.

Export the family through `src/index.ts`. Make experiments depend on that public
barrel only.

An authoring schema describes safe identity inputs; it does not reflect over a
generated blueprint. Use `AssetFamilyAuthoringSchema` and validate it at module
load. Keep the factory adapter explicit because only the family knows how a
parameter maps to recipe invariants. Generic editor shells may render the schema,
defaults, and previews without branching on `character`, `building`, or future
family IDs.

## Preserve invariants

- Use a separate seed namespace for every semantic feature.
- Persist generated feature values in the recipe.
- Generate shared character semantics once in `CharacterIdentityRecipe`.
- Keep raster, smooth-solid, voxel, and future adapters free of semantic rerolls.
- Preserve feature topology and attachment across adapters; projection may lose
  visible dimensions, identity must not lose their meaning.
- Share normalized intent across representations, not pixel or surface coordinates.
- Treat facial decoration as shared semantic data. Eyelids, eye bags, wrinkles,
  scars, and cheek marks belong to an identity-derived eye or face profile and
  are emitted only by the styles that own them. Never add an unconditional
  raster-only or solid-only face stroke, and never use adapter-local surface
  coordinates as its source of truth.
- Derive drawing and gameplay geometry from the same layout.
- Keep independently stateful parts in independent layers.
- Place pivots at physical joints.
- Keep local layer order within the asset; use runtime draw ranks globally.
- Expose gameplay through colliders, sockets, and `InteractionDefinition`, never texture inspection.
- Validate every interaction state, sensor, socket, layer, and layer-state binding.
- Dispose runtime GPU resources through `SpriteRig.dispose()`.
- Keep smooth-solid geometry and material specifications serialisable and free
  of Three.js objects; resolve them through `SolidRig`.
- Derive 3D feature placement from the same analytic or modelled surface used
  to build the mesh. Use stable semantic part IDs and real node pivots.
- Dispose solid GPU resources through `SolidRig.dispose()`.
- Wrap the exact solid blueprint with `createInkedSolidBlueprint`; never copy,
  reroll, or specialize its semantic geometry for the inked projection.
- Pass an explicit shared `MediumId` to `createInkedSolidBlueprint`. Raster and
  inked-solid previews of one asset must use the same medium. Never invent a
  second 3D-only drawing-medium taxonomy.
- Keep contours and generic medium marks camera-dependent. Synthesize medium
  marks in view-oriented drawing space, translate the field with the projected
  origin of its visible semantic part, and clip it by semantic material masks.
  Camera movement must update projection continuously without random seed or
  colour changes at quantized thresholds.
- Use the visible surface normal to rotate and foreshorten directional gesture
  fields on explicitly faceted carrier topology and, only there, to vary mark
  density under the discrete drawing light. Adjacent planes sharing a material must not
  receive one uniform screen-space hatch. Keep camera response continuous;
  never classify camera-facing planes into arbitrary style buckets that can
  flicker during rotation. Derive smooth-versus-faceted flow from authored
  geometry topology, not screen-space normal derivatives. Smooth meshes and
  superellipsoids retain view-oriented 2D marks with light-invariant deposited
  density: their geometry may occlude the marks, but it must not turn filler
  into a simulated shadow field.
- Preserve exact carrier geometry, colliders, sockets, and pivots. Put the
  doodle's imprecision in generic projection policy: static low-frequency
  contour wander and pressure variation, broken pickup, echoes, plus optional
  quantized line boil. Never bend family geometry merely to make its rendered
  outline look hand drawn.
- Vary pencil pickup continuously along a gesture path. Do not impose periodic
  segment masks that turn one stroke into aligned dashes or apparent kinks;
  reserve complete breaks for authored marks with semantic intent.
- Keep view-field frequency and phase invariant within one carrier region.
  On faceted carriers, drawing light may modulate pressure or opacity, or reveal
  an additional fixed-frequency pass; never rescale or rephase the field per
  pixel because quantized tone boundaries would become visible seams. On smooth
  carriers, treat medium marks as deposited filler and keep lighting out of them.
- Let the shared medium compiler project material roles into mark styles. Hair,
  cloth, facade, glass, and unknown roles may require different deposition, but
  the generic renderer must never branch on an asset family or semantic part ID.
- Treat an authored material drawing tone as higher-priority intent than the
  role fallback. Test that raster tone, solid material hint, and inked-solid
  coverage agree for representative seeds.
- Preserve semantic material RGB as the exact inked-solid pigment source.
  Describe volume through deposition opacity and mark density; never pre-mix
  pigment with paper, contour ink, scene fog, or normal-lighting colour.
- Calibrate inked-solid mark density and opacity against the shared raster
  medium's tone semantics and relative spacing. Test representative `light`,
  `hatch`, `scribble`, and `black` tones instead of tuning per-family scales.
- Project each medium from its raster deposition operation, not from generic
  tone labels alone. For example, Watercolour uses layered translucent coverage
  without directional hatch, Ink keeps one restrained hatch vocabulary while
  tone changes fill coverage, and Oil uses an opaque bed plus broken pigment
  daubs. Do not reinterpret these filler operations as shadow bands.
- Keep line boil on view-dependent contour passes. View-synthesized medium marks
  follow animated owner parts but never use boil frames; paper grain alone stays
  stationary in screen space.
- Reuse `InkedSolidPass` across asset families and dispose it explicitly.
- In Doodle 3D, the solid mesh is an invisible carrier for depth, occlusion,
  normals, semantic colour, and material masks. Never composite its continuous
  albedo. Semantic material colour may only source synthesized pigment; PBR
  roughness, metalness, clearcoat, and specular response stay absent.
- Begin every visible carrier region from opaque drawing paper, then composite
  semantic pigment bed, medium gestures, and contour in that order. Do not use
  transparent-clear RGB as the paper base, and keep carrier alpha opaque even
  when a material intentionally has zero gesture coverage.
- Model expressive and decorative features with semantic subparts and ratios in
  shared identity/profile data. Eyes, hairlines, outfit motifs, and mouths are
  one normalized construction projected by raster and solid adapters, not two
  unrelated drawings. Never reroll a shared proportion in an adapter.
- Keep expression intent in a representation-neutral profile. Name asymmetric
  values by visible face semantics: positive brow `innerRaise` raises both ends
  nearest the nose, regardless of local axis signs. Raster and solid adapters
  translate that intent; they must not own separate expression tables. Keep
  brows clear of pupil geometry and express upper-eye pressure through shared
  eye openness or an authored eyelid rather than mesh intersection.
- Treat `SolidFinishId` and `MediumId` as orthogonal. Physical finishes such as
  skin, glass, ceramic, or metal affect only smooth solid rendering. Add new
  medium behaviour centrally in `src/materials/medium.ts` and
  `src/assets/inked-solid/medium-projection.ts`; extend the generic
  `InkedSolidPass` field only when necessary, never a family adapter.
- Author semantic marks in the family adapter. Use superellipsoid surface
  directions for analytic hosts and part-local points for boxes, profiles,
  meshes, or paths that leave a surface. Always name and validate the owner
  part. These spatial strokes are not a replacement for camera-conditioned
  medium deposition.
- Resolve semantic marks through `InkedSolidStrokeRig`; parent them to the
  owner mesh and dispose the stroke rig before `SolidRig`.
- Put the complete attachment rule for secondary effects such as tears, drips,
  sparks, smoke, or labels in the shared semantic profile. Store normalized
  clearance there, then let every adapter account for its projected effect
  extent so the visible tip or edge attaches to the intended feature; never
  align only the effect centre with adapter-local literals.
- Share temporal pose blending across raster and solid runtimes. A pose switch
  must traverse the same normalized weights and transition duration in every
  projection. When a planar gesture crosses a volumetric silhouette, articulate
  the solid part around its real joint and move it in front of the carrier
  volume instead of allowing mesh penetration.
- Do not add compatibility shims before a serialized recipe format has actually been released.
- While the package remains greenfield and unpublished, update all call sites
  and delete obsolete contracts instead of adding legacy aliases or migrations.

## Integrate the consumer

Update the playground catalog and its serializable document only when the user
needs to author the new parameter. Inspector controls must change the recipe,
not mutate baked textures. Provide state previews for interactive layers.

## Verify

Add tests that prove:

- identical seeds and options produce equal recipes;
- representations created from one identity preserve the same semantic values;
- wrapped and volumetric features occupy the expected axes instead of collapsing
  into front plates;
- feature namespaces do not affect unrelated parameters;
- expected layers and pivots exist;
- bounds, colliders, and sockets agree with layout;
- interaction and animation states apply to the intended parts;
- other families remain unchanged.
- one inked-solid policy works on at least one organic and one architectural
  solid family without family-specific renderer branches.
- physical finish changes smooth rendering without changing doodle deposition or
  semantic stroke data.
- every public `MediumId` compiles to a deterministic raster and inked-solid
  policy with the same ID and a visibly distinct view-synthesized character.

Run `pnpm verify`. Then inspect representative seeds in the in-app browser at
every viewport class the experiment claims to support. For the current
desktop-only playground and labs, desktop QA is sufficient. Report the chosen
classification, public API changes, tests, and any remaining consumer work.
