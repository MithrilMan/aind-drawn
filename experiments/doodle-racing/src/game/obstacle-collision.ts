import * as THREE from 'three';

import type { ArcadeVehicleState } from './arcade-vehicle-physics.js';
import type { RaceObstacle } from './race-world.js';

export type CollisionResult = Readonly<{
  state: ArcadeVehicleState;
  obstacleId: string | null;
  severity: number;
}>;

const VEHICLE_RADIUS = 0.92;

function resolveCircle(
  state: ArcadeVehicleState,
  obstacle: Extract<RaceObstacle, { kind: 'tyres' | 'tree' }>,
): Readonly<{ normalX: number; normalZ: number; penetration: number }> | null {
  const deltaX = state.x - obstacle.x;
  const deltaZ = state.z - obstacle.z;
  const distance = Math.hypot(deltaX, deltaZ);
  const minimum = VEHICLE_RADIUS + obstacle.radius;
  if (distance >= minimum) return null;
  if (distance < 1e-6) return Object.freeze({ normalX: 1, normalZ: 0, penetration: minimum });
  return Object.freeze({
    normalX: deltaX / distance,
    normalZ: deltaZ / distance,
    penetration: minimum - distance,
  });
}

function resolveSegment(
  state: ArcadeVehicleState,
  obstacle: Extract<RaceObstacle, { kind: 'barrier' }>,
): Readonly<{ normalX: number; normalZ: number; penetration: number }> | null {
  const deltaX = obstacle.endX - obstacle.startX;
  const deltaZ = obstacle.endZ - obstacle.startZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const amount = THREE.MathUtils.clamp(
    ((state.x - obstacle.startX) * deltaX + (state.z - obstacle.startZ) * deltaZ)
      / Math.max(1e-9, lengthSquared),
    0,
    1,
  );
  const closestX = obstacle.startX + deltaX * amount;
  const closestZ = obstacle.startZ + deltaZ * amount;
  const offsetX = state.x - closestX;
  const offsetZ = state.z - closestZ;
  const distance = Math.hypot(offsetX, offsetZ);
  const minimum = VEHICLE_RADIUS + obstacle.radius;
  if (distance >= minimum) return null;
  if (distance < 1e-6) {
    const length = Math.sqrt(lengthSquared);
    return Object.freeze({
      normalX: -deltaZ / length,
      normalZ: deltaX / length,
      penetration: minimum,
    });
  }
  return Object.freeze({
    normalX: offsetX / distance,
    normalZ: offsetZ / distance,
    penetration: minimum - distance,
  });
}

export function resolveObstacleCollisions(
  state: ArcadeVehicleState,
  obstacles: readonly RaceObstacle[],
): CollisionResult {
  let current = state;
  let obstacleId: string | null = null;
  let maximumSeverity = 0;
  for (const obstacle of obstacles) {
    const contact = obstacle.kind === 'barrier'
      ? resolveSegment(current, obstacle)
      : resolveCircle(current, obstacle);
    if (contact === null) continue;
    const inwardSpeed = current.velocityX * contact.normalX + current.velocityZ * contact.normalZ;
    const severity = Math.max(0, -inwardSpeed);
    const bounce = inwardSpeed < 0 ? -(1.58 * inwardSpeed) : 0;
    current = Object.freeze({
      ...current,
      x: current.x + contact.normalX * (contact.penetration + 0.015),
      z: current.z + contact.normalZ * (contact.penetration + 0.015),
      velocityX: (current.velocityX + contact.normalX * bounce) * 0.72,
      velocityZ: (current.velocityZ + contact.normalZ * bounce) * 0.72,
      angularVelocity: current.angularVelocity
        + (current.velocityX * contact.normalZ - current.velocityZ * contact.normalX) * 0.045,
      impact: Math.max(current.impact, THREE.MathUtils.clamp(severity / 18, 0, 1)),
    });
    if (severity > maximumSeverity) {
      maximumSeverity = severity;
      obstacleId = obstacle.id;
    }
  }
  return Object.freeze({ state: current, obstacleId, severity: maximumSeverity });
}
