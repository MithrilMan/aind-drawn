# Library Evolution Roadmap

Status: active

Scope: `src/`, the compiled library artifact, and library-level verification

Out of scope: Projection Studio product design, application state, application bundle size,
and experiment-specific controls

## Executive summary

AIND Drawn already has a strong architectural center. Semantic asset families own their
vocabulary; deterministic identities survive multiple representations; raster, smooth-solid,
and inked-solid output are adapters rather than independent generators; and Three.js remains
outside identity, layout, and blueprint authoring. The next step should preserve those choices,
not replace them with a more fashionable framework.

Runtime identity, minimal composition, pure family motion, and registered multi-instance Doodle
rendering are now first-class capabilities. The library can describe, validate, compare,
instantiate, deterministically sample, and render complete mixed-policy scenes, but several of
its promises are not yet first-class capabilities for a consumer:

- recurring solid topology is rebuilt by family-local mesh code;
- the root package exposes a much larger API than an ordinary consumer should need;
- export, inspection, and selective regeneration are architectural promises rather than public
  library features.

The remaining recommended direction is therefore:

1. add small reusable geometry primitives where duplication already proves the need;
2. ship persistence, export, and inspection as first-class library capabilities;
3. reduce the ordinary-consumer package surface without hiding advanced authoring APIs;
4. only then add a family that stresses a genuinely new architectural axis.

This document deliberately does not propose a monorepo, a generic game engine, a universal asset
registry, or a family-agnostic procedural geometry language. Those would add ceremony before they
add capability.

## Implementation progress

### 2026-08-23 - Initiative 1 completed

The first P0 item, unified identity, recipe, and blueprint envelopes, is implemented across the
public library. This is a greenfield replacement: obsolete headers were removed rather than
deprecated, aliased, or decoded through compatibility paths.

Completed work:

- added the public `AssetRepresentationId`, `AssetIdentityEnvelope`, `AssetRecipeEnvelope`, and
  `AssetBlueprintHeader` contracts in `src/contracts/asset-envelope.ts`;
- migrated character, building, and vehicle identities to `schemaVersion`, `family`, and `seed`;
- migrated every raster and solid recipe to the same `schemaVersion`, `family`,
  `representation`, `identity`, and `style` shape;
- removed the vehicle recipe's duplicate seed and moved raster `medium` and `side` into `style`;
- migrated raster, solid, focused-face, and inked-solid blueprints to `blueprintVersion`,
  `family`, `representation`, `assetId`, and `seed`;
- made complete raster, solid, and inked-solid projections preserve the same deterministic
  `assetId`; focused face output remains in the `character` family and uses its own focused
  content ID;
- changed runtime discrimination to explicit `family` and `representation` values and aligned
  Three.js object metadata on `assetId`;
- removed the obsolete recipe headers and the old envelope fields `version`, `kind`, and blueprint
  `id`, with no compatibility layer;
- added source-level regression coverage and compiled-artifact assertions for the canonical
  envelope and cross-representation ID parity;
- updated the architecture and asset-authoring documentation with the implemented rules.

Not included in this completed item: JSON codecs, pure blueprint validators, or runtime validation
before allocation. Those remain Initiative 2; folding them into the contract rename would make
the first change broader without making either concern clearer.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 85 tests, the compiled library
artifact, and its 138 public exports pass. The regression suite also checks that obsolete envelope
fields are absent and that complete projections retain one `assetId`.

### 2026-08-23 - Initiative 2 completed

The second P0 item establishes supported input and validation boundaries without introducing a
runtime schema dependency or pretending that TypeScript assertions validate JSON.

Completed work:

- added `AssetValidationIssue` and `AssetValidationError`, with immutable aggregated issues,
  stable paths, and stable machine-readable codes;
- added strict family-owned decoders for character, building, and vehicle identities;
- made decoders reject future versions, foreign discriminants, obsolete or unknown fields,
  malformed values, and impossible family combinations;
- made decoded identities detached and deeply immutable, without rerunning any generator;
- added `encodeAssetIdentity` as the supported detached JSON boundary for trusted identities;
- added renderer-free raster and solid blueprint validators covering envelopes, dimensions,
  geometry, hierarchy cycles, IDs, references, capabilities, sockets, colliders, materials, and
  interaction bindings;
- made `SpriteRig` and `SolidRig` validate before canvas, material, or geometry allocation;
- made both constructors release partial resources if rendering construction fails after a valid
  contract crosses the boundary;
- added malformed fixtures, representative multi-seed factory validation, decoder regressions,
  pre-allocation assertions, controlled constructor faults, and compiled-artifact codec checks.

No migrations or compatibility decoders were added. Schema version `1` is the first supported
format; unsupported versions fail explicitly.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 98 tests, the compiled library
artifact, and its 145 public exports pass. Compiled-artifact checks exercise identity encode/decode,
future-version rejection, and both blueprint validators.

### 2026-08-23 - Phase 0 closed and Initiative 4 completed

The remaining Phase 0 API guardrail and the P0 spatial attachment initiative are implemented.
This is another greenfield replacement: coordinate maps, layer-owned bone anchors, position-only
solid nodes, and absolute collider centres were removed rather than retained behind aliases.

Completed work:

- added an exact snapshot of all 145 runtime exports to compiled-artifact verification, so a barrel
  change now requires an intentional API review rather than merely changing an export count;
- added public `Pose2`, `Pose3`, quaternion, explicit raster-bone, attached socket, attached
  collider, and renderer-neutral world-transform contracts;
- made raster bones own hierarchy and rest poses; layers now reference a bone without repeating
  its parent or anchor;
- made solid nodes own complete local rest poses with unit quaternions instead of position-only
  transforms;
- replaced raster and solid socket maps with immutable definitions that name an owner and local
  pose;
- attached every collider to a raster bone or solid node and added the focused circle, capsule,
  and sphere vocabulary without introducing a physics-engine schema;
- added `SpriteRig.getSocketWorldPose`, `SpriteRig.getColliderWorldShape`,
  `SolidRig.getSocketWorldPose`, and `SolidRig.getColliderWorldShape`;
- made world queries account for hierarchy, animation, interaction transforms, root transforms,
  and mirrored facing while returning only frozen serialisable values;
- attached character hand sockets to arm joints and added solid building and vehicle door-handle
  sockets plus door-leaf colliders owned by their hinge nodes; activation sensors remain on the
  stable approach region;
- migrated character, building, vehicle, focused-face, Projection Studio preview, validators,
  compiled-artifact checks, and all call sites to the new contracts with no compatibility path;
- added regressions for animated hand sockets in both representations, root translation and
  mirroring, door socket/collider articulation, idempotent state application, obsolete spatial
  fields, unit quaternions, and serialisable query results.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 101 tests, the compiled library
artifact, its exact 145-export snapshot, and the Projection Studio production build pass.
Desktop browser QA covered character, building, and vehicle raster plus Doodle 3D output,
focused Customize previews, and the vehicle door open state in both projections.

The next recommended slice is Initiative 3, the shared semantic manifest. Spatial ownership is
now real enough to share interaction intent without merely centralising duplicate coordinates.

### 2026-08-23 - Initiative 3 completed

Cross-representation semantics now have one owner. Raster and solid blueprints no longer carry
parallel interaction definitions that merely happen to agree.

Completed work:

- added the public, family-agnostic `AssetSemanticManifest`, `SemanticPartSpec`,
  `InteractionSpec`, and spatial vocabulary contracts;
- added identity-adjacent immutable manifests for character, focused character face, building,
  and vehicle assets;
- made complete raster and solid projections from one identity reference the exact same manifest
  object;
- added required `semanticPartId` ownership to every raster layer and solid part while allowing
  representation granularity to differ;
- replaced `InteractionDefinition` and `SolidInteractionDefinition` with raster layer bindings
  and solid node bindings that reference shared interaction IDs;
- aligned complete cross-representation socket and collider inventories, including character
  crown/face/head metadata, building roof/handle/leaf metadata, and vehicle handle/passenger/leaf
  metadata;
- extended pure blueprint validation to enforce manifest structure, hierarchy, ownership,
  inventories, sensor references, and complete bindings;
- added `validateAssetSemanticManifest` and `validateAssetBlueprintParity`, with regressions that
  detect missing semantic parts, sockets, colliders, and bindings without family switches;
- migrated rigs, Projection Studio focused previews, compiled-artifact verification, tests, and
  documentation with no compatibility aliases for the removed interaction contracts.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 104 tests, compiled artifact,
