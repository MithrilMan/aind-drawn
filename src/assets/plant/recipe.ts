import { TAU } from '../../core/geometry.js';
import { SeedTree, normalizeSeed, type Random, type Seed } from '../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../core/sketch.js';
import type { MediumId } from '../../materials/medium.js';
import type { RecipeHeader } from '../types.js';

export type PlantSpecies = 'grass' | 'plant' | 'tree' | 'flower' | 'wildcard';
export type PlantStemStyle = 'none' | 'stalk' | 'trunk';
export type PlantLeafStyle = 'tuft' | 'rosette' | 'crown' | 'sprig';
export type PlantBloomStyle = 'none' | 'daisy' | 'ball' | 'blossom' | 'seedhead';

export type PlantPlacement = Readonly<{
  angle: number;
  radial: number;
  scale: number;
  rise: number;
  curl: number;
}>;

export type PlantRecipe = RecipeHeader & Readonly<{
  kind: 'plant';
  species: PlantSpecies;
  linePressure: number;
  palette: Readonly<{
    ground: RgbColor;
    stem: RgbColor;
    leaf: RgbColor;
    leafShadow: RgbColor;
    bloom: RgbColor;
    bloomCenter: RgbColor;
  }>;
  mound: Readonly<{
    radius: number;
    height: number;
    bump: boolean;
    bumpSide: number;
    bumpScale: number;
  }>;
  stem: Readonly<{
    style: PlantStemStyle;
    height: number;
    radius: number;
    lean: number;
  }>;
  leaves: Readonly<{
    style: PlantLeafStyle;
    size: number;
    lean: number;
    placements: readonly PlantPlacement[];
  }>;
  bloom: Readonly<{
    style: PlantBloomStyle;
    size: number;
    petals: number;
    placements: readonly PlantPlacement[];
  }>;
}>;

export type PlantRecipeOptions = Readonly<{
  species?: PlantSpecies;
  medium?: MediumId;
}>;

const GROUND_COLORS: readonly RgbColor[] = [
  [113, 91, 66],
  [128, 105, 73],
  [91, 86, 72],
  [139, 113, 86],
];

const LEAF_COLORS: readonly RgbColor[] = [
  [74, 111, 73],
  [88, 126, 82],
  [64, 104, 91],
  [113, 123, 72],
  [87, 99, 67],
];

const STEM_COLORS: readonly RgbColor[] = [
  [91, 75, 54],
  [104, 82, 57],
  [78, 94, 65],
  [91, 105, 69],
];

function shade(color: RgbColor, factor: number): RgbColor {
  return color.map((channel) => Math.round(channel * factor)) as unknown as RgbColor;
}

