import type { VehicleIdentityRecipe } from '../identity/recipe.js';
import type { VehicleMotionSample, VehicleMotionState } from './motion.js';

/** Pure vehicle kinematics evaluated from cumulative travel and absolute time. */
export function sampleVehicleMotion(
  identity: VehicleIdentityRecipe,
  state: VehicleMotionState,
  time: number,
): VehicleMotionSample {
  if (!(time >= 0) || !Number.isFinite(time)) {
    throw new RangeError('Vehicle sample time must be a non-negative finite number');
  }
  const steeringAngle = state.steering * 0.48;
  const bounce = Math.sin(time * (2.2 + state.speed * 3.4))
    * state.suspension
    * (0.012 + Math.min(1.5, state.speed) * 0.026);
  return Object.freeze({
    time,
    state,
    wheelRotation: -state.travelDistance / identity.wheels.radius,
    steeringAngle,
    steeringScale: 1 - Math.abs(steeringAngle) * 0.08,
    chassisBounce: bounce,
  });
}
