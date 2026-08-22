import { SeedTree, normalizeSeed, type Seed } from '../../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../../core/sketch.js';

export const BUILDING_ARCHETYPES = [
  'cottage',
  'townhouse',
  'apartment',
  'high-rise',
] as const;

export type BuildingArchetype = typeof BUILDING_ARCHETYPES[number];
export type RoofStyle = 'flat' | 'gable' | 'crooked' | 'shed' | 'mansard';
export type DoorStyle = 'arched' | 'panel' | 'plank';
export type DoorHingeSide = 'left' | 'right';

export type BalconyFeature = Readonly<{
  floorFromGround: number;
  startColumn: number;
  columnSpan: number;
}>;

export type BuildingIdentityRecipe = Readonly<{
  version: 1;
  kind: 'building-identity';
  seed: number;
  archetype: BuildingArchetype;
  width: number;
  height: number;
  depth: number;
  floors: number;
  columns: number;
  roof: RoofStyle;
  door: Readonly<{
    style: DoorStyle;
    column: number;
    /** Hinge side as seen while facing the facade from outside. */
    hinge: DoorHingeSide;
    openingAngle: number;
  }>;
  balconies: readonly BalconyFeature[];
  chimney: Readonly<{
    present: boolean;
    side: 'left' | 'right';
    height: number;
  }>;
  palette: Readonly<{
    wall: RgbColor;
    accent: RgbColor;
    glass: RgbColor;
    interior: RgbColor;
  }>;
}>;

export type BuildingIdentityOptions = Readonly<{
  archetype?: BuildingArchetype;
  width?: number;
  height?: number;
  depth?: number;
  roof?: RoofStyle;
  doorStyle?: DoorStyle;
  balcony?: boolean;
  chimney?: boolean;
}>;

type ArchetypeProfile = Readonly<{
  width: readonly [minimum: number, maximum: number];
  height: readonly [minimum: number, maximum: number];
  depthRatio: readonly [minimum: number, maximum: number];
  floorHeight: readonly [minimum: number, maximum: number];
  bayWidth: readonly [minimum: number, maximum: number];
  floors: readonly [minimum: number, maximum: number];
  columns: readonly [minimum: number, maximum: number];
  roofs: readonly RoofStyle[];
  doors: readonly DoorStyle[];
  balconyChance: number;
  balconyDensity: number;
  chimneyChance: number;
}>;

const ARCHETYPE_PROFILES: Readonly<Record<BuildingArchetype, ArchetypeProfile>> = Object.freeze({
  cottage: Object.freeze({
    width: [3.6, 5.8] as const, height: [3.2, 5] as const,
    depthRatio: [0.72, 0.96] as const,
    floorHeight: [1.48, 1.72] as const, bayWidth: [1.35, 1.75] as const,
    floors: [1, 2] as const, columns: [2, 4] as const,
    roofs: ['gable', 'crooked', 'mansard'] as const,
    doors: ['arched', 'plank', 'panel'] as const,
    balconyChance: 0.28, balconyDensity: 0.65, chimneyChance: 0.76,
  }),
  townhouse: Object.freeze({
    width: [4.2, 6.8] as const, height: [5.2, 8.2] as const,
    depthRatio: [0.68, 0.88] as const,
    floorHeight: [1.35, 1.58] as const, bayWidth: [1.15, 1.48] as const,
    floors: [3, 6] as const, columns: [3, 6] as const,
    roofs: ['mansard', 'gable', 'shed'] as const,
    doors: ['panel', 'arched', 'plank'] as const,
    balconyChance: 0.58, balconyDensity: 0.9, chimneyChance: 0.58,
  }),
  apartment: Object.freeze({
    width: [6.5, 11] as const, height: [8, 14] as const,
    depthRatio: [0.58, 0.78] as const,
    floorHeight: [1.15, 1.36] as const, bayWidth: [0.95, 1.26] as const,
    floors: [5, 12] as const, columns: [5, 10] as const,
    roofs: ['flat', 'mansard', 'shed'] as const, doors: ['panel', 'arched'] as const,
    balconyChance: 0.84, balconyDensity: 1.25, chimneyChance: 0.24,
  }),
  'high-rise': Object.freeze({
    width: [5.8, 9] as const, height: [13, 24] as const,
    depthRatio: [0.62, 0.88] as const,
    floorHeight: [0.94, 1.16] as const, bayWidth: [0.82, 1.08] as const,
    floors: [10, 28] as const, columns: [5, 10] as const,
    roofs: ['flat', 'shed'] as const, doors: ['panel'] as const,
    balconyChance: 0.52, balconyDensity: 1.45, chimneyChance: 0.08,
  }),
});

const WALL_COLORS: readonly RgbColor[] = [
  [113, 105, 90],
  [132, 104, 86],
  [97, 112, 105],
  [120, 106, 123],
];