exact public API snapshot, and the Projection Studio production build pass. Desktop browser QA
confirmed representative character, building, and vehicle raster and Doodle 3D projections plus
vehicle interaction controls.

The next recommended slice is Initiative 5, runtime instances and composition. The content
contract is now coherent enough that instance identity can be introduced without leaking family
or renderer state back into blueprints.

### 2026-08-23 - Initiative 5 completed

Runtime content identity and mutable scene identity now have separate owners. One immutable
blueprint can back multiple independently transformed and stateful rigs without acquiring runtime
fields or renderer policy.

Completed work:

- added the public renderer-neutral `AssetInstance`, `AssetInstanceState`, raster instance, and
  solid instance contracts with frozen serialisable world-space snapshots;
- added explicit `instanceId` options to `SpriteRig` and `SolidRig`, plus process-local generated
  IDs for transient consumers and separate `assetId`/`instanceId` renderer metadata;
- added world-pose setters that account for an existing renderer parent and preserve root scale;
- made interaction states and playback time instance-owned, with sprite playback time driving
  absolute boil-frame sampling rather than accumulating deltas;
- added the optional `AssetComposition` service for insertion, removal, complete raster draw
  order, same-dimension socket attachments, deterministic parent-before-child updates, and
  serialisable composition snapshots;
- made composition resource responsibility explicit through `owned` and `borrowed` insertion;
  removal and disposal release only owned rigs and remain idempotent;
- kept immutable blueprints directly shareable while retaining per-rig GPU ownership. Shared GPU
  caches remain intentionally deferred until measurement justifies reference-counted resources;
- added source and compiled-artifact regressions for independent state, generated IDs, world
  transforms, attachment following, deterministic update order, draw ordering, cycle rejection,
  serialisation, and exact disposal ownership;
- updated architecture, asset-authoring, and authoring-skill guidance with the new runtime rules.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 109 tests, the compiled library
artifact, its exact 158-export snapshot, and the Projection Studio production build pass. Desktop
browser QA confirmed representative character and vehicle raster and Doodle 3D projections plus
vehicle door interaction, with no page-console errors or warnings.

### 2026-08-23 - Runtime and validation decomposition completed

The focused size and responsibility review before Initiative 6 is complete. File length was used
as a diagnostic signal rather than a target: cohesive facades remain intact, while files mixing
independent change reasons were split behind their existing public APIs.

Completed work:

- replaced the 1,201-line blueprint validator implementation with a four-line public facade over
  internal shared, manifest, raster, solid, and parity modules;
- kept structured issue collection and public validation exports unchanged while separating
  renderer-free representation rules and cross-representation comparison;
- reduced `SpriteRig` from 540 to 269 lines and made it the instance/spatial-query orchestrator;
- extracted `RasterSkeleton` for bone topology and pose, `SpriteLayerRenderer` for baking,
  texture state, draw order, and GPU lifecycle, and `InteractionStateController` for idempotent
  interaction state;
- extended architecture-boundary regressions across every extracted validator and runtime module,
  so internal decomposition cannot hide family imports or renderer dependencies;
- deliberately deferred `CharacterAnimator` decomposition to Initiative 6, where mutable motion
  interpretation will be replaced by pure sampling and thin projection applicators;
- deferred `InkedSolidPass` decomposition to the multi-instance rendering initiative. Most of its
  apparent size is embedded shader source, while its scene-pass ownership changes in Initiative 7;
- left `Sketch` as a cohesive drawing facade instead of manufacturing tiny abstractions solely to
  reduce line count.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 109 tests, the compiled library
artifact, its unchanged exact 158-export snapshot, and the Projection Studio production build
pass. Desktop browser QA covered animated character bones and expression layers plus building and
vehicle door interactions across repeated rig construction, with no page-console errors or
warnings.

The next recommended slice is Initiative 6, pure deterministic motion sampling.

### 2026-08-23 - Initiative 6 completed

Character and vehicle animation are now sampled as immutable semantic data before either
projection mutates a rig. The implementation replaces the former animator hierarchy rather than
wrapping it, in keeping with the package's unpublished greenfield status.

Completed work:

- replaced `CharacterAnimator`, `SolidCharacterAnimator`, `SolidFaceAnimator`,
  `CharacterPoseBlend`, and `VehicleAnimator` with explicit state reducers, pure family samplers,
  and thin raster and solid applicators;
- added frozen serialisable `CharacterMotionState`, absolute transition anchors, normalized
  articulated part intent, shared face intent, and identity-keyed secondary-effect samples;
- made repeated character and vehicle commands return their existing state when unchanged, so
  defensive per-frame assignment cannot restart transitions or autonomic behaviour;
- replaced hidden elapsed counters and random cursors with absolute-time locomotion, breathing,
  flow, blink, and gaze sampling. Blink and gaze use namespaced seed-derived time windows that can
  be inspected directly without replaying prior frames;
- separated body pose sampling, facial schedules, flowing-effect sampling, and projection
  application into focused modules rather than moving the old animator into one large function;
- made both character projections consume the exact same `CharacterMotionSample`, including pose
  weights, semantic joint swing, planar roll, foreground-crossing intent, expression, gaze, blink,
  mouth state, and tear-component phase;
- made vehicle sampling derive one wheel angle from identity-owned radius and cumulative signed
  travel before raster or solid application. Rolling capabilities now select projection targets
  only and no longer duplicate wheel radius;
- added focused `SolidRig` node and part rest-pose resets so solid applicators remain idempotent
  without owning hidden renderer caches or disturbing unrelated interaction nodes;
- migrated Projection Studio to pass the canonical generated identity into its catalog-owned
  runtime adapters. The stages remain family-agnostic and both projections sample against the
  same absolute playback time;
- added regressions for deep sample equality and serialisation, direct seeking, intermediate and
  converged pose transitions, deterministic and disableable autonomic schedules, idempotent
  commands, repeated sample application without drift, shared vehicle kinematics, signed travel,
  and renderer-free sampler imports;
- intentionally changed the public API snapshot: five mutable animator exports were removed and
  ten explicit state, sampler, and applicator functions were added, for 163 reviewed runtime
  exports.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 116 tests, the compiled
library artifact, its exact 163-export snapshot, and the Projection Studio production build
pass. Desktop browser QA exercised character run plus crying motion and vehicle drive plus right
steering across raster and Doodle 3D projections; page-console inspection reported no errors or
warnings.

The next recommended slice is Initiative 7, multi-instance inked-solid rendering.

### 2026-08-23 - Initiative 7 completed

The inked-solid runtime is now a scene service rather than a mutable single-blueprint pass. The
old `InkedSolidPass` contract and every call site were replaced directly; no compatibility alias
or wrapper remains.

Completed work:

- added the public `InkedSolidScenePass`, registration handle, scene paper policy, diagnostics,
  and explicit `exclude` or `depth-only` unregistered-geometry occlusion policy;
- made registration validate exact blueprint/rig ownership and matching `instanceId`, while
  allowing multiple runtime instances of the same immutable blueprint and different families in
  one pass;
- moved shared policy types out of blueprint/provider construction, removing the previous
  type-only dependency cycle;
- split shader source, compositor, G-buffer targets, per-instance policy texture, carrier
  material cache, registered carrier metadata, stroke runtime, and scene lifecycle into focused
  modules;
- precomputed part, material, topology, semantic-stroke, and pass-material mappings at
  registration time; the steady-state render loop updates only existing matrices and uniforms and
  performs no scene traversal or frozen swap-record allocation proportional to mesh count;
- encoded each visible carrier's policy slot in the normal/topology buffer and stored contour,
  deposition, and medium parameters in a lookup texture, so different media and contour policies
  coexist while one immutable scene paper remains independent of registration order;
- rendered registered geometry through shared internal proxy scenes. Unregistered objects are
  excluded by default and may occlude through depth only when the scene service is constructed
  with that explicit policy;
- made registrations own their semantic stroke rig and every pass material. Registration removal
  releases all proxies, stroke geometry, and cached GPU materials without disturbing its
  `SolidRig` or another instance;
- migrated Projection Studio to dispose and replace registrations when ink policy changes and
  removed its direct ownership of `InkedSolidStrokeRig`;
- added source regressions covering two character instances sharing one blueprint, a building in
  the same pass, distinct media, ownership validation, unrelated geometry, explicit depth-only
  occlusion, renderer-state restoration, idempotent disposal, and empty post-removal caches;
