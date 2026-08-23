export const VEHICLE_MOTIONS = ['parked', 'drive', 'reverse', 'showcase'] as const;
export type VehicleMotionPreset = typeof VEHICLE_MOTIONS[number];
export const VEHICLE_STEERING_DIRECTIONS = ['left', 'straight', 'right'] as const;
export type VehicleSteeringDirection = typeof VEHICLE_STEERING_DIRECTIONS[number];

export type VehicleMotion = Readonly<{
  /** Cumulative signed world travel; wheel rotation is derived, never integrated. */
  travelDistance: number;
  speed?: number;
  /** Steering input in -1..1; positive turns toward vehicle-left (-Z). */
  steering?: number;
  /** Suspension character in the normalized range 0..1. */
  suspension?: number;
}>;

export type VehicleMotionState = Readonly<{
  travelDistance: number;
  speed: number;
  steering: number;
  suspension: number;
}>;

export type VehicleMotionSample = Readonly<{
  time: number;
  state: VehicleMotionState;
  wheelRotation: number;
  steeringAngle: number;
  steeringScale: number;
  chassisBounce: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Positive yaw turns the +X vehicle-forward vector toward vehicle-left (-Z). */
export function vehicleSteeringInput(
  direction: VehicleSteeringDirection,
  amount = 0.72,
): number {
  const magnitude = clamp(Math.abs(amount), 0, 1);
  return direction === 'left' ? magnitude : direction === 'right' ? -magnitude : 0;
}

function validatedState(motion: VehicleMotion): VehicleMotionState {
  const state = {
    travelDistance: motion.travelDistance,
    speed: motion.speed ?? 0,
    steering: motion.steering ?? 0,
    suspension: motion.suspension ?? 0.35,
  };
  if (!Object.values(state).every(Number.isFinite)) {
    throw new RangeError('Vehicle motion values must be finite');
  }
  if (state.speed < 0) throw new RangeError('Vehicle speed must be non-negative');
  if (Math.abs(state.steering) > 1) throw new RangeError('Vehicle steering must be between -1 and 1');
  if (state.suspension < 0 || state.suspension > 1) {
    throw new RangeError('Vehicle suspension must be between zero and one');
  }
  return Object.freeze(state);
}

export function createVehicleMotionState(
  motion: VehicleMotion = { travelDistance: 0 },
): VehicleMotionState {
  return validatedState(motion);
}

/** Reuses the previous frozen state when the command is semantically unchanged. */
export function setVehicleMotion(
  state: VehicleMotionState,
  motion: VehicleMotion,
): VehicleMotionState {
  const next = validatedState(motion);
  return next.travelDistance === state.travelDistance
    && next.speed === state.speed
    && next.steering === state.steering
    && next.suspension === state.suspension
    ? state
    : next;
}