const GLASS_COLORS: readonly RgbColor[] = [
  [125, 151, 154],
  [142, 157, 151],
  [112, 132, 144],
  [167, 154, 126],
];

function positiveDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Building ${name} must be a positive finite number`);
  }
  return value;
}

function freezeColor(color: RgbColor): RgbColor {
  return Object.freeze([color[0], color[1], color[2]] as const);
}

function createBalconies(
  tree: SeedTree,
  identity: Readonly<{
    width: number;
    height: number;
    floors: number;
    columns: number;
  }>,
  density: number,
  present: boolean,
): readonly BalconyFeature[] {
  if (!present || identity.floors < 2) return Object.freeze([]);
  const upperFloors = identity.floors - 1;
  const horizontalLanes = Math.max(1, Math.floor(identity.columns / 3));
  const capacity = upperFloors * horizontalLanes;
  const requestedCount = Math.max(1, Math.floor(identity.width * identity.height / 12 * density));
  const count = Math.min(14, capacity, requestedCount);
  const balconies: BalconyFeature[] = [];

  for (let index = 0; index < count; index += 1) {
    const random = tree.random(`building:balcony:${index}`);
    const floorFromGround = 1 + (index % upperFloors);
    const lane = Math.floor(index / upperFloors) % horizontalLanes;
    const laneStart = Math.floor(lane * identity.columns / horizontalLanes);
    const laneEnd = Math.floor((lane + 1) * identity.columns / horizontalLanes);
    const availableColumns = Math.max(1, laneEnd - laneStart);
    const columnSpan = random.integer(1, Math.min(3, availableColumns));
    const startColumn = random.integer(laneStart, Math.max(laneStart, laneEnd - columnSpan));
    balconies.push(Object.freeze({ floorFromGround, startColumn, columnSpan }));
  }
  return Object.freeze(balconies);
}

export function createBuildingIdentity(
  seed: Seed,
  options: BuildingIdentityOptions = {},
): BuildingIdentityRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const archetype = options.archetype ?? tree.random('building:archetype').weighted([
    { value: 'cottage' as const, weight: 4 },
    { value: 'townhouse' as const, weight: 3 },
    { value: 'apartment' as const, weight: 2 },
    { value: 'high-rise' as const, weight: 1 },
  ]);
  const profile = ARCHETYPE_PROFILES[archetype];
  const dimensions = tree.random('building:dimensions');
  const structure = tree.random('building:structure');
  const roofRandom = tree.random('building:roof');
  const doorRandom = tree.random('building:door');
  const doorHingeRandom = tree.random('building:door:hinge');
  const doorMotionRandom = tree.random('building:door:motion');
  const balconyRandom = tree.random('building:balcony:presence');
  const chimneyRandom = tree.random('building:chimney');
  const paletteRandom = tree.random('building:palette');
  const width = positiveDimension(
    options.width ?? dimensions.float(...profile.width),
    'width',
  );
  const height = positiveDimension(
    options.height ?? dimensions.float(...profile.height),
    'height',
  );
  const depth = positiveDimension(
    options.depth ?? width * dimensions.float(...profile.depthRatio),
    'depth',
  );
  const floors = Math.max(
    profile.floors[0],
    Math.min(profile.floors[1], Math.round(height / structure.float(...profile.floorHeight))),
  );
  const columns = Math.max(
    profile.columns[0],
    Math.min(profile.columns[1], Math.round(width / structure.float(...profile.bayWidth))),
  );
  const hasBalconies = options.balcony ?? balconyRandom.chance(profile.balconyChance);
  const structuralIdentity = { width, height, floors, columns };

  return Object.freeze({
    version: 1,
    kind: 'building-identity',
    seed: normalizedSeed,
    archetype,
    width,
    height,
    depth,
    floors,
    columns,
    roof: options.roof ?? roofRandom.pick(profile.roofs),
    door: Object.freeze({
      style: options.doorStyle ?? doorRandom.pick(profile.doors),
      column: doorRandom.integer(0, columns - 1),
      hinge: doorHingeRandom.pick(['left', 'right'] as const),
      openingAngle: doorMotionRandom.float(Math.PI * 0.42, Math.PI * 0.47),
    }),
    balconies: createBalconies(
      tree,
      structuralIdentity,
      profile.balconyDensity,
      hasBalconies,
    ),
    chimney: Object.freeze({
      present: options.chimney ?? chimneyRandom.chance(profile.chimneyChance),
      side: chimneyRandom.pick(['left', 'right'] as const),
      height: chimneyRandom.float(0.42, 0.78),
    }),
    palette: Object.freeze({
      wall: freezeColor(paletteRandom.pick(WALL_COLORS)),
      accent: freezeColor(paletteRandom.pick(ACCENT_COLORS)),
      glass: freezeColor(paletteRandom.pick(GLASS_COLORS)),
      interior: freezeColor([37, 35, 31]),
    }),
  });
}
