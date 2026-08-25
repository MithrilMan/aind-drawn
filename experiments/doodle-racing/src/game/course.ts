import * as THREE from 'three';

import {
  DEFAULT_COURSE_PATH_RECIPE,
  CoursePathValidationError,
  compileCourseStrokeRecipe,
  type CoursePathPoint,
  type CoursePathRecipe,
  type CourseStrokeCompileOptions,
} from './course-path.js';

export {
  DEFAULT_COURSE_PATH_RECIPE,
  CoursePathValidationError,
  compileCourseStrokeRecipe,
  createCoursePathRecipe,
  type CoursePathPoint,
  type CoursePathRecipe,
  type CoursePathRecipeOptions,
  type CoursePathValidationCode,
  type CourseStrokeCompileOptions,
} from './course-path.js';

export type CourseSample = Readonly<{
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  curvature: number;
  distance: number;
}>;

export type CourseCheckpoint = Readonly<{
  id: string;
  index: number;
  progress: number;
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  halfWidth: number;
}>;

export type CourseBounds = Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}>;

export type CourseLayout = Readonly<{
  recipe: CoursePathRecipe;
  samples: readonly CourseSample[];
  checkpoints: readonly CourseCheckpoint[];
  totalLength: number;
  trackWidth: number;
  minimumTurnRadius: number;
  bounds: CourseBounds;
}>;

export type CourseProjection = CourseSample & Readonly<{
  progress: number;
  distanceFromCentre: number;
  lateralOffset: number;
  segmentIndex: number;
}>;

export type CompiledCourseStroke = Readonly<{
  recipe: CoursePathRecipe;
  layout: CourseLayout;
}>;

const SAMPLE_COUNT = 256;
const MINIMUM_CHECKPOINT_COUNT = 12;
const MAXIMUM_CHECKPOINT_COUNT = 24;
const CHECKPOINT_OFF_ROAD_MARGIN = 2;
const EPSILON = 1e-9;

function circumradius(first: THREE.Vector3, middle: THREE.Vector3, last: THREE.Vector3): number {
  const a = first.distanceTo(middle);
  const b = middle.distanceTo(last);
  const c = last.distanceTo(first);
  const twiceArea = Math.abs(
    (middle.x - first.x) * (last.z - first.z)
      - (middle.z - first.z) * (last.x - first.x),
  );
  if (twiceArea < 1e-7) return Number.POSITIVE_INFINITY;
  return a * b * c / (twiceArea * 2);
}

function wrapProgress(progress: number): number {
  return THREE.MathUtils.euclideanModulo(progress, 1);
}

function interpolateSample(
  first: CourseSample,
  second: CourseSample,
  amount: number,
  distance: number,
): CourseSample {
  const tangent = new THREE.Vector2(
    THREE.MathUtils.lerp(first.tangentX, second.tangentX, amount),
    THREE.MathUtils.lerp(first.tangentZ, second.tangentZ, amount),
  ).normalize();
  return Object.freeze({
    x: THREE.MathUtils.lerp(first.x, second.x, amount),
    z: THREE.MathUtils.lerp(first.z, second.z, amount),
    tangentX: tangent.x,
    tangentZ: tangent.y,
    normalX: -tangent.y,
    normalZ: tangent.x,
    curvature: THREE.MathUtils.lerp(first.curvature, second.curvature, amount),
    distance,
  });
}

function sampleAt(
  samples: readonly CourseSample[],
  totalLength: number,
  progress: number,
): CourseSample {
  const targetDistance = wrapProgress(progress) * totalLength;
  for (let index = 0; index < samples.length; index += 1) {
    const first = samples[index];
    const second = samples[(index + 1) % samples.length];
    if (first === undefined || second === undefined) continue;
    const secondDistance = index === samples.length - 1 ? totalLength : second.distance;
    if (targetDistance > secondDistance) continue;
    const amount = (targetDistance - first.distance)
      / Math.max(EPSILON, secondDistance - first.distance);
    return interpolateSample(first, second, amount, targetDistance);
  }
  const first = samples[0];
  if (first === undefined) throw new RangeError('Course requires at least one sample');
  return first;
}

