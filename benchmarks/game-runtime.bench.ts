import { bench, describe } from 'vitest';

import {
  SpatialHash2D,
  createArcadeVehicleState,
  resolveObstacleCollisions,
  stepArcadeVehicle,
  type ArcadeDriveInput,
  type ArcadeVehicleState,
  type CollisionObstacle,
  type VehicleCollisionProfile,
} from '@mithrilman/aind-game-runtime';

const VEHICLE_COUNT = 12;
const STEP_COUNT = 120;
const INPUT: ArcadeDriveInput = Object.freeze({
  accelerate: true,
  brake: false,
  left: true,
  right: false,
  handbrake: false,
  steeringAxis: 0.38,
  throttle: 0.92,
});
const PROFILE: VehicleCollisionProfile = Object.freeze({
  halfLength: 1.8,
  halfWidth: 0.9,
  frontAxle: 1.15,
  rearAxle: -1.15,
  wheelRadius: 0.43,
  wheelHalfWidth: 0.16,
  groundClearance: 0.2,
});
const OBSTACLES: readonly CollisionObstacle[] = Object.freeze(Array.from(
  { length: 24 },
  (_, index) => Object.freeze({
    id: `obstacle:${index}`,
    x: 18 + index * 3.1,
    z: (index % 3 - 1) * 7,
    radius: 0.8,
  }),
));
const CROWD = Object.freeze(Array.from({ length: 48 }, (_, index) => Object.freeze({
  x: index % 8 * 0.72,
  z: Math.floor(index / 8) * 0.72,
})));
const CROWD_HASH = new SpatialHash2D<(typeof CROWD)[number]>(1);
const CROWD_NEIGHBOURS: (typeof CROWD)[number][] = [];

function simulateField(): readonly ArcadeVehicleState[] {
  const vehicles = Array.from(
    { length: VEHICLE_COUNT },
    (_, index) => createArcadeVehicleState(index * -1.2, index * 1.1, 0),
  );
  for (let step = 0; step < STEP_COUNT; step += 1) {
    for (let index = 0; index < vehicles.length; index += 1) {
      const before = vehicles[index] as ArcadeVehicleState;
      const proposed = stepArcadeVehicle(before, INPUT, 'road', 1 / 120);
      vehicles[index] = resolveObstacleCollisions(before, proposed, OBSTACLES, PROFILE).state;
    }
  }
  return vehicles;
}

describe('game runtime hot path', () => {
  bench('steps a 12-vehicle field with structural collision broad phase', () => {
    simulateField();
  });

  bench('rebuilds and queries a 48-agent spatial broad phase', () => {
    CROWD_HASH.rebuild(CROWD);
    for (const agent of CROWD) {
      CROWD_HASH.queryRadiusInto(agent.x, agent.z, 0.9, CROWD_NEIGHBOURS);
    }
  });
});