- added `pnpm benchmark:inked-solid`, a 48-instance, 2,448-part, 1,728-semantic-stroke JS-side
  benchmark across all six media. The recorded baseline is 3.72 ms mean preparation time
  (269 Hz), five render calls, four G-buffer targets, and zero steady-state per-mesh allocations;
  it deliberately excludes GPU raster time rather than presenting a fake end-to-end number;
- initially added hood and cargo perimeter strokes while diagnosing the vehicle preview. The
  subsequent Initiative 8 review removed them: those boundaries and body creases belong to
  carrier topology, not to semantic ink authoring.

Verification completed with `pnpm verify`: TypeScript, ESLint, all 118 tests, the compiled
library artifact, its exact 164-export snapshot, and the Projection Studio production build pass.
Desktop browser QA exercised character, vehicle, and building Doodle projections with Graphite,
Ink, and Watercolour at front and oblique views; WebGL shader compilation and page-console
inspection reported no errors or warnings.

### 2026-08-23 - Initiative 8 vehicle hard-surface slice completed

The first Initiative 8 slice replaces the vehicle's smooth chassis proxy with actual sheet-metal
topology and makes the generic contour pass respect authored surface classification. This is not
the full geometry-primitives initiative: shared revolution and sweep specifications remain open.

Completed work:

- replaced the vehicle body superellipsoid with a focused faceted shell whose polygon planes own
  bonnet ridges, shoulders, belt lines, lower chamfers, and front/rear transitions;
- aligned the shell's open upper run with the articulated cargo lid, cabin, and hood, so closed
  panels meet real shoulder edges and opening a panel reveals authored interior geometry;
- removed the manually authored hood and cargo `panel-seam` strokes. Grille, window, tyre, and
  wheel marks remain semantic strokes because they describe actual drawn details;
- made normal-derived contour response conditional on the generic faceted-topology bit already
  encoded in the normal buffer. Lower crease thresholds can now reveal shallow designed plane
  changes without drawing curvature bands on superellipsoids or smooth meshes;
- made every triangle generated from one faceted `MeshGeometrySpec` polygon retain the polygon's
  single authored normal, preventing fan diagonals from leaking into Doodle linework;
- extracted vehicle body-shell construction into a focused module instead of adding another
  responsibility to the already substantial vehicle blueprint factory;
- added regressions for body topology, the absence of fake panel strokes, and polygon-normal
  preservation across runtime triangulation.

Verification completed with TypeScript, ESLint, and all 119 tests. Desktop browser QA covered
profile and oblique Graphite views plus an opened bonnet; hard-surface creases remain visible,
smooth tyres retain no triangulation cage, and WebGL/page-console inspection reported no errors
or warnings.

The next recommended slice is to finish Initiative 8 with the renderer-neutral revolved-profile
primitive, migrate the vehicle tyre and one existing wearable or wrap, then add sweep only where
the second proven consumer justifies it.

## Current strengths to preserve

### Semantic families are the primary ownership boundary

The physical organisation under `src/assets/<family>/` correctly makes character, building, and
vehicle concepts the top-level source of vocabulary. Identity, representation adapters, and
runtime behaviour remain close to the family that understands them.

This is preferable to either of the common alternatives:

- representation-first folders, which scatter one semantic change across the repository;
- a generic asset registry containing optional fields for every known family, which gradually
  turns the core into a union of unrelated domain concepts.

Future work should continue to add generic contracts only when at least two families need the
same behaviour and the behaviour can be named without family vocabulary.

### Identity is generated once

The shared identity model is the library's most important invariant. Representation adapters
consume one immutable recipe rather than rerolling compatible-looking values from the same seed.
Namespaced random streams also protect unrelated traits from evaluation-order changes.

Future features such as selective reroll, export, scene persistence, and collaborative editing
should operate on persisted identity values. They must not regenerate semantic decisions during
load or projection.

### Solid blueprints are renderer-neutral data

`SolidAssetBlueprint` remains serialisable and free of Three.js objects. `SolidRig` owns the
translation into geometry, materials, nodes, and GPU resources. The inked-solid projection wraps
the exact solid blueprint instead of maintaining competing geometry.

This boundary should remain intact. New geometry specifications may be added to the contract, but
asset families should never instantiate renderer objects.

### Drawing medium and physical finish are orthogonal

Raster medium policy and inked-solid deposition share semantic drawing intent, while smooth-solid
finishes remain a physical material concern. This is a durable distinction and should not be
collapsed into a single style identifier.

### Verification focuses on semantic invariants

The current tests cover deterministic generation, namespace isolation, cross-representation
parity, topology, interactions, material ownership, runtime idempotence, composition, registered
scene rendering, and resource disposal. The baseline is healthy: the current library suite passes
all 118 tests, and the compiled artifact verification enforces an exact snapshot of 164 public
exports.

The recommended work adds new kinds of verification; it does not replace these tests with visual
snapshots alone.

## Design principles for the next stage

The following principles should govern every initiative in this roadmap.

### Persist resolved identity, not generator implementation

A saved document stores generated semantic values. A seed remains useful provenance and an input
for controlled variation, but loading must not depend on the current generator producing the same
object shape or distribution.

### Separate schema version from representation and family

Versioning answers whether data can be decoded. Family answers which domain owns the vocabulary.
Representation answers how the identity is projected. A single `kind` string should not encode all
three facts.

### Validate before allocating runtime resources

Contract validation belongs to pure code. Rigs may assert internal assumptions, but they should
not be the first place where duplicate IDs, invalid hierarchies, missing materials, bad geometry,
or broken interaction bindings are discovered.

### Attach spatial semantics to owners

A socket, collider, effect source, semantic stroke, or interaction binding that moves with a part
must explicitly name that part's bone or node and store a local pose. Static world coordinates are
not an attachment model.

### Keep runtime state distinct from deterministic identity

An identity determines what an asset is. An instance determines where it is, its current pose,
interaction states, playback time, and transient effects. Two instances may share one blueprint
while owning different runtime state.

### Prefer family-owned motion intent over a generic animation framework

Characters and vehicles do not need the same vocabulary. They do need the same architectural
shape: pure sampling of deterministic semantic motion followed by thin representation-specific
application.

### Optimise measured hot paths, not diagrams

The inked-solid renderer has obvious avoidable per-frame work. Remove repeated lookup and
allocation first, add benchmarks, and only then consider multipass consolidation or multiple
render targets.

## Priority map

| Priority | Initiative | Status | Primary outcome | Main prerequisite |
| --- | --- | --- | --- | --- |
| P0 | Unified recipe and blueprint envelopes | Completed | Coherent public data model | None |
| P0 | Codecs and pure validators | Completed | Safe persistence and fail-fast runtimes | Unified envelopes |
| P0 | Attached sockets and colliders | Completed | Real equipment, portals, and physics integration | Contract cleanup |
| P1 | Shared semantic manifest | Completed | Guaranteed cross-representation state parity | Unified envelopes |
| P1 | Runtime instance identity | Completed | Multiple independent instances of one asset | Contract cleanup |
| P1 | Pure motion samplers | Completed | Seekable, exportable, deterministic motion | Runtime instance model |
| P1 | Multi-instance inked-solid rendering | Completed | Doodle rendering for complete scenes | Runtime instance identity |
| P1 | Export adapters | Planned | Useful assets outside the runtime | Codecs and spatial semantics |
| P2 | Focused solid geometry primitives | In progress | Less duplicated topology and better LOD | Geometry validation |
| P2 | Semantic inspection and parity reports | Planned | Better authoring and integration tooling | Shared semantic manifest |
| P2 | Selective reroll and locks | Planned | Controlled procedural iteration | Stable identity codecs |
| P3 | New stress-test family | Planned | Validate branching, repetition, wind, and LOD | Earlier foundations |

## Initiative 1: unified recipe and blueprint envelopes - completed 2026-08-23

### Problem

Recipe shapes currently encode equivalent concepts differently:

- raster character uses `kind: 'character'` and `representation: 'raster'`;
- raster and solid building recipes encode representation in `kind`;
- vehicle recipes duplicate `seed` and `medium` at different levels and do not expose a uniform
  representation discriminant;
- raster blueprints do not expose the `representation` field present on solid blueprints;
- `RecipeHeader` and `SolidRecipeHeader` exist but are not the actual base of family recipes;
- solid blueprint `kind` values include the word `solid`, while raster blueprint `kind` values
  generally name the semantic family.

This does not prevent the current factories from working, but it makes generic persistence,
inspection, export, and composition unnecessarily dependent on family-specific casts.

### Proposed contract

Use an explicit envelope with stable meanings:

