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
  elevation: number;
  pitch: number;
  curbImpact: number;
  curbPenalty: number;
}>;

export type ArcadeDriveInput = Readonly<{
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
  /** Optional analogue overrides. Digital controls continue to use the booleans above. */
  steeringAxis?: number;
  throttle?: number;
  brakePressure?: number;
}>;

export type DrivingSurface = 'road' | 'off-road';

const ROAD_MAX_SPEED = 31;
const OFF_ROAD_MAX_SPEED = 16;
const DRIFT_ENTRY_SPEED = 15.5;
const DRIFT_HOLD_SPEED = 7.5;

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
    elevation: 0,
    pitch: 0,
    curbImpact: 0,
    curbPenalty: 0,
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

  const throttle = THREE.MathUtils.clamp(
    input.throttle ?? Number(input.accelerate),
    0,
    1,
  );
  const brakePressure = THREE.MathUtils.clamp(
    input.brakePressure ?? Number(input.brake),
    0,
    1,
  );
  const digitalSteering = Number(input.left) - Number(input.right);
  const rawSteering = THREE.MathUtils.clamp(input.steeringAxis ?? digitalSteering, -1, 1);

  const surfaceMaximumSpeed = surface === 'road' ? ROAD_MAX_SPEED : OFF_ROAD_MAX_SPEED;
  const curbControl = 1 - state.curbPenalty * 0.78;
  if (throttle > 0) {
    const effectiveThrottle = throttle ** 1.35;
    const forwardSpeedRatio = THREE.MathUtils.clamp(
      Math.max(0, longitudinal) / surfaceMaximumSpeed,
      0,
      1,
    );
    const driveAcceleration = longitudinal < -1
      ? 40
      : 28 * (1 - 0.72 * forwardSpeedRatio ** 1.7);
    longitudinal += driveAcceleration * effectiveThrottle * curbControl * delta;
  }
  if (brakePressure > 0) longitudinal -= (longitudinal > 1 ? 36 : 13) * brakePressure * delta;
  const aerodynamicDrag = (surface === 'road' ? 0.0082 : 0.031)
    * longitudinal * longitudinal;
  longitudinal = approach(longitudinal, 0, aerodynamicDrag * delta);
  const rollingDrag = (surface === 'road' ? 1.1 : 5.4) + state.curbPenalty * 11;
  if (throttle === 0 && brakePressure === 0) {
    longitudinal = approach(longitudinal, 0, rollingDrag * delta);
  }

  const speed = Math.abs(longitudinal);
  const highSpeedSteeringReduction = THREE.MathUtils.lerp(
    1,
    0.74,
    THREE.MathUtils.smoothstep(speed, 11, ROAD_MAX_SPEED),
  );
  const steeringTarget = Math.sign(rawSteering)
    * Math.abs(rawSteering) ** 0.82
    * highSpeedSteeringReduction;
  const reversingSteering = steeringTarget !== 0
    && state.steering !== 0
    && Math.sign(steeringTarget) !== Math.sign(state.steering);
  const steeringResponse = reversingSteering ? 22 : steeringTarget === 0 ? 17 : 12;
  const steering = THREE.MathUtils.lerp(
    state.steering,
    steeringTarget,
    1 - Math.exp(-steeringResponse * delta),
  );
  const speedFactor = THREE.MathUtils.clamp(speed / 13, 0, 1);
  const powerDriftIntent = surface === 'road'
    && speed > DRIFT_ENTRY_SPEED
    && throttle > 0.72
    && Math.abs(steering) > 0.62;
  const driftCarry = state.drifting
    && speed > DRIFT_HOLD_SPEED
    && (throttle > 0.12 || Math.abs(rawSteering) > 0.12);
  const driftIntent = input.handbrake || powerDriftIntent || driftCarry;
  const yawTarget = steering
    * Math.sign(longitudinal || 1)
    * (0.46 + speedFactor * 1.04)
    * (driftIntent ? 1.28 : 1);
  const angularVelocity = THREE.MathUtils.lerp(
    state.angularVelocity,
    yawTarget,
    1 - Math.exp(-(driftIntent ? 10.5 : 15) * delta),
  );
  const heading = state.heading + angularVelocity * delta;

  const counterSteering = state.slipAngle * rawSteering < -0.025;
  const driftGrip = input.handbrake
    ? 2.05
    : THREE.MathUtils.lerp(6.4, 2.65, throttle);
  const lateralGrip = surface === 'off-road'
    ? 4.2
    : driftIntent
      ? counterSteering ? Math.max(8.8, driftGrip) : driftGrip
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
  if (input.handbrake) nextLongitudinal *= Math.exp(-1.55 * delta);
  const maximumSpeed = surfaceMaximumSpeed * (1 - state.curbPenalty * 0.48);
  nextLongitudinal = THREE.MathUtils.clamp(nextLongitudinal, -8.5, maximumSpeed);
  const unboundedSlipAngle = Math.atan2(
    nextLateral,
    Math.max(0.25, Math.abs(nextLongitudinal)),
  );
  const driftSpeedScale = driftIntent
    ? THREE.MathUtils.lerp(
      1,
      0.84,
      THREE.MathUtils.clamp(Math.abs(unboundedSlipAngle) / 0.65, 0, 1),
    )
    : 1;
  const combinedMaximumSpeed = maximumSpeed * driftSpeedScale;
  const combinedSpeed = Math.hypot(nextLongitudinal, nextLateral);
  if (combinedSpeed > combinedMaximumSpeed) {
    const scale = combinedMaximumSpeed / combinedSpeed;
    nextLongitudinal *= scale;
    nextLateral *= scale;
  }
  const velocityX = nextForwardX * nextLongitudinal + nextRightX * nextLateral;
  const velocityZ = nextForwardZ * nextLongitudinal + nextRightZ * nextLateral;
  const slipAngle = Math.atan2(nextLateral, Math.max(0.25, Math.abs(nextLongitudinal)));
  const drifting = Math.abs(slipAngle) > 0.075 && speed > DRIFT_HOLD_SPEED && driftIntent;

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
    elevation: Math.max(0, state.elevation - 1.55 * delta),
    pitch: approach(state.pitch, 0, 2.4 * delta),
    curbImpact: state.curbImpact * Math.exp(-9 * delta),
    curbPenalty: Math.max(0, state.curbPenalty - 1.35 * delta),
  });
}

export function vehicleSpeed(state: ArcadeVehicleState): number {
  return Math.hypot(state.velocityX, state.velocityZ);
}
