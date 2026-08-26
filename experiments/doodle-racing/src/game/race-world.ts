import { SeedTree } from '../../../../src/index.js';
import { nearestCoursePoint, sampleCourseAt, type CourseLayout } from './course.js';
import type { JumpRamp } from './race-jump.js';

export type SegmentObstacle = Readonly<{
  id: string;
  kind: 'barrier';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  radius: number;
  height: number;
}>;

export type CircleObstacle = Readonly<{
  id: string;
  kind: 'tyres' | 'tree';
  x: number;
  z: number;
  radius: number;
}>;

export type RaceObstacle = SegmentObstacle | CircleObstacle;

export type TrackCone = Readonly<{
  id: string;
  x: number;
  z: number;
}>;

export type TreePlacement = Readonly<{
  id: string;
  seed: number;
  x: number;
  z: number;
  scale: number;
  rotation: number;
}>;

export type SpectatorPlacement = Readonly<{
  id: string;
  seed: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  row: number;
}>;

export type GrandstandLayout = Readonly<{
  x: number;
  z: number;
  heading: number;
  length: number;
  rows: number;
  spectators: readonly SpectatorPlacement[];
}>;

export type ExplorerSpawnWaypoint = Readonly<{
  x: number;
  y: number;
  z: number;
}>;

/**
 * Map-authored entry point for the controllable character. The world owns the
 * placement and approach path; the Explore runtime only directs the entrance.
 */
export type ExplorerSpawnPlacement = Readonly<{
  id: string;
  entrance: 'smoke';
  x: number;
  y: number;
  z: number;
  heading: number;
  approach: readonly ExplorerSpawnWaypoint[];
}>;

export type RaceWorldLayout = Readonly<{
  barriers: readonly SegmentObstacle[];
  tyreStacks: readonly CircleObstacle[];
  cones: readonly TrackCone[];
  ramps: readonly JumpRamp[];
  trees: readonly TreePlacement[];
  grandstand: GrandstandLayout;
  explorerSpawn: ExplorerSpawnPlacement;
  obstacles: readonly RaceObstacle[];
}>;

export const GRANDSTAND_ROW_SPACING = 0.72;
export const GRANDSTAND_STEP_DEPTH = 1.15;
export const GRANDSTAND_STEP_BASE_HEIGHT = 0.34;
export const GRANDSTAND_STEP_HEIGHT_RISE = 0.25;
export const TRACK_BARRIER_HEIGHT = 0.56;
const DEFAULT_CROWD_SEED = 8_200;
const SPECTATORS_PER_ROW_MINIMUM = 3;
const SPECTATORS_PER_ROW_MAXIMUM = 4;
const SPECTATOR_EDGE_MARGIN = 1.1;
const SPECTATOR_MINIMUM_SPACING = 2.05;

export type GrandstandSurface = Readonly<{
  height: number;
  row: number;
}>;

export type GrandstandStepSpan = Readonly<{
  minimumAway: number;
  maximumAway: number;
  centreAway: number;
  depth: number;
}>;

export function grandstandStepHeight(row: number): number {
  return GRANDSTAND_STEP_BASE_HEIGHT + row * GRANDSTAND_STEP_HEIGHT_RISE;
}

export function grandstandStepTop(row: number): number {
  return grandstandStepHeight(row);
}

/**
 * Resolves the visible, non-overlapping volume owned by one grandstand row.
 * The original overlapping boxes form the same stair profile from the front,
 * but leave coplanar end faces fighting in the depth buffer.
 */
export function grandstandStepSpan(row: number, rows: number): GrandstandStepSpan {
  const minimumAway = row * GRANDSTAND_ROW_SPACING - GRANDSTAND_STEP_DEPTH * 0.5;
  const maximumAway = row === rows - 1
    ? row * GRANDSTAND_ROW_SPACING + GRANDSTAND_STEP_DEPTH * 0.5
    : (row + 1) * GRANDSTAND_ROW_SPACING - GRANDSTAND_STEP_DEPTH * 0.5;
  return Object.freeze({
    minimumAway,
    maximumAway,
    centreAway: (minimumAway + maximumAway) * 0.5,
    depth: maximumAway - minimumAway,
  });
}

