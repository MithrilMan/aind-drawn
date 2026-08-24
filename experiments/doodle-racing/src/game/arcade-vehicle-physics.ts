import * as THREE from 'three';

export type ArcadeVehicleState = Readonly<{
  x: number;
  z: number;
  heading: number;
  velocityX: number;
  velocityZ: number;
  angularVelocity: number;
  steering: number;
  travelDistance: number;
  slipAngle: number;
  drifting: boolean;
  impact: number;
}>;

export type ArcadeDriveInput = Readonly<{
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}>;

export type DrivingSurface = 'road' | 'off-road';

const ROAD_MAX_SPEED = 31;
const OFF_ROAD_MAX_SPEED = 16;

function approach(value: number, target: number, speed: number): number {
  if (Math.abs(target - value) <= speed) return target;
  return value + Math.sign(target - value) * speed;
}

export function createArcadeVehicleState(
  x: number,
  z: number,
  heading: number,
): ArcadeVehicleState {
  return Object.freeze({
    x,
    z,
    heading,
    velocityX: 0,
    velocityZ: 0,
    angularVelocity: 0,
    steering: 0,
    travelDistance: 0,
    slipAngle: 0,
    drifting: false,
    impact: 0,
  });
}

export function stepArcadeVehicle(
  state: ArcadeVehicleState,
  input: ArcadeDriveInput,
  surface: DrivingSurface,
  deltaSeconds: number,
): ArcadeVehicleState {
  const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05);
  const forwardX = Math.cos(state.heading);
  const forwardZ = -Math.sin(state.heading);
  const rightX = Math.sin(state.heading);
  const rightZ = Math.cos(state.heading);
  let longitudinal = state.velocityX * forwardX + state.velocityZ * forwardZ;
  const lateral = state.velocityX * rightX + state.velocityZ * rightZ;

  if (input.accelerate) longitudinal += (longitudinal < -1 ? 40 : 28) * delta;
  if (input.brake) longitudinal -= (longitudinal > 1 ? 36 : 13) * delta;
  const rollingDrag = surface === 'road' ? 1.1 : 5.4;
  if (!input.accelerate && !input.brake) longitudinal = approach(longitudinal, 0, rollingDrag * delta);

  const steeringTarget = Number(input.left) - Number(input.right);
  const steering = THREE.MathUtils.lerp(
    state.steering,
    steeringTarget,
    1 - Math.exp(-13 * delta),
  );
  const speed = Math.abs(longitudinal);
  const speedFactor = THREE.MathUtils.clamp(speed / 13, 0, 1);
  const driftIntent = input.handbrake;
  const yawTarget = steering
    * Math.sign(longitudinal || 1)
    * (0.42 + speedFactor * 1.08)
    * (input.handbrake ? 1.32 : 1);
  const angularVelocity = THREE.MathUtils.lerp(
    state.angularVelocity,
    yawTarget,
    1 - Math.exp(-(driftIntent ? 9.5 : 15) * delta),
  );
  const heading = state.heading + angularVelocity * delta;

  const lateralGrip = surface === 'off-road'
    ? 4.2
    : input.handbrake
      ? 2.15
      : 16.5;
  const nextForwardX = Math.cos(heading);
  const nextForwardZ = -Math.sin(heading);
  const nextRightX = Math.sin(heading);
  const nextRightZ = Math.cos(heading);
  const freeVelocityX = forwardX * longitudinal + rightX * lateral;
  const freeVelocityZ = forwardZ * longitudinal + rightZ * lateral;
  let nextLongitudinal = freeVelocityX * nextForwardX + freeVelocityZ * nextForwardZ;
  let nextLateral = freeVelocityX * nextRightX + freeVelocityZ * nextRightZ;
  nextLateral *= Math.exp(-lateralGrip * delta);
  if (input.handbrake) nextLongitudinal *= Math.exp(-1.75 * delta);
  const maximumSpeed = surface === 'road' ? ROAD_MAX_SPEED : OFF_ROAD_MAX_SPEED;
  nextLongitudinal = THREE.MathUtils.clamp(nextLongitudinal, -8.5, maximumSpeed);
  const velocityX = nextForwardX * nextLongitudinal + nextRightX * nextLateral;
  const velocityZ = nextForwardZ * nextLongitudinal + nextRightZ * nextLateral;
  const slipAngle = Math.atan2(nextLateral, Math.max(0.25, Math.abs(nextLongitudinal)));
  const drifting = Math.abs(slipAngle) > 0.085 && speed > 8.5 && driftIntent;

  return Object.freeze({
    x: state.x + velocityX * delta,
    z: state.z + velocityZ * delta,
    heading,
    velocityX,
    velocityZ,
    angularVelocity,
    steering,
    travelDistance: state.travelDistance + nextLongitudinal * delta,
    slipAngle,
    drifting,
    impact: state.impact * Math.exp(-5.5 * delta),
  });
}

export function vehicleSpeed(state: ArcadeVehicleState): number {
  return Math.hypot(state.velocityX, state.velocityZ);
}