```ts
export type AssetRepresentationId = 'raster' | 'solid' | 'inked-solid';

export type AssetRecipeEnvelope<
  TFamily extends string,
  TRepresentation extends Exclude<AssetRepresentationId, 'inked-solid'>,
  TIdentity,
  TStyle,
> = Readonly<{
  schemaVersion: 1;
  family: TFamily;
  representation: TRepresentation;
  identity: TIdentity;
  style: TStyle;
}>;
```

Identity recipes should use the same naming discipline:

```ts
export type AssetIdentityEnvelope<TFamily extends string> = Readonly<{
  schemaVersion: 1;
  family: TFamily;
  seed: number;
}>;
```

Blueprints should share an equally explicit header:

```ts
export type AssetBlueprintHeader<
  TFamily extends string,
  TRepresentation extends AssetRepresentationId,
> = Readonly<{
  blueprintVersion: 1;
  family: TFamily;
  representation: TRepresentation;
  assetId: string;
  seed: number;
}>;
```

`assetId` identifies deterministic authored content. It must not double as the identity of a
runtime instance. Runtime instance identity is introduced separately below.

Family IDs deliberately remain family-owned string literals rather than members of a closed union
in a generic contract. Adding a plant must not require editing a central list merely to make the
core compile. Applications may define a closed union for the families they register; the library
extension boundary remains open.

### Version semantics

Use versions for data compatibility, not generator marketing:

- `schemaVersion` changes when persisted identity or recipe structure requires a decoder change;
- `blueprintVersion` changes when a serialised solid blueprint changes incompatibly;
- generator algorithm changes do not require a schema bump when saved recipes already contain all
  resolved values;
- a change that would alter newly generated results may be documented as generator provenance, but
  loading existing resolved recipes must not rerun that generator.

Do not add migrations until a released format exists. The immediate task is to establish the
first coherent format and update every internal call site while the package remains greenfield.

### Migration steps

- [x] Introduce open family literals and a representation ID type in a shared contract module.
- [x] Replace unused recipe headers with one actual generic envelope.
- [x] Normalise identity, raster recipe, solid recipe, raster blueprint, and solid blueprint headers.
- [x] Update animators and consumers to discriminate on `representation`, never on property
  presence or representation-encoded `kind` strings.
- [x] Remove obsolete fields and aliases rather than preserving compatibility shims.
- [x] Add compiled-artifact assertions for the new envelope.

### Acceptance criteria

- [x] Every identity exposes `schemaVersion`, `family`, and `seed`.
- [x] Every representation recipe exposes `schemaVersion`, `family`, `representation`, `identity`,
  and `style` in the same locations.
- [x] Every blueprint exposes a representation discriminant.
- [x] Semantic family names are identical across representations.
- [x] No runtime uses `'representation' in blueprint` or parses representation from `kind`.
- [x] JSON round trips preserve every recipe and serialisable blueprint.

## Initiative 2: codecs and pure contract validation - completed 2026-08-23

### Problem

TypeScript types describe trusted in-process values. They do not validate data loaded from JSON,
received over a network, restored from storage, or supplied by a third-party asset author.

The current library proves JSON compatibility with serialisation round trips but does not expose a
supported decoding path. Blueprint validation is also distributed across runtime constructors.
Some invalid references are therefore discovered after material, texture, or geometry allocation
has begun.

### Proposed codec API

Prefer small explicit family codecs over reflection or a large runtime schema dependency:

```ts
export type AssetValidationIssue = Readonly<{
  path: readonly (string | number)[];
  code: string;
  message: string;
}>;

export class AssetValidationError extends TypeError {
  public readonly issues: readonly AssetValidationIssue[];
}

export function decodeCharacterIdentity(input: unknown): CharacterIdentityRecipe;
export function decodeBuildingIdentity(input: unknown): BuildingIdentityRecipe;
export function decodeVehicleIdentity(input: unknown): VehicleIdentityRecipe;
```

The decoder should:

- reject unknown schema versions;
- validate discriminants before reading family fields;
- validate finite numeric values and documented ranges;
- validate tuple lengths, colours, normalized directions, and non-empty identifiers;
- reject impossible combinations that factories normally prevent;
- return a deeply immutable value owned by the library;
- report all useful issues in one error when practical rather than stopping at the first leaf.

An encoder may initially be a named wrapper around JSON-compatible data. Its value is a supported
boundary and a future location for canonical ordering or format metadata:

```ts
export function encodeAssetIdentity(identity: AssetIdentityRecipe): JsonValue;
```

### Pure blueprint validators

Add renderer-free validation functions:

```ts
export function validateRasterAssetBlueprint(
  blueprint: AssetBlueprint,
): AssetBlueprint;

export function validateSolidAssetBlueprint(
  blueprint: SolidAssetBlueprint,
): SolidAssetBlueprint;
```

Raster validation should include:

- unique layer, bone, collider, socket, and interaction IDs;
- acyclic and complete bone ownership;
- positive finite canvas and world dimensions;
- finite positions, depth, pivots, and bounds;
- at least one state for every layer;
- interaction states that bind to valid layer states;
- sensor and activation socket references;
- unique capability IDs per owner.

Solid validation should include:

- unique node, part, material, collider, socket, and interaction IDs;
- acyclic and complete node ownership;
- valid geometry dimensions and finite vertices;
- valid mesh faces, non-degenerate triangles where required, and indices in range;
- material references for every part;
- interaction bindings for every state;
- valid surface anchors and normalized directions;
- unique capability IDs per owner.

Rigs should validate before allocating resources. Factories may call validators in development and
tests; public runtime constructors should always protect their own boundary.

### Failure atomicity

If construction still fails after validation because a renderer allocation fails, the constructor
must dispose everything it already owns before rethrowing. Add focused tests using factories that
fail after a controlled number of allocations.

### Acceptance criteria

- [x] Unknown JSON cannot enter the domain through a type assertion in supported APIs.
- [x] Invalid blueprints fail before GPU or canvas allocation.
- [x] Decoder errors contain stable paths and codes suitable for tools.
- [x] Every factory output passes the matching validator over representative and property-generated
  seeds.
- [x] Constructor fault tests prove partial resources are released.

## Initiative 3: a shared semantic manifest - completed 2026-08-23

### Problem

The same interaction intent is currently restated in raster and solid forms. A building door, for
example, has the same semantic states, sensor intent, activation socket, and portal meaning, but
each blueprint separately carries the complete state definition plus representation bindings.

Tests catch known parity cases, but the contract does not make drift impossible.

### Proposed split

Separate semantic state from projection bindings:

```ts
export type InteractionSpec = Readonly<{
  id: string;
  kind: 'toggle' | 'portal';
  initialState: string;
  states: readonly string[];
  sensorId: string;
  activationSocketId: string;
}>;

export type SemanticPartSpec = Readonly<{
  id: string;
  parentId?: string;
  spatial: 'surface' | 'front-extrusion' | 'shell' | 'cluster' | 'wrap' | 'volume' | 'articulated';
}>;

export type AssetSemanticManifest<TFamily extends string = string> = Readonly<{
  family: TFamily;
  parts: readonly SemanticPartSpec[];
  socketIds: readonly string[];
  colliderIds: readonly string[];
  interactions: readonly InteractionSpec[];
}>;
```

Raster and solid blueprints then add only representation-specific bindings:

```ts
export type RasterInteractionBinding = Readonly<{
  interactionId: string;
  layers: readonly InteractionLayerBinding[];
}>;

export type SolidInteractionBinding = Readonly<{
  interactionId: string;
  nodes: readonly SolidInteractionNodeBinding[];
}>;
```

The manifest may be generated by a family layout or identity-adjacent semantic factory. It should
not become a registry that knows character, building, or vehicle fields.

Semantic parts are not required to have a one-to-one relationship with concrete layers or meshes.
One raster hair layer and several solid hair volumes may all bind to the same `hair` semantic part.
Conversely, a semantic construction may be intentionally invisible in one projection while still
remaining present in the manifest. Concrete layer and solid-part definitions should therefore
publish `semanticPartId`; parity compares ownership and intent, not accidental renderer granularity.

### Benefits

- state names and interaction kinds cannot diverge between projections;
- exporters receive one semantic description independent of renderer data;
- composition and inspection tools can operate without switching on family;
- runtime interaction controllers can share state transitions while applying different bindings;
- tests can compare complete semantic contracts generically.

### Acceptance criteria

- [x] Raster and solid blueprints from one identity reference the same semantic interaction specs.
- [x] Representation adapters contain bindings, not duplicate interaction definitions.
- [x] A generic parity validator detects missing parts, sockets, colliders, or bindings.
- [x] No generic contract imports family vocabulary.