export function grandstandSurfaceAt(
  stand: GrandstandLayout,
  away: number,
  along = 0,
): GrandstandSurface {
  if (Math.abs(along) > stand.length * 0.5) {
    return Object.freeze({ height: 0, row: -1 });
  }
  let highestRow = -1;
  let height = 0;
  for (let row = 0; row < stand.rows; row += 1) {
    const span = grandstandStepSpan(row, stand.rows);
    if (away < span.minimumAway || away > span.maximumAway) continue;
    if (grandstandStepTop(row) <= height) continue;
    highestRow = row;
    height = grandstandStepTop(row);
  }
  return Object.freeze({
    height,
    row: highestRow,
  });
}

export function grandstandLocalPoint(
  stand: GrandstandLayout,
  along: number,
  away: number,
): Readonly<{ x: number; z: number }> {
  return Object.freeze({
    x: stand.x + Math.cos(stand.heading) * along + Math.sin(stand.heading) * away,
    z: stand.z - Math.sin(stand.heading) * along + Math.cos(stand.heading) * away,
  });
}

const BARRIER_RUNS = Object.freeze([
  Object.freeze({ start: 0.055, end: 0.13, side: 1 }),
  Object.freeze({ start: 0.235, end: 0.31, side: 1 }),
  Object.freeze({ start: 0.37, end: 0.45, side: -1 }),
  Object.freeze({ start: 0.565, end: 0.665, side: -1 }),
  Object.freeze({ start: 0.82, end: 0.92, side: 1 }),
] as const);

function createBarriers(course: CourseLayout): readonly SegmentObstacle[] {
  const barriers: SegmentObstacle[] = [];
  const offset = course.trackWidth * 0.5 + 0.36;
  for (const [runIndex, run] of BARRIER_RUNS.entries()) {
    const segments = Math.max(3, Math.round((run.end - run.start) * 72));
    for (let index = 0; index < segments; index += 1) {
      const first = sampleCourseAt(course, run.start + (run.end - run.start) * index / segments);
      const second = sampleCourseAt(course, run.start + (run.end - run.start) * (index + 1) / segments);
      barriers.push(Object.freeze({
        id: `barrier:${runIndex}:${index}`,
        kind: 'barrier',
        startX: first.x + first.normalX * offset * run.side,
        startZ: first.z + first.normalZ * offset * run.side,
        endX: second.x + second.normalX * offset * run.side,
        endZ: second.z + second.normalZ * offset * run.side,
        radius: 0.28,
        height: TRACK_BARRIER_HEIGHT,
      }));
    }
  }
  return Object.freeze(barriers);
}

function pointOffTrack(
  course: CourseLayout,
  progress: number,
  side: -1 | 1,
  distance: number,
): Readonly<{ x: number; z: number }> {
  const sample = sampleCourseAt(course, progress);
  return Object.freeze({
    x: sample.x + sample.normalX * side * distance,
    z: sample.z + sample.normalZ * side * distance,
  });
}

function createTyreStacks(course: CourseLayout): readonly CircleObstacle[] {
  const points = [
    Object.freeze({ progress: 0.13, side: 1 as const }),
    Object.freeze({ progress: 0.31, side: 1 as const }),
    Object.freeze({ progress: 0.565, side: -1 as const }),
    Object.freeze({ progress: 0.665, side: -1 as const }),
    Object.freeze({ progress: 0.92, side: 1 as const }),
  ];
  return Object.freeze(points.map((point, index) => {
    const position = pointOffTrack(course, point.progress, point.side, course.trackWidth * 0.5 + 0.72);
    return Object.freeze({
      id: `tyres:${index}`,
      kind: 'tyres' as const,
      x: position.x,
      z: position.z,
      radius: 0.78,
    });
  }));
}

function createCones(course: CourseLayout): readonly TrackCone[] {
  const cones: TrackCone[] = [];
  for (let index = 0; index < 5; index += 1) {
    const progress = 0.705 + index * 0.008;
    const sample = sampleCourseAt(course, progress);
    const offset = (index % 2 === 0 ? -1 : 1) * course.trackWidth * 0.23;
    cones.push(Object.freeze({
      id: `cone:${index}`,
      x: sample.x + sample.normalX * offset,
      z: sample.z + sample.normalZ * offset,
    }));
  }
  return Object.freeze(cones);
}

