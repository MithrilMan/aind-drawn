import * as THREE from 'three';

export type CourseSample = Readonly<{
  x: number;
  z: number;
  tangentX: number;
  tangentZ: number;
  normalX: number;
  normalZ: number;
  distance: number;
}>;

export type CourseBounds = Readonly<{
  minimumX: number;
  maximumX: number;
  minimumZ: number;
  maximumZ: number;
}>;

export type CourseLayout = Readonly<{
  samples: readonly CourseSample[];
  totalLength: number;
  trackWidth: number;
  bounds: CourseBounds;
}>;

export type CourseProjection = CourseSample & Readonly<{
  progress: number;
  distanceFromCentre: number;
}>;

const SAMPLE_COUNT = 192;
const TRACK_WIDTH = 7.4;

const CONTROL_POINTS = Object.freeze([
  [-18, -2],
  [-13, -12],
  [-2, -14],
  [10, -12],
  [18, -4],
  [17, 7],
  [8, 13],
  [-4, 12],
  [-15, 8],
] as const);

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
    distance,
  });
}

export function createCourseLayout(): CourseLayout {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const points = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, SAMPLE_COUNT);
  const samples: CourseSample[] = [];
  let distance = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as THREE.Vector3;
    const previous = points[(index - 1 + points.length) % points.length] as THREE.Vector3;
    const next = points[(index + 1) % points.length] as THREE.Vector3;
    if (index > 0) distance += point.distanceTo(previous);
    const tangent = next.clone().sub(previous).normalize();
    samples.push(Object.freeze({
      x: point.x,
      z: point.z,
      tangentX: tangent.x,
      tangentZ: tangent.z,
      normalX: -tangent.z,
      normalZ: tangent.x,
      distance,
    }));
  }
  const first = points[0] as THREE.Vector3;
  const last = points[points.length - 1] as THREE.Vector3;
  const totalLength = distance + last.distanceTo(first);
  const margin = TRACK_WIDTH * 0.72;
  return Object.freeze({
    samples: Object.freeze(samples),
    totalLength,
    trackWidth: TRACK_WIDTH,
    bounds: Object.freeze({
      minimumX: Math.min(...samples.map(({ x }) => x)) - margin,
      maximumX: Math.max(...samples.map(({ x }) => x)) + margin,
      minimumZ: Math.min(...samples.map(({ z }) => z)) - margin,
      maximumZ: Math.max(...samples.map(({ z }) => z)) + margin,
    }),
  });
}

export function sampleCourseAt(layout: CourseLayout, progress: number): CourseSample {
  const targetDistance = wrapProgress(progress) * layout.totalLength;
  const samples = layout.samples;
  for (let index = 0; index < samples.length; index += 1) {
    const first = samples[index] as CourseSample;
    const second = samples[(index + 1) % samples.length] as CourseSample;
    const secondDistance = index === samples.length - 1
      ? layout.totalLength
      : second.distance;
    if (targetDistance > secondDistance) continue;
    const amount = (targetDistance - first.distance)
      / Math.max(1e-9, secondDistance - first.distance);
    return interpolateSample(first, second, amount, targetDistance);
  }
  return samples[0] as CourseSample;
}

export function nearestCoursePoint(
  layout: CourseLayout,
  x: number,
  z: number,
): CourseProjection {
  let nearestIndex = 0;
  let nearestDistanceSquared = Number.POSITIVE_INFINITY;
  for (let index = 0; index < layout.samples.length; index += 1) {
    const sample = layout.samples[index] as CourseSample;
    const distanceSquared = (sample.x - x) ** 2 + (sample.z - z) ** 2;
    if (distanceSquared >= nearestDistanceSquared) continue;
    nearestIndex = index;
    nearestDistanceSquared = distanceSquared;
  }
  const sample = layout.samples[nearestIndex] as CourseSample;
  return Object.freeze({
    ...sample,
    progress: sample.distance / layout.totalLength,
    distanceFromCentre: Math.sqrt(nearestDistanceSquared),
  });
}