## Initiative 4: articulated sockets, colliders, and runtime spatial queries - completed 2026-08-23

### Problem

Current socket maps contain positions only. They do not identify an owner bone or node and do not
include orientation. Colliders are similarly authored in asset coordinates with no explicit
attachment to articulated parts.

This is sufficient for static entry points and initial layout tests, but insufficient for:

- attaching an item to a moving hand;
- placing a driver in an animated seat or door opening;
- mounting effects on wheels, exhausts, faces, or machinery;
- querying a portal after its parent asset moves;
- synchronising physics shapes with animated or interactive nodes;
- exporting meaningful attachment transforms.

### Proposed spatial contracts

Use serialisable local poses:

```ts
export type Pose2 = Readonly<{
  position: Vector2;
  rotation: number;
}>;

export type Quaternion = readonly [x: number, y: number, z: number, w: number];

export type Pose3 = Readonly<{
  position: Point3;
  rotation: Quaternion;
}>;
```

Use quaternions for public 3D socket orientation. They avoid leaking an Euler order into every
consumer and remain renderer-neutral data.

Representation blueprints attach sockets to local owners:

```ts
export type RasterSocketDefinition = Readonly<{
  id: string;
  bone: string;
  localPose: Pose2;
}>;

export type SolidSocketDefinition = Readonly<{
  id: string;
  node: string;
  localPose: Pose3;
}>;
```

Raster bones should become explicit blueprint definitions instead of being inferred from repeated
layer fields. A `RasterBoneDefinition` owns its parent and local rest pose; layers, sockets, and
colliders reference its ID. This removes the current need to detect conflicting bone anchors across
layers and permits a semantic attachment bone to exist without inventing an invisible layer.

Solid nodes should similarly own a complete serialisable rest pose rather than position alone.
Scale may default to one, but rest orientation belongs to the node when it defines the physical
joint. Parts then add only geometry placement relative to that node.

Collider definitions should use the same ownership model. Static colliders attach to the root;
door leaves, wheels, limbs, and other moving collision shapes attach to their physical node.

The initial shape vocabulary should remain small but become useful:

- raster: rectangle, circle, capsule, polygon;
- solid: box, sphere, capsule, convex hull where a real consumer proves the need.

Do not add a complete physics shape language. The goal is portable semantic collision data, not a
physics engine.

### Runtime API

Rigs should resolve world-space values without exposing Three.js objects as the only option:

```ts
spriteRig.getSocketWorldPose(id): Pose2 | null;
solidRig.getSocketWorldPose(id): Pose3 | null;
spriteRig.getColliderWorldShape(id): ColliderShape2 | null;
solidRig.getColliderWorldShape(id): ColliderShape3 | null;
```

Optional low-level access to a bone or node may remain available, but ordinary consumers should
not need to reconstruct hierarchy transforms.

### State and interaction behaviour

An interaction state may alter a node transform. Attached sockets and colliders should follow that
node automatically. If a state changes collider presence or shape rather than transform, model
that as an explicit state binding; never infer it from layer visibility or material alpha.

### Acceptance criteria

- A hand socket follows character animation in raster and solid runtimes.
- Vehicle door sockets and colliders follow their hinge nodes.
- Applying the same interaction state twice is idempotent.
- World-pose queries return pure serialisable values.
- Exported attachments preserve owner IDs and local poses.
- Root transforms and mirrored facing are reflected correctly.

## Initiative 5: runtime instances and composition

### Problem

Blueprint IDs currently identify deterministic generated content and are also written into runtime
object metadata. Two instances of the same blueprint therefore share the same asset ID even when
they need different transforms, interaction states, media policy, or animation time.

A blueprint is reusable authored data. An instance is mutable runtime state. They require separate
identity.

### Proposed instance model

```ts
export type AssetInstanceId = string;

export type AssetInstanceState<TPose extends Pose2 | Pose3> = Readonly<{
  id: AssetInstanceId;
  assetId: string;
  transform: TPose;
  interactionStates: Readonly<Record<string, string>>;
  playbackTime: number;
}>;
```

Rigs should accept or generate an explicit instance ID:

```ts
new SolidRig(blueprint, { instanceId: 'scene/vehicle/17' });
```

The deterministic blueprint must remain shareable. Instance state should not be written back into
identity or recipe objects.

### Minimal composition service

A small optional composition layer may own:

- instance insertion and removal;
- root transform updates;
- back-to-front draw ranks for raster rigs;
- attachment relationships between instance sockets;
- interaction state snapshots;
- deterministic update order;
- disposal ownership.

It should not own physics simulation, navigation, game rules, ECS storage, or scene persistence
policy. Consumers may integrate these assets into their own engines.

### Acceptance criteria

- Multiple instances can share one blueprint without sharing runtime state.
- Two instances may use different animation times and interaction states.
- An attached child follows the parent's socket without accessing renderer internals.
- Removing one instance disposes only resources it owns.
- Shared immutable resources use explicit reference ownership and are disposed exactly once.

## Initiative 6: pure, deterministic motion sampling - completed 2026-08-23

### Problem

Before this initiative, the runtimes avoided accumulated transform drift and characters shared
temporal pose weights, but motion interpretation was still mixed with rig mutation:

- `VehicleAnimator` accepts either a raster or solid rig and imports Three.js;
- raster and solid character animators repeat pose interpretation with representation-specific
  constants;
- elapsed time is internal mutable state, which makes exact seeking and offline export harder;
- consumers cannot inspect or serialise the sampled semantic pose before it is applied.

### Implemented two-stage model

Each animated family owns a pure semantic sampler and thin projection applicators:

```ts
export function sampleCharacterMotion(
  identity: CharacterIdentityRecipe,
  state: CharacterMotionState,
  time: number,
): CharacterMotionSample;

export function applyRasterCharacterMotion(
  rig: SpriteRig,
  sample: CharacterMotionSample,
): void;

export function applySolidCharacterMotion(
  rig: SolidRig,
  sample: CharacterMotionSample,
): void;
```

The sample should use family vocabulary and normalized intent. It may contain joint swing, lift,
compression, expression, gaze, flow phases, and other semantic channels. It should not contain
Three.js vectors or matrices.

Vehicle sampling should derive wheel rotation from cumulative signed travel exactly as it does
today, but should return wheel and chassis intent before either representation is mutated.

### Absolute time and commands

Prefer sampling at an absolute time plus explicit state over hidden time integration where
possible. Stateful one-shot behaviour such as blink scheduling may use a deterministic runtime
state object, but that state should be inspectable and seekable for export.

State setters remain idempotent commands. Reapplying the same expression, pose, or interaction
must not restart transitions or autonomic schedules.

### Benefits

- deterministic replay and animation export;
- timeline scrubbing;
- easier parity tests between raster and solid motion;
- renderer-independent simulation;
- simpler integration with game loops and network snapshots;
- family runtimes no longer need unsafe rig discrimination.

### Acceptance criteria

- Equal identity, state, and time produce equal motion samples.
- Raster and solid adapters consume the same sample.
- Seeking directly to a time matches stepping to that time within documented stateful behaviour.
- Applying one sample twice does not accumulate transforms.
- Motion sampling imports neither Three.js nor raster drawing infrastructure.

## Initiative 7: multi-instance inked-solid rendering - completed 2026-08-23

### Problem

Before this initiative, `InkedSolidPass` stored one `InkedSolidBlueprint`. Its render loop traversed the scene
four times to produce semantic albedo, view marks, anchors, and normals before compositing. During
those traversals it replaces materials, allocates swap records, and performs repeated linear
searches through blueprint parts and materials.

The design proves the visual model, but it is not yet the right ownership shape for a scene with
many independently styled or animated asset instances.

### Target API

Evolve the pass into a scene-level service with registered carriers:

```ts
const pass = new InkedSolidScenePass(renderer);

const registration = pass.register({
  instanceId,
  blueprint: inkedBlueprint,
  rig,
});

pass.render(scene, camera, time);
registration.dispose();
pass.dispose();
```

Paper is a scene-level drawing surface. Registered instances may use different pigment media,
mark vocabularies, and contour policies, but the pass must resolve one explicit scene paper policy
unless a future design introduces genuinely separate paper regions. Medium defaults may propose a
paper; they must not make the result depend on registration order when several media coexist.

Registration should precompute:

- part ID to geometry topology;
- material ID to drawing policy;
- mesh to instance, part, material, and owner anchor;
- reusable render-pass material assignments;
- semantic stroke ownership.

