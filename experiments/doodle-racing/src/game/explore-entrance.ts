import type {
  CharacterExpression,
  CharacterPose,
} from '../../../../src/index.js';
import type {
  ExplorerSpawnPlacement,
  ExplorerSpawnWaypoint,
} from './race-world.js';

const MATERIALIZE_SECONDS = 2.3;
const COUGH_SECONDS = 1.6;
const DISCOVER_SECONDS = 3;
const CELEBRATE_SECONDS = 1.15;
const MINIMUM_APPROACH_SECONDS = 1.4;
const MAXIMUM_APPROACH_SECONDS = 3.4;
const APPROACH_SPEED = 4.8;
const ACTOR_REVEAL_SECONDS = 0.82;

export type ExploreEntrancePhase =
  | 'materializing'
  | 'coughing'
  | 'discovering'
  | 'celebrating'
  | 'approaching'
  | 'complete';

export type ExploreEntranceFrame = Readonly<{
  phase: ExploreEntrancePhase;
  phaseProgress: number;
  progress: number;
  approachProgress: number;
  actorVisible: boolean;
  controlsEnabled: boolean;
  x: number;
  y: number;
  z: number;
  heading: number;
  pose: CharacterPose;
  expression: CharacterExpression;
}>;

type EntranceTiming = Readonly<{
  approachSeconds: number;
  totalSeconds: number;
}>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function entrancePoints(spawn: ExplorerSpawnPlacement): readonly ExplorerSpawnWaypoint[] {
  return Object.freeze([
    Object.freeze({ x: spawn.x, y: spawn.y, z: spawn.z }),
    ...spawn.approach,
  ]);
}

function pathLength(points: readonly ExplorerSpawnWaypoint[]): number {
  let length = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as ExplorerSpawnWaypoint;
    const current = points[index] as ExplorerSpawnWaypoint;
    length += Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    );
  }
  return length;
}

function timingFor(spawn: ExplorerSpawnPlacement): EntranceTiming {
  const approachSeconds = Math.max(
    MINIMUM_APPROACH_SECONDS,
    Math.min(MAXIMUM_APPROACH_SECONDS, pathLength(entrancePoints(spawn)) / APPROACH_SPEED),
  );
  return Object.freeze({
    approachSeconds,
    totalSeconds: MATERIALIZE_SECONDS
      + COUGH_SECONDS
      + DISCOVER_SECONDS
      + CELEBRATE_SECONDS
      + approachSeconds,
  });
}

function samplePath(
  points: readonly ExplorerSpawnWaypoint[],
  progress: number,
  fallbackHeading: number,
): Readonly<{ x: number; y: number; z: number; heading: number }> {
  if (points.length < 2) {
    const point = points[0] as ExplorerSpawnWaypoint;
    return Object.freeze({ ...point, heading: fallbackHeading });
  }
  const lengths: number[] = [];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as ExplorerSpawnWaypoint;
    const current = points[index] as ExplorerSpawnWaypoint;
    const length = Math.hypot(
      current.x - previous.x,
      current.y - previous.y,
      current.z - previous.z,
    );
    lengths.push(length);
    totalLength += length;
  }
  if (totalLength <= 1e-6) {
    const point = points[points.length - 1] as ExplorerSpawnWaypoint;
    return Object.freeze({ ...point, heading: fallbackHeading });
  }

  let remaining = clamp01(progress) * totalLength;
  for (let index = 0; index < lengths.length; index += 1) {
    const length = lengths[index] as number;
    const start = points[index] as ExplorerSpawnWaypoint;
    const end = points[index + 1] as ExplorerSpawnWaypoint;
    if (remaining > length && index < lengths.length - 1) {
      remaining -= length;
      continue;
    }
    const segmentProgress = length <= 1e-6 ? 1 : clamp01(remaining / length);
    return Object.freeze({
      x: start.x + (end.x - start.x) * segmentProgress,
      y: start.y + (end.y - start.y) * segmentProgress,
      z: start.z + (end.z - start.z) * segmentProgress,
      heading: length <= 1e-6
        ? fallbackHeading
        : Math.atan2(end.x - start.x, end.z - start.z),
    });
  }

  const end = points[points.length - 1] as ExplorerSpawnWaypoint;
  return Object.freeze({ ...end, heading: fallbackHeading });
}

function discoveryHeading(baseHeading: number, progress: number): number {
  if (progress < 0.3) {
    return baseHeading - smoothStep(progress / 0.3) * 0.72;
  }
  if (progress < 0.68) {
    return baseHeading - 0.72 + smoothStep((progress - 0.3) / 0.38) * 1.4;
  }
  return baseHeading + 0.68 - smoothStep((progress - 0.68) / 0.32) * 0.68;
}

