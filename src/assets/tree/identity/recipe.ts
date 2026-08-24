import type { AssetIdentityEnvelope } from '../../../contracts/asset-envelope.js';
import { SeedTree, normalizeSeed, type Seed } from '../../../core/random.js';
import type { RgbColor } from '../../../core/sketch.js';

export const TREE_ARCHETYPES = ['broadleaf', 'pine', 'windswept'] as const;
export const TREE_SEASONS = ['summer', 'autumn'] as const;

export type TreeArchetype = typeof TREE_ARCHETYPES[number];
export type TreeSeason = typeof TREE_SEASONS[number];

export type TreeBranchProfile = Readonly<{
  id: string;
  parentId: string;
  attachAlong: number;
  azimuth: number;
  inclination: number;
  lengthRatio: number;
  radiusRatio: number;
}>;

export type TreeCanopyProfile = Readonly<{
  id: string;
  ownerBranchId: string;
  along: number;
  radiiRatio: readonly [x: number, y: number, z: number];
  lobeAmplitude: number;
  lobeCount: number;
  lobePhase: number;
}>;

export type TreeIdentityRecipe = AssetIdentityEnvelope<'tree'> & Readonly<{
  archetype: TreeArchetype;
  season: TreeSeason;
  height: number;
  trunk: Readonly<{
    heightRatio: number;
    baseRadiusRatio: number;
    topRadiusRatio: number;
  }>;
  branches: readonly TreeBranchProfile[];
  canopy: readonly TreeCanopyProfile[];
  palette: Readonly<{
    bark: RgbColor;
    foliage: RgbColor;
    foliageAccent: RgbColor;
  }>;
}>;

export type TreeIdentityOptions = Readonly<{
  archetype?: TreeArchetype;
  season?: TreeSeason;
  height?: number;
}>;

const BARK_COLORS: readonly RgbColor[] = Object.freeze([
  Object.freeze([88, 65, 46] as const),
  Object.freeze([101, 76, 51] as const),
  Object.freeze([72, 67, 55] as const),
]);

const SUMMER_FOLIAGE: readonly (readonly [RgbColor, RgbColor])[] = Object.freeze([
  Object.freeze([Object.freeze([70, 104, 56] as const), Object.freeze([111, 132, 72] as const)] as const),
  Object.freeze([Object.freeze([58, 91, 63] as const), Object.freeze([94, 126, 80] as const)] as const),
  Object.freeze([Object.freeze([82, 112, 58] as const), Object.freeze([134, 143, 77] as const)] as const),
]);

const AUTUMN_FOLIAGE: readonly (readonly [RgbColor, RgbColor])[] = Object.freeze([
  Object.freeze([Object.freeze([163, 82, 45] as const), Object.freeze([210, 140, 62] as const)] as const),
  Object.freeze([Object.freeze([137, 70, 43] as const), Object.freeze([187, 113, 49] as const)] as const),
  Object.freeze([Object.freeze([170, 112, 42] as const), Object.freeze([205, 151, 70] as const)] as const),
]);

function positiveHeight(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('Tree height must be a positive finite number');
  }
  return value;
}

function branchCount(archetype: TreeArchetype, random: ReturnType<SeedTree['random']>): number {
  if (archetype === 'pine') return random.integer(8, 10);
  if (archetype === 'windswept') return random.integer(5, 7);
  return random.integer(6, 8);
}

function createBranches(tree: SeedTree, archetype: TreeArchetype): readonly TreeBranchProfile[] {
  const count = branchCount(archetype, tree.random('tree:branches:count'));
  const branches: TreeBranchProfile[] = [];
  const primaryCount = Math.max(4, count - 2);
  const sweepDirection = tree.random('tree:branches:sweep').float(-Math.PI, Math.PI);
  for (let index = 0; index < count; index += 1) {
    const random = tree.random(`tree:branch:${index}`);
    const primary = index < primaryCount;
    const parentIndex = primary ? -1 : random.integer(0, Math.max(0, primaryCount - 1));
    const parentId = parentIndex < 0 ? 'trunk' : `branch:${parentIndex}`;
    const azimuthBase = index / Math.max(1, primaryCount) * Math.PI * 2;
    const azimuth = archetype === 'windswept'
      ? sweepDirection + random.float(-0.72, 0.72)
      : azimuthBase + random.float(-0.42, 0.42);
    const inclination = archetype === 'pine'
      ? random.float(0.88, 1.18)
      : random.float(0.56, 1.02);
    branches.push(Object.freeze({
      id: `branch:${index}`,
      parentId,
      attachAlong: primary ? random.float(0.34, 0.88) : random.float(0.52, 0.84),
      azimuth,
      inclination,
      lengthRatio: primary ? random.float(0.18, 0.31) : random.float(0.1, 0.18),
      radiusRatio: primary ? random.float(0.34, 0.52) : random.float(0.2, 0.32),
    }));
  }
  return Object.freeze(branches);
}

function createCanopy(
  tree: SeedTree,
  archetype: TreeArchetype,
  branches: readonly TreeBranchProfile[],
): readonly TreeCanopyProfile[] {
  return Object.freeze(branches.map((branch, index) => {
    const random = tree.random(`tree:canopy:${index}`);
    const pine = archetype === 'pine';
    const windswept = archetype === 'windswept';
    return Object.freeze({
      id: `canopy:${index}`,
      ownerBranchId: branch.id,
      along: random.float(0.78, 1),
      radiiRatio: Object.freeze([
        random.float(windswept ? 0.12 : 0.1, windswept ? 0.18 : 0.16),
        random.float(pine ? 0.17 : 0.11, pine ? 0.24 : 0.17),
        random.float(0.1, 0.16),
      ] as const),
      lobeAmplitude: random.float(0.035, 0.095),
      lobeCount: random.integer(3, 7),
      lobePhase: random.float(-Math.PI, Math.PI),
    });
  }));
}

export function createTreeIdentity(
  seed: Seed,
  options: TreeIdentityOptions = {},
): TreeIdentityRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const archetype = options.archetype ?? tree.random('tree:archetype').weighted([
    { value: 'broadleaf' as const, weight: 5 },
    { value: 'pine' as const, weight: 3 },
    { value: 'windswept' as const, weight: 2 },
  ]);
  const season = options.season ?? tree.random('tree:season').weighted([
    { value: 'summer' as const, weight: 4 },
    { value: 'autumn' as const, weight: 1 },
  ]);
  const dimensions = tree.random('tree:dimensions');
  const height = positiveHeight(options.height ?? dimensions.float(3.8, 6.4));
  const branches = createBranches(tree, archetype);
  const foliage = tree.random('tree:palette').pick(
    season === 'summer' ? SUMMER_FOLIAGE : AUTUMN_FOLIAGE,
  );

  return Object.freeze({
    schemaVersion: 1,
    family: 'tree',
    seed: normalizedSeed,
    archetype,
    season,
    height,
    trunk: Object.freeze({
      heightRatio: dimensions.float(archetype === 'pine' ? 0.66 : 0.5, archetype === 'pine' ? 0.78 : 0.64),
      baseRadiusRatio: dimensions.float(0.045, 0.065),
      topRadiusRatio: dimensions.float(0.018, 0.032),
    }),
    branches,
    canopy: createCanopy(tree, archetype, branches),
    palette: Object.freeze({
      bark: tree.random('tree:palette:bark').pick(BARK_COLORS),
      foliage: foliage[0],
      foliageAccent: foliage[1],
    }),
  });
}
