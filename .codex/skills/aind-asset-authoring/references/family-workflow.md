# Asset family workflow

Use this reference for every new public asset type. It turns an asset request
into the repository contracts required to generate, render, interact with, and
test that asset without coupling it to one experiment.

## 1. Write the semantic inventory

Before choosing files, write down:

- domain name and archetypes, such as `vehicle` with `car`, `van`, and `truck`;
- deterministic choices and user overrides;
- semantic parts and which ones can move or change state;
- spatial topology of each meaningful feature;
- bounds, colliders, sockets, and interactions required by consumers;
- required representations: raster, smooth solid, inked solid, or a subset;
- transient motion that belongs in a runtime animator rather than identity.

Use domain vocabulary. Buildings have archetypes, characters may have species,
and vehicles have body styles. Reusing the architecture is useful; pretending
everything is a species is not.

## 2. Choose the smallest honest model

### Dedicated raster family

Use `src/assets/<family>/` when the asset has a supported product consumer and
owns semantic layers, family-specific layout, independent pivots, states,
interactions, or animation. Do not create a catch-all prop registry or keep a
placeholder family alive only through tests and barrel exports.

Typical structure:

```text
src/assets/<family>/
├── recipe.ts
├── layout.ts
└── blueprint.ts
```

Add focused profile or geometry files only when they own a real concept. Do not
split one five-line calculation into a ceremonial folder forest.

### Multi-representation family

Create one family root when semantic identity must survive more than one
representation. Keep every family-owned adapter and animator below it:

```text
src/assets/<family>/
├── identity/
│   ├── recipe.ts
│   └── drawing-style.ts   # only when seeded tone hierarchy is shared
├── raster/
│   ├── recipe.ts
│   ├── layout.ts
│   └── blueprint.ts
├── solid/
│   ├── recipe.ts
│   ├── layout.ts
│   ├── blueprint.ts
│   └── ink-strokes.ts     # only for semantic 3D marks
└── runtime/               # only when the family owns transient behavior
    └── animator.ts
```

Characters and buildings are the maintained examples. Identity owns semantic
choices, proportions, part inventory, palette roles, feature topology,
attachment intent, and normalized placement. Representation recipes reference
the exact immutable identity and add only medium, finish, mesh density, or
other projection policy.

Do not call the identity factory inside an adapter. Passing the same seed to two
independent generators produces correlated drift, not shared identity.

## 3. Author deterministic recipes

Recipes are immutable, serialisable domain data. They contain everything a
blueprint needs and no renderer objects.

- Normalize public seeds with `normalizeSeed`.
- Use `SeedTree` and one namespace per semantic feature.
- Persist generated values instead of recomputing them later.
- Validate caller-provided dimensions, counts, enums, and ranges at the public
  boundary; reject invalid values with useful `RangeError` or `TypeError` text.
- Freeze the returned object and nested arrays/objects.
- Keep `version: 1` on serialised recipes while the current contracts use it.
- Put drawing `medium` in raster representation style, not shared identity.
- Put physical `finish` in solid representation style, not shared identity.

Good namespaces describe semantic ownership:

```ts
const tree = new SeedTree(normalizedSeed);
const bodyRandom = tree.random('vehicle:body');
const wheelRandom = tree.random('vehicle:wheels');
const doorRandom = tree.random('vehicle:doors');
```

Adding `vehicle:roof-rack` must not change existing wheel dimensions. Add a
regression test when extending an established family.

## 4. Derive one layout

The layout translates identity into representation coordinates. Compute once:

- total bounds and ground/base line;
- part dimensions and positions;
- pivots and node origins;
- sockets and interaction approach points;
- collider geometry;
- repeated-grid placement such as windows, wheels, leaves, or seats;
- raster canvas scale or solid local coordinates as applicable.

Blueprint drawing callbacks and part builders consume the layout. They do not
recalculate wheel centres, door hinges, or window grids independently.

Raster world coordinates use a bottom-left/y-up convention. Canvas drawing is
top-left/y-down, so centralise that conversion as `plant/layout.ts` and
`plant/blueprint.ts` do. `LayerDefinition.pivot` is normalized over the layer:
limbs normally pivot at a joint edge; ground objects normally pivot at their
bottom centre.

Bounds must contain all visible geometry. Sockets and colliders use the same
coordinate system and derived dimensions as the drawing or solid parts.

## 5. Build a raster blueprint

Return an immutable `AssetBlueprint` with stable IDs:

