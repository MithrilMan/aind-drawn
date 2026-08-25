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
- palette roles and normalized drawing-value/gesture intent;
- sockets such as driver seat, passenger seats, cargo, tow, and entry.

Do not put `MediumId`, `RasterHand`, art direction, physical substrate/finish,
canvas coordinates, or Three.js values in identity. Use namespaces such as
`vehicle:body`, `vehicle:cabin`,
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

The raster representation recipe references identity and adds `MediumId`, art
direction, and raster drawing policy. A custom `RasterHand` remains scoped to
the consuming bake, cache, audit, or rig. Draw rear parts before body and front parts after it.
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

A canonical side silhouette is not a transverse cabin model. Define an identity-adjacent
cross-section for belt width, roof width, taper, and overhang, then make the cabin, roof, door
glass, and roof-mounted details consume it. Never obtain a cabin by extruding its elevation at a
constant fraction of total vehicle width: that produces vertical slab sides, an oversized roof,
and door glass that cannot sit on the carrier surface.

Give every visible surface one owner. When the roof owns the upper skin, omit the coincident top
face from the glass cabin instead of stacking two coplanar carriers and hoping the depth buffer
chooses politely. Use an authored clearance only where two distinct physical skins genuinely sit
proud of each other. Build hard-surface bands from explicit non-degenerate triangles or quads;
do not rely on a concave or collinear n-gon that renderer or validator fan triangulation can split
into zero-area triangles.

An articulated door owns its complete visible glazing assembly: panel glass, optional frame,
handle, and authored marks all move with the hinge node. The fixed cabin may own the windscreen,
rear glass, pillars, and a real recessed opening, but it must not place a visible glass or interior
plate across the door-window aperture. Tessellate fixed cabin side glass around that aperture so
opening the door reveals an actual void rather than a stationary duplicate pane.

Normalize generated door and window profiles before solid tessellation. Remove consecutive
control points and transverse levels that would create sub-threshold edges after thickness is
applied. Preserve the profile endpoints and identity shape, and use a scale-aware minimum rather
than a seed-specific coordinate exception.

The solid representation recipe references the same identity and adds only
art direction, physical substrate/finish, and mesh policy. Its parts reference
`SemanticSurfaceSpec` values through `surfaceId`. Place seat and entry sockets
in vehicle-local 3D space. Keep the body collider independent from wheel or interaction sensors.

## Doodle 3D

Wrap the exact solid blueprint with `createInkedSolidBlueprint` and the same
medium used by the raster comparison. The vehicle adapter maps body, tyres,
glass, and accents to generic drawing applications and explicit `ArtRole`
bindings by `semanticPartId`; the medium compiler never learns those vehicle
concepts. Add family-authored spatial strokes only for genuine
features such as panel seams, tyre grooves, window divisions or seals, light divisions,
or lifted wires.

Do not add a closed semantic stroke around a window merely to reinforce the boundary of its
existing solid carrier. The generic contour pass already owns that geometric border; duplicating
it produces a detached or doubled frame when the door moves. A window stroke is justified only
for an internal division, seal, or other authored mark not represented by carrier topology.

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
- art-direction changes preserve vehicle identity, geometry, sockets, colliders,
  interaction bindings, and articulated topology across all projections;
- physical substrate and finish affect smooth solid but not Doodle deposition;
- a renderer-scoped raster hand cannot alter another vehicle rig;
- tyres occupy real depth in solid output;
- cabin belt and roof widths remain within authored cross-section ranges for every archetype;
- roof and cabin carriers have no coplanar duplicate surface and roof faces are explicit,
  non-degenerate polygons;
- representative seeds plus every authoring override construct a validated `SolidRig`, not merely
  an unchecked blueprint;
- generated door and window profiles contain no near-coincident consecutive points or levels that
  can collapse into degenerate side faces;
- the centre of every articulated door-window aperture is not covered by a fixed cabin face, while
  the surrounding windscreen, pillars, and rear glass remain present;
- geometric window contours are not duplicated by closed semantic strokes;
- travel animation rotates front and rear wheels consistently without drift;
- optional cargo or roof-rack namespaces do not reroll wheels or doors.
