import { SeedTree, normalizeSeed, type Seed } from '../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../core/sketch.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type { RecipeHeader } from '../types.js';
import { propDefinition, type PropKind } from './definition.js';

export type { PropKind } from './definition.js';

export type PropRecipe = RecipeHeader & Readonly<{
  kind: 'prop';
  prop: PropKind;
  width: number;
  height: number;
  tone: ToneStyle;
  palette: Readonly<{
    primary: RgbColor;
    accent: RgbColor;
  }>;
}>;

export type PropRecipeOptions = Readonly<{
  prop?: PropKind;
  medium?: MediumId;
}>;

const PRIMARY_COLORS: readonly RgbColor[] = [
  [83, 78, 69],
  [119, 91, 62],
  [83, 105, 83],
  [114, 83, 89],
];

export function createPropRecipe(seed: Seed, options: PropRecipeOptions = {}): PropRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const shapeRandom = tree.random('prop:shape');
  const paletteRandom = tree.random('prop:palette');
  const prop = options.prop ?? shapeRandom.pick<PropKind>(['lantern', 'crate', 'sign', 'shrub']);
  const size = propDefinition(prop).baseSize;
  return Object.freeze({
    version: 1,
    kind: 'prop',
    seed: normalizedSeed,
    medium: options.medium ?? 'graphite',
    prop,
    width: size.width * shapeRandom.float(0.9, 1.12),
    height: size.height * shapeRandom.float(0.9, 1.15),
    tone: shapeRandom.pick<ToneStyle>(['hatch', 'scribble', 'stipple', 'light']),
    palette: Object.freeze({
      primary: paletteRandom.pick(PRIMARY_COLORS),
      accent: paletteRandom.pick(ACCENT_COLORS),
    }),
  });
}
