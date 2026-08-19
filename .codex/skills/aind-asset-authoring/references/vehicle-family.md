# Vehicle family reference

Model a car as a new `vehicle` asset family.

## Recipe

`VehicleRecipe` should persist the semantic choices required to reconstruct the
same vehicle:

- body style and proportions;
- cabin position and roof line;
- wheelbase, wheel radius, and track height;
- door count and hinge side;
- lights, bumpers, optional cargo or roof rack;
- palette, medium, and tone strategy.

Use independent namespaces such as `vehicle:body`, `vehicle:cabin`,
`vehicle:wheels`, `vehicle:doors`, and `vehicle:details`.

## Layout

Derive a `VehicleLayout` containing:

- total bounds and ground line;
- body and cabin polygons;
- front and rear wheel centers and radii;
- door bounds and hinge positions;
- `wheel:front`, `wheel:rear`, `seat:driver`, `door:entry`, and optional cargo sockets;
- body and wheel colliders plus a door interaction sensor.

Do not independently recompute wheel positions inside draw callbacks.

## Blueprint

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

## Runtime

A `VehicleAnimator` may rotate wheel bones from signed travel distance. Door
opening can be driven by `SpriteRig.setInteractionState('door', 'open')`; only
add continuous hinge animation if a consumer actually needs interpolation.

## Playground

Add a `vehicle:car` catalog entry. Expose semantic controls such as body style,
door state, and optional details. Width and height remain scene transforms unless
the user explicitly requests regeneration of body proportions.
