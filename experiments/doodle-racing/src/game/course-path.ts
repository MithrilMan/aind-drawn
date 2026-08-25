export type CoursePathPoint = readonly [x: number, y: number];

export type CoursePathRecipe = Readonly<{
  schemaVersion: 1;
  points: readonly CoursePathPoint[];
  worldScale: number;
  trackWidth: number;
}>;

export type CoursePathRecipeOptions = Readonly<{
  worldScale?: number;
  trackWidth?: number;
}>;

export type CourseStrokeCompileOptions = CoursePathRecipeOptions & Readonly<{
  closureTolerance?: number;
  simplificationTolerance?: number;
}>;

export type CoursePathValidationCode =
  | 'point-count'
  | 'point-limit'
  | 'non-finite-point'
  | 'path-span'
  | 'path-closure'
  | 'path-length'
  | 'self-intersection'
  | 'track-clearance'
  | 'turn-radius';

export class CoursePathValidationError extends RangeError {
  public constructor(
    public readonly code: CoursePathValidationCode,
    message: string,
  ) {
    super(message);
    this.name = 'CoursePathValidationError';
  }
}

const DEFAULT_WORLD_SCALE = 112;
const DEFAULT_TRACK_WIDTH = 9.6;
const DEFAULT_CLOSURE_TOLERANCE = 0.16;
const DEFAULT_SIMPLIFICATION_TOLERANCE = 0.008;
const MAX_STROKE_POINTS = 8192;
const MINIMUM_POINT_SEPARATION = 1e-6;

const DEFAULT_WORLD_POINTS = Object.freeze([
  Object.freeze([-53, -4] as const),
  Object.freeze([-46, -31] as const),
  Object.freeze([-22, -44] as const),
  Object.freeze([11, -42] as const),
  Object.freeze([40, -31] as const),
  Object.freeze([55, -9] as const),
  Object.freeze([51, 18] as const),
  Object.freeze([35, 40] as const),
  Object.freeze([15, 46] as const),
  Object.freeze([0, 35] as const),
  Object.freeze([-20, 44] as const),
  Object.freeze([-44, 35] as const),
  Object.freeze([-57, 15] as const),
] satisfies readonly CoursePathPoint[]);

function positiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number`);
  }
  return value;
}

function finitePoint(point: CoursePathPoint, index: number): CoursePathPoint {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new CoursePathValidationError(
      'non-finite-point',
      `Course path point ${index} must contain finite coordinates`,
    );
  }
  return Object.freeze([point[0], point[1]] as const);
}

function distanceSquared(first: CoursePathPoint, second: CoursePathPoint): number {
  return (second[0] - first[0]) ** 2 + (second[1] - first[1]) ** 2;
}

function collapseConsecutivePoints(points: readonly CoursePathPoint[]): readonly CoursePathPoint[] {
  const collapsed: CoursePathPoint[] = [];
  for (const [index, source] of points.entries()) {
    const point = finitePoint(source, index);
    const previous = collapsed[collapsed.length - 1];
    if (previous !== undefined && distanceSquared(previous, point) < MINIMUM_POINT_SEPARATION ** 2) {
      continue;
    }
    collapsed.push(point);
  }
  return Object.freeze(collapsed);
}

function normalizedPoints(points: readonly CoursePathPoint[]): readonly CoursePathPoint[] {
  const minimumX = Math.min(...points.map((point) => point[0]));
  const maximumX = Math.max(...points.map((point) => point[0]));
  const minimumY = Math.min(...points.map((point) => point[1]));
  const maximumY = Math.max(...points.map((point) => point[1]));
  const span = Math.max(maximumX - minimumX, maximumY - minimumY);
  if (!(span > MINIMUM_POINT_SEPARATION)) {
    throw new CoursePathValidationError(
      'path-span',
      'Course path must occupy a non-zero two-dimensional area',
    );
  }
  const centreX = (minimumX + maximumX) * 0.5;
  const centreY = (minimumY + maximumY) * 0.5;
  return Object.freeze(points.map((point) => Object.freeze([
    (point[0] - centreX) / span,
    (point[1] - centreY) / span,
  ] as const)));
}

function pointSegmentDistanceSquared(
  point: CoursePathPoint,
  start: CoursePathPoint,
  end: CoursePathPoint,
): number {
  const segmentX = end[0] - start[0];
  const segmentY = end[1] - start[1];
  const lengthSquared = segmentX * segmentX + segmentY * segmentY;
  if (lengthSquared < MINIMUM_POINT_SEPARATION ** 2) return distanceSquared(point, start);
  const amount = Math.max(0, Math.min(1, (
    (point[0] - start[0]) * segmentX + (point[1] - start[1]) * segmentY
  ) / lengthSquared));
  const projected: CoursePathPoint = [
    start[0] + segmentX * amount,
    start[1] + segmentY * amount,
  ];
  return distanceSquared(point, projected);
}

function simplifyPoints(
  points: readonly CoursePathPoint[],
  tolerance: number,
): readonly CoursePathPoint[] {
  if (points.length <= 2) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const pending: (readonly [start: number, end: number])[] = [[0, points.length - 1]];
  const toleranceSquared = tolerance * tolerance;
  while (pending.length > 0) {
    const range = pending.pop();
    if (range === undefined) continue;
    const [startIndex, endIndex] = range;
    const start = points[startIndex];
    const end = points[endIndex];
    if (start === undefined || end === undefined) continue;
    let farthestIndex = -1;
    let farthestDistanceSquared = toleranceSquared;
    for (let index = startIndex + 1; index < endIndex; index += 1) {
      const point = points[index];
      if (point === undefined) continue;
      const candidate = pointSegmentDistanceSquared(point, start, end);
      if (candidate <= farthestDistanceSquared) continue;
      farthestDistanceSquared = candidate;
      farthestIndex = index;
    }
    if (farthestIndex < 0) continue;
    keep[farthestIndex] = 1;
    pending.push([startIndex, farthestIndex], [farthestIndex, endIndex]);
  }
  return Object.freeze(points.filter((_, index) => keep[index] === 1));
}

export function createCoursePathRecipe(
  sourcePoints: readonly CoursePathPoint[],
  options: CoursePathRecipeOptions = {},
): CoursePathRecipe {
  if (sourcePoints.length > MAX_STROKE_POINTS) {
    throw new CoursePathValidationError(
      'point-limit',
      `Course path cannot contain more than ${MAX_STROKE_POINTS} points`,
    );
  }
  const points = collapseConsecutivePoints(sourcePoints);
  const first = points[0];
  const last = points[points.length - 1];
  const uniquePoints = first !== undefined
    && last !== undefined
    && points.length > 1
    && distanceSquared(first, last) < MINIMUM_POINT_SEPARATION ** 2
    ? points.slice(0, -1)
    : points;
  if (uniquePoints.length < 4) {
    throw new CoursePathValidationError(
      'point-count',
      'Course path requires at least four distinct control points',
    );
  }
  return Object.freeze({
    schemaVersion: 1,
    points: normalizedPoints(uniquePoints),
    worldScale: positiveFinite(options.worldScale ?? DEFAULT_WORLD_SCALE, 'Course world scale'),
    trackWidth: positiveFinite(options.trackWidth ?? DEFAULT_TRACK_WIDTH, 'Course track width'),
  });
}

export function compileCourseStrokeRecipe(
  sourcePoints: readonly CoursePathPoint[],
  options: CourseStrokeCompileOptions = {},
): CoursePathRecipe {
  if (sourcePoints.length > MAX_STROKE_POINTS) {
    throw new CoursePathValidationError(
      'point-limit',
      `Course stroke cannot contain more than ${MAX_STROKE_POINTS} points`,
    );
  }
  const collapsed = collapseConsecutivePoints(sourcePoints);
  if (collapsed.length < 5) {
    throw new CoursePathValidationError(
      'point-count',
      'Course stroke requires at least five sampled points',
    );
  }
  const normalized = normalizedPoints(collapsed);
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first === undefined || last === undefined) {
    throw new CoursePathValidationError('point-count', 'Course stroke is empty');
  }
  const closureTolerance = positiveFinite(
    options.closureTolerance ?? DEFAULT_CLOSURE_TOLERANCE,
    'Course closure tolerance',
  );
  if (Math.sqrt(distanceSquared(first, last)) > closureTolerance) {
    throw new CoursePathValidationError(
      'path-closure',
      'Finish the pencil stroke near its starting point to close the circuit',
    );
  }
  const simplificationTolerance = positiveFinite(
    options.simplificationTolerance ?? DEFAULT_SIMPLIFICATION_TOLERANCE,
    'Course simplification tolerance',
  );
  const simplified = simplifyPoints(normalized, simplificationTolerance);
  return createCoursePathRecipe(simplified.slice(0, -1), options);
}

export const DEFAULT_COURSE_PATH_RECIPE = createCoursePathRecipe(
  DEFAULT_WORLD_POINTS,
  Object.freeze({ worldScale: DEFAULT_WORLD_SCALE, trackWidth: DEFAULT_TRACK_WIDTH }),
);
