import * as THREE from 'three';

import type { VehicleIdentityRecipe } from '../../../../src/index.js';
import type { ArcadeVehicleState } from './arcade-vehicle-physics.js';
import type { RaceObstacle, SegmentObstacle } from './race-world.js';

export type VehicleCollisionProfile = Readonly<{
  halfLength: number;
  halfWidth: number;
  frontAxle: number;
  rearAxle: number;
  wheelRadius: number;
  groundClearance: number;
}>;

export type CollisionResult = Readonly<{
  state: ArcadeVehicleState;
  obstacleId: string | null;
  severity: number;
}>;

type Point = Readonly<{ x: number; z: number }>;
type SegmentPair = Readonly<{ first: Point; second: Point }>;
type Contact = Readonly<{
  state: ArcadeVehicleState;
  normalX: number;
  normalZ: number;
  penetration: number;
}>;

const SWEEP_SPACING = 0.12;
const CONTACT_MARGIN = 0.015;

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
    groundClearance: identity.dimensions.groundClearance,
  });
}

function vehicleSegment(
  state: Pick<ArcadeVehicleState, 'x' | 'z' | 'heading'>,
  profile: VehicleCollisionProfile,
): SegmentPair {
  const forwardX = Math.cos(state.heading);
  const forwardZ = -Math.sin(state.heading);
  const extent = Math.max(0, profile.halfLength - profile.halfWidth);
  return Object.freeze({
    first: Object.freeze({
      x: state.x - forwardX * extent,
      z: state.z - forwardZ * extent,
    }),
    second: Object.freeze({
      x: state.x + forwardX * extent,
      z: state.z + forwardZ * extent,
    }),
  });
}

function closestOnSegment(point: Point, segment: SegmentPair): Point {
  const deltaX = segment.second.x - segment.first.x;
  const deltaZ = segment.second.z - segment.first.z;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const amount = THREE.MathUtils.clamp(
    ((point.x - segment.first.x) * deltaX + (point.z - segment.first.z) * deltaZ)
      / Math.max(1e-9, lengthSquared),
    0,
    1,
  );
  return Object.freeze({
    x: segment.first.x + deltaX * amount,
    z: segment.first.z + deltaZ * amount,
  });
}

function squaredDistance(first: Point, second: Point): number {
  const deltaX = first.x - second.x;
  const deltaZ = first.z - second.z;
  return deltaX * deltaX + deltaZ * deltaZ;
}

function crossedSegments(first: SegmentPair, second: SegmentPair): Point | null {
  const firstX = first.second.x - first.first.x;
  const firstZ = first.second.z - first.first.z;
  const secondX = second.second.x - second.first.x;
  const secondZ = second.second.z - second.first.z;
  const denominator = firstX * secondZ - firstZ * secondX;
  if (Math.abs(denominator) < 1e-9) return null;
  const offsetX = second.first.x - first.first.x;
  const offsetZ = second.first.z - first.first.z;
  const firstAmount = (offsetX * secondZ - offsetZ * secondX) / denominator;
  const secondAmount = (offsetX * firstZ - offsetZ * firstX) / denominator;
  if (firstAmount < 0 || firstAmount > 1 || secondAmount < 0 || secondAmount > 1) return null;
  return Object.freeze({
    x: first.first.x + firstX * firstAmount,
    z: first.first.z + firstZ * firstAmount,
  });
}

function closestBetweenSegments(first: SegmentPair, second: SegmentPair): Readonly<{
  first: Point;
  second: Point;
}> {
  const crossing = crossedSegments(first, second);
  if (crossing !== null) return Object.freeze({ first: crossing, second: crossing });
  const candidates = [
    Object.freeze({ first: first.first, second: closestOnSegment(first.first, second) }),
    Object.freeze({ first: first.second, second: closestOnSegment(first.second, second) }),
    Object.freeze({ first: closestOnSegment(second.first, first), second: second.first }),
    Object.freeze({ first: closestOnSegment(second.second, first), second: second.second }),
  ];
  let closest = candidates[0] as (typeof candidates)[number];
  let minimum = squaredDistance(closest.first, closest.second);
  for (const candidate of candidates.slice(1)) {
    const distance = squaredDistance(candidate.first, candidate.second);
    if (distance >= minimum) continue;
    closest = candidate;
    minimum = distance;
  }
  return closest;
}