const RAMP_ZONES = Object.freeze([
  Object.freeze({ start: 0.075, end: 0.115, side: -1 as const }),
  Object.freeze({ start: 0.47, end: 0.535, side: 1 as const }),
  Object.freeze({ start: 0.755, end: 0.815, side: -1 as const }),
] as const);

function createJumpRamps(course: CourseLayout): readonly JumpRamp[] {
  return Object.freeze(RAMP_ZONES.map((zone, index) => {
    let straightest = sampleCourseAt(course, zone.start);
    for (let sampleIndex = 1; sampleIndex <= 24; sampleIndex += 1) {
      const candidateProgress = zone.start + (zone.end - zone.start) * sampleIndex / 24;
      const candidate = sampleCourseAt(course, candidateProgress);
      if (Math.abs(candidate.curvature) >= Math.abs(straightest.curvature)) continue;
      straightest = candidate;
    }
    const laneOffset = zone.side * course.trackWidth * 0.15;
    return Object.freeze({
      id: `jump-ramp:${index}`,
      x: straightest.x + straightest.normalX * laneOffset,
      z: straightest.z + straightest.normalZ * laneOffset,
      tangentX: straightest.tangentX,
      tangentZ: straightest.tangentZ,
      normalX: straightest.normalX,
      normalZ: straightest.normalZ,
      length: 3.2,
      width: course.trackWidth * 0.45,
      height: 0.32,
      minimumLaunchSpeed: 14,
    });
  }));
}

type GrandstandGeometry = Readonly<Pick<
  GrandstandLayout,
  'x' | 'z' | 'heading' | 'length' | 'rows'
>>;

export function createGrandstandSpectators(
  stand: GrandstandGeometry,
  seed: number,
): readonly SpectatorPlacement[] {
  const tree = new SeedTree(seed);
  const spectators: SpectatorPlacement[] = [];
  for (let row = 0; row < stand.rows; row += 1) {
    const random = tree.random(`paper-circuit:crowd-layout:row:${row}`);
    const count = random.integer(SPECTATORS_PER_ROW_MINIMUM, SPECTATORS_PER_ROW_MAXIMUM);
    const alongPositions: number[] = [];
    for (let spectator = 0; spectator < count; spectator += 1) {
      let along = 0;
      let accepted = false;
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const candidate = random.float(
          -stand.length * 0.5 + SPECTATOR_EDGE_MARGIN,
          stand.length * 0.5 - SPECTATOR_EDGE_MARGIN,
        );
        along = candidate;
        if (alongPositions.every((position) => (
          Math.abs(candidate - position) >= SPECTATOR_MINIMUM_SPACING
        ))) {
          accepted = true;
          break;
        }
      }
      if (!accepted) {
        const minimum = -stand.length * 0.5 + SPECTATOR_EDGE_MARGIN;
        const maximum = stand.length * 0.5 - SPECTATOR_EDGE_MARGIN;
        along = Array.from({ length: 129 }, (_, index) => (
          minimum + (maximum - minimum) * index / 128
        )).reduce((best, candidate) => {
          const clearance = Math.min(...alongPositions.map((position) => (
            Math.abs(candidate - position)
          )));
          const bestClearance = Math.min(...alongPositions.map((position) => (
            Math.abs(best - position)
          )));
          return clearance > bestClearance ? candidate : best;
        }, minimum);
      }
      alongPositions.push(along);
    }
    alongPositions.sort((left, right) => left - right);
    for (const [spectator, along] of alongPositions.entries()) {
      const away = row * GRANDSTAND_ROW_SPACING + random.float(-0.16, 0.16);
      spectators.push(Object.freeze({
        id: `spectator:${row}:${spectator}`,
        seed: tree.seed(`paper-circuit:crowd-identity:${row}:${spectator}`),
        x: stand.x + Math.cos(stand.heading) * along + Math.sin(stand.heading) * away,
        y: grandstandStepTop(row),
        z: stand.z - Math.sin(stand.heading) * along + Math.cos(stand.heading) * away,
        // Character solids face local +Z. A yaw equal to the stand's along-axis
        // heading rotates that front toward the track-side normal.
        heading: stand.heading,
        row,
      }));
    }
  }
  return Object.freeze(spectators);
}