function orientation(
  first: CourseSample,
  second: CourseSample,
  third: CourseSample,
): number {
  return (second.x - first.x) * (third.z - first.z)
    - (second.z - first.z) * (third.x - first.x);
}

function segmentsIntersect(
  firstStart: CourseSample,
  firstEnd: CourseSample,
  secondStart: CourseSample,
  secondEnd: CourseSample,
): boolean {
  const firstSideStart = orientation(firstStart, firstEnd, secondStart);
  const firstSideEnd = orientation(firstStart, firstEnd, secondEnd);
  const secondSideStart = orientation(secondStart, secondEnd, firstStart);
  const secondSideEnd = orientation(secondStart, secondEnd, firstEnd);
  if (firstSideStart * firstSideEnd < -EPSILON && secondSideStart * secondSideEnd < -EPSILON) {
    return true;
  }
  const onSegment = (start: CourseSample, end: CourseSample, point: CourseSample): boolean => (
    Math.abs(orientation(start, end, point)) <= 1e-7
    && point.x >= Math.min(start.x, end.x) - 1e-7
    && point.x <= Math.max(start.x, end.x) + 1e-7
    && point.z >= Math.min(start.z, end.z) - 1e-7
    && point.z <= Math.max(start.z, end.z) + 1e-7
  );
  return onSegment(firstStart, firstEnd, secondStart)
    || onSegment(firstStart, firstEnd, secondEnd)
    || onSegment(secondStart, secondEnd, firstStart)
    || onSegment(secondStart, secondEnd, firstEnd);
}

function pointSegmentDistanceSquared(
  point: CourseSample,
  start: CourseSample,
  end: CourseSample,
): number {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  if (lengthSquared < EPSILON) return (point.x - start.x) ** 2 + (point.z - start.z) ** 2;
  const amount = THREE.MathUtils.clamp(
    ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / lengthSquared,
    0,
    1,
  );
  const deltaX = point.x - (start.x + segmentX * amount);
  const deltaZ = point.z - (start.z + segmentZ * amount);
  return deltaX * deltaX + deltaZ * deltaZ;
}

function segmentDistanceSquared(
  firstStart: CourseSample,
  firstEnd: CourseSample,
  secondStart: CourseSample,
  secondEnd: CourseSample,
): number {
  if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) return 0;
  return Math.min(
    pointSegmentDistanceSquared(firstStart, secondStart, secondEnd),
    pointSegmentDistanceSquared(firstEnd, secondStart, secondEnd),
    pointSegmentDistanceSquared(secondStart, firstStart, firstEnd),
    pointSegmentDistanceSquared(secondEnd, firstStart, firstEnd),
  );
}

