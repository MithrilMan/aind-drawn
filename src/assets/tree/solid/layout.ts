import type { Bounds3, Point3 } from '../../../core/geometry3.js';
import type { Pose3, SolidNodeDefinition, SolidSocketDefinition } from '../../../contracts/solid-asset.js';
import type { TreeBranchProfile } from '../identity/recipe.js';
import type { SolidTreeRecipe } from './recipe.js';

export type SolidTreeBranchLayout = Readonly<{
  id: string;
  parentId: string;
  start: Point3;
  end: Point3;
  startRadius: number;
  endRadius: number;
}>;

export type SolidTreeCanopyLayout = Readonly<{
  id: string;
  ownerBranchId: string;
  centre: Point3;
  radii: Point3;
  lobeAmplitude: number;
  lobeCount: number;
  lobePhase: number;
}>;

export type SolidTreeLayout = Readonly<{
  height: number;
  trunkHeight: number;
  trunkBaseRadius: number;
  trunkTopRadius: number;
  branches: readonly SolidTreeBranchLayout[];
  canopy: readonly SolidTreeCanopyLayout[];
  bounds: Bounds3;
  nodes: readonly SolidNodeDefinition[];
  sockets: readonly SolidSocketDefinition[];
}>;

const IDENTITY_ROTATION = Object.freeze([0, 0, 0, 1] as const);

function point(x: number, y: number, z: number): Point3 {
  return Object.freeze([x, y, z] as const);
}

function pose(position: Point3): Pose3 {
  return Object.freeze({ position, rotation: IDENTITY_ROTATION });
}

function mixPoint(start: Point3, end: Point3, amount: number): Point3 {
  return point(
    start[0] + (end[0] - start[0]) * amount,
    start[1] + (end[1] - start[1]) * amount,
    start[2] + (end[2] - start[2]) * amount,
  );
}

function branchStart(
  profile: TreeBranchProfile,
  trunkHeight: number,
  existing: ReadonlyMap<string, SolidTreeBranchLayout>,
): Point3 {
  if (profile.parentId === 'trunk') return point(0, trunkHeight * profile.attachAlong, 0);
  const parent = existing.get(profile.parentId);
  if (parent === undefined) throw new Error(`Tree branch ${profile.id} references missing parent ${profile.parentId}`);
  return mixPoint(parent.start, parent.end, profile.attachAlong);
}

function expandBounds(minimum: number[], maximum: number[], centre: Point3, radii: Point3): void {
  for (let axis = 0; axis < 3; axis += 1) {
    minimum[axis] = Math.min(minimum[axis] as number, (centre[axis] as number) - (radii[axis] as number));
    maximum[axis] = Math.max(maximum[axis] as number, (centre[axis] as number) + (radii[axis] as number));
  }
}

export function buildSolidTreeLayout(recipe: SolidTreeRecipe): SolidTreeLayout {
  const identity = recipe.identity;
  const height = identity.height;
  const trunkHeight = height * identity.trunk.heightRatio;
  const trunkBaseRadius = height * identity.trunk.baseRadiusRatio;
  const trunkTopRadius = height * identity.trunk.topRadiusRatio;
  const branchMap = new Map<string, SolidTreeBranchLayout>();
  const branches = identity.branches.map((profile) => {
    const start = branchStart(profile, trunkHeight, branchMap);
    const length = height * profile.lengthRatio;
    const horizontal = Math.sin(profile.inclination);
    const direction: Point3 = point(
      Math.cos(profile.azimuth) * horizontal,
      Math.cos(profile.inclination),
      Math.sin(profile.azimuth) * horizontal,
    );
    const end = point(
      start[0] + direction[0] * length,
      start[1] + direction[1] * length,
      start[2] + direction[2] * length,
    );
    const branch = Object.freeze({
      id: profile.id,
      parentId: profile.parentId,
      start,
      end,
      startRadius: trunkBaseRadius * profile.radiusRatio,
      endRadius: trunkBaseRadius * profile.radiusRatio * 0.38,
    });
    branchMap.set(branch.id, branch);
    return branch;
  });

  const canopy = identity.canopy.map((profile) => {
    const branch = branchMap.get(profile.ownerBranchId);
    if (branch === undefined) throw new Error(`Tree canopy ${profile.id} references missing branch ${profile.ownerBranchId}`);
    return Object.freeze({
      id: profile.id,
      ownerBranchId: profile.ownerBranchId,
      centre: mixPoint(branch.start, branch.end, profile.along),
      radii: point(
        height * profile.radiiRatio[0],
        height * profile.radiiRatio[1],
        height * profile.radiiRatio[2],
      ),
      lobeAmplitude: profile.lobeAmplitude,
      lobeCount: profile.lobeCount,
      lobePhase: profile.lobePhase,
    });
  });

  const minimum = [-trunkBaseRadius, 0, -trunkBaseRadius];
  const maximum = [trunkBaseRadius, trunkHeight, trunkBaseRadius];
  for (const branch of branches) {
    expandBounds(minimum, maximum, branch.start, point(branch.startRadius, branch.startRadius, branch.startRadius));
    expandBounds(minimum, maximum, branch.end, point(branch.endRadius, branch.endRadius, branch.endRadius));
  }
  for (const cluster of canopy) expandBounds(minimum, maximum, cluster.centre, cluster.radii);

  return Object.freeze({
    height,
    trunkHeight,
    trunkBaseRadius,
    trunkTopRadius,
    branches: Object.freeze(branches),
    canopy: Object.freeze(canopy),
    bounds: Object.freeze({
      minimum: point(minimum[0] as number, minimum[1] as number, minimum[2] as number),
      maximum: point(maximum[0] as number, maximum[1] as number, maximum[2] as number),
    }),
    nodes: Object.freeze([Object.freeze({ id: 'root', restPose: pose(point(0, 0, 0)) })]),
    sockets: Object.freeze([
      Object.freeze({ id: 'base', node: 'root', localPose: pose(point(0, 0, 0)) }),
      Object.freeze({ id: 'crown', node: 'root', localPose: pose(point(0, maximum[1] as number, 0)) }),
      ...branches.map((branch) => Object.freeze({
        id: `${branch.id}:tip`,
        node: 'root',
        localPose: pose(branch.end),
      })),
    ]),
  });
}