function createGrandstand(course: CourseLayout, crowdSeed: number): GrandstandLayout {
  const start = sampleCourseAt(course, 0.985);
  const standOffset = course.trackWidth * 0.5 + 5.4;
  const x = start.x - start.normalX * standOffset;
  const z = start.z - start.normalZ * standOffset;
  const heading = Math.atan2(-start.tangentZ, start.tangentX);
  const length = 15.2;
  const rows = 4;
  const spectators = createGrandstandSpectators({ x, z, heading, length, rows }, crowdSeed);
  return Object.freeze({ x, z, heading, length, rows, spectators: Object.freeze(spectators) });
}

function insetCoursePoint(
  course: CourseLayout,
  point: Readonly<{ x: number; z: number }>,
  margin: number,
): Readonly<{ x: number; z: number }> {
  return Object.freeze({
    x: Math.max(
      course.bounds.minimumX + margin,
      Math.min(course.bounds.maximumX - margin, point.x),
    ),
    z: Math.max(
      course.bounds.minimumZ + margin,
      Math.min(course.bounds.maximumZ - margin, point.z),
    ),
  });
}

function createExplorerSpawn(
  course: CourseLayout,
  grandstand: GrandstandLayout,
): ExplorerSpawnPlacement {
  const start = insetCoursePoint(
    course,
    grandstandLocalPoint(grandstand, -grandstand.length * 0.18, -4.8),
    1.6,
  );
  const middle = insetCoursePoint(
    course,
    grandstandLocalPoint(grandstand, -grandstand.length * 0.1, -2.75),
    1.05,
  );
  const destination = insetCoursePoint(
    course,
    grandstandLocalPoint(grandstand, 0, -1.02),
    0.6,
  );
  const approachHeading = Math.atan2(middle.x - start.x, middle.z - start.z);
  return Object.freeze({
    id: 'explorer-spawn:grandstand',
    entrance: 'smoke',
    x: start.x,
    y: 0,
    z: start.z,
    // Materialize facing away from the destination so the opening camera sees
    // the expression; the celebration turns the actor toward the approach.
    heading: approachHeading + Math.PI,
    approach: Object.freeze([
      Object.freeze({ x: middle.x, y: 0, z: middle.z }),
      Object.freeze({ x: destination.x, y: 0, z: destination.z }),
    ]),
  });
}

function createTrees(course: CourseLayout, grandstand: GrandstandLayout): readonly TreePlacement[] {
  const tree = new SeedTree(7391);
  const placements: TreePlacement[] = [];
  for (let attempt = 0; attempt < 160 && placements.length < 16; attempt += 1) {
    const random = tree.random(`race-tree:${attempt}`);
    const x = random.float(course.bounds.minimumX + 1, course.bounds.maximumX - 1);
    const z = random.float(course.bounds.minimumZ + 1, course.bounds.maximumZ - 1);
    const projection = nearestCoursePoint(course, x, z);
    const standDistance = Math.hypot(x - grandstand.x, z - grandstand.z);
    if (projection.distanceFromCentre < course.trackWidth * 0.5 + 3.2 || standDistance < 8.2) continue;
    if (placements.some((placement) => Math.hypot(x - placement.x, z - placement.z) < 2.6)) continue;
    placements.push(Object.freeze({
      id: `tree:${placements.length}`,
      seed: 9000 + attempt * 43,
      x,
      z,
      scale: random.float(0.62, 0.92),
      rotation: random.float(-Math.PI, Math.PI),
    }));
  }
  return Object.freeze(placements);
}

export function createRaceWorldLayout(
  course: CourseLayout,
  crowdSeed = DEFAULT_CROWD_SEED,
): RaceWorldLayout {
  const barriers = createBarriers(course);
  const tyreStacks = createTyreStacks(course);
  const grandstand = createGrandstand(course, crowdSeed);
  const trees = createTrees(course, grandstand);
  const treeObstacles: readonly CircleObstacle[] = Object.freeze(trees.map((tree) => Object.freeze({
    id: tree.id,
    kind: 'tree' as const,
    x: tree.x,
    z: tree.z,
    radius: 0.55 * tree.scale,
  })));
  return Object.freeze({
    barriers,
    tyreStacks,
    cones: createCones(course),
    ramps: createJumpRamps(course),
    trees,
    grandstand,
    explorerSpawn: createExplorerSpawn(course, grandstand),
    obstacles: Object.freeze([...barriers, ...tyreStacks, ...treeObstacles]),
  });
}