function fallbackNormal(
  state: ArcadeVehicleState,
  obstacle: SegmentObstacle,
): Readonly<{ x: number; z: number }> {
  const deltaX = obstacle.endX - obstacle.startX;
  const deltaZ = obstacle.endZ - obstacle.startZ;
  const length = Math.max(1e-9, Math.hypot(deltaX, deltaZ));
  let x = -deltaZ / length;
  let z = deltaX / length;
  const centreX = (obstacle.startX + obstacle.endX) * 0.5;
  const centreZ = (obstacle.startZ + obstacle.endZ) * 0.5;
  const side = (state.x - centreX) * x + (state.z - centreZ) * z;
  if (side < 0 || (Math.abs(side) < 1e-9 && state.velocityX * x + state.velocityZ * z > 0)) {
    x = -x;
    z = -z;
  }
  return Object.freeze({ x, z });
}

function contactAt(
  state: ArcadeVehicleState,
  obstacle: RaceObstacle,
  profile: VehicleCollisionProfile,
): Contact | null {
  const footprint = vehicleSegment(state, profile);
  let vehiclePoint: Point;
  let obstaclePoint: Point;
  let minimum: number;
  if (obstacle.kind === 'barrier') {
    const pair = closestBetweenSegments(footprint, Object.freeze({
      first: Object.freeze({ x: obstacle.startX, z: obstacle.startZ }),
      second: Object.freeze({ x: obstacle.endX, z: obstacle.endZ }),
    }));
    vehiclePoint = pair.first;
    obstaclePoint = pair.second;
    minimum = profile.halfWidth + obstacle.radius;
  } else {
    obstaclePoint = Object.freeze({ x: obstacle.x, z: obstacle.z });
    vehiclePoint = closestOnSegment(obstaclePoint, footprint);
    minimum = profile.halfWidth + obstacle.radius;
  }
  const offsetX = vehiclePoint.x - obstaclePoint.x;
  const offsetZ = vehiclePoint.z - obstaclePoint.z;
  const distance = Math.hypot(offsetX, offsetZ);
  if (distance >= minimum) return null;
  if (distance > 1e-7) {
    return Object.freeze({
      state,
      normalX: offsetX / distance,
      normalZ: offsetZ / distance,
      penetration: minimum - distance,
    });
  }
  const fallback = obstacle.kind === 'barrier'
    ? fallbackNormal(state, obstacle)
    : (() => {
      const speed = Math.hypot(state.velocityX, state.velocityZ);
      return speed > 1e-7
        ? Object.freeze({ x: -state.velocityX / speed, z: -state.velocityZ / speed })
        : Object.freeze({ x: 1, z: 0 });
    })();
  return Object.freeze({
    state,
    normalX: fallback.x,
    normalZ: fallback.z,
    penetration: minimum,
  });
}

function interpolatedState(
  before: ArcadeVehicleState,
  after: ArcadeVehicleState,
  amount: number,
): ArcadeVehicleState {
  const headingDelta = THREE.MathUtils.euclideanModulo(
    after.heading - before.heading + Math.PI,
    Math.PI * 2,
  ) - Math.PI;
  return Object.freeze({
    ...after,
    x: THREE.MathUtils.lerp(before.x, after.x, amount),
    z: THREE.MathUtils.lerp(before.z, after.z, amount),
    heading: before.heading + headingDelta * amount,
  });
}

function sweepSteps(
  before: ArcadeVehicleState,
  after: ArcadeVehicleState,
  profile: VehicleCollisionProfile,
): number {
  const translation = Math.hypot(after.x - before.x, after.z - before.z);
  const headingDelta = Math.abs(THREE.MathUtils.euclideanModulo(
    after.heading - before.heading + Math.PI,
    Math.PI * 2,
  ) - Math.PI);
  return THREE.MathUtils.clamp(
    Math.ceil((translation + headingDelta * profile.halfLength) / SWEEP_SPACING),
    1,
    24,
  );
}

function sweptContact(
  before: ArcadeVehicleState,
  after: ArcadeVehicleState,
  obstacle: RaceObstacle,
  profile: VehicleCollisionProfile,
): Contact | null {
  const steps = sweepSteps(before, after, profile);
  for (let index = 0; index <= steps; index += 1) {
    const state = interpolatedState(before, after, index / steps);
    const contact = contactAt(state, obstacle, profile);
    if (contact !== null) return contact;
  }
  return null;
}

