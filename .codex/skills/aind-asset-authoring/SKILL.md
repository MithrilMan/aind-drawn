---
name: aind-asset-authoring
description: Design, add, or revise procedural asset classes in the aind-drawn repository, including props, characters, scenery, vehicles, layers, recipes, colliders, sockets, interactions, animation, catalog integration, and authoring tests. Use when an object type or visual family must be created or when deciding whether an asset belongs in the prop registry or needs its own family.
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
`src/core/geometry3.ts`, and the `src/assets/solid-face/` reference family.

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
- Avoid compatibility shims unless a released serialized recipe requires a migration.

## Integrate the consumer

Update the playground catalog and its serializable document only when the user
needs to author the new parameter. Inspector controls must change the recipe,
not mutate baked textures. Provide state previews for interactive layers.

## Verify

Add tests that prove:

- identical seeds and options produce equal recipes;
- representations created from one identity preserve the same semantic values;
- feature namespaces do not affect unrelated parameters;
- expected layers and pivots exist;
- bounds, colliders, and sockets agree with layout;
- interaction and animation states apply to the intended parts;
- other families remain unchanged.

Run `pnpm verify`. Then inspect representative seeds in the in-app browser at
the primary desktop width and a narrow width. Report the chosen classification,
public API changes, tests, and any remaining consumer work.