function freezePlacements(values: readonly PlantPlacement[]): readonly PlantPlacement[] {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

function placements(random: Random, count: number): readonly PlantPlacement[] {
  return freezePlacements(Array.from({ length: count }, (_, index) => ({
    angle: index / Math.max(1, count) * TAU + random.float(-0.24, 0.24),
    radial: random.float(0.18, 1),
    scale: random.float(0.72, 1.25),
    rise: random.float(-0.18, 0.92),
    curl: random.float(-0.32, 0.34),
  })));
}

function stemStyle(species: PlantSpecies, random: Random): PlantStemStyle {
  if (species === 'grass') return 'none';
  if (species === 'tree') return 'trunk';
  if (species === 'plant' || species === 'flower') return 'stalk';
  return random.weighted([
    { value: 'none', weight: 2 },
    { value: 'stalk', weight: 5 },
    { value: 'trunk', weight: 3 },
  ]);
}

function leafStyle(species: PlantSpecies, random: Random): PlantLeafStyle {
  if (species === 'grass') return 'tuft';
  if (species === 'plant') return 'rosette';
  if (species === 'tree') return 'crown';
  if (species === 'flower') return 'sprig';
  return random.weighted([
    { value: 'tuft', weight: 4 },
    { value: 'rosette', weight: 3 },
    { value: 'crown', weight: 2 },
    { value: 'sprig', weight: 2 },
  ]);
}

function bloomStyle(species: PlantSpecies, random: Random): PlantBloomStyle {
  if (species === 'grass') {
    return random.weighted([{ value: 'none', weight: 8 }, { value: 'seedhead', weight: 2 }]);
  }
  if (species === 'plant') {
    return random.weighted([{ value: 'none', weight: 7 }, { value: 'ball', weight: 3 }]);
  }
  if (species === 'tree') {
    return random.weighted([{ value: 'none', weight: 7 }, { value: 'blossom', weight: 3 }]);
  }
  if (species === 'flower') return 'daisy';
  return random.weighted([
    { value: 'none', weight: 5 },
    { value: 'daisy', weight: 2 },
    { value: 'ball', weight: 1 },
    { value: 'blossom', weight: 1 },
    { value: 'seedhead', weight: 1 },
  ]);
}

function countFor(style: PlantLeafStyle, random: Random): number {
  if (style === 'tuft') return random.integer(11, 19);
  if (style === 'rosette') return random.integer(5, 8);
  if (style === 'crown') return random.integer(4, 7);
  return random.integer(2, 4);
}

export function createPlantRecipe(
  seed: Seed,
  options: PlantRecipeOptions = {},
): PlantRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const species = options.species ?? tree.random('plant:species').weighted<PlantSpecies>([
    { value: 'grass', weight: 22 },
    { value: 'plant', weight: 22 },
    { value: 'tree', weight: 22 },
    { value: 'flower', weight: 22 },
    { value: 'wildcard', weight: 12 },
  ]);
  const moundRandom = tree.random('plant:mound');
  const stemRandom = tree.random('plant:stem');
  const leafRandom = tree.random('plant:leaves');
  const bloomRandom = tree.random('plant:bloom');
  const selectedStem = stemStyle(species, stemRandom);
  const selectedLeaves = leafStyle(species, leafRandom);
  const selectedBloom = bloomStyle(species, bloomRandom);

  const moundRadius = species === 'tree'
    ? moundRandom.float(0.78, 1.08)
    : species === 'flower'
      ? moundRandom.float(0.48, 0.76)
      : moundRandom.float(0.62, 1.02);
  const stemHeight = selectedStem === 'none'
    ? 0
    : selectedStem === 'trunk'
      ? stemRandom.float(1.55, 2.55)
      : species === 'plant'
        ? stemRandom.float(0.65, 1.12)
        : stemRandom.float(0.9, 1.58);
  const stemRadius = selectedStem === 'trunk'
    ? stemRandom.float(0.28, 0.48)
    : selectedStem === 'stalk'
      ? stemRandom.float(0.07, 0.14)
      : 0;
  const leafSize = selectedLeaves === 'crown'
    ? leafRandom.float(0.82, 1.16)
    : selectedLeaves === 'sprig'
      ? leafRandom.float(0.48, 0.76)
      : leafRandom.float(0.68, 1.18);
  const leafPlacements = placements(leafRandom, countFor(selectedLeaves, leafRandom));
  const bloomPlacements = placements(
    bloomRandom,
    selectedBloom === 'blossom' ? bloomRandom.integer(7, 11) : 3,
  );

  const ground = tree.random('plant:palette:ground').pick(GROUND_COLORS);
  const leaf = tree.random('plant:palette:leaf').pick(LEAF_COLORS);
  const stem = selectedStem === 'trunk'
    ? tree.random('plant:palette:stem').pick(STEM_COLORS.slice(0, 2))
    : tree.random('plant:palette:stem').pick(STEM_COLORS.slice(2));
  const bloom = tree.random('plant:palette:bloom').pick(ACCENT_COLORS);

  return Object.freeze({
    version: 1,
    kind: 'plant',
    seed: normalizedSeed,
    species,
    medium: options.medium ?? 'graphite',
    linePressure: tree.random('plant:line').float(0.88, 1.17),
    palette: Object.freeze({
      ground,
      stem,
      leaf,
      leafShadow: shade(leaf, 0.72),
      bloom,
      bloomCenter: shade(bloom, 0.62),
    }),
    mound: Object.freeze({
      radius: moundRadius,
      height: moundRandom.float(0.28, species === 'tree' ? 0.58 : 0.48),
      bump: moundRandom.chance(species === 'grass' ? 0.32 : 0.68),
      bumpSide: moundRandom.float(-0.72, 0.72),
      bumpScale: moundRandom.float(0.38, 0.6),
    }),
    stem: Object.freeze({
      style: selectedStem,
      height: stemHeight,
      radius: stemRadius,
      lean: selectedStem === 'none' ? 0 : stemRandom.float(-0.15, 0.15),
    }),
    leaves: Object.freeze({
      style: selectedLeaves,
      size: leafSize,
      lean: leafRandom.float(0.28, 0.56),
      placements: leafPlacements,
    }),
    bloom: Object.freeze({
      style: selectedBloom,
      size: bloomRandom.float(0.48, species === 'flower' ? 1.12 : 0.92),
      petals: bloomRandom.integer(7, 10),
      placements: bloomPlacements,
    }),
  });
}

export function plantRecipeFingerprint(recipe: PlantRecipe): string {
  return `${recipe.version}:${recipe.seed}:${recipe.species}:${recipe.medium}`;
}