function couldReachObstacle(
  before: ArcadeVehicleState,
  after: ArcadeVehicleState,
  obstacle: RaceObstacle,
  profile: VehicleCollisionProfile,
): boolean {
  const minimumX = Math.min(before.x, after.x) - profile.halfLength;
  const maximumX = Math.max(before.x, after.x) + profile.halfLength;
  const minimumZ = Math.min(before.z, after.z) - profile.halfLength;
  const maximumZ = Math.max(before.z, after.z) + profile.halfLength;
  if (obstacle.kind === 'barrier') {
    return Math.max(obstacle.startX, obstacle.endX) + obstacle.radius >= minimumX
      && Math.min(obstacle.startX, obstacle.endX) - obstacle.radius <= maximumX
      && Math.max(obstacle.startZ, obstacle.endZ) + obstacle.radius >= minimumZ
      && Math.min(obstacle.startZ, obstacle.endZ) - obstacle.radius <= maximumZ;
  }
  return obstacle.x + obstacle.radius >= minimumX
    && obstacle.x - obstacle.radius <= maximumX
    && obstacle.z + obstacle.radius >= minimumZ
    && obstacle.z - obstacle.radius <= maximumZ;
}

function distanceToBarrier(point: Point, obstacle: SegmentObstacle): number {
  const closest = closestOnSegment(point, Object.freeze({
    first: Object.freeze({ x: obstacle.startX, z: obstacle.startZ }),
    second: Object.freeze({ x: obstacle.endX, z: obstacle.endZ }),
  }));
  return Math.hypot(point.x - closest.x, point.z - closest.z);
}

function axleSupport(
  state: ArcadeVehicleState,
  obstacle: SegmentObstacle,
  axleOffset: number,
  wheelRadius: number,
): number {
  const point = Object.freeze({
    x: state.x + Math.cos(state.heading) * axleOffset,
    z: state.z - Math.sin(state.heading) * axleOffset,
  });
  const climbReach = Math.sqrt(Math.max(
    0,
    2 * wheelRadius * obstacle.height - obstacle.height * obstacle.height,
  ));
  const distance = Math.max(0, distanceToBarrier(point, obstacle) - obstacle.radius);
  if (climbReach < 1e-6 || distance >= climbReach) return 0;
  const progress = THREE.MathUtils.smoothstep(1 - distance / climbReach, 0, 1);
  return obstacle.height * progress;
}

function climbSupport(
  before: ArcadeVehicleState,
  after: ArcadeVehicleState,
  obstacle: SegmentObstacle,
  profile: VehicleCollisionProfile,
): Readonly<{
  elevation: number;
  pitch: number;
  entryState: ArcadeVehicleState | null;
}> {
  const steps = sweepSteps(before, after, profile);
  let best: Readonly<{ elevation: number; pitch: number }> = Object.freeze({
    elevation: 0,
    pitch: 0,
  });
  let entryState: ArcadeVehicleState | null = null;
  let maximumAxleSupport = 0;
  for (let index = 0; index <= steps; index += 1) {
    const state = interpolatedState(before, after, index / steps);
    const front = axleSupport(state, obstacle, profile.frontAxle, profile.wheelRadius);
    const rear = axleSupport(state, obstacle, profile.rearAxle, profile.wheelRadius);
    const candidateMaximum = Math.max(front, rear);
    if (entryState === null && candidateMaximum > 0) entryState = state;
    if (candidateMaximum <= maximumAxleSupport) continue;
    maximumAxleSupport = candidateMaximum;
    best = Object.freeze({
      elevation: (front + rear) * 0.5,
      pitch: Math.atan2(front - rear, profile.frontAxle - profile.rearAxle),
    });
  }
  return Object.freeze({ ...best, entryState });
}

function canClimb(
  before: ArcadeVehicleState,
  obstacle: SegmentObstacle,
  contact: Contact,
  profile: VehicleCollisionProfile,
): boolean {
  if (obstacle.height > profile.wheelRadius * 1.05) return false;
  if (obstacle.height <= profile.groundClearance + 0.04) return true;
  if (before.elevation >= obstacle.height * 0.2) return true;
  const inwardSpeed = -(
    contact.state.velocityX * contact.normalX + contact.state.velocityZ * contact.normalZ
  );
  const heightRatio = obstacle.height / profile.wheelRadius;
  const requiredSpeed = 1.2 + Math.max(0, heightRatio - 0.35) * 8.5;
  return inwardSpeed >= requiredSpeed;
}

