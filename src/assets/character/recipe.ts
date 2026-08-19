import { SeedTree, type Random, type Seed, normalizeSeed } from '../../core/random.js';
import { ACCENT_COLORS, SKIN_COLORS, type RgbColor } from '../../core/sketch.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type { RecipeHeader } from '../types.js';

export type CharacterSpecies = 'human' | 'cat' | 'nightmare';
export type HeadShape = 'round' | 'square' | 'pear' | 'drop' | 'lump';
export type EyeStyle = 'saucer' | 'dot' | 'sleepy' | 'void' | 'star';
export type MouthStyle = 'tiny' | 'smile' | 'frown' | 'zigzag' | 'open';
export type HairStyle = 'none' | 'cap' | 'bob' | 'fringe' | 'spikes' | 'tuft';
export type OutfitStyle = 'plain' | 'stripe' | 'star' | 'buttons';

export type CharacterRecipe = RecipeHeader & Readonly<{
  kind: 'character';
  species: CharacterSpecies;
  palette: Readonly<{
    skin: RgbColor;
    cloth: RgbColor;
    hair: RgbColor;
    accent: RgbColor;
  }>;
  linePressure: number;
  head: Readonly<{
    shape: HeadShape;
    width: number;
    height: number;
    wobble: number;
    tilt: number;
    tone: ToneStyle;
  }>;
  eyes: Readonly<{
    style: EyeStyle;
    alternateStyle: EyeStyle | null;
    spacing: number;
    size: number;
    verticalOffset: number;
    glint: boolean;
  }>;
  mouth: Readonly<{
    style: MouthStyle;
    width: number;
    verticalOffset: number;
  }>;
  hair: Readonly<{
    style: HairStyle;
    height: number;
    tone: ToneStyle;
  }>;
  body: Readonly<{
    width: number;
    height: number;
    tone: ToneStyle;
    armLength: number;
    legLength: number;
    stance: number;
  }>;
  outfit: Readonly<{
    style: OutfitStyle;
    scale: number;
  }>;
  tail: Readonly<{
    present: boolean;
    length: number;
    curl: number;
  }>;
}>;

export type CharacterRecipeOptions = Readonly<{
  species?: CharacterSpecies;
  medium?: MediumId;
}>;

const HAIR_COLORS: readonly RgbColor[] = [
  [66, 57, 48],
  [112, 71, 44],
  [167, 132, 72],
  [80, 94, 108],
  [118, 83, 92],
];

function colorDistance(left: RgbColor, right: RgbColor): number {
  return Math.hypot(
    left[0] - right[0],
    left[1] - right[1],
    left[2] - right[2],
  );
}

function pickDistinctColor(
  random: Random,
  colors: readonly RgbColor[],
  against: readonly RgbColor[],
): RgbColor {
  const ranked = colors
    .map((color) => ({
      color,
      distance: Math.min(...against.map((reference) => colorDistance(color, reference))),
    }))
    .sort((left, right) => right.distance - left.distance);
  const candidates = ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.6)));
  return random.pick(candidates).color;
}

function weightedForSpecies(species: CharacterSpecies) {
  if (species === 'cat') {
    return {
      heads: [
        { value: 'pear' as const, weight: 4 },
        { value: 'round' as const, weight: 3 },
        { value: 'lump' as const, weight: 2 },
      ],
      eyes: [
        { value: 'saucer' as const, weight: 4 },
        { value: 'sleepy' as const, weight: 2 },
        { value: 'dot' as const, weight: 1 },
      ],
    };
  }
  if (species === 'nightmare') {
    return {
      heads: [
        { value: 'lump' as const, weight: 5 },
        { value: 'drop' as const, weight: 3 },
        { value: 'square' as const, weight: 2 },
      ],
      eyes: [
        { value: 'void' as const, weight: 5 },
        { value: 'star' as const, weight: 2 },
        { value: 'dot' as const, weight: 1 },
      ],
    };
  }
  return {
    heads: [
      { value: 'round' as const, weight: 4 },
      { value: 'square' as const, weight: 2 },
      { value: 'pear' as const, weight: 2 },
      { value: 'drop' as const, weight: 1 },
      { value: 'lump' as const, weight: 1 },
    ],
    eyes: [
      { value: 'saucer' as const, weight: 4 },
      { value: 'dot' as const, weight: 3 },
      { value: 'sleepy' as const, weight: 2 },
      { value: 'star' as const, weight: 1 },
    ],
  };
}

