import { SeedTree, normalizeSeed, type Seed } from '../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../core/sketch.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type { RecipeHeader } from '../types.js';

export type PlatformRecipe = RecipeHeader & Readonly<{
  kind: 'platform';
  width: number;
  height: number;
  tone: ToneStyle;
  palette: Readonly<{
    ground: RgbColor;
    accent: RgbColor;
  }>;
}>;

export type PlatformRecipeOptions = Readonly<{
  medium?: MediumId;
  width?: number;
  height?: number;
}>;

const GROUND_COLORS: readonly RgbColor[] = [
  [113, 105, 90], [132, 104, 86], [97, 112, 105], [120, 106, 123],
];

function positiveDimension(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`Platform ${name} must be a positive finite number`);
  }
  return value;
}

function freezeColor(color: RgbColor): RgbColor {
  return Object.freeze([color[0], color[1], color[2]] as const);
}

export function createPlatformRecipe(
  seed: Seed,
  options: PlatformRecipeOptions = {},
): PlatformRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const shape = tree.random('platform:shape');
  const palette = tree.random('platform:palette');
  const width = positiveDimension(options.width ?? shape.float(2.1, 4.8), 'width');
  const height = positiveDimension(options.height ?? shape.float(0.55, 0.9), 'height');
  return Object.freeze({
    version: 1,
    kind: 'platform',
    seed: normalizedSeed,
    medium: options.medium ?? 'graphite',
    width,
    height,
    tone: shape.pick<ToneStyle>(['light', 'hatch', 'scribble', 'stipple']),
    palette: Object.freeze({
      ground: freezeColor(palette.pick(GROUND_COLORS)),
      accent: freezeColor(palette.pick(ACCENT_COLORS)),
    }),
  });
}