function validateCourseGeometry(
  samples: readonly CourseSample[],
  totalLength: number,
  trackWidth: number,
  minimumTurnRadius: number,
): void {
  if (totalLength < trackWidth * 18) {
    throw new CoursePathValidationError(
      'path-length',
      `Course length ${totalLength.toFixed(2)} is too short for a ${trackWidth.toFixed(2)} wide track`,
    );
  }
  for (let firstIndex = 0; firstIndex < samples.length; firstIndex += 1) {
    const firstStart = samples[firstIndex];
    const firstEnd = samples[(firstIndex + 1) % samples.length];
    if (firstStart === undefined || firstEnd === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < samples.length; secondIndex += 1) {
      const secondStart = samples[secondIndex];
      const secondEnd = samples[(secondIndex + 1) % samples.length];
      if (secondStart === undefined || secondEnd === undefined) continue;
      const gap = Math.min(secondIndex - firstIndex, samples.length - (secondIndex - firstIndex));
      if (gap <= 1) continue;
      if (segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)) {
        throw new CoursePathValidationError(
          'self-intersection',
          'Course centre line intersects itself; flat circuits cannot contain crossings',
        );
      }
    }
  }
  const requiredTurnRadius = trackWidth * 0.5 + 0.65;
  if (minimumTurnRadius < requiredTurnRadius) {
    throw new CoursePathValidationError(
      'turn-radius',
      `Course turn radius ${minimumTurnRadius.toFixed(2)} is narrower than the ${requiredTurnRadius.toFixed(2)} track extrusion limit`,
    );
  }
  const averageSegmentLength = totalLength / samples.length;
  const requiredClearance = trackWidth + 0.72;
  const neighborhood = Math.ceil(requiredClearance / Math.max(EPSILON, averageSegmentLength)) + 2;
  const requiredClearanceSquared = requiredClearance * requiredClearance;
  for (let firstIndex = 0; firstIndex < samples.length; firstIndex += 1) {
    const firstStart = samples[firstIndex];
    const firstEnd = samples[(firstIndex + 1) % samples.length];
    if (firstStart === undefined || firstEnd === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < samples.length; secondIndex += 1) {
      const gap = Math.min(secondIndex - firstIndex, samples.length - (secondIndex - firstIndex));
      if (gap <= neighborhood) continue;
      const secondStart = samples[secondIndex];
      const secondEnd = samples[(secondIndex + 1) % samples.length];
      if (secondStart === undefined || secondEnd === undefined) continue;
      if (segmentDistanceSquared(firstStart, firstEnd, secondStart, secondEnd) >= requiredClearanceSquared) {
        continue;
      }
      throw new CoursePathValidationError(
        'track-clearance',
        `Non-adjacent course sections require at least ${requiredClearance.toFixed(2)} units of centre-line clearance`,
      );
    }
  }
}

function createCheckpoints(
  samples: readonly CourseSample[],
  totalLength: number,
  trackWidth: number,
): readonly CourseCheckpoint[] {
  const checkpointCount = THREE.MathUtils.clamp(
    Math.round(totalLength / (trackWidth * 2.45)),
    MINIMUM_CHECKPOINT_COUNT,
    MAXIMUM_CHECKPOINT_COUNT,
  );
  return Object.freeze(Array.from({ length: checkpointCount }, (_, index) => {
    const progress = index / checkpointCount;
    const sample = sampleAt(samples, totalLength, progress);
    return Object.freeze({
      id: index === 0 ? 'start-finish' : `checkpoint:${index}`,
      index,
      progress,
      x: sample.x,
      z: sample.z,
      tangentX: sample.tangentX,
      tangentZ: sample.tangentZ,
      normalX: sample.normalX,
      normalZ: sample.normalZ,
      halfWidth: trackWidth * 0.5 + CHECKPOINT_OFF_ROAD_MARGIN,
    });
  }));
}