### Internal separation

Split the current implementation into focused modules:

- policy contracts and defaults;
- registered carrier metadata;
- G-buffer target ownership;
- semantic albedo material cache;
- view-mark material cache;
- anchor encoding;
- normal/topology encoding;
- fullscreen compositor;
- shader source modules;
- lifecycle and diagnostics.

The existing type-only dependency cycle between blueprint policy and projection-provider types
should be removed by moving shared inked-solid policy types into a contract module that depends on
neither provider registration nor blueprint construction.

### Performance sequence

Optimise in this order:

1. replace per-frame `.find()` calls with registration-time maps;
2. eliminate per-frame frozen swap-record allocation;
3. avoid traversing unrelated scene objects where layers or registered roots suffice;
4. reuse arrays and temporary vectors;
5. add a benchmark containing many animated instances and representative media;
6. only then evaluate WebGL2 multiple render targets or pass consolidation.

The first performance target should be zero steady-state JavaScript allocation proportional to
mesh count during an unchanged render. Rendering cost should scale approximately linearly with
registered visible parts.

### Correctness requirements

- Different instances may use different media and contour policies on one explicit scene paper.
- Identical blueprints may have multiple instance IDs.
- Marks follow articulated owners without line-boil phase resets.
- Paper grain remains stationary while part-relative fields move with parts.
- Semantic pigment colour remains exact and independent of physical finish.
- Unregistered geometry may occlude registered carriers only through an explicit scene policy;
  accidental inclusion must not recolour the drawing.

### Acceptance criteria

- One pass renders at least two different families and two instances of one shared blueprint.
- Instance removal leaves no cached materials or GPU resources behind.
- A performance benchmark records CPU time, draw calls, targets, and steady-state allocations.
- Existing medium parity and contour invariants remain unchanged.

All acceptance criteria are implemented. The benchmark records JavaScript-side carrier
preparation and renderer submission separately from GPU time; a future GPU benchmark should use
timer queries in a stable browser harness rather than infer raster cost from CPU wall time.

## Initiative 8: focused solid geometry authoring primitives - in progress 2026-08-23

### Problem

Several families manually build indexed mesh vertices and faces for recurring topology:

- vehicle tyres and cylinders;
- eyewear rims and temples;
- hair shells and wraps;
- facial-hair rings;
- building shells and profiled volumes.

Vehicle body carriers also need a focused faceted-shell construction. The current smooth
superellipsoid preserves volume but cannot publish the intentional bonnet, shoulder, belt, and
fender creases visible in designed sheet metal. Those plane changes must exist in authored
topology or shared semantic profiles; they must not be invented by lowering the screen-space
normal threshold until incidental tessellation becomes visible.

Some family-specific meshes are appropriate. Reimplementing common revolution and sweep topology
is not. It makes validation, detail scaling, normal generation, and inked-solid flow behaviour
inconsistent.

The current `ExtrudedProfileGeometrySpec.curveSegments` field is also misleading: the Three.js
adapter deliberately forces `curveSegments: 1`, so the public value has no effect.

### Proposed primitives

Add only primitives supported by repeated current use:

```ts
export type RevolvedProfileGeometrySpec = Readonly<{
  type: 'revolved-profile';
  profile: readonly Point[];
  radialSegments: number;
  closed: boolean;
  smooth: boolean;
}>;

export type SweptProfileGeometrySpec = Readonly<{
  type: 'swept-profile';
  path: readonly Point3[];
  profile: readonly Point[];
  pathClosed: boolean;
  frame: 'parallel-transport';
  twist?: readonly number[];
  smooth: boolean;
}>;
```

A lofted profile should be added only if at least two existing meshes can use the same contract
without losing their semantic topology.

### Authoring and runtime rules

- specifications remain serialisable and immutable;
- runtime `detail` scales tessellation, not identity or bounds;
- topology explicitly declares smooth versus faceted flow;
- analytic or generated bounds are testable without Three.js;
- invalid self-intersections and degenerate profile segments fail validation;
- family adapters select primitives but do not construct renderer geometry.

Remove `ExtrudedProfileGeometrySpec.curveSegments` while its outline is a polyline. Segment count
has no meaningful effect on straight path commands. Reintroduce curve resolution only together
with an explicit serialisable curve-path vocabulary. A public control that is intentionally
ignored is worse than no control.

### Acceptance criteria

- Vehicle tyre and at least one wearable or wrap use shared primitives.
- Reduced runtime detail preserves bounds, sockets, colliders, and semantic IDs.
- Generated normals and face winding pass focused tests.
- Inked-solid surface-flow classification remains authored and stable.

### Current delivery

The vehicle hard-surface slice is complete: the body is an authored faceted shell, articulated
lids close its upper topology, generic normal creases are gated by faceted classification, and
runtime triangulation preserves one normal per authored polygon. Revolved-profile and
swept-profile contracts, migrations, detail scaling, and their remaining acceptance tests are
still pending; Initiative 8 is therefore intentionally marked in progress rather than complete.

## Initiative 9: typed capabilities

### Problem

Namespaced capabilities are the correct extension boundary, but the current generic reader accepts
a decoder that often performs a type assertion. Payload shape is therefore trusted rather than
validated, duplicate capability IDs are not rejected generically, and shallow freezing does not
guarantee nested immutability.

### Proposed capability keys

```ts
export type AssetCapabilityKey<T extends object> = Readonly<{
  id: string;
  decode: (input: unknown) => T;
}>;

export function defineAssetCapability<T extends object>(
  key: AssetCapabilityKey<T>,
  data: T,
): AssetCapability;

export function readAssetCapability<T extends object>(
  capabilities: AssetCapabilities | undefined,
  key: AssetCapabilityKey<T>,
): T | undefined;
```

The key remains owned beside its family. The generic contract learns nothing about wheel, face,
flow, or character vocabulary.

### Acceptance criteria

- Family capability decoders reject malformed payloads.
- Duplicate capability IDs on one owner fail blueprint validation.
- Capability data remains JSON-compatible.
- Runtime readers contain no `as FamilyCapability` casts.

## Initiative 10: public API and package boundaries

### Problem

The root barrel currently exports contracts, low-level geometry, family internals, layouts,
capability constructors, runtimes, material providers, and high-level factories together. The
compiled artifact currently exposes 155 names.

A large root API makes accidental commitments cheap and future cleanup expensive. It also makes it
hard to communicate the intended path for ordinary consumers versus family authors.

### Proposed export surface

Keep a curated root for the common workflow:

```ts
import {
  createCharacterIdentity,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
  SpriteRig,
  SolidRig,
} from '@mithrilman/aind-drawn';
```

Add intentional subpath exports:

- `@mithrilman/aind-drawn/contracts`;
- `@mithrilman/aind-drawn/authoring`;
- `@mithrilman/aind-drawn/character`;
- `@mithrilman/aind-drawn/building`;
- `@mithrilman/aind-drawn/vehicle`;
- `@mithrilman/aind-drawn/raster`;
- `@mithrilman/aind-drawn/solid`;
- `@mithrilman/aind-drawn/inked-solid`.

Low-level family geometry helpers should be exported only from an authoring-oriented path when they
are genuinely supported extension points.

### Three.js ownership

Before external publication:

- declare Three.js as a peer dependency and retain it as a development dependency;
- document the supported version range;
- avoid `instanceof THREE.Mesh` where duplicate module instances could break detection;
- prefer stable object flags or adapter-owned registration;
- add `sideEffects: false` once module initialisation is confirmed safe for tree shaking.

### API verification

Add a generated public API report or an explicit export snapshot. Changes should be reviewed as
API decisions rather than appearing indirectly through `export *`.

### What not to do

Do not split the repository into many packages yet. Subpath exports provide useful boundaries
without introducing workspace release coordination, duplicated configuration, or cross-package
version choreography.

### Acceptance criteria

- The root export count is intentionally curated.
- Every public symbol belongs to a documented consumer or authoring workflow.
- Package tests exercise root and subpath imports from the compiled artifact.
- A consumer with its own compatible Three.js installation receives one runtime instance.

## Feature roadmap

The architectural initiatives above should produce visible library capabilities. Features should
be designed as consumers of the hardened contracts, not as special cases attached directly to
families.

## Feature 1: first-class persistence

### User value

Consumers can save an identity, restore it safely, compare it, transmit it, and regenerate all
representations without depending on internal object construction.

### Proposed surface

- family identity encoders and decoders;
- canonical family and version discriminants;
- stable identity fingerprints for every family;
- optional recipe document containing representation style selections;
- explicit unsupported-version errors;
- later migrations registered by family and source version.