export function resolveObstacleCollisions(
  before: ArcadeVehicleState,
  proposed: ArcadeVehicleState,
  obstacles: readonly RaceObstacle[],
  profile: VehicleCollisionProfile,
): CollisionResult {
  let current = proposed;
  let obstacleId: string | null = null;
  let maximumSeverity = 0;
  for (const obstacle of obstacles) {
    if (!couldReachObstacle(before, current, obstacle, profile)) continue;
    const contact = sweptContact(before, current, obstacle, profile);
    if (contact === null) continue;
    if (obstacle.kind === 'barrier' && canClimb(before, obstacle, contact, profile)) {
      const support = climbSupport(before, current, obstacle, profile);
      const inwardVelocity = current.velocityX * contact.normalX
        + current.velocityZ * contact.normalZ;
      const normalImpactSpeed = Math.max(0, -inwardVelocity);
      const impactStarted = before.curbPenalty <= 0.05;
      const impactStrength = THREE.MathUtils.clamp(normalImpactSpeed / 12, 0.42, 1);
      const tangentVelocityX = current.velocityX - contact.normalX * inwardVelocity;
      const tangentVelocityZ = current.velocityZ - contact.normalZ * inwardVelocity;
      const impactState = support.entryState ?? contact.state;
      current = Object.freeze({
        ...current,
        x: impactStarted ? impactState.x : current.x,
        z: impactStarted ? impactState.z : current.z,
        heading: impactStarted ? impactState.heading : current.heading,
        velocityX: impactStarted
          ? tangentVelocityX * 0.62 + contact.normalX * inwardVelocity * 0.28
          : current.velocityX,
        velocityZ: impactStarted
          ? tangentVelocityZ * 0.62 + contact.normalZ * inwardVelocity * 0.28
          : current.velocityZ,
        angularVelocity: impactStarted ? current.angularVelocity * 0.45 : current.angularVelocity,
        slipAngle: impactStarted ? current.slipAngle * 0.32 : current.slipAngle,
        drifting: impactStarted ? false : current.drifting,
        impact: impactStarted ? Math.max(current.impact, impactStrength) : current.impact,
        curbImpact: impactStarted ? impactStrength : current.curbImpact,
        curbPenalty: impactStarted ? 1 : current.curbPenalty,
        elevation: Math.max(
          current.elevation,
          support.elevation,
          impactStarted ? 0.08 + impactStrength * 0.11 : 0,
        ),
        pitch: Math.abs(support.pitch) > Math.abs(current.pitch) ? support.pitch : current.pitch,
      });
      if (impactStarted && normalImpactSpeed > maximumSeverity) {
        maximumSeverity = normalImpactSpeed;
        obstacleId = obstacle.id;
      }
      continue;
    }
    const inwardSpeed = current.velocityX * contact.normalX + current.velocityZ * contact.normalZ;
    const severity = Math.max(0, -inwardSpeed);
    const bounce = inwardSpeed < 0 ? -(1.58 * inwardSpeed) : 0;
    current = Object.freeze({
      ...current,
      x: contact.state.x + contact.normalX * (contact.penetration + CONTACT_MARGIN),
      z: contact.state.z + contact.normalZ * (contact.penetration + CONTACT_MARGIN),
      heading: contact.state.heading,
      velocityX: (current.velocityX + contact.normalX * bounce) * 0.72,
      velocityZ: (current.velocityZ + contact.normalZ * bounce) * 0.72,
      angularVelocity: current.angularVelocity
        + (current.velocityX * contact.normalZ - current.velocityZ * contact.normalX) * 0.045,
      impact: Math.max(current.impact, THREE.MathUtils.clamp(severity / 18, 0, 1)),
      elevation: 0,
      pitch: 0,
      curbImpact: 0,
      curbPenalty: 0,
    });
    if (severity > maximumSeverity) {
      maximumSeverity = severity;
      obstacleId = obstacle.id;
    }
  }
  return Object.freeze({ state: current, obstacleId, severity: maximumSeverity });
}
