import type { Point } from '../../../core/geometry.js';
import { createVehicleCabinSideProfile } from './geometry.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleBodySideSection = Readonly<{
  bodyHeight: number;
  sideHalfWidth: number;
  ridgeHalfWidth: number;
  samples: readonly Point[];
}>;

export function createVehicleBodySideSection(
  identity: VehicleIdentityRecipe,
): VehicleBodySideSection {
  const cabin = createVehicleCabinSideProfile(identity);
  const bodyHeight = Math.max(
    identity.wheels.radius * 0.95,
    cabin.beltHeight - cabin.bodyBottom,
  );
  const sideHalfWidth = identity.dimensions.width * 0.5;
  const roundness = Math.max(
    0,
    Math.min(1, (identity.body.cornerRoundness - 0.72) / 0.46),
  );
  const ridgeHalfWidth = sideHalfWidth * (0.7 + roundness * 0.08);
  const bottom = cabin.bodyBottom - bodyHeight * 0.035;
  const lowerSide = cabin.bodyBottom + bodyHeight * 0.18;
  const shoulder = cabin.bodyBottom + bodyHeight * 0.7;
  return Object.freeze({
    bodyHeight,
    sideHalfWidth,
    ridgeHalfWidth,
    samples: Object.freeze([
      Object.freeze([bottom, sideHalfWidth * 0.84] as const),
      Object.freeze([lowerSide, sideHalfWidth] as const),
      Object.freeze([shoulder, sideHalfWidth] as const),
      Object.freeze([cabin.beltHeight, ridgeHalfWidth] as const),
    ]),
  });
}

export function vehicleBodyHalfWidthAt(
  section: VehicleBodySideSection,
  y: number,
): number {
  const first = section.samples[0] as Point;
  const last = section.samples[section.samples.length - 1] as Point;
  if (y <= first[0]) return first[1];
  if (y >= last[0]) return last[1];
  for (let index = 1; index < section.samples.length; index += 1) {
    const start = section.samples[index - 1] as Point;
    const end = section.samples[index] as Point;
    if (y > end[0]) continue;
    const amount = (y - start[0]) / Math.max(1e-9, end[0] - start[0]);
    return start[1] + (end[1] - start[1]) * amount;
  }
  return last[1];
}
