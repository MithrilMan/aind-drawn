import * as THREE from 'three';

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
  minimumTurnRadius: number;
  bounds: CourseBounds;
}>;

export type CourseProjection = CourseSample & Readonly<{
  progress: number;
  distanceFromCentre: number;
  lateralOffset: number;
}>;

const SAMPLE_COUNT = 256;
const TRACK_WIDTH = 9.6;

const CONTROL_POINTS = Object.freeze([
  [-53, -4],
  [-46, -31],
  [-22, -44],
  [11, -42],
  [40, -31],
  [55, -9],
  [51, 18],
  [35, 40],
  [15, 46],
  [0, 35],
  [-20, 44],
  [-44, 35],
  [-57, 15],
] as const);

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

export function createCourseLayout(): CourseLayout {
  const curve = new THREE.CatmullRomCurve3(
    CONTROL_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    'centripetal',
  );
  const points = curve.getSpacedPoints(SAMPLE_COUNT).slice(0, SAMPLE_COUNT);
  const preliminary: Omit<CourseSample, 'curvature'>[] = [];
  let distance = 0;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index] as THREE.Vector3;
    const previous = points[(index - 1 + points.length) % points.length] as THREE.Vector3;
    const next = points[(index + 1) % points.length] as THREE.Vector3;
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
  const first = points[0] as THREE.Vector3;
  const last = points[points.length - 1] as THREE.Vector3;
  const totalLength = distance + last.distanceTo(first);
  const minimumTurnRadius = Math.min(...points.map((point, index) => circumradius(
    points[(index - 2 + points.length) % points.length] as THREE.Vector3,
    point,
    points[(index + 2) % points.length] as THREE.Vector3,
  )));
  const requiredTurnRadius = TRACK_WIDTH * 0.5 + 0.65;
  if (minimumTurnRadius < requiredTurnRadius) {
    throw new RangeError(
      `Course turn radius ${minimumTurnRadius.toFixed(2)} is narrower than the ${requiredTurnRadius.toFixed(2)} track extrusion limit`,
    );
  }
  const samples: CourseSample[] = preliminary.map((sample, index) => {
    const previous = preliminary[(index - 2 + preliminary.length) % preliminary.length];
    const next = preliminary[(index + 2) % preliminary.length];
    if (previous === undefined || next === undefined) throw new RangeError('Course sampling failed');
    return Object.freeze({
      ...sample,
      curvature: THREE.MathUtils.clamp(
        previous.tangentX * next.tangentZ - previous.tangentZ * next.tangentX,
        -1,
        1,
      ),
    });
  });
  const margin = 13;
  return Object.freeze({
    samples: Object.freeze(samples),
    totalLength,
    trackWidth: TRACK_WIDTH,
    minimumTurnRadius,
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
  const offsetX = x - sample.x;
  const offsetZ = z - sample.z;
  return Object.freeze({
    ...sample,
    progress: sample.distance / layout.totalLength,
    distanceFromCentre: Math.sqrt(nearestDistanceSquared),
    lateralOffset: offsetX * sample.normalX + offsetZ * sample.normalZ,
  });
}