function interpolateAngle(start: number, end: number, progress: number): number {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * clamp01(progress);
}

export function sampleExploreEntrance(
  spawn: ExplorerSpawnPlacement,
  elapsedSeconds: number,
): ExploreEntranceFrame {
  if (spawn.approach.length === 0) {
    throw new Error(`Explore spawn ${spawn.id} requires at least one approach waypoint`);
  }
  const points = entrancePoints(spawn);
  const timing = timingFor(spawn);
  const elapsed = Math.max(0, elapsedSeconds);
  const progress = clamp01(elapsed / timing.totalSeconds);
  const actorVisible = elapsed >= ACTOR_REVEAL_SECONDS;

  if (elapsed < MATERIALIZE_SECONDS) {
    return Object.freeze({
      phase: 'materializing',
      phaseProgress: clamp01(elapsed / MATERIALIZE_SECONDS),
      progress,
      approachProgress: 0,
      actorVisible,
      controlsEnabled: false,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      heading: spawn.heading,
      pose: 'idle',
      expression: 'surprised',
    });
  }

  const discoveryElapsed = elapsed - MATERIALIZE_SECONDS;
  if (discoveryElapsed < COUGH_SECONDS) {
    return Object.freeze({
      phase: 'coughing',
      phaseProgress: clamp01(discoveryElapsed / COUGH_SECONDS),
      progress,
      approachProgress: 0,
      actorVisible: true,
      controlsEnabled: false,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      heading: spawn.heading,
      pose: 'cough',
      expression: discoveryElapsed < COUGH_SECONDS * 0.72 ? 'scared' : 'surprised',
    });
  }

  const lookElapsed = discoveryElapsed - COUGH_SECONDS;
  if (lookElapsed < DISCOVER_SECONDS) {
    const phaseProgress = clamp01(lookElapsed / DISCOVER_SECONDS);
    return Object.freeze({
      phase: 'discovering',
      phaseProgress,
      progress,
      approachProgress: 0,
      actorVisible: true,
      controlsEnabled: false,
      x: spawn.x,
      y: spawn.y,
      z: spawn.z,
      heading: discoveryHeading(spawn.heading, phaseProgress),
      pose: 'idle',
      expression: phaseProgress < 0.26
        ? 'scared'
        : phaseProgress < 0.78 ? 'surprised' : 'happy',
    });
  }

  const celebrateElapsed = lookElapsed - DISCOVER_SECONDS;
  if (celebrateElapsed < CELEBRATE_SECONDS) {
    const phaseProgress = clamp01(celebrateElapsed / CELEBRATE_SECONDS);
    const hopHeight = Math.abs(Math.sin(phaseProgress * Math.PI * 2)) * 0.38;
    const approachHeading = samplePath(points, 0, spawn.heading).heading;
    return Object.freeze({
      phase: 'celebrating',
      phaseProgress,
      progress,
      approachProgress: 0,
      actorVisible: true,
      controlsEnabled: false,
      x: spawn.x,
      y: spawn.y + hopHeight,
      z: spawn.z,
      heading: interpolateAngle(spawn.heading, approachHeading, smoothStep(phaseProgress)),
      pose: hopHeight > 0.035 ? 'airborne' : 'play',
      expression: 'happy',
    });
  }

  const approachElapsed = celebrateElapsed - CELEBRATE_SECONDS;
  if (approachElapsed < timing.approachSeconds) {
    const phaseProgress = clamp01(approachElapsed / timing.approachSeconds);
    const approachProgress = smoothStep(phaseProgress);
    const placement = samplePath(points, approachProgress, spawn.heading);
    return Object.freeze({
      phase: 'approaching',
      phaseProgress,
      progress,
      approachProgress,
      actorVisible: true,
      controlsEnabled: false,
      ...placement,
      pose: 'run',
      expression: 'happy',
    });
  }

  const placement = samplePath(points, 1, spawn.heading);
  return Object.freeze({
    phase: 'complete',
    phaseProgress: 1,
    progress: 1,
    approachProgress: 1,
    actorVisible: true,
    controlsEnabled: true,
    ...placement,
    pose: 'idle',
    expression: 'happy',
  });
}

export class ExploreEntranceDirector {
  private elapsed = 0;

  public constructor(public readonly spawn: ExplorerSpawnPlacement) {}

  public snapshot(): ExploreEntranceFrame {
    return sampleExploreEntrance(this.spawn, this.elapsed);
  }

  public update(deltaSeconds: number): ExploreEntranceFrame {
    this.elapsed += Math.max(0, Math.min(0.05, deltaSeconds));
    return this.snapshot();
  }

  public get complete(): boolean {
    return this.snapshot().controlsEnabled;
  }
}
