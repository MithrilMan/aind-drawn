import type { CourseCheckpoint, CourseLayout } from './course.js';

export type RacePosition = Readonly<{ x: number; z: number }>;

export type RaceRouteProgress = Readonly<{
  lap: number;
  nextCheckpointIndex: number;
  lastCheckpointIndex: number;
  progress: number;
  raceScore: number;
}>;

function wrapProgress(progress: number): number {
  const wrapped = progress % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function expectedCheckpoint(
  course: CourseLayout,
  state: RaceRouteProgress,
): CourseCheckpoint {
  const checkpoint = course.checkpoints[state.nextCheckpointIndex];
  if (checkpoint === undefined) {
    throw new RangeError(`Unknown course checkpoint index: ${state.nextCheckpointIndex}`);
  }
  return checkpoint;
}

function validatedRaceScore(
  course: CourseLayout,
  lap: number,
  lastCheckpointIndex: number,
  nextCheckpointIndex: number,
  progress: number,
): number {
  const last = course.checkpoints[lastCheckpointIndex];
  const next = course.checkpoints[nextCheckpointIndex];
  if (last === undefined || next === undefined) throw new RangeError('Invalid checkpoint progression');
  const sectorStart = last.progress;
  const sectorEnd = nextCheckpointIndex === 0 ? 1 : next.progress;
  const sectorLength = sectorEnd - sectorStart;
  const forwardDistance = wrapProgress(progress - sectorStart);
  const validatedDistance = forwardDistance <= sectorLength + 1e-6 ? forwardDistance : 0;
  return lap + sectorStart + Math.min(sectorLength, validatedDistance);
}

export function crossesCheckpointForward(
  checkpoint: CourseCheckpoint,
  previous: RacePosition,
  current: RacePosition,
): boolean {
  const previousAlong = (previous.x - checkpoint.x) * checkpoint.tangentX
    + (previous.z - checkpoint.z) * checkpoint.tangentZ;
  const currentAlong = (current.x - checkpoint.x) * checkpoint.tangentX
    + (current.z - checkpoint.z) * checkpoint.tangentZ;
  if (previousAlong > 0 || currentAlong <= 0) return false;
  const denominator = previousAlong - currentAlong;
  if (Math.abs(denominator) < 1e-9) return false;
  const amount = previousAlong / denominator;
  if (amount < 0 || amount > 1) return false;
  const crossingX = previous.x + (current.x - previous.x) * amount;
  const crossingZ = previous.z + (current.z - previous.z) * amount;
  const lateral = (crossingX - checkpoint.x) * checkpoint.normalX
    + (crossingZ - checkpoint.z) * checkpoint.normalZ;
  return Math.abs(lateral) <= checkpoint.halfWidth;
}

export function createRaceRouteProgress(
  course: CourseLayout,
  initialProgress = 0,
): RaceRouteProgress {
  if (course.checkpoints.length < 2) {
    throw new RangeError('Race course requires a start line and at least one checkpoint');
  }
  const progress = wrapProgress(initialProgress);
  return Object.freeze({
    lap: 0,
    nextCheckpointIndex: 1,
    lastCheckpointIndex: 0,
    progress,
    raceScore: validatedRaceScore(course, 0, 0, 1, progress),
  });
}

export function advanceRaceRouteProgress(
  course: CourseLayout,
  state: RaceRouteProgress,
  previous: RacePosition,
  current: RacePosition,
  projectedProgress: number,
): RaceRouteProgress {
  let lap = state.lap;
  let lastCheckpointIndex = state.lastCheckpointIndex;
  let nextCheckpointIndex = state.nextCheckpointIndex;
  if (crossesCheckpointForward(expectedCheckpoint(course, state), previous, current)) {
    lastCheckpointIndex = nextCheckpointIndex;
    if (nextCheckpointIndex === 0) {
      lap += 1;
      nextCheckpointIndex = 1;
    } else {
      nextCheckpointIndex = nextCheckpointIndex + 1 < course.checkpoints.length
        ? nextCheckpointIndex + 1
        : 0;
    }
  }
  const progress = wrapProgress(projectedProgress);
  return Object.freeze({
    lap,
    nextCheckpointIndex,
    lastCheckpointIndex,
    progress,
    raceScore: validatedRaceScore(
      course,
      lap,
      lastCheckpointIndex,
      nextCheckpointIndex,
      progress,
    ),
  });
}

export function projectRaceRouteProgress(
  course: CourseLayout,
  state: RaceRouteProgress,
  projectedProgress: number,
): RaceRouteProgress {
  const progress = wrapProgress(projectedProgress);
  return Object.freeze({
    ...state,
    progress,
    raceScore: validatedRaceScore(
      course,
      state.lap,
      state.lastCheckpointIndex,
      state.nextCheckpointIndex,
      progress,
    ),
  });
}

export function lastValidatedCheckpointProgress(
  course: CourseLayout,
  state: RaceRouteProgress,
): number {
  const checkpoint = course.checkpoints[state.lastCheckpointIndex];
  if (checkpoint === undefined) throw new RangeError('Race progress references an unknown checkpoint');
  return checkpoint.progress;
}