### Suggested document form

```ts
export type AssetDocument = Readonly<{
  documentVersion: 1;
  identity: AssetIdentityRecipe;
  representations: Readonly<{
    raster?: RasterStyleSelection;
    solid?: SolidStyleSelection;
    inkedSolid?: InkedSolidStyleSelection;
  }>;
}>;
```

Runtime state should remain in a separate scene or instance document. Saving a character identity
must not silently include its current blink timer or world position.

### Acceptance criteria

- Save and load preserve complete semantic identity.
- All representations reconstructed from the loaded identity retain parity.
- Corrupt, partial, and future-version documents fail with actionable issues.
- Fingerprints are available for character, building, and vehicle identities.

## Feature 2: export adapters

### User value

The library produces assets that can leave its own runtime. Without export, procedural generation
remains impressive but captive.

### Raster exports

Provide an optional raster export module supporting:

- one composited PNG at an explicit scale;
- one PNG per semantic layer and state;
- boil-frame sprite sheets;
- metadata describing layer pivots, bone ownership, sockets, and frame timing;
- deterministic file naming derived from family, asset ID, state, and frame.

Raster export should reuse the public baking pipeline. It must not duplicate family draw logic.
Extract layer and state baking from `SpriteRig` into a renderer-neutral `RasterAssetBaker` with
explicit canvas or image ownership; `SpriteRig` and exporters then consume the same baked result.
The baker is also the correct location for optional cache keys, headless canvas adapters, and
sprite-sheet metadata. It must not know family vocabulary.

### Solid exports

Provide a glTF/GLB adapter supporting:

- mesh hierarchy and node pivots;
- material colour and physical finish approximation;
- semantic part IDs in `extras.aind`;
- sockets, colliders, and interactions in `extras.aind` or a versioned sidecar;
- animation clips once motion sampling is available;
- deterministic export from one recipe and export options object.

Physical finish textures generated by the Three.js provider may be baked only as an exporter
policy. The core solid blueprint remains renderer-neutral.

### Inked-solid exports

Begin with deterministic rendered output rather than inventing a portable shader format:

- still image at an explicit camera and size;
- transparent or paper-backed output policy;
- image sequence over a deterministic timeline;
- later video encoding in an optional environment adapter.

### Acceptance criteria

- Export does not require internal source imports.
- Exported metadata retains semantic IDs and attachment transforms.
- Equal recipe and options produce structurally equal metadata and visually stable output within
  documented renderer limits.
- Exporters dispose every temporary resource.

## Feature 3: semantic inspection and parity reports

### User value

Family authors and engine integrators can inspect what an asset means without reverse-engineering
draw callbacks, mesh names, or runtime objects.

### Proposed API

```ts
export function inspectAssetBlueprint(
  blueprint: AssetBlueprint | SolidAssetBlueprint,
): AssetInspection;

export function compareAssetProjections(
  raster: AssetBlueprint,
  solid: SolidAssetBlueprint,
): AssetProjectionParityReport;
```

Inspection should include:

- family, representation, asset ID, and version;
- semantic part inventory;
- layer, bone, node, and material ownership;
- sockets and colliders with owners;
- interactions, states, and bindings;
- capabilities and versions;
- bounds and geometry statistics;
- validation issues and warnings.

Parity reports should distinguish errors from intentional projection loss. A raster projection may
collapse hidden depth, but it must not lose the semantic existence of a wrap, volume, or
articulated part.

### Acceptance criteria

- Reports are pure JSON-compatible data.
- Generic inspection imports no family modules.
- Every current family has zero unexpected parity errors for representative seeds.
- Authoring tests can assert semantic requirements through the inspector instead of duplicating
  traversal logic.

## Feature 4: deterministic timeline and clips

### User value

Consumers can seek, scrub, replay, export, and synchronise animation without relying on an opaque
sequence of frame updates.

### Proposed capabilities

- absolute-time motion sampling;
- serialisable motion parameters and interaction state snapshots;
- named clips or presets owned by each family;
- deterministic autonomic schedules;
- transition sampling without cumulative drift;
- optional baking into raster frames or glTF animation tracks.

This is not a universal animation graph editor. Family motion remains family-owned; the shared
runtime supplies time, blending primitives, deterministic schedules, and pose application
contracts.

### Acceptance criteria

- Direct seeking and stepped playback agree.
- A clip can be sampled without a renderer.
- Raster and solid projections consume one semantic timeline.
- Exporters can bake a bounded interval deterministically.

## Feature 5: selective reroll and feature locks

### User value

Procedural exploration becomes controlled rather than destructive. A consumer may keep a face and
palette while regenerating hair, outfit, building balconies, or vehicle details.

### Proposed model

Do not mutate an existing identity in place. Produce a new resolved identity using explicit
namespace variation:

```ts
export type IdentityVariation = Readonly<{
  source: AssetIdentityRecipe;
  variationSeed: number;
  reroll: readonly string[];
}>;
```

Family-owned variation functions map public semantic feature IDs to their seed namespaces and
reapply invariants:

```ts
varyCharacterIdentity(variation): CharacterIdentityRecipe;
```

Public feature IDs should be stable semantic concepts such as `palette`, `hair`, `mouth`, or
`outfit`, not raw internal namespace strings.

### Rules

- unchanged feature values remain exactly equal;
- rerolled features use dedicated deterministic namespaces;
- dependent invariants are recomputed explicitly;
- a variation result is a complete persisted identity, not an overlay requiring the original
  generator;
- impossible locks fail clearly rather than silently changing unrelated traits.

### Acceptance criteria

- Rerolling one feature preserves unrelated identity fields exactly.
- Equal source, variation seed, and feature set produce equal identities.
- Loaded identities can be varied without knowing the generator version that created them.
- Variation is covered by namespace-isolation tests.

## Feature 6: a new architectural stress-test family

### Recommended family: tree or plant

A new family should prove a missing capability rather than demonstrate that the current folder
template can be copied again. Trees and plants introduce several useful stresses:

- branching semantic topology;
- repeated leaves, needles, fruit, or flowers;
- wind motion and phase variation;
- hierarchical sockets for growth and effects;
- instancing and level-of-detail pressure;
- organic raster silhouettes and real solid volume;
- seasonal or damage interaction states;
- smooth and explicitly faceted carriers in one asset.

### Classification

The identity should own species or archetype, branching profile, proportions, palette roles,
attachment topology, seasonal state, and normalized feature placement. Raster and solid adapters
project that shared growth structure. Wind belongs to runtime state; generated branch topology
belongs to identity.

### Why it comes later

Implementing plants before attached sockets, reusable sweep geometry, runtime instances, and pure
motion sampling would force family-local substitutes for each missing capability. That would make
the new family appear productive while quietly weakening the architecture.

### Acceptance criteria

- Branch topology is deterministic and representation-neutral.
- Repeated components do not require family-specific renderer branches.
- Wind sampling is deterministic and shared across projections.
- Runtime detail or instancing changes rendering cost without changing identity or gameplay data.
- The family validates the multi-instance inked-solid path.

## Verification strategy

### Contract tests

Add focused suites for:

- envelope consistency;
- codec success and failure paths;
- pure blueprint validation;
- duplicate IDs and hierarchy cycles;
- attachment ownership and world-pose resolution;
- capability decoding;
- shared semantic manifests;
- instance isolation.

### Property and seed-sweep tests

Representative seeds are valuable but cannot explore the combinatorial surface of procedural
generation. Add deterministic seed sweeps for each family and assertion category:

- all numbers are finite;
- dimensions and radii are positive;
- bounds contain authored geometry within documented tolerance;
- sockets and sensor colliders reference valid owners;
- interactions bind every state;
- mesh indices are valid and faces are non-degenerate;
- required semantic parts exist for every archetype;
- representation parity has no unexpected losses.

Property tests need not introduce a dependency immediately. A bounded deterministic loop over
carefully selected seeds already catches substantial failures and remains debuggable.

### Geometry tests

For generated mesh primitives, verify:

- valid face winding;
- expected smooth or faceted topology;
- stable bounds across runtime detail levels;
- no NaN normals or zero-area triangles where prohibited;
- surface anchors resolve against the same analytic shape;
- colliders and sockets remain invariant under tessellation changes.

### Resource lifecycle tests

Cover normal disposal and failure atomicity for:

- sprite textures and geometries;
- solid materials, generated maps, and geometries;
- inked-solid render targets and cached materials;
- semantic stroke rigs;
- exporter temporaries;
- shared blueprint or instance resources.

