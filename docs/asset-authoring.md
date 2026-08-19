# Procedural asset authoring

The library separates a generated asset into four contracts:

1. A **recipe** is complete, immutable, versioned, serializable data.
2. A **layout** derives world geometry, bounds, anchors, and part dimensions.
3. A **blueprint** binds named visual parts to geometry, colliders, sockets, states, and interactions.
4. A **runtime** adapts those parts to a renderer and applies transient state.

Drawing code consumes a complete recipe. It must not make new semantic random
choices while rasterizing; otherwise boil frames can change the identity of the
asset rather than only the character of its line.

## Choose the smallest honest model

First choose the representation: use raster layers for hand-drawn planes and
semantic solid parts for real volume. Consumer choice is not representation
choice: a `SpriteRig` can live in a Three.js scene, while a `SolidRig` can be
rendered orthographically in a 2.5D game.

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

`src/assets/solid-face` is the smooth-solid reference. Its recipe persists
identity and finish, its layout places facial features on an analytic surface,
and its blueprint emits serialisable geometry and material roles. The Three.js
objects exist only after `SolidRig` consumes that blueprint.

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

## Blueprint rules

- Give layers stable semantic IDs such as `body`, `wheel:front`, and `door:left`.
- Derive visual placement, bounds, colliders, and sockets from the same layout.
- Keep independently stateful parts in separate layers.
- Use a sensor collider and activation socket for each interaction.
- Bind interaction states to layer states through `InteractionDefinition`.
- Never infer physics or interaction regions from texture alpha.
- Choose pivots at the physical joint: wheel center, door hinge, limb shoulder.
- Keep local layer order small; `SpriteRig.drawRank` assigns the global block.
- For solids, use stable node and part IDs and mount features through a shared
  `SurfaceAnchor`; do not hand-tune Three.js transforms in the consumer.
- Keep material intent in `SolidMaterialSpec` and lighting/environment policy in
  the runtime or scene.

The building door is the reference interaction: the `door` layer exposes
`closed` and `open`, `door:sensor` defines proximity, `door:entry` defines the
actor anchor, and the `door` portal interaction connects them.

## Integration checklist

1. Export the new public types and factories from `src/index.ts`.
2. Register the asset in the consumer catalog rather than importing internals.
3. Extend the serializable experiment document only for authored parameters.
4. Add deterministic recipe tests and blueprint contract tests.
5. Test state validation and animation in the runtime when applicable.
6. Dispose generated resources through `SpriteRig.dispose()` or `SolidRig.dispose()`.
7. Run `pnpm verify`.
8. Inspect representative seeds in the internal browser at desktop and narrow widths.

Repository agents can follow the local `aind-asset-authoring` skill under
`.codex/skills` for the step-by-step implementation workflow.
