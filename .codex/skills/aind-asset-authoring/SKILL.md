---
name: aind-asset-authoring
description: Design, implement, or revise procedural asset types in aind-drawn, including deterministic identity, art direction, semantic surfaces, raster and solid projections, Doodle 3D, spatial topology, interactions, animation, performance, catalog integration, and authoring tests.
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
- experiment/editor registration: [references/playground-integration.md](references/playground-integration.md);
- vehicles and comparable articulated machinery: [references/vehicle-family.md](references/vehicle-family.md).

Do not force every family through every representation. A decal may remain
raster-only; an arbitrary-view machine may begin solid-only; a family expected
to span projections must begin with representation-neutral identity.

## Read the local contracts

Before editing, read:

- `docs/architecture.md`
- `docs/asset-authoring.md`
- `docs/art-direction-and-surfaces.md`
- the existing family closest to the requested asset
- `src/contracts/raster-asset.ts`

For a real-volume asset, also read `src/contracts/solid-asset.ts`,
`src/core/geometry3.ts`, and the `src/assets/character/solid/` reference family.
Read `src/assets/character/solid/face/` as the reusable surface-mounted feature component.
Read `src/assets/building/identity/` and `src/assets/building/solid/` when the
asset is architectural, modular, or needs a non-character multi-representation
reference.

For three-dimensional hand-drawn rendering, also read
`docs/3d-stroke-rendering.md`, `src/projections/inked-solid/blueprint.ts`,
`src/projections/inked-solid/runtime/pass.ts`, and `src/projections/inked-solid/runtime/stroke-rig.ts`.
Ink policy wraps a completed solid blueprint;
it is not a replacement solid family.

For a character representation, also read
`src/assets/character/identity/recipe.ts`. Character adapters must consume that
shared identity instead of generating a second set of semantic choices.

For a vehicle or another multipart prop-like object, also read
`references/vehicle-family.md` in this skill.


## Classify the asset

Classify both its semantic family and its representation. Raster layers are
appropriate for hand-drawn planes; `SolidAssetBlueprint` is appropriate for
real volume. Do not choose based on whether the consumer happens to use
Three.js: both representations can coexist in a 2.5D or 3D scene.

Do not create a catch-all prop registry or a placeholder family without an
active consumer. A supported static silhouette may begin as a focused
raster-only family; add representation and runtime folders only when its domain
requires them.

Create `src/assets/<family>/` when the asset has multiple semantic parts,
animation, interaction states, family-specific layout, or state-dependent
gameplay. Prefer a dedicated family for vehicles, doors, machinery, and
containers that open.

State the classification and the concrete reason before implementation.

## Model identity before representation

When an asset family has or plausibly needs more than one representation,
create `src/assets/<family>/identity/` before authoring adapters. Identity owns
all deterministic semantic and spatial choices that must survive projection:
archetype, proportions, part inventory, palette roles, topology, attachment,
interaction intent, and normalized feature placement.

Each representation recipe references that exact immutable identity and adds
only representation policy:

- raster recipe: `MediumId`, art direction, line pressure, and bake policy;
- raster runtime: an optional renderer-scoped `RasterHand`, never global state;
- solid: art direction, physical substrate and finish, plus mesh-density policy;
- inked solid: `MediumId`, contour, spatial semantic strokes, and
  view-synthesized drawing-application policy.

If a seeded value or gesture choice must remain recognisable across representations,
derive it once in an identity-adjacent drawing-style profile and place the
resolved intent on `SemanticSurfaceSpec.drawing.drawing`. Every semantic surface
also declares a generic `drawing.application`; never infer either field from
colour, surface ID, path geometry, or part name. Each family binds generic
`ArtRole` values explicitly to `semanticPartId`. Do not bury drawing intent in
the raster recipe and ask another projection to guess it.

Do not put a drawing medium, raster hand, art direction, or physical treatment
in shared identity. Do not rerun an identity factory
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

A canonical elevation does not define the missing depth axis. When width changes over height or
length, author a representation-neutral cross-section and make every solid surface and mounted
feature consume it; never extrude the silhouette at one arbitrary constant depth.

Give each visible carrier surface one owner. Do not stack coplanar semantic parts to fake a border
or covering skin; omit the covered host face or model real physical clearance so the depth buffer
cannot alternate between them. Author hard-surface mesh bands with explicit non-degenerate
triangles or quads. Avoid concave or collinear n-gons whose fan triangulation can create zero-area
triangles, and validate the actual runtime rig for representative seeds and every authoring
override.

Normalize procedural profiles before tessellation. Collapse consecutive points and section levels
whose separation falls below a scale-aware minimum edge length; an outline that looks valid in
elevation can otherwise create zero-area side faces once given physical thickness.


## Add a dedicated family

Create one concept per file where the family needs it:

- `recipe.ts`: immutable serializable identity and namespaced random streams,
  or representation-only policy when a shared family identity already exists.
- `layout.ts`: one derivation for part dimensions, bounds, sockets, and collider geometry.
- `blueprint.ts`: stable named layers, semantic part ownership, joints, pivots,
  states, draw callbacks, colliders, sockets, and representation bindings.
