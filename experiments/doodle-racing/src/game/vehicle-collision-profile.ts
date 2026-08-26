import type { VehicleCollisionProfile } from '@mithrilman/aind-game-runtime';

import type { VehicleIdentityRecipe } from '../../../../src/index.js';

/** Maps authored vehicle proportions to the generic runtime collision capsule. */
export function createVehicleCollisionProfile(
  identity: VehicleIdentityRecipe,
): VehicleCollisionProfile {
  const halfLength = identity.dimensions.length * 0.5;
  const halfWidth = identity.dimensions.width * 0.5 + identity.wheels.width * 0.32;
  const axleInset = identity.dimensions.length * (1 - identity.wheels.wheelbaseRatio) * 0.5;
  return Object.freeze({
    halfLength,
    halfWidth,
    rearAxle: -halfLength + axleInset,
    frontAxle: halfLength - axleInset,
    wheelRadius: identity.wheels.radius,
    wheelHalfWidth: identity.wheels.width * 0.5,
    groundClearance: identity.dimensions.groundClearance,
  });
}
