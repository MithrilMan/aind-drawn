import { vehicleSpeed, type ArcadeVehicleState } from '@mithrilman/aind-game-runtime';

export type JumpRamp = Readonly<{
  id: string;
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  length: number;
  width: number;
  height: number;
  minimumLaunchSpeed: number;
}>;

export type JumpRampResult = Readonly<{
  state: ArcadeVehicleState;
  rampId: string | null;
  launched: boolean;
}>;

type RampCoordinates = Readonly<{
  along: number;
  lateral: number;
}>;

function coordinates(
  state: Pick<ArcadeVehicleState, 'x' | 'z'>,
  ramp: JumpRamp,
): RampCoordinates {
  const deltaX = state.x - ramp.x;
  const deltaZ = state.z - ramp.z;
  return Object.freeze({
    along: deltaX * ramp.tangentX + deltaZ * ramp.tangentZ,
    lateral: deltaX * ramp.normalX + deltaZ * ramp.normalZ,
  });
}

function smoothRamp(amount: number): number {
  const clamped = Math.max(0, Math.min(1, amount));
  return clamped * clamped * (3 - 2 * clamped);
}

function rampSupport(
  state: ArcadeVehicleState,
  ramp: JumpRamp,
  location: RampCoordinates,
): ArcadeVehicleState | null {
  const halfLength = ramp.length * 0.5;
  if (Math.abs(location.lateral) > ramp.width * 0.5) return null;
  if (location.along < -halfLength || location.along > halfLength) return null;
  const amount = (location.along + halfLength) / ramp.length;
  const support = ramp.height * smoothRamp(amount);
  const slope = ramp.height * 6 * amount * (1 - amount) / ramp.length;
  return Object.freeze({
    ...state,
    elevation: Math.max(state.elevation, support),
    verticalVelocity: 0,
    airborne: false,
    pitch: Math.max(state.pitch, Math.atan(slope)),
  });
}

/** Applies authored ramp support and emits one forward launch when the front edge is crossed. */
export function resolveJumpRamps(
  before: ArcadeVehicleState,
  proposed: ArcadeVehicleState,
  ramps: readonly JumpRamp[],
): JumpRampResult {
  if (before.airborne || proposed.airborne) {
    return Object.freeze({ state: proposed, rampId: null, launched: false });
  }
  let supported = proposed;
  let supportingRampId: string | null = null;
  for (const ramp of ramps) {
    const previous = coordinates(before, ramp);
    const current = coordinates(proposed, ramp);
    const halfLength = ramp.length * 0.5;
    const forwardTravel = current.along - previous.along;
    const crossesExit = previous.along < halfLength
      && current.along >= halfLength
      && forwardTravel > 1e-6;
    if (crossesExit) {
      const crossingAmount = Math.max(0, Math.min(
        1,
        (halfLength - previous.along) / forwardTravel,
      ));
      const crossingLateral = previous.lateral
        + (current.lateral - previous.lateral) * crossingAmount;
      if (
        Math.abs(crossingLateral) <= ramp.width * 0.5
        && vehicleSpeed(proposed) >= ramp.minimumLaunchSpeed
      ) {
        const launchVelocity = 3 + Math.min(31, vehicleSpeed(proposed)) * 0.015;
        return Object.freeze({
          state: Object.freeze({
            ...proposed,
            elevation: Math.max(proposed.elevation, ramp.height),
            verticalVelocity: launchVelocity,
            airborne: true,
            pitch: Math.max(proposed.pitch, Math.atan2(ramp.height, ramp.length * 0.44)),
            drifting: false,
          }),
          rampId: ramp.id,
          launched: true,
        });
      }
    }
    const candidate = rampSupport(supported, ramp, current);
    if (candidate === null || candidate.elevation <= supported.elevation) continue;
    supported = candidate;
    supportingRampId = ramp.id;
  }
  return Object.freeze({
    state: supported,
    rampId: supportingRampId,
    launched: false,
  });
}