- `authoring.ts`: public semantic parameter metadata, defaults, choices, and
  focused raster preview layer IDs when a generic editor must customize the family.
- a family-specific animator under `src/assets/<family>/runtime/` only for
  transient motion that is not authored recipe data. Keep family-agnostic rigs
  and renderer infrastructure under `src/runtime/`.

Family-only metadata travels through namespaced `AssetCapability` entries.
Define the capability ID, payload type, constructor, and reader beside the
family. Generic layer, solid-part, rig, and renderer contracts carry capability
data without importing or switching on it. Do not grow shared `motion` or
`animation` unions whenever a family needs a new behaviour.

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
- For families with a canonical elevation, let one identity-adjacent geometry
  profile own exact local-space roof, aperture, opening, and attachment shapes;
  adapters apply coordinate transforms and medium wobble, not new proportions.
- Author Doodle semantic strokes only for marks owned by a real part or profile.
  Never invent facade seams, scratches, insets, or duplicate contours in an
  inked-solid adapter merely to make an otherwise sparse projection look drawn.
- Treat facial decoration as shared semantic data. Eyelids, eye bags, wrinkles,
  scars, and cheek marks belong to an identity-derived eye or face profile and
  are emitted only by the styles that own them. Never add an unconditional
  raster-only or solid-only face stroke, and never use adapter-local surface
  coordinates as its source of truth.
- Derive drawing and gameplay geometry from the same layout.
- Keep independently stateful parts in independent layers.
- Place pivots at physical joints.
- Keep local layer order within the asset; use runtime draw ranks globally.
- Expose gameplay through the shared `AssetSemanticManifest`, attached colliders
  and sockets, and representation-specific interaction bindings; never inspect textures.
- Validate every interaction state, sensor, socket, layer, and layer-state binding.
- Dispose runtime GPU resources through `SpriteRig.dispose()`.
- Keep smooth-solid geometry and `SemanticSurfaceSpec` values serialisable and
  free of Three.js objects. Resolve physical resources through a scene-scoped
  `SolidSurfaceResourceCache`, and pass that cache to `SolidRig` when instances
  should share immutable materials and procedural textures.
- Derive 3D feature placement from the same analytic or modelled surface used
  to build the mesh. Use stable semantic part IDs and real node pivots.
- Dispose each `SolidRig`, then dispose its scene cache after the final consumer.
- Wrap the exact solid blueprint with `createInkedSolidBlueprint`; never copy,
  reroll, or specialize its semantic geometry for the inked projection.
- Pass an explicit shared `MediumId` to `createInkedSolidBlueprint`. Raster and
  inked-solid previews of one asset must use the same medium. Never invent a
  second 3D-only drawing-medium taxonomy.
- Keep contours and generic medium marks camera-dependent. Synthesize medium
  marks in view-oriented drawing space, translate the field with the projected
  origin of its visible semantic part, and clip it by semantic surface masks.
  Camera movement must update projection continuously without random seed or
  colour changes at quantized thresholds.
- Use the visible surface normal to rotate and foreshorten directional gesture
  fields on explicitly faceted carrier topology and, only there, to vary mark
  density under the discrete drawing light. Adjacent planes sharing a surface must not
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
  pixel because quantized drawing-value boundaries would become visible seams. On smooth
  carriers, treat medium marks as deposited filler and keep lighting out of them.
- Let the shared medium compiler project generic drawing applications into mark
  styles. Families map their own semantics to `paper`, `pigment`, `tint`,
  `flat`, `ink`, `wash`, or `glaze`; the compiler never receives family,
  surface-role, surface-ID, or family-specific semantic-part vocabulary.
- Require an authored drawing application plus `DrawingIntent` on every semantic
  surface. Test that raster drawing intent, the solid surface, and inked-solid
  coverage agree for representative seeds.
- Preserve semantic surface RGB as the exact inked-solid pigment source.
  Describe volume through deposition opacity and mark density; never pre-mix
  pigment with paper, contour ink, scene fog, or normal-lighting colour.
- Calibrate inked-solid mark density and opacity against the shared raster
  medium's drawing-value and gesture semantics plus relative spacing. Test
  representative `paper`, `light`, `mid`, `dark`, and `solid` values with
  `quiet`, `regular`, `agitated`, and `granular` gestures.
- Project each medium from its raster deposition operation, not from generic
  value labels alone. For example, Watercolour uses layered translucent coverage
  without directional hatch, Ink keeps one restrained hatch vocabulary while
  drawing value changes fill coverage, and Oil uses an opaque bed plus broken pigment
  daubs. Do not reinterpret these filler operations as shadow bands.
- Keep line boil on view-dependent contour passes. View-synthesized medium marks
  follow animated owner parts but never use boil frames; paper grain alone stays
  stationary in screen space.
- Reuse one `InkedSolidScenePass` across asset families, register each exact
  instance/blueprint/rig triple, dispose registrations before their solid rigs,
  and dispose the scene pass explicitly. A registration owns its semantic
  `InkedSolidStrokeRig`; ordinary consumers do not construct a second one.