export function createCharacterRecipe(
  seed: Seed,
  options: CharacterRecipeOptions = {},
): CharacterRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const species = options.species ?? 'human';
  const casting = weightedForSpecies(species);
  const skin = tree.random('character:palette:skin').pick(SKIN_COLORS);
  const hair = pickDistinctColor(
    tree.random('character:palette:hair'),
    HAIR_COLORS,
    [skin],
  );
  const cloth = pickDistinctColor(
    tree.random('character:palette:cloth'),
    ACCENT_COLORS,
    [skin, hair],
  );
  const accent = pickDistinctColor(
    tree.random('character:palette:accent'),
    ACCENT_COLORS,
    [skin, cloth],
  );
  const headRandom = tree.random('character:head');
  const eyesRandom = tree.random('character:eyes');
  const mouthRandom = tree.random('character:mouth');
  const hairRandom = tree.random('character:hair');
  const bodyRandom = tree.random('character:body');
  const outfitRandom = tree.random('character:outfit');
  const tailRandom = tree.random('character:tail');

  const eyeStyle = eyesRandom.weighted(casting.eyes);
  const alternateStyle = eyesRandom.chance(species === 'nightmare' ? 0.55 : 0.22)
    ? eyesRandom.weighted(casting.eyes)
    : null;
  const hairStyle = species === 'cat'
    ? 'none'
    : hairRandom.weighted<HairStyle>([
      { value: 'none', weight: 2 },
      { value: 'cap', weight: 3 },
      { value: 'bob', weight: 2 },
      { value: 'fringe', weight: 2 },
      { value: 'spikes', weight: 2 },
      { value: 'tuft', weight: 1 },
    ]);
  const outfitStyle = species === 'cat'
    ? 'plain'
    : outfitRandom.weighted<OutfitStyle>([
      { value: 'plain', weight: 5 },
      { value: 'stripe', weight: 3 },
      { value: 'star', weight: 2 },
      { value: 'buttons', weight: species === 'human' ? 2 : 1 },
    ]);

  return Object.freeze({
    version: 1,
    kind: 'character',
    seed: normalizedSeed,
    species,
    medium: options.medium ?? 'graphite',
    palette: Object.freeze({
      skin,
      cloth,
      hair,
      accent,
    }),
    linePressure: tree.random('character:line').float(0.86, 1.2),
    head: Object.freeze({
      shape: headRandom.weighted(casting.heads),
      width: headRandom.float(0.82, 1.14),
      height: headRandom.float(0.88, 1.16),
      wobble: species === 'nightmare' ? headRandom.float(0.75, 1.25) : headRandom.float(0.35, 0.72),
      tilt: headRandom.float(-0.09, 0.09),
      tone: species === 'nightmare' ? 'scribble' : headRandom.pick<ToneStyle>(['light', 'light', 'hatch']),
    }),
    eyes: Object.freeze({
      style: eyeStyle,
      alternateStyle,
      spacing: eyesRandom.float(0.37, 0.52),
      size: eyesRandom.float(0.82, 1.22),
      verticalOffset: eyesRandom.float(-0.08, 0.05),
      glint: eyesRandom.chance(0.82),
    }),
    mouth: Object.freeze({
      style: mouthRandom.weighted<MouthStyle>([
        { value: 'tiny', weight: 4 },
        { value: 'smile', weight: 3 },
        { value: 'frown', weight: 2 },
        { value: 'zigzag', weight: 1 },
      ]),
      width: mouthRandom.float(0.2, 0.43),
      verticalOffset: mouthRandom.float(0.28, 0.43),
    }),
    hair: Object.freeze({
      style: hairStyle,
      height: hairRandom.float(0.2, 0.48),
      tone: hairRandom.pick<ToneStyle>(['hatch', 'scribble', 'black']),
    }),
    body: Object.freeze({
      width: species === 'cat'
        ? bodyRandom.float(0.54, 0.72)
        : bodyRandom.float(0.42, 0.63),
      height: species === 'cat'
        ? bodyRandom.float(0.38, 0.54)
        : bodyRandom.float(0.5, 0.72),
      tone: bodyRandom.pick<ToneStyle>(['light', 'hatch', 'scribble']),
      armLength: species === 'cat'
        ? bodyRandom.float(0.36, 0.5)
        : bodyRandom.float(0.44, 0.63),
      legLength: species === 'cat'
        ? bodyRandom.float(0.19, 0.3)
        : bodyRandom.float(0.25, 0.42),
      stance: species === 'cat'
        ? bodyRandom.float(0.24, 0.36)
        : bodyRandom.float(0.18, 0.32),
    }),
    outfit: Object.freeze({
      style: outfitStyle,
      scale: outfitRandom.float(0.82, 1.18),
    }),
    tail: Object.freeze({
      present: species === 'cat' || (species === 'nightmare' && tailRandom.chance(0.48)),
      length: tailRandom.float(0.72, 1.08),
      curl: tailRandom.float(-0.7, 0.86),
    }),
  });
}
