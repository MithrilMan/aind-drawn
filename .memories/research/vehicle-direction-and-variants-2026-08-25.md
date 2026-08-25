# Vehicle Direction and Variants

Last updated: 2026-08-25

## Summary

Vehicle direction became ambiguous because `body.bonnetRatio`, `body.cargoRatio`, and cabin
placement were generated from independent ranges. The cabin could therefore contradict the
authored front/rear balance, especially on coupés and sedans.

## Details

- Vehicle-local front remains `+X`; raster right-side elevation maps it to the right edge.
- `cabin.startRatio` now equals `body.cargoRatio`, while `cabin.endRatio` equals
  `1 - body.bonnetRatio`. Solid hood and cargo layout consume those exact boundaries.
- Passenger archetypes keep the bonnet longer than the rear deck; pickup intentionally keeps a
  longer cargo section.
- Public archetypes are `city`, `coupe`, `sedan`, `fastback`, `roadster`, `wagon`, `suv`,
  `offroad`, `van`, and `pickup`.
- Front readability is reinforced with grille geometry and five authored headlight signatures;
  rear lights own a separate red palette role.
- `tests/vehicle.test.ts` constructs a `SolidRig` for every archetype and every headlight override.
- Projection Studio is the visual QA surface. Representative roadster, sedan, and SUV profiles
  were inspected through the public raster and Doodle 3D pipeline.

## Reuse When

Use this note when changing vehicle proportions, adding an archetype, or diagnosing a car that
appears to travel backwards despite correct runtime axes.