- `kind`, `seed`, `medium`, and total `bounds`;
- one `LayerDefinition` per independently ordered, stateful, or articulated
  visual part;
- colliders, sockets, and declarative interactions.

Each layer declares its semantic `id`, owning `bone`, optional `parentBone`,
local `order`, `depth`, canvas size, world size, position, pivot, available
states, and draw callback. The draw callback consumes a complete recipe and
the supplied `Sketch`; it makes no semantic random choices.

Use `mediumById(recipe.medium)` and the shared `Medium` operations. Preserve
paper fill, pigment, and edge as separate drawing concerns. Artwork
imperfection belongs in `Sketch`/`Medium` policy or authored geometry, not in
collider jitter.

Layer order is local to the asset. `SpriteRig.drawRank` assigns the global
contiguous painter block. Do not use raw layer order to interleave separate
assets.

## 6. Build a solid blueprint

Return serialisable `SolidAssetBlueprint`; Three.js begins only in `SolidRig`.

### Geometry choice

- `box`: hard planar carrier such as walls, slabs, beams, and posts;
- `superellipsoid`: smooth analytic volume such as heads, limbs, stones, and
  rounded bodies;
- `extruded-profile`: a deliberately profile-driven plate or shallow volume;
- `mesh`: arbitrary indexed or flat polygonal volume.

Set `mesh.smooth: true` for a continuous curved carrier and `false` for
intentional facets. Doodle 3D uses this topology: smooth carriers retain a
view-oriented field while faceted carriers can orient marks per visible plane.
Do not use a front extrusion as a fallback for wraps, shells, roofs, wheels, or
features whose depth changes their meaning.

### Nodes and parts

- Put one node at every physical articulation pivot.
- Parent nodes according to semantic ownership.
- Keep each independently visible or material-bearing part as a named
  `SolidPartDefinition`.
- Use `placement.surface` for a feature mounted to an analytic host.
- Store local Euler adjustments in `placement.rotation`; do not hand-tune
  transforms later in the experiment.
- Reuse the same analytic surface for geometry and feature placement.

### Materials and gameplay

Materials carry a semantic `id`, colour, smooth finish, and an explicit generic
drawing application plus tone. When a seeded tone hierarchy must match raster
output, derive it next to identity and assign `SolidMaterialSpec.drawing.tone`.
Map family semantics to `drawing.application` in the family adapter; never infer
either value from part names, material IDs, or RGB.

Solid colliders currently use boxes. Add a general collider primitive only when
the domain needs it across families; do not bury a one-off physics type in an
adapter. Sockets and interaction sensors use the layout's coordinates.

## 7. Preserve spatial topology

Classify every feature whose hidden dimensions matter:

- `surface`: follows a host, such as a seam or painted mark;
- `front-extrusion`: intentionally plate-like and view-biased;
- shell: follows a host with coverage, boundary, clearance, thickness, relief;
- cluster: localized volumes anchored to a host, such as tufts or thorns;
- wrap: surrounds a circumference, such as a crown, pipe, collar, or tyre;
- volume: occupies independent 3D space;
- articulated: owns a pivot and runtime state.

Identity stores the intent. Raster may collapse hidden dimensions; solid must
preserve them. Use normalized host-relative coordinates or sockets, never a 2D
outline as the only source for 3D reconstruction.

## 8. Publish without leaking internals

- Export public recipes, options, layouts when useful to consumers, blueprints,
  geometry contracts, and factories from `src/index.ts`.
- Keep family-owned identity, representation, and runtime code under one family
  root. Keep shared contracts under `src/contracts/`, cross-family
  projections under `src/projections/`, and generic rigs under
  `src/runtime/`.
- Keep focused draw helpers and runtime implementation details internal.
- Experiments import only `src/index.ts`.
- Do not add compatibility aliases while the package remains unpublished and
  greenfield; change every call site instead.

## 9. Acceptance checklist

Add applicable tests for:

- deterministic recipe and blueprint equality;
- namespace isolation after adding optional features;
- option validation and immutable output;
- exact part/layer IDs, parentage, order, pivots, and states;
- bounds enclosing visible geometry;
- collider and socket agreement with layout;
- interaction bindings and invalid-state rejection;
- shared semantic values across raster and solid projections;
- wrapped/volumetric features occupying the expected axes;
- public export availability and consumer document parsing.

Run `pnpm verify`. Inspect representative minimum, typical, maximum, and
feature-heavy seeds in the in-app browser. For a multi-representation family,
compare the same identity and medium side by side rather than judging unrelated
random outputs.