export function createCourseLayout(
  recipe: CoursePathRecipe = DEFAULT_COURSE_PATH_RECIPE,
): CourseLayout {
  const curve = new THREE.CatmullRomCurve3(
    recipe.points.map(([x, z]) => new THREE.Vector3(
      x * recipe.worldScale,
      0,
      z * recipe.worldScale,
    )),
    true,
    'centripetal',
  );
  const points = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, SAMPLE_COUNT);
  const preliminary: Omit<CourseSample, 'curvature'>[] = [];
  let distance = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    if (point === undefined || previous === undefined || next === undefined) continue;
    if (index > 0) distance += point.distanceTo(previous);
    const tangent = next.clone().sub(previous).normalize();
    preliminary.push(Object.freeze({
      x: point.x,
      z: point.z,
      tangentX: tangent.x,
      tangentZ: tangent.z,
      normalX: -tangent.z,
      normalZ: tangent.x,
      distance,
    }));
  }
  const first = points[0];
  const last = points[points.length - 1];
  if (first === undefined || last === undefined) {
    throw new CoursePathValidationError('point-count', 'Course path did not produce any samples');
  }
  const totalLength = distance + last.distanceTo(first);
  const minimumTurnRadius = Math.min(...points.map((point, index) => circumradius(
    points[(index - 2 + points.length) % points.length] as THREE.Vector3,
    point,
    points[(index + 2) % points.length] as THREE.Vector3,
  )));
  const samples: CourseSample[] = preliminary.map((sample, index) => {
    const previous = preliminary[(index - 2 + preliminary.length) % preliminary.length];
    const next = preliminary[(index + 2) % preliminary.length];
    if (previous === undefined || next === undefined) {
      throw new CoursePathValidationError('point-count', 'Course sampling failed');
    }
    return Object.freeze({
      ...sample,
      curvature: THREE.MathUtils.clamp(
        previous.tangentX * next.tangentZ - previous.tangentZ * next.tangentX,
        -1,
        1,
      ),
    });
  });
  validateCourseGeometry(samples, totalLength, recipe.trackWidth, minimumTurnRadius);
  const margin = Math.max(13, recipe.trackWidth * 1.35);
  return Object.freeze({
    recipe,
    samples: Object.freeze(samples),
    checkpoints: createCheckpoints(samples, totalLength, recipe.trackWidth),
    totalLength,
    trackWidth: recipe.trackWidth,
    minimumTurnRadius,
    bounds: Object.freeze({
      minimumX: Math.min(...samples.map(({ x }) => x)) - margin,
      maximumX: Math.max(...samples.map(({ x }) => x)) + margin,
      minimumZ: Math.min(...samples.map(({ z }) => z)) - margin,
      maximumZ: Math.max(...samples.map(({ z }) => z)) + margin,
    }),
  });
}

export function compileCourseStroke(
  points: readonly CoursePathPoint[],
  options: CourseStrokeCompileOptions = {},
): CompiledCourseStroke {
  const recipe = compileCourseStrokeRecipe(points, options);
  return Object.freeze({ recipe, layout: createCourseLayout(recipe) });
}

export function sampleCourseAt(layout: CourseLayout, progress: number): CourseSample {
  return sampleAt(layout.samples, layout.totalLength, progress);
}

export function nearestCoursePoint(
  layout: CourseLayout,
  x: number,
  z: number,
): CourseProjection {
  let nearestIndex = 0;
  let nearestAmount = 0;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.samples.length; index += 1) {
    const first = layout.samples[index];
    const second = layout.samples[(index + 1) % layout.samples.length];
    if (first === undefined || second === undefined) continue;
    const segmentX = second.x - first.x;
    const segmentZ = second.z - first.z;
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const amount = lengthSquared < EPSILON ? 0 : THREE.MathUtils.clamp(
      ((x - first.x) * segmentX + (z - first.z) * segmentZ) / lengthSquared,
      0,
      1,
    );
    const projectedX = first.x + segmentX * amount;
    const projectedZ = first.z + segmentZ * amount;
    const distanceSquared = (x - projectedX) ** 2 + (z - projectedZ) ** 2;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearestIndex = index;
    nearestAmount = amount;
    nearestDistanceSquared = distanceSquared;
  }
  const first = layout.samples[nearestIndex];
  const second = layout.samples[(nearestIndex + 1) % layout.samples.length];
  if (first === undefined || second === undefined) throw new RangeError('Course projection failed');
  const secondDistance = nearestIndex === layout.samples.length - 1
    ? layout.totalLength
    : second.distance;
  const distance = THREE.MathUtils.lerp(first.distance, secondDistance, nearestAmount);
  const sample = interpolateSample(first, second, nearestAmount, distance);
  const offsetX = x - sample.x;
  const offsetZ = z - sample.z;
  return Object.freeze({
    ...sample,
    progress: wrapProgress(distance / layout.totalLength),
    distanceFromCentre: Math.sqrt(nearestDistanceSquared),
    lateralOffset: offsetX * sample.normalX + offsetZ * sample.normalZ,
    segmentIndex: nearestIndex,
  });
}