- In Doodle 3D, the solid mesh is an invisible carrier for depth, occlusion,
  normals, semantic colour, and surface masks. Never composite its continuous
  albedo. Semantic surface colour may only source synthesized pigment; PBR
  roughness, metalness, clearcoat, and specular response stay absent.
- Begin every visible carrier region from opaque drawing paper, then composite
  semantic pigment bed, medium gestures, and contour in that order. Do not use
  transparent-clear RGB as the paper base, and keep carrier alpha opaque even
  when a surface intentionally has zero gesture coverage.
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
- Keep identity, `MediumId`, renderer-scoped `RasterHand`, art direction,
  semantic substance, drawing application and intent, physical substrate, and
  physical finish as independent axes. `SurfaceSubstance` says what the part is
  understood to be made from; `PhysicalSurfaceTreatment` says how smooth solid
  shades it. Doodle ignores substrate, finish, roughness, metalness, and
  clearcoat. Asset families declare `SemanticSurfaceSpec`; they never
  instantiate Three.js materials or own physical textures. Add new substrate or
  finish behavior through `SolidSurfaceResourceCache`, with deterministic map
  generation, reference-counted leases, and disposal tests. Add new
  medium behaviour centrally in `src/materials/medium.ts`, add one provider
  under `src/projections/inked-solid/projection-providers/`, and register it in
  `src/projections/inked-solid/medium-projection.ts`; extend the generic
  `InkedSolidScenePass` compositor field only when necessary, never a family adapter.
- Treat `DrawingIntent.value` as perceptual value and `DrawingIntent.gesture` as
  energy/regularity, not renderer commands. Oil answers every value with loaded
  brush daubs, charcoal with granular pickup, and marker with broad translucent
  passes. Never reinterpret a generic gesture as a particular renderer primitive.
- Compile art direction through immutable `AssetAppearance`. Include the
  resolved recipe and explicit semantic-part bindings in its fingerprint. Art
  direction may alter palette response, contour, detail budget, physical
  response, paper, ground, backdrop, and lighting; it must not mutate identity,
  topology, sockets, colliders, interactions, or stable boil-frame composition.
- Author semantic marks in the family adapter. Use superellipsoid surface
  directions for analytic hosts and part-local points for boxes, profiles,
  meshes, or paths that leave a surface. Always name and validate the owner
  part. These spatial strokes are not a replacement for camera-conditioned
  medium deposition.
- Resolve semantic marks through `InkedSolidStrokeRig`; parent them to the
  owner mesh and dispose the stroke rig before `SolidRig`.
- Put the complete attachment rule and component topology for secondary effects
  such as tears, drips, sparks, smoke, or labels in the shared semantic profile.
  Store normalized clearance, component offsets, flow phase, travel, and pulse
  there when they are part of the gesture. Separate attached and free-moving
  components: a wet tear keeps its stream on the eyelid while its drop and bead
  move independently. Every adapter accounts for projected extent so the
  visible tip or edge attaches to the intended feature; never translate one
  monolithic effect or align only its centre with adapter-local literals.
- Share temporal pose blending across raster and solid runtimes. A pose switch
  must traverse the same normalized weights and transition duration in every
  projection. When a planar gesture crosses a volumetric silhouette, articulate
  the solid part around its real joint and move it in front of the carrier
  volume instead of allowing mesh penetration.
- Treat runtime state setters as idempotent commands. Reapplying the current
  expression, pose request, or interaction state every frame must not restart a
  blink, transition, one-shot effect, or random schedule.
- Do not add compatibility shims before a serialized recipe format has actually been released.
- While the package remains greenfield and unpublished, update all call sites
  and delete obsolete contracts instead of adding legacy aliases or migrations.

## Integrate the consumer

Update the active experiment catalog only when the user needs the family there.
Projection Studio families publish authoring metadata, declarative dynamic
controls, default transient state, and a runtime-motion adapter beside their
projection factory. The shell must not branch on family IDs. Inspector controls
change recipes, not baked textures; interaction controls call rig interaction
APIs and motion controls feed family animators.

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
- art direction changes all three projections while `assetId`, identity,
  manifest, geometry, sockets, colliders, interactions, and semantic topology
  remain unchanged.
- appearance fingerprints include both the normalized art-direction recipe and
  explicit semantic-part bindings; custom recipes are detached and deeply frozen.
- physical substrate or finish changes smooth rendering without changing Doodle
  deposition or semantic stroke data.
- every physical treatment resolves through `SolidSurfaceResourceCache`;
  generated maps are shared within its scene boundary and disposed exactly once.
- a second raster hand is scoped to a rig, cache, bake, or audit and never
  installed through global mutable state.
- every public `MediumId` compiles to a deterministic raster and inked-solid
  policy with the same ID and a visibly distinct view-synthesized character.

Run `pnpm verify`. Then inspect representative seeds in the in-app browser at
every viewport class the experiment claims to support. For the current
desktop-only Projection Studio, desktop QA is sufficient. Report the chosen
classification, public API changes, tests, and any remaining consumer work.
