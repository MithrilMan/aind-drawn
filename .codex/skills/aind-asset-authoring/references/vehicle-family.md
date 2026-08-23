# Vehicle family reference

Model a car as a new `vehicle` asset family.

## Classification and folders

A car is a dedicated, multi-representation `vehicle` family: body, wheels, and
doors have independent topology and motion, while raster and solid outputs must
preserve one identity. Use:

```text
src/assets/vehicle/
├── identity/
│   ├── recipe.ts
│   └── drawing-style.ts
├── raster/
│   ├── recipe.ts
│   ├── layout.ts
│   └── blueprint.ts
├── solid/
│   ├── recipe.ts
│   ├── layout.ts
│   ├── blueprint.ts
│   └── ink-strokes.ts
└── runtime/
    └── animator.ts       # only when continuous travel is required
```

## Identity

`VehicleIdentityRecipe` persists semantic choices required to project the same
vehicle in any representation:

- body archetype, proportions, bonnet/trunk balance, and ground clearance;
- cabin position, roof line, windows, and seat count;
- wheelbase, wheel radius, tyre width, axle height, and optional spare wheel;
- door count, side, hinge placement, and entry intent;
- lights, bumpers, mirrors, optional cargo, roof rack, or tow point;
- palette roles and normalized drawing-tone intent;
- sockets such as driver seat, passenger seats, cargo, tow, and entry.

Do not put `MediumId`, `SolidFinishId`, canvas coordinates, or Three.js values
in identity. Use namespaces such as `vehicle:body`, `vehicle:cabin`,
`vehicle:wheels`, `vehicle:doors`, `vehicle:lights`, and `vehicle:details`.

## Layout

Derive a `VehicleLayout` containing:

- total bounds and ground line;
- body and cabin polygons;
- front and rear wheel centers and radii;
- door bounds and hinge positions;
- `wheel:front`, `wheel:rear`, `seat:driver`, `door:entry`, and optional cargo sockets;
- body and wheel colliders plus a door interaction sensor.

Use normalized identity intent to derive a raster layout and a solid layout.
Both preserve wheelbase ratios, hinge side, seat ordering, and socket meaning;
they do not share pixel or world-space coordinates. Never independently
recompute wheel positions inside draw callbacks or part builders.

## Raster blueprint

Recommended layers and bones:

```text
vehicle:root
├── body
├── wheel:rear
├── wheel:front
├── door:left
└── details
```

Put each wheel pivot at its center. Put the door pivot at its hinge. Keep the
door states `closed` and `open` on the door layer. A `door` portal interaction
uses `door:sensor`, `door:entry`, and a layer binding between interaction and
door states.

The body collider remains solid. Wheel colliders may be circles when the shared
collider vocabulary supports them; until then, use tested rectangles or polygons
rather than adding a one-off physics concept inside the vehicle renderer.

The raster representation recipe references identity and adds only `MediumId`
and raster drawing policy. Draw rear parts before body and front parts after it.
Keep wheels independent even if the first consumer never animates them.

## Solid blueprint

Recommended node hierarchy:

```text
vehicle:root
├── steering
├── axle:rear
│   ├── wheel:rear:left
│   └── wheel:rear:right
├── axle:front
│   ├── wheel:front:left
│   └── wheel:front:right
├── door:left
└── door:right
```

Use true volumes:

- body/cabin may be smooth meshes, superellipsoids, or authored faceted meshes;
- tyres are wraps or radial volumes, never camera-facing discs;
- windows follow cabin surfaces or occupy shallow inset volumes;
- doors own real hinge nodes and remain spatially distinct from body paint;
- lights, mirrors, racks, and cargo use semantic parts and explicit drawing applications.

The solid representation recipe references the same identity and adds only
finish/mesh policy. Place seat and entry sockets in vehicle-local 3D space.
Keep the body collider independent from wheel or interaction sensors.

## Doodle 3D

Wrap the exact solid blueprint with `createInkedSolidBlueprint` and the same
medium used by the raster comparison. The vehicle adapter maps body, tyres,
glass, and accents to generic drawing applications; the medium compiler never
learns those vehicle concepts. Add family-authored spatial strokes only for genuine
features such as panel seams, tyre grooves, window borders, light divisions, or
lifted wires.

Smooth body panels remain view-oriented; explicitly faceted panels can change
hatch flow across creases. Do not add vehicle branches to `InkedSolidScenePass`.

## Interaction and runtime

Door opening uses the shared `door` interaction contract in both raster and
solid representations. Multiple usable doors may expose separate IDs and entry
sockets such as `door:left` / `door:left:entry`.

A `VehicleAnimator` may derive wheel rotation from signed travel distance and
steering from signed turn input. Cache rest transforms and calculate rotation
from travel rather than accumulating per-frame deltas. Door state can be driven
by the rig interaction API; add continuous hinge interpolation only if a
consumer actually needs it.

## Projection Studio

Register the public `vehicle` family in `experiments/projection-studio/src/family-catalog.ts`.
Supply its authoring schema, default customization, projection factory,
declarative dynamic controls, default transient state, and runtime-motion
adapter. Do not add vehicle markup or a `familyId === 'vehicle'` branch to the
shell. Semantic controls such as body style, wheel style, doors, rack, and
spoiler come from `VehicleAuthoringSchema`; drive, reverse, steering, doors,
bonnet, and cargo controls come from the family dynamics contract. Render all
family and part previews through public vehicle factories.

## Vehicle-specific tests

In addition to the common family matrix, test:

- wheel centres, axle height, radii, and wheelbase agree across layout and parts;
- wheel and door pivots are at their physical joints;
- door sensors and entry sockets identify the same side;
- raster and solid adapters retain body archetype, door count, palette roles,
  and wheel proportions from the same identity;
- tyres occupy real depth in solid output;
- travel animation rotates front and rear wheels consistently without drift;
- optional cargo or roof-rack namespaces do not reroll wheels or doors.
