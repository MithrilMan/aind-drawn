# Interactions and motion

Read this reference when parts change state, move independently, or expose
gameplay actions. Identity describes what the asset is. Interaction state and
animation describe what it is doing now.

## Model state before drawing it

For every interaction, define:

- stable interaction ID and semantic kind (`toggle` or `portal` currently);
- complete state vocabulary;
- initial state;
- sensor collider identifying where activation is possible;
- activation socket identifying where an actor or tool approaches;
- affected raster layers or solid nodes;
- one complete binding for every state.

A visible door without a sensor and entry socket is decoration. A sensor whose
state is hard-coded in an experiment is a demo hack. Keep semantic intent in the
identity-adjacent `AssetSemanticManifest`; blueprints add only projection bindings.

## Raster states

Each stateful `LayerDefinition` lists every supported state. Its draw callback
receives `state` and renders that exact variant. The shared `InteractionSpec`
defines domain state; `RasterInteractionBinding` maps it to layer state:

```text
interaction: door
states: closed, open
sensor: door:sensor
activation socket: door:entry
binding: door layer -> { closed: closed, open: open }
```

Use one layer when the same physical part changes appearance. Use separate
layers when parts have independent order, visibility, or pivots. Do not rebuild
the blueprint to toggle state; `SpriteRig.setInteractionState` applies it.

Validate that:

- the sensor exists and has `kind: 'sensor'`;
- the activation socket exists;
- every bound layer exists;
- every interaction state maps to a state declared by that layer.

## Solid states

Place the node origin at the physical joint. A door node belongs at its hinge,
a wheel node at its axle, and a lid node along its opening edge.

`SolidInteractionBinding` maps each shared interaction state to a serialisable
`SolidNodeState` containing optional translation, rotation, and scale. The state
transform is relative to the node's authored rest transform. Apply state through
`SolidRig.setInteractionState`; never replace meshes or mutate geometry.

Validate the same sensor/socket invariants as raster plus:

- every bound node exists;
- every state has a transform entry for every binding;
- the initial state is present;
- applying one state and returning to another does not accumulate transforms.

Raster and solid adapters of one identity reference the exact same manifest and
interaction specs. Coordinates and bindings differ by representation; IDs,
states, sensor intent, socket intent, and semantic part ownership do not. Verify
complete projection pairs with `validateAssetBlueprintParity`.

## Transient animation

Create a runtime animator only for time-dependent motion that is not immutable
identity or a discrete interaction state. Examples include locomotion,
breathing, gaze, wheel rotation from travel, a swaying branch, or interpolated
hinge motion requested by a consumer.

Animator rules:

- accept an existing rig; never regenerate recipes or geometry;
- cache rest transforms and reset targets before applying each update;
- calculate transforms from elapsed state, not by accumulating frame deltas;
- target semantic bone/node/part IDs;
- keep motion options separate from the recipe;
- preserve attachment of children and ink strokes through parent transforms;
- make automatic behaviours such as blink or gaze explicitly configurable for
  deterministic tests and editor previews.
- make state setters idempotent: assigning the current expression, pose request,
  or interaction state again must not restart a blink, blend, one-shot effect,
  or random schedule. Consumers may defensively avoid redundant commands, but
  the runtime contract must remain safe when they do not.

When an animator needs authored per-layer or per-part metadata, publish it as a
namespaced `AssetCapability` owned by the family. Keep the payload type,
constructor, and reader beside that family, and let its animator consume the
reader. Generic `LayerDefinition`, `SolidPartDefinition`, `SpriteRig`, and
`SolidRig` must not acquire family-specific motion unions or switch on those
capability IDs.

Do not create a bespoke animator merely to switch `open` and `closed`; the
interaction contract already does that. Add interpolation only when continuous
motion is an actual requirement.

## Runtime instances and composition

Keep deterministic content identity and mutable runtime identity separate.
`assetId` belongs to the immutable blueprint; `instanceId`, world pose,
interaction states, and playback time belong to one rig instance. Supply an
explicit instance ID whenever a scene will persist or exchange state. Generated
IDs are process-local only.

Use `getInstanceState()` for frozen serialisable snapshots and `setWorldPose()`
for root movement. Never copy runtime state into an identity, recipe, blueprint,
or shared semantic manifest. Two rigs created from the same blueprint must be
able to diverge in interaction state and playback time without cloning or
mutating authored data.

Use `AssetComposition` only when a consumer benefits from its narrow policy:

- deterministic parent-before-child updates;
- same-dimension socket attachments;
- complete back-to-front raster draw ordering;
- explicit `owned` or `borrowed` disposal responsibility;
- renderer-neutral state snapshots.

Do not add physics, navigation, gameplay rules, ECS storage, or persistence to
the composition layer. Shared GPU caches require reference-counted leases and
measured benefit; immutable blueprints may be shared directly.

## Shared motion vocabulary

Share a domain motion contract when raster and solid representations need to
mirror the same intent. Character `idle`, `walk`, `run`, `airborne`, `sit`,
`sleep`, and `play` are the current example. Project one shared temporal pose
blend into every representation: pose weights, easing, and transition duration
are domain motion, not renderer policy. Each adapter converts those weights to
its own transforms while preserving pose meaning.

Planar layer order can hide overlap that becomes a real mesh penetration in a
solid projection. When a gesture crosses a torso or other carrier silhouette,
rotate the solid part around its physical joint into the foreground volume;
do not translate the joint, flatten the mesh, or let the limb tunnel through
the carrier. Derive clearance from authored geometry where a fixed offset is
needed.

Do not generalise character gait concepts into unrelated families. Vehicles
may use signed travel and steering; machinery may use cycle phase and load.

Transient secondary effects follow the same rule. Model their semantic
components and normalized motion in shared identity-adjacent profiles before
projecting them. Keep an attached stream, tether, smoke source, or spark emitter
on its socket; animate free drops, beads, particles, or wisps independently.
Adapters convert shared offsets and travel into their local units. They do not
collapse the effect into one texture or mesh and translate the attachment away
from its source.

Facial expressions use the same rule. Define one representation-neutral
profile for eye openness, eye scale, brow lift, and brow inner-end raise. Use
visible semantics rather than renderer signs: a positive inner raise lifts both
ends nearest the nose. Each adapter converts that value to its own local
rotation convention. Never keep a raster expression table and a solid
expression table in separate animators.

An eyebrow may approach or overlap the outer eye boundary as a caricature, but
must not pass through the pupil as an intersecting beam. Keep the brow centre
clear of pupil geometry. Use shared eye openness or an explicitly authored
upper eyelid when the expression needs to cover the eye.

## Tests

Add runtime tests proving:

- all declared states are accepted and unknown states are rejected;
- visual layers or solid nodes receive the intended state;
- pivots remain fixed while parts rotate around them;
- repeated updates do not drift from rest transforms;
- repeated assignment of the current state does not restart transient motion;
- parent motion carries child parts and owned spatial strokes;
- automatic motion can be disabled for deterministic inspection;
- the first update after a pose change is intermediate and the shared blend
  converges without snapping in both raster and solid runtimes;
- limbs intended to cross a planar silhouette remain in front of the solid
  carrier volume rather than intersecting it;
- raster and solid facial adapters preserve the same inner-brow direction and
  eye openness for representative expressions;
- attached effect components stay on their source while free components move
  with deterministic, projection-equivalent phase and travel;
- an extreme expressive seed keeps eyebrow geometry clear of the pupil;
- disposing the rig or stroke rig releases and detaches owned resources.