### Visual regression tests

Add library-level visual baselines for a small curated matrix:

- one organic and one architectural asset;
- raster and inked-solid output;
- representative graphite, watercolor, oil, and marker behaviour;
- canonical and oblique solid views;
- one articulated state and one animated pose.

Visual tests complement semantic assertions. They must not become the only proof that sockets,
colliders, topology, or material intent are correct.

### Performance benchmarks

Track at least:

- identity and blueprint generation throughput;
- sprite bake time and retained texture memory;
- solid geometry construction by part and detail level;
- inked-solid CPU time, draw calls, and render-target memory;
- scaling from one to many registered instances;
- steady-state JavaScript allocations during animation.

Store benchmark scenarios and environment metadata. Do not fail CI on noisy absolute timings until
the environment is controlled; initially detect major relative regressions.

### Test organisation

As coverage grows, split large cross-cutting test files by conceptual ownership:

```text
tests/
|-- contracts/
|-- codecs/
|-- assets/character/
|-- assets/building/
|-- assets/vehicle/
|-- projections/inked-solid/
|-- runtime/
`-- exports/
```

This is an organisational change, not an excuse to duplicate setup. Shared contract fixtures
should remain small and explicit.

## Incremental delivery plan

### Phase 0: contract hardening

Completed in Initiatives 1 and 2:

- unified family and representation identifiers;
- normalised identity, recipe, and blueprint envelopes;
- removal of obsolete headers and inconsistent `kind` values;
- pure raster and solid validators;
- family identity codecs;

The final Phase 0 item, the exact public API snapshot, is complete.

Exit criteria:

- all current factories and runtimes use the new contracts;
- no compatibility aliases remain;
- all current tests pass through validators;
- compiled artifact tests cover canonical imports and JSON decode.

### Phase 1: spatial semantics

Completed:

- attached socket definitions with orientation;
- attached colliders;
- world-space spatial queries in both rigs.

Remaining:

- shared semantic manifest;
- shared interaction state machine with representation bindings;
- explicit runtime instance IDs.

Exit criteria:

- a moving character hand and vehicle door expose correct runtime attachments;
- two instances of one blueprint maintain independent state;
- exporters and inspectors can consume spatial data without renderer internals.

### Phase 2: motion and scene rendering

Deliver:

- pure character and vehicle motion samplers;
- thin raster and solid pose applicators;
- absolute-time sampling and deterministic state snapshots;
- registered multi-instance inked-solid rendering;
- renderer diagnostics and performance benchmarks.

Exit criteria:

- raster and solid motion share one sampled intent;
- one inked-solid pass renders multiple families and instances;
- no avoidable per-mesh JavaScript allocation occurs during steady-state rendering.

### Phase 3: useful outputs

Deliver:

- raster PNG, layer, and sprite-sheet exporters;
- glTF/GLB export with semantic metadata;
- inked-solid still and sequence rendering;
- semantic inspection and parity reports;
- versioned asset documents.

Exit criteria:

- generated assets can be saved, loaded, exported, and inspected through public APIs only;
- exported attachment, collider, interaction, and part metadata passes round-trip tests;
- temporary exporter resources are disposed deterministically.

### Phase 4: controlled generation and stress family

Deliver:

- selective reroll and feature locks;
- focused shared sweep or revolution primitives proven by existing families;
- tree or plant identity, projections, runtime wind, and authoring tests;
- instancing and detail policies where measurements justify them.

Exit criteria:

- the new family introduces no family vocabulary into generic renderers;
- branch topology and wind intent survive representations;
- multi-instance rendering and export remain within established budgets.

## Recommended first implementation slice

The original recommendation combined envelope normalisation and pure validators. Implementation
split it at the actual architectural seam: Initiative 1 migrated the greenfield contracts, then
Initiative 2 added validation and codecs against the canonical shape. Both slices are complete.

### Concrete work

1. [x] Add `AssetRepresentationId` and common open-family envelope types.
2. [x] Update all identity and representation recipes.
3. [x] Give raster blueprints an explicit representation discriminant.
4. [x] Make semantic family values identical across raster and solid output.
5. [x] Replace runtime representation detection based on property existence or encoded kind strings.
6. [x] Implement pure raster and solid blueprint validators.
7. [x] Invoke validation before resource construction.
8. [x] Add malformed blueprint fixtures for every reference type.
9. [x] Add compiled-artifact assertions for the new headers.
10. [x] Update architecture and authoring documentation in the same change.

### Why this slice comes first

- it reduces ambiguity in every later API;
- codecs, manifests, composition, and export all depend on coherent discriminants;
- the package is still free to make breaking changes without migration theatre;
- it does not require a visual redesign or a speculative generic subsystem;
- it exposes invalid assumptions before they become serialised format commitments.

## Risks and mitigations

### Risk: a generic manifest becomes a generic asset model

Mitigation: include only cross-family semantic IDs, interactions, sockets, colliders, and
capability containers. Family recipes retain all actual domain vocabulary.

### Risk: codec maintenance duplicates TypeScript types

Mitigation: keep codecs near family recipes, test factory output through them, and introduce a
small shared validation toolkit for primitives. Avoid reflection-heavy schema generation until
maintenance cost proves the need.

### Risk: attached colliders turn the library into a physics engine

Mitigation: publish immutable shapes and transforms only. Collision detection, broad phase,
resolution, and simulation remain consumer responsibilities.

### Risk: motion samples become a universal pose abstraction

Mitigation: keep sample types family-owned. Share time, interpolation, deterministic scheduling,
and transform application mechanics, not character and vehicle vocabulary.

### Risk: multi-instance rendering becomes premature optimisation

Mitigation: first make instance ownership correct, then remove obvious repeated lookup and
allocation, then benchmark. Advanced render-pass consolidation remains optional.

### Risk: export commits the library to one engine format

Mitigation: export from renderer-neutral blueprints and use versioned semantic metadata. glTF is
an adapter, not the domain model.

### Risk: selective reroll destabilises identity invariants

Mitigation: expose family-owned semantic feature IDs, regenerate complete resolved identities, and
test exact equality of all unlocked fields.

## Explicit non-goals

The roadmap does not include:

- a physics engine;
- an entity-component system;
- a universal scene graph replacing consumer engines;
- a catch-all prop registry;
- a family switch inside generic renderers;
- separate inked-solid geometry;
- renderer objects in recipes or blueprints;
- a shader subclass per asset family;
- a monorepo split without independent release needs;
- compatibility aliases for unreleased formats;
- visual preview stand-ins that bypass the public generation pipeline;
- a complete procedural CAD or geometry-node language.

## Open design decisions

### Manual codecs or a schema library

Recommendation: begin with explicit codecs plus a small internal validation toolkit. The domain has
many tuple, topology, and cross-field invariants that generic structural schemas would still need
custom refinements to express. Reconsider only if duplication becomes measurable.

### Quaternion or Euler socket orientation

Recommendation: store normalized quaternions in public 3D socket poses. Accept Euler convenience
inputs in authoring helpers when useful, but resolve them before blueprint publication.

### Replace or evolve `InkedSolidPass` - resolved

Implemented as a clean `InkedSolidScenePass` contract with all call sites migrated. The obsolete
single-blueprint class was deleted without a legacy wrapper because no released consumer exists.

### Semantic metadata inside glTF or beside it

Recommendation: place compact, self-contained identifiers and transforms in `extras.aind`; use a
versioned sidecar only for data that would make the glTF difficult to inspect or exceeds practical
tool compatibility.

### Share generated GPU resources across instances

Recommendation: establish correct per-instance state and explicit ownership first. Add sharing at
the geometry, material, or texture boundary only with reference-counted disposal tests and measured
benefit.

## Definition of success

The evolution is successful when an external consumer can, using public APIs only:

1. decode a saved identity safely;
2. reconstruct raster, solid, and inked-solid representations;
3. validate every contract before allocating runtime resources;
4. create multiple independent instances of one blueprint;
5. attach another object to an animated socket;
6. query current colliders and interaction state in world space;
7. sample animation deterministically at an arbitrary time;
8. render multiple inked-solid instances in one scene;
9. export useful raster and glTF artifacts with semantic metadata;
10. inspect and compare representation parity without family-specific traversal code;
11. dispose every owned resource deterministically;
12. add a new semantic family without modifying generic renderer vocabulary.

At that point AIND Drawn is no longer only a strong procedural rendering experiment. It is a
coherent asset library with durable data, runtime, composition, and tooling boundaries.
