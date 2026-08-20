---
name: aind-asset-authoring
description: Design, add, or revise procedural asset families in the aind-drawn repository, including representation-neutral identity, raster and solid projections, spatial topology, props, characters, buildings, vehicles, layers, recipes, colliders, sockets, interactions, animation, catalog integration, and authoring tests.
---

# AIND asset authoring

Build the smallest asset model that preserves semantic parts, deterministic
identity, gameplay metadata, and runtime state. Do not hide multipart behavior
inside one canvas callback.

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
`docs/3d-stroke-rendering.md`, `src/assets/inked-solid/blueprint.ts`, and
`src/runtime/inked-solid-pass.ts`. Ink policy wraps a completed solid blueprint;
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
- inked solid: contour, semantic stroke, and hatching policy.

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
- an animator under `src/runtime/` only for transient motion that is not authored recipe data.

Export the family through `src/index.ts`. Make experiments depend on that public
barrel only.

## Preserve invariants

- Use a separate seed namespace for every semantic feature.
- Persist generated feature values in the recipe.
- Generate shared character semantics once in `CharacterIdentityRecipe`.
- Keep raster, smooth-solid, voxel, and future adapters free of semantic rerolls.
- Preserve feature topology and attachment across adapters; projection may lose
  visible dimensions, identity must not lose their meaning.
- Share normalized intent across representations, not pixel or surface coordinates.
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
- Keep contours camera-dependent and hatch coordinates object-local. A hatch
  texture that swims while a node animates is a broken attachment, not style.
- Reuse `InkedSolidPass` across asset families and dispose it explicitly.
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

Run `pnpm verify`. Then inspect representative seeds in the in-app browser at
every viewport class the experiment claims to support. For the current
desktop-only playground and labs, desktop QA is sufficient. Report the chosen
classification, public API changes, tests, and any remaining consumer work.
