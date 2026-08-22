import type { Point } from '../../../core/geometry.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleCabinSideProfile = Readonly<{
  bodyBottom: number;
  beltHeight: number;
  roofHeight: number;
  /** Monotonic rear-to-front profile in vehicle-local coordinates. */
  outline: readonly Point[];
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

/**
 * Defines the shared side silhouette used by every vehicle projection.
 * Runs are relative to the available cabin span, so short coupe and pickup
 * cabins cannot fold their roof vertices over one another.
 */
export function createVehicleCabinSideProfile(
  identity: VehicleIdentityRecipe,
): VehicleCabinSideProfile {
  const { length, height, groundClearance } = identity.dimensions;
  const bodyBottom = Math.max(groundClearance, identity.wheels.radius * 0.58);
  const beltHeight = bodyBottom + (height - bodyBottom) * identity.body.beltHeightRatio;
  const roofHeight = bodyBottom + (height - bodyBottom) * identity.cabin.roofHeightRatio;
  const rearX = -length * 0.5 + identity.cabin.startRatio * length;
  const frontX = -length * 0.5 + identity.cabin.endRatio * length;
  const span = frontX - rearX;
  let rearRun = clamp(span * 0.25 / identity.cabin.rearSlope, span * 0.19, span * 0.36);
  let frontRun = clamp(span * 0.28 / identity.cabin.windscreenSlope, span * 0.21, span * 0.38);
  const maximumCombinedRun = span * 0.74;
  if (rearRun + frontRun > maximumCombinedRun) {
    const scale = maximumCombinedRun / (rearRun + frontRun);
    rearRun *= scale;
    frontRun *= scale;
  }
  const shoulderHeight = beltHeight + (roofHeight - beltHeight) * 0.88;
  return Object.freeze({
    bodyBottom,
    beltHeight,
    roofHeight,
    outline: freezePoints([
      [rearX, beltHeight],
      [rearX + rearRun * 0.56, shoulderHeight],
      [rearX + rearRun, roofHeight],
      [frontX - frontRun, roofHeight],
      [frontX - frontRun * 0.56, shoulderHeight],
      [frontX, beltHeight],
    ]),
  });
}
