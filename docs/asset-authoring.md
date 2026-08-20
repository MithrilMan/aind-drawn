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
its completed `SolidAssetBlueprint` with `createInkedSolidBlueprint`. Contour,
hatching, paper tint, and boil timing are representation policy; they must not
reroll geometry or enter the family identity. The same public runtime is used
for characters, buildings, vehicles, and props with real volume. Do not create
a family-specific post-process shader.

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
  the runtime or scene.
- Keep inked-solid policy in `InkedSolidBlueprint`; screen-space contours belong
  to the camera pass and hatching coordinates must stay local to the rendered
  geometry so articulated parts do not swim through the marks.

The building door is the cross-representation interaction reference. Raster
binds `closed` and `open` layer states; solid binds those states to the hinged
`door` node. Both use `door:sensor`, `door:entry`, and the same portal intent.

## Integration checklist

1. Export the new public types and factories from `src/index.ts`.
2. Register the asset in the consumer catalog rather than importing internals.
3. Extend the serializable experiment document only for authored parameters.
4. Add deterministic recipe tests and blueprint contract tests.
5. Test state validation and animation in the runtime when applicable.
6. Dispose generated resources through `SpriteRig.dispose()`, `SolidRig.dispose()`,
   and `InkedSolidPass.dispose()` when that representation is active.
7. Run `pnpm verify`.
8. Inspect representative seeds in the internal browser at every width the
   experiment claims to support; desktop-only labs require desktop QA only.

Repository agents can follow the local `aind-asset-authoring` skill under
`.codex/skills` for the step-by-step implementation workflow.
