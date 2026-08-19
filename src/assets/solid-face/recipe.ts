import { SeedTree, type Seed, normalizeSeed } from '../../core/random.js';
import { ACCENT_COLORS, SKIN_COLORS, type RgbColor } from '../../core/sketch.js';
import type { SolidFinishId } from '../../materials/finish.js';
import type { SolidRecipeHeader } from '../solid-types.js';

export type SolidFaceSpecies = 'human' | 'creature' | 'robot';
export type SolidHeadShape = 'round' | 'block' | 'tall' | 'wide';
export type SolidEyeStyle = 'button' | 'wide' | 'sleepy' | 'void';
export type SolidMouthStyle = 'smile' | 'flat' | 'open' | 'cat';
export type SolidHairStyle = 'none' | 'tuft' | 'crown';

export type SolidFaceRecipe = SolidRecipeHeader & Readonly<{
  kind: 'solid-face';
  species: SolidFaceSpecies;
  finish: SolidFinishId;
  palette: Readonly<{
    skin: RgbColor;
    ink: RgbColor;
    sclera: RgbColor;
    accent: RgbColor;
    hair: RgbColor;
  }>;
  head: Readonly<{
    shape: SolidHeadShape;
    width: number;
    height: number;
    depth: number;
    exponent: number;
  }>;
  eyes: Readonly<{
    style: SolidEyeStyle;
    spacing: number;
    height: number;
    size: number;
    pupilScale: number;
  }>;
  brows: Readonly<{
    present: boolean;
    lift: number;
    tilt: number;
  }>;
  nose: Readonly<{
    present: boolean;
    size: number;
  }>;
  mouth: Readonly<{
    style: SolidMouthStyle;
    width: number;
    height: number;
  }>;
  hair: Readonly<{
    style: SolidHairStyle;
    scale: number;
  }>;
}>;

export type SolidFaceRecipeOptions = Readonly<{
  species?: SolidFaceSpecies;
  finish?: SolidFinishId;
  shape?: SolidHeadShape;
}>;

const ROBOT_COLORS: readonly RgbColor[] = [
  [114, 126, 132],
  [153, 148, 134],
  [82, 105, 112],
  [176, 168, 148],
];

const HAIR_COLORS: readonly RgbColor[] = [
  [50, 42, 38],
  [91, 57, 39],
  [145, 104, 54],
  [61, 69, 82],
  [110, 67, 79],
];

function shapeExponent(shape: SolidHeadShape): number {
  if (shape === 'round') return 2.2;
  if (shape === 'block') return 6.8;
  return 3.1;
}

export function createSolidFaceRecipe(
  seed: Seed,
  options: SolidFaceRecipeOptions = {},
): SolidFaceRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const species = options.species ?? tree.random('solid-face:species').weighted<SolidFaceSpecies>([
    { value: 'human', weight: 5 },
    { value: 'creature', weight: 3 },
    { value: 'robot', weight: 2 },
  ]);
  const headRandom = tree.random('solid-face:head');
  const shape = options.shape ?? headRandom.weighted<SolidHeadShape>([
    { value: 'round', weight: 5 },
    { value: 'block', weight: species === 'robot' ? 5 : 2 },
    { value: 'tall', weight: 2 },
    { value: 'wide', weight: 2 },
  ]);
  const eyeRandom = tree.random('solid-face:eyes');
  const featureRandom = tree.random('solid-face:features');
  const skin = tree.random('solid-face:palette:skin').pick(
    species === 'robot' ? ROBOT_COLORS : SKIN_COLORS,
  );
  const accent = tree.random('solid-face:palette:accent').pick(ACCENT_COLORS);
  const hair = tree.random('solid-face:palette:hair').pick(HAIR_COLORS);
  const widthFactor = shape === 'wide' ? 1.16 : shape === 'tall' ? 0.88 : 1;
  const heightFactor = shape === 'tall' ? 1.15 : shape === 'wide' ? 0.9 : 1;

  return Object.freeze({
    version: 1,
    kind: 'solid-face',
    seed: normalizedSeed,
    species,
    finish: options.finish ?? (species === 'robot' ? 'metal' : 'skin'),
    palette: Object.freeze({
      skin,
      ink: [31, 29, 28] as const,
      sclera: [241, 235, 215] as const,
      accent,
      hair,
    }),
    head: Object.freeze({
      shape,
      width: headRandom.float(0.88, 1.12) * widthFactor,
      height: headRandom.float(0.92, 1.12) * heightFactor,
      depth: headRandom.float(0.88, 1.08),
      exponent: shapeExponent(shape),
    }),
    eyes: Object.freeze({
      style: eyeRandom.weighted<SolidEyeStyle>([
        { value: 'button', weight: 4 },
        { value: 'wide', weight: 3 },
        { value: 'sleepy', weight: 2 },
        { value: 'void', weight: species === 'creature' ? 3 : 1 },
      ]),
      spacing: eyeRandom.float(0.3, 0.43),
      height: eyeRandom.float(0.08, 0.2),
      size: eyeRandom.float(0.82, 1.16),
      pupilScale: eyeRandom.float(0.27, 0.43),
    }),
    brows: Object.freeze({
      present: species === 'human' && featureRandom.chance(0.42),
      lift: featureRandom.float(0.2, 0.3),
      tilt: featureRandom.float(-0.18, 0.18),
    }),
    nose: Object.freeze({
      present: featureRandom.chance(species === 'human' ? 0.44 : 0.22),
      size: featureRandom.float(0.08, 0.13),
    }),
    mouth: Object.freeze({
      style: featureRandom.weighted<SolidMouthStyle>([
        { value: 'smile', weight: 4 },
        { value: 'flat', weight: 2 },
        { value: 'open', weight: 2 },
        { value: 'cat', weight: species === 'creature' ? 3 : 1 },
      ]),
      width: featureRandom.float(0.22, 0.38),
      height: featureRandom.float(-0.28, -0.16),
    }),
    hair: Object.freeze({
      style: species === 'human'
        ? featureRandom.weighted<SolidHairStyle>([
          { value: 'none', weight: 2 },
          { value: 'tuft', weight: 3 },
          { value: 'crown', weight: 3 },
        ])
        : 'none',
      scale: featureRandom.float(0.82, 1.15),
    }),
  });
}
