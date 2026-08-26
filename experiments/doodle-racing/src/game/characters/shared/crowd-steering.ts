import type { RacerSnapshot } from '../../race-model.js';
import type { TracksideSpectatorPlacement } from '../../race-world.js';

const WATCH_RADIUS = 12;
const PANIC_HORIZON_SECONDS = 1.15;
const PANIC_CLEARANCE = 1.45;
const MINIMUM_THREAT_SPEED = 3;
const ZERO_STEERING = Object.freeze({ x: 0, z: 0 });

export type TracksideReaction = Readonly<{
  mode: 'idle' | 'watching' | 'fleeing';
  heading: number;
  vehicleId: string | null;
}>;

export type CrowdPursuitStep = Readonly<{
  x: number;
  z: number;
  heading: number;
  moving: boolean;
}>;

export type CrowdCelebrationTarget = Readonly<{ x: number; z: number }>;
export type CrowdSeparationAgent = Readonly<{ x: number; z: number }>;

const CELEBRANTS_PER_RING = 10;
const CELEBRATION_RING_SPACING = 0.82;

/** Gives every invader a stable place around the winner instead of one shared pile. */
export function crowdCelebrationTarget(
  centre: Readonly<{ x: number; z: number }>,
  slot: number,
  output: { x: number; z: number } = { x: 0, z: 0 },
): CrowdCelebrationTarget {
  const ring = Math.floor(slot / CELEBRANTS_PER_RING);
  const member = slot % CELEBRANTS_PER_RING;
  const radius = 1.55 + ring * CELEBRATION_RING_SPACING;
  const angle = member / CELEBRANTS_PER_RING * Math.PI * 2 + ring * 0.31;
  output.x = centre.x + Math.cos(angle) * radius;
  output.z = centre.z + Math.sin(angle) * radius;
  return output;
}

function normalized(x: number, z: number): Readonly<{ x: number; z: number }> {
  const length = Math.hypot(x, z);
  return length <= 1e-6
    ? Object.freeze({ x: 0, z: 0 })
    : Object.freeze({ x: x / length, z: z / length });
}

function vehicleVelocity(vehicle: RacerSnapshot): Readonly<{ x: number; z: number }> {
  return Object.freeze({
    x: Math.cos(vehicle.heading) * vehicle.speed,
    z: -Math.sin(vehicle.heading) * vehicle.speed,
  });
}

function closestApproach(
  x: number,
  z: number,
  vehicle: RacerSnapshot,
  horizonSeconds: number,
): Readonly<{ distance: number; time: number; x: number; z: number }> {
  const velocity = vehicleVelocity(vehicle);
  const speedSquared = velocity.x * velocity.x + velocity.z * velocity.z;
  const relativeX = x - vehicle.x;
  const relativeZ = z - vehicle.z;
  const time = speedSquared <= 1e-5
    ? 0
    : Math.max(0, Math.min(
      horizonSeconds,
      (relativeX * velocity.x + relativeZ * velocity.z) / speedSquared,
    ));
  const nearestX = vehicle.x + velocity.x * time;
  const nearestZ = vehicle.z + velocity.z * time;
  return Object.freeze({
    distance: Math.hypot(x - nearestX, z - nearestZ),
    time,
    x: nearestX,
    z: nearestZ,
  });
}

export function tracksideReactionFor(
  placement: TracksideSpectatorPlacement,
  x: number,
  z: number,
  racers: readonly RacerSnapshot[],
): TracksideReaction {
  let watched: RacerSnapshot | null = null;
  let watchedDistance = WATCH_RADIUS;
  let threat: RacerSnapshot | null = null;
  let threatClearance = Number.POSITIVE_INFINITY;
  for (const racer of racers) {
    const distance = Math.hypot(x - racer.x, z - racer.z);
    if (distance < watchedDistance) {
      watched = racer;
      watchedDistance = distance;
    }
    if (racer.speed < MINIMUM_THREAT_SPEED || distance > WATCH_RADIUS) continue;
    const approach = closestApproach(x, z, racer, PANIC_HORIZON_SECONDS);
    if (approach.time <= 0.03 || approach.distance >= PANIC_CLEARANCE) continue;
    if (approach.distance < threatClearance) {
      threat = racer;
      threatClearance = approach.distance;
    }
  }
  if (threat !== null) {
    return Object.freeze({
      mode: 'fleeing',
      heading: Math.atan2(placement.outwardX, placement.outwardZ),
      vehicleId: threat.id,
    });
  }
  if (watched !== null) {
    return Object.freeze({
      mode: 'watching',
      heading: Math.atan2(watched.x - x, watched.z - z),
      vehicleId: watched.id,
    });
  }
  return Object.freeze({
    mode: 'idle',
    heading: placement.heading,
    vehicleId: null,
  });
}

/** Pursues a celebration target while steering away from current and predicted car footprints. */
export function stepCrowdPursuit(
  source: Readonly<{ x: number; z: number }>,
  target: Readonly<{ x: number; z: number }>,
  racers: readonly RacerSnapshot[],
  speed: number,
  deltaSeconds: number,
  separation: Readonly<{ x: number; z: number }> = ZERO_STEERING,
): CrowdPursuitStep {
  const desired = normalized(target.x - source.x, target.z - source.z);
  let steerX = desired.x + separation.x * 2.75;
  let steerZ = desired.z + separation.z * 2.75;
  for (const racer of racers) {
    const approach = closestApproach(source.x, source.z, racer, 0.9);
    const currentDistance = Math.hypot(source.x - racer.x, source.z - racer.z);
    const safety = 1.75 + Math.min(1.35, racer.speed * 0.055);
    if (approach.distance < safety) {
      const away = normalized(source.x - approach.x, source.z - approach.z);
      const strength = (1 - approach.distance / safety) * 3.1;
      steerX += away.x * strength;
      steerZ += away.z * strength;
    }
    if (currentDistance < 2.2) {
      const away = normalized(source.x - racer.x, source.z - racer.z);
      const strength = (1 - currentDistance / 2.2) * 4.2;
      steerX += away.x * strength;
      steerZ += away.z * strength;
    }
  }
  const direction = normalized(steerX, steerZ);
  const distance = Math.hypot(target.x - source.x, target.z - source.z);
  const movement = Math.min(distance, Math.max(0, speed * deltaSeconds));
  const moving = movement > 1e-4 && (direction.x !== 0 || direction.z !== 0);
  return Object.freeze({
    x: source.x + direction.x * movement,
    z: source.z + direction.z * movement,
    heading: moving ? Math.atan2(direction.x, direction.z) : 0,
    moving,
  });
}
