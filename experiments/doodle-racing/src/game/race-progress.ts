import type { CourseLayout, CourseProjection } from './course.js';

export const MINIMUM_ROUTE_COVERAGE = 0.85;
export const MAXIMUM_ROUTE_GAP_WIDTHS = 3;

export type RacePosition = Readonly<{ x: number; z: number }>;

export type RaceRouteObservation = Readonly<{
  previous: RacePosition;
  current: RacePosition;
  previousProjection: CourseProjection;
  currentProjection: CourseProjection;
  previousTouchesRoute: boolean;
  currentTouchesRoute: boolean;
}>;

export type RaceRouteProgress = Readonly<{
  lap: number;
  progress: number;
  raceScore: number;
  lastSafeProgress: number;
  onRoute: boolean;
  coverageWords: readonly number[];
  coverageFraction: number;
  largestSkippedDistance: number;
}>;

export type RouteCoverageStats = Readonly<{
  coveredFraction: number;
  largestGapDistance: number;
}>;

const WORD_BITS = 32;
const MAXIMUM_ARC_TO_WORLD_RATIO = 1.5;
const EPSILON = 1e-9;

function wrapProgress(progress: number): number {
  const wrapped = progress % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

function signedProgressDelta(previous: number, current: number): number {
  let delta = wrapProgress(current) - wrapProgress(previous);
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return delta;
}

function forwardProgressDelta(previous: number, current: number): number {
  return wrapProgress(current - previous);
}

function segmentIndex(course: CourseLayout, progress: number): number {
  return Math.min(
    course.samples.length - 1,
    Math.floor(wrapProgress(progress) * course.samples.length),
  );
}

function segmentLength(course: CourseLayout, index: number): number {
  const sample = course.samples[index];
  const next = course.samples[(index + 1) % course.samples.length];
  if (sample === undefined || next === undefined) {
    throw new RangeError(`Unknown course segment: ${index}`);
  }
  return index === course.samples.length - 1
    ? course.totalLength - sample.distance
    : next.distance - sample.distance;
}

function isCovered(words: readonly number[], index: number): boolean {
  const word = words[Math.floor(index / WORD_BITS)] ?? 0;
  return (word & (1 << (index % WORD_BITS))) !== 0;
}

function emptyCoverage(course: CourseLayout): readonly number[] {
  return Object.freeze(Array.from(
    { length: Math.ceil(course.samples.length / WORD_BITS) },
    () => 0,
  ));
}

function markSegment(
  course: CourseLayout,
  words: readonly number[],
  progress: number,
): readonly number[] {
  const index = segmentIndex(course, progress);
  if (isCovered(words, index)) return words;
  const next = [...words];
  const wordIndex = Math.floor(index / WORD_BITS);
  next[wordIndex] = (next[wordIndex] ?? 0) | (1 << (index % WORD_BITS));
  return Object.freeze(next);
}

function markForwardRange(
  course: CourseLayout,
  words: readonly number[],
  previousProgress: number,
  currentProgress: number,
): readonly number[] {
  const delta = signedProgressDelta(previousProgress, currentProgress);
  if (delta < -EPSILON) return words;
  const start = segmentIndex(course, previousProgress);
  const end = segmentIndex(course, currentProgress);
  const next = [...words];
  let index = start;
  for (let count = 0; count <= course.samples.length; count += 1) {
    const wordIndex = Math.floor(index / WORD_BITS);
    next[wordIndex] = (next[wordIndex] ?? 0) | (1 << (index % WORD_BITS));
    if (index === end) return Object.freeze(next);
    index = (index + 1) % course.samples.length;
  }
  throw new RangeError('Forward route coverage exceeded one complete lap');
}

export function routeCoverageStats(
  course: CourseLayout,
  coverageWords: readonly number[],
): RouteCoverageStats {
  let coveredDistance = 0;
  let firstCoveredIndex = -1;
  for (let index = 0; index < course.samples.length; index += 1) {
    if (!isCovered(coverageWords, index)) continue;
    if (firstCoveredIndex < 0) firstCoveredIndex = index;
    coveredDistance += segmentLength(course, index);
  }
  if (firstCoveredIndex < 0) {
    return Object.freeze({ coveredFraction: 0, largestGapDistance: course.totalLength });
  }
  let largestGapDistance = 0;
  let currentGapDistance = 0;
  for (let offset = 1; offset <= course.samples.length; offset += 1) {
    const index = (firstCoveredIndex + offset) % course.samples.length;
    if (isCovered(coverageWords, index)) {
      largestGapDistance = Math.max(largestGapDistance, currentGapDistance);
      currentGapDistance = 0;
    } else {
      currentGapDistance += segmentLength(course, index);
    }
  }
  return Object.freeze({
    coveredFraction: coveredDistance / course.totalLength,
    largestGapDistance: Math.max(largestGapDistance, currentGapDistance),
  });
}

export function maximumRouteGapDistance(course: CourseLayout): number {
  return course.trackWidth * MAXIMUM_ROUTE_GAP_WIDTHS;
}

function initialCoverage(course: CourseLayout, progress: number): readonly number[] {
  return markForwardRange(course, emptyCoverage(course), 0, progress);
}

function plausibleForwardDistance(
  course: CourseLayout,
  observation: RaceRouteObservation,
): number {
  const progressDelta = signedProgressDelta(
    observation.previousProjection.progress,
    observation.currentProjection.progress,
  );
  if (progressDelta <= EPSILON) return 0;
  const worldDistance = Math.hypot(
    observation.current.x - observation.previous.x,
    observation.current.z - observation.previous.z,
  );
  const arcDistance = progressDelta * course.totalLength;
  const segmentSlack = course.totalLength / course.samples.length * 2;
  return arcDistance <= worldDistance * MAXIMUM_ARC_TO_WORLD_RATIO + segmentSlack
    ? progressDelta
    : 0;
}

function crossesStartLine(previousProgress: number, progressDelta: number): boolean {
  return progressDelta > EPSILON && wrapProgress(previousProgress) + progressDelta >= 1;
}

export function createRaceRouteProgress(
  course: CourseLayout,
  initialProgress = 0,
): RaceRouteProgress {
  if (course.samples.length < 2) throw new RangeError('Race course requires at least two segments');
  const progress = wrapProgress(initialProgress);
  const coverageWords = initialCoverage(course, progress);
  const stats = routeCoverageStats(course, coverageWords);
  return Object.freeze({
    lap: 0,
    progress,
    raceScore: progress,
    lastSafeProgress: progress,
    onRoute: true,
    coverageWords,
    coverageFraction: stats.coveredFraction,
    largestSkippedDistance: 0,
  });
}

export function advanceRaceRouteProgress(
  course: CourseLayout,
  state: RaceRouteProgress,
  observation: RaceRouteObservation,
): RaceRouteProgress {
  const progress = wrapProgress(observation.currentProjection.progress);
  const previousOnRoute = observation.previousTouchesRoute;
  const onRoute = observation.currentTouchesRoute;
  let coverageWords = state.coverageWords;
  let acceptedFromProgress = state.progress;
  let acceptedProgressDelta = 0;
  let lastSafeProgress = state.lastSafeProgress;
  let largestSkippedDistance = state.largestSkippedDistance;

  if (onRoute) {
    coverageWords = markSegment(course, coverageWords, progress);
    if (state.onRoute && previousOnRoute) {
      acceptedProgressDelta = plausibleForwardDistance(course, observation);
      if (acceptedProgressDelta > 0) {
        acceptedFromProgress = state.progress;
        coverageWords = markForwardRange(course, coverageWords, state.progress, progress);
      }
    } else {
      acceptedFromProgress = state.lastSafeProgress;
      const gapProgress = forwardProgressDelta(state.lastSafeProgress, progress);
      const gapDistance = gapProgress * course.totalLength;
      largestSkippedDistance = Math.max(largestSkippedDistance, gapDistance);
      if (gapProgress <= 0.5 && gapDistance <= maximumRouteGapDistance(course)) {
        acceptedProgressDelta = gapProgress;
      }
    }
    lastSafeProgress = progress;
  }

  const stats = routeCoverageStats(course, coverageWords);
  let lap = state.lap;
  const raceScore = Math.min(lap + 1 - EPSILON, state.raceScore + acceptedProgressDelta);
  if (crossesStartLine(acceptedFromProgress, acceptedProgressDelta)) {
    const gapLimit = maximumRouteGapDistance(course);
    if (
      stats.coveredFraction >= MINIMUM_ROUTE_COVERAGE
      && stats.largestGapDistance <= gapLimit
    ) {
      lap += 1;
      coverageWords = initialCoverage(course, progress);
      const nextStats = routeCoverageStats(course, coverageWords);
      return Object.freeze({
        lap,
        progress,
        raceScore: lap + progress,
        lastSafeProgress: progress,
        onRoute,
        coverageWords,
        coverageFraction: nextStats.coveredFraction,
        largestSkippedDistance: 0,
      });
    }
    largestSkippedDistance = Math.max(largestSkippedDistance, stats.largestGapDistance);
  }

  return Object.freeze({
    lap,
    progress,
    raceScore,
    lastSafeProgress,
    onRoute,
    coverageWords,
    coverageFraction: stats.coveredFraction,
    largestSkippedDistance,
  });
}

export function projectRaceRouteProgress(
  state: RaceRouteProgress,
  projectedProgress: number,
): RaceRouteProgress {
  const progress = wrapProgress(projectedProgress);
  return Object.freeze({
    ...state,
    progress,
    lastSafeProgress: progress,
    onRoute: true,
  });
}

export function lastSafeRouteProgress(state: RaceRouteProgress): number {
  return state.lastSafeProgress;
}

export function isRouteSegmentCovered(
  coverageWords: readonly number[],
  segmentIndex: number,
): boolean {
  if (!Number.isInteger(segmentIndex) || segmentIndex < 0) return false;
  return isCovered(coverageWords, segmentIndex);
}
