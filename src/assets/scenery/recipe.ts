import { SeedTree, normalizeSeed, type Seed } from '../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../core/sketch.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type { RecipeHeader } from '../types.js';

export type SceneryKind = 'building' | 'platform';
export type RoofStyle = 'flat' | 'gable' | 'crooked' | 'shed' | 'mansard';
export type DoorStyle = 'arched' | 'panel' | 'plank';
export type BalconyFeature = Readonly<{
  floorFromGround: number;
  startColumn: number;
  columnSpan: number;
}>;

export type SceneryRecipe = RecipeHeader & Readonly<{
  kind: 'scenery';
  scenery: SceneryKind;
  width: number;
  height: number;
  floors: number;
  columns: number;
  roof: RoofStyle;
  door: Readonly<{
    style: DoorStyle;
    column: number;
  }>;
  balconies: readonly BalconyFeature[];
  chimney: Readonly<{
    present: boolean;
    side: 'left' | 'right';
    height: number;
  }>;
  tone: ToneStyle;
  palette: Readonly<{
    wall: RgbColor;
    accent: RgbColor;
  }>;
}>;

export type SceneryRecipeOptions = Readonly<{
  scenery?: SceneryKind;
  medium?: MediumId;
  width?: number;
  height?: number;
  roof?: RoofStyle;
  doorStyle?: DoorStyle;
  balcony?: boolean;
  chimney?: boolean;
}>;

const WALL_COLORS: readonly RgbColor[] = [
  [113, 105, 90],
  [132, 104, 86],
  [97, 112, 105],
  [120, 106, 123],
];

function createBalconies(
  tree: SeedTree,
  width: number,
  height: number,
  floors: number,
  columns: number,
  present: boolean,
): readonly BalconyFeature[] {
  if (!present) return Object.freeze([]);
  const upperFloors = Math.max(1, floors - 1);
  const horizontalLanes = Math.max(1, Math.floor(columns / 3));
  const capacity = upperFloors * horizontalLanes;
  const requestedCount = Math.max(1, Math.floor((width * height) / 12));
  const count = Math.min(6, capacity, requestedCount);
  const balconies: BalconyFeature[] = [];

  for (let index = 0; index < count; index += 1) {
    const random = tree.random(`scenery:balcony:${index}`);
    const floorFromGround = 1 + (index % upperFloors);
    const lane = Math.floor(index / upperFloors) % horizontalLanes;
    const laneStart = Math.floor((lane * columns) / horizontalLanes);
    const laneEnd = Math.floor(((lane + 1) * columns) / horizontalLanes);
    const availableColumns = Math.max(1, laneEnd - laneStart);
    const columnSpan = random.integer(1, Math.min(3, availableColumns));
    const startColumn = random.integer(laneStart, Math.max(laneStart, laneEnd - columnSpan));
    balconies.push(Object.freeze({ floorFromGround, startColumn, columnSpan }));
  }
  return Object.freeze(balconies);
}

export function createSceneryRecipe(
  seed: Seed,
  options: SceneryRecipeOptions = {},
): SceneryRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const shape = tree.random('scenery:shape');
  const roofRandom = tree.random('scenery:roof');
  const doorRandom = tree.random('scenery:door');
  const balconyPresenceRandom = tree.random('scenery:balcony:presence');
  const chimneyRandom = tree.random('scenery:chimney');
  const palette = tree.random('scenery:palette');
  const scenery = options.scenery ?? 'building';
  const width = options.width
    ?? (scenery === 'building' ? shape.float(3.8, 6.2) : shape.float(2.1, 4.8));
  const height = options.height
    ?? (scenery === 'building' ? shape.float(3.8, 6.8) : shape.float(0.55, 0.9));
  const floors = scenery === 'building' ? Math.max(2, Math.round(height / 1.45)) : 1;
  const columns = scenery === 'building' ? Math.max(2, Math.round(width / 1.4)) : 1;
  const hasBalconies = scenery === 'building'
    && (options.balcony ?? balconyPresenceRandom.chance(0.46));

  return Object.freeze({
    version: 1,
    kind: 'scenery',
    seed: normalizedSeed,
    medium: options.medium ?? 'graphite',
    scenery,
    width,
    height,
    floors,
    columns,
    roof: options.roof ?? roofRandom.pick<RoofStyle>([
      'flat', 'gable', 'crooked', 'shed', 'mansard',
    ]),
    door: Object.freeze({
      style: options.doorStyle ?? doorRandom.pick<DoorStyle>(['arched', 'panel', 'plank']),
      column: doorRandom.integer(0, columns - 1),
    }),
    balconies: createBalconies(tree, width, height, floors, columns, hasBalconies),
    chimney: Object.freeze({
      present: scenery === 'building' && (options.chimney ?? chimneyRandom.chance(0.58)),
      side: chimneyRandom.pick(['left', 'right'] as const),
      height: chimneyRandom.float(0.42, 0.78),
    }),
    tone: shape.pick<ToneStyle>(['light', 'hatch', 'scribble', 'stipple']),
    palette: Object.freeze({
      wall: palette.pick(WALL_COLORS),
      accent: palette.pick(ACCENT_COLORS),
    }),
  });
}
