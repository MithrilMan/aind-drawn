import { SeedTree, type Random, type Seed, normalizeSeed } from '../../../core/random.js';
import { ACCENT_COLORS, SKIN_COLORS, type RgbColor } from '../../../core/sketch.js';
import type { AssetIdentityEnvelope } from '../../../contracts/asset-envelope.js';

export type CharacterIdentitySpecies = 'human' | 'cat' | 'nightmare' | 'creature' | 'robot';
export type CharacterHeadShape = 'round' | 'square' | 'pear' | 'drop' | 'lump' | 'tall' | 'wide';
export type CharacterEyeStyle = 'saucer' | 'dot' | 'sleepy' | 'void' | 'star';
export type CharacterMouthStyle =
  | 'tiny'
  | 'smile'
  | 'frown'
  | 'zigzag'
  | 'open'
  | 'flat'
  | 'cat'
  | 'grin'
  | 'maw'
  | 'fangs'
  | 'buckteeth'
  | 'stitch';
export type CharacterDentalStyle = 'none' | 'row' | 'grit' | 'fangs' | 'buck';
export type CharacterHairStyle =
  | 'none'
  | 'cap'
  | 'bob'
  | 'fringe'
  | 'spikes'
  | 'tuft'
  | 'quiff'
  | 'crown';
export type CharacterOutfitStyle = 'plain' | 'stripe' | 'star' | 'buttons';
export type CharacterNoseStyle = 'none' | 'button' | 'drop';
export type CharacterEarStyle = 'none' | 'round' | 'pointed';
export type CharacterFacialHairStyle = 'none' | 'full-rounded';
export type CharacterEyewearStyle = 'none' | 'heavy-square';

export type CharacterEyewearAccessoryRecipe = Readonly<{
  kind: 'eyewear';
  style: Exclude<CharacterEyewearStyle, 'none'>;
  color: RgbColor;
  lensWidth: number;
  lensHeight: number;
  bridgeWidth: number;
  frameThickness: number;
  verticalOffset: number;
  spatial: Readonly<{
    kind: 'wrap';
    host: 'head';
    rearReach: number;
  }>;
}>;

/** A representation-neutral, typed extension point for wearable character parts. */
export type CharacterAccessoryRecipe = CharacterEyewearAccessoryRecipe;

export type CharacterIdentityRecipe = AssetIdentityEnvelope<'character'> & Readonly<{
  species: CharacterIdentitySpecies;
  palette: Readonly<{
    skin: RgbColor;
    cloth: RgbColor;
    hair: RgbColor;
    accent: RgbColor;
    ink: RgbColor;
    sclera: RgbColor;
    tear: RgbColor;
    skinAccent: RgbColor;
  }>;
  head: Readonly<{
    shape: CharacterHeadShape;
    width: number;
    height: number;
    wobble: number;
    tilt: number;
    phase: number;
  }>;
  eyes: Readonly<{
    style: CharacterEyeStyle;
    alternateStyle: CharacterEyeStyle | null;
    spacing: number;
    size: number;
    verticalOffset: number;
    glint: boolean;
  }>;
  brows: Readonly<{ present: boolean; lift: number; tilt: number }>;
  ears: Readonly<{ style: CharacterEarStyle; size: number }>;
  nose: Readonly<{
    present: boolean;
    style: CharacterNoseStyle;
    size: number;
    length: number;
  }>;
  mouth: Readonly<{
    style: CharacterMouthStyle;
    width: number;
    verticalOffset: number;
    teeth: CharacterDentalStyle;
    toothCount: number;
    tongue: boolean;
  }>;
  hair: Readonly<{ style: CharacterHairStyle; height: number }>;
  facialHair: Readonly<{
    style: CharacterFacialHairStyle;
    width: number;
    length: number;
    bulk: number;
  }>;
  accessories: readonly CharacterAccessoryRecipe[];
  body: Readonly<{
    width: number;
    height: number;
    armLength: number;
    legLength: number;
    stance: number;
  }>;
  outfit: Readonly<{ style: CharacterOutfitStyle; scale: number }>;
  tail: Readonly<{ present: boolean; length: number; curl: number }>;
}>;

export type CharacterIdentityOptions = Readonly<{
  species?: CharacterIdentitySpecies;
  shape?: CharacterHeadShape;
  eyeStyle?: CharacterEyeStyle;
  alternateEyeStyle?: CharacterEyeStyle | null;
  mouthStyle?: CharacterMouthStyle;
  mouthTeeth?: CharacterDentalStyle;
  mouthTongue?: boolean;
  hairStyle?: CharacterHairStyle;
  facialHairStyle?: CharacterFacialHairStyle;
  eyewearStyle?: CharacterEyewearStyle;
  noseStyle?: CharacterNoseStyle;
  earStyle?: CharacterEarStyle;
  outfitStyle?: CharacterOutfitStyle;
}>;

const HAIR_COLORS: readonly RgbColor[] = [
  [66, 57, 48], [112, 71, 44], [167, 132, 72], [80, 94, 108], [118, 83, 92],
];

const ROBOT_COLORS: readonly RgbColor[] = [
  [114, 126, 132], [153, 148, 134], [82, 105, 112], [176, 168, 148],
];

function colorDistance(left: RgbColor, right: RgbColor): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function freezeColor(color: RgbColor): RgbColor {
  return Object.freeze([color[0], color[1], color[2]] as const);
}

function mixColor(left: RgbColor, right: RgbColor, amount: number): RgbColor {
  const mix = (index: 0 | 1 | 2): number => Math.round(
    left[index] + (right[index] - left[index]) * amount,
  );
  return freezeColor([mix(0), mix(1), mix(2)]);
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
  return random.pick(ranked.slice(0, Math.max(1, Math.ceil(ranked.length * 0.6)))).color;
}

function castingFor(species: CharacterIdentitySpecies) {
  if (species === 'cat') {
    return {
      heads: [
        { value: 'pear' as const, weight: 4 }, { value: 'round' as const, weight: 3 },
        { value: 'lump' as const, weight: 2 },
      ],
      eyes: [
        { value: 'saucer' as const, weight: 4 }, { value: 'sleepy' as const, weight: 2 },
        { value: 'dot' as const, weight: 1 },
      ],
    };
  }
  if (species === 'nightmare' || species === 'creature') {
    return {
      heads: [
        { value: 'lump' as const, weight: 5 }, { value: 'drop' as const, weight: 3 },
        { value: 'wide' as const, weight: species === 'creature' ? 2 : 0 },
        { value: 'square' as const, weight: 2 },
      ],
      eyes: [
        { value: 'void' as const, weight: 5 }, { value: 'star' as const, weight: 2 },
        { value: 'dot' as const, weight: 1 },
      ],
    };
  }
  if (species === 'robot') {
    return {
      heads: [
        { value: 'square' as const, weight: 6 }, { value: 'wide' as const, weight: 2 },
        { value: 'tall' as const, weight: 2 },
      ],
      eyes: [
        { value: 'dot' as const, weight: 4 }, { value: 'void' as const, weight: 3 },
        { value: 'saucer' as const, weight: 2 },
      ],
    };
  }
  return {
    heads: [
      { value: 'round' as const, weight: 4 }, { value: 'square' as const, weight: 2 },
      { value: 'pear' as const, weight: 2 }, { value: 'drop' as const, weight: 1 },
      { value: 'lump' as const, weight: 1 },
    ],
    eyes: [
      { value: 'saucer' as const, weight: 4 }, { value: 'dot' as const, weight: 3 },
      { value: 'sleepy' as const, weight: 2 }, { value: 'star' as const, weight: 1 },
    ],
  };
}

function mouthFor(species: CharacterIdentitySpecies, random: Random): CharacterMouthStyle {
  if (species === 'cat') {
    return random.weighted([
      { value: 'cat', weight: 5 }, { value: 'smile', weight: 2 },
      { value: 'fangs', weight: 2 }, { value: 'open', weight: 1 },
    ]);
  }
  if (species === 'nightmare') {
    return random.weighted([
      { value: 'maw', weight: 4 }, { value: 'grin', weight: 3 },
      { value: 'fangs', weight: 2 }, { value: 'stitch', weight: 2 },
      { value: 'zigzag', weight: 1 },
    ]);
  }
  if (species === 'creature') {
    return random.weighted([
      { value: 'maw', weight: 3 }, { value: 'open', weight: 2 },
      { value: 'grin', weight: 2 }, { value: 'fangs', weight: 2 },
      { value: 'cat', weight: 1 }, { value: 'zigzag', weight: 1 },
    ]);
  }
  if (species === 'robot') {
    return random.weighted([
      { value: 'flat', weight: 4 }, { value: 'grin', weight: 3 },
      { value: 'open', weight: 2 }, { value: 'zigzag', weight: 2 },
    ]);
  }
  return random.weighted([
    { value: 'tiny', weight: 4 }, { value: 'smile', weight: 3 },
    { value: 'frown', weight: 2 }, { value: 'grin', weight: 2 },
    { value: 'buckteeth', weight: 1 }, { value: 'stitch', weight: 1 },
    { value: 'open', weight: 1 }, { value: 'zigzag', weight: 1 },
  ]);
}

function dentalFor(
  style: CharacterMouthStyle,
  species: CharacterIdentitySpecies,
  random: Random,
): CharacterDentalStyle {
  if (style === 'grin') return 'grit';
  if (style === 'maw') return 'row';
  if (style === 'fangs') return 'fangs';
  if (style === 'buckteeth') return 'buck';
  const probability = species === 'nightmare' || species === 'creature' ? 0.62
    : species === 'cat' ? 0.34
      : species === 'robot' ? 0.28 : 0.14;
  if (!random.chance(probability)) return 'none';
  return random.weighted<CharacterDentalStyle>([
    { value: 'row', weight: 4 },
    { value: 'fangs', weight: species === 'cat' || species === 'creature' ? 3 : 1 },
    { value: 'buck', weight: species === 'human' ? 2 : 1 },
  ]);
}

export function createCharacterIdentity(
  seed: Seed,
  options: CharacterIdentityOptions = {},
): CharacterIdentityRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const species = options.species ?? 'human';
  const casting = castingFor(species);
  const skin = tree.random('character:palette:skin').pick(
    species === 'robot' ? ROBOT_COLORS : SKIN_COLORS,
  );
  const hair = pickDistinctColor(tree.random('character:palette:hair'), HAIR_COLORS, [skin]);
  const cloth = pickDistinctColor(tree.random('character:palette:cloth'), ACCENT_COLORS, [skin, hair]);
  const accent = pickDistinctColor(tree.random('character:palette:accent'), ACCENT_COLORS, [skin, cloth]);
  const headRandom = tree.random('character:head');
  const eyesRandom = tree.random('character:eyes');
  const mouthStyleRandom = tree.random('character:mouth:style');
  const mouthDentalRandom = tree.random('character:mouth:dental');
  const mouthTongueRandom = tree.random('character:mouth:tongue');
  const mouthMeasurementRandom = tree.random('character:mouth:measurements');
  const hairRandom = tree.random('character:hair');
  const bodyRandom = tree.random('character:body');
  const outfitRandom = tree.random('character:outfit');
  const tailRandom = tree.random('character:tail');
  const detailsRandom = tree.random('character:face-details');
  const earRandom = tree.random('character:ears');
  const facialHairRandom = tree.random('character:facial-hair');
  const eyewearRandom = tree.random('character:accessory:eyewear');
  const generatedEyeStyle = eyesRandom.weighted(casting.eyes);
  const eyeStyle = options.eyeStyle ?? generatedEyeStyle;
  const isCreature = species === 'nightmare' || species === 'creature';
  const generatedHeadShape = headRandom.weighted(casting.heads);
  const headShape = options.shape ?? generatedHeadShape;
  const headWidthFactor = headShape === 'wide' ? 1.12 : headShape === 'tall' ? 0.9 : 1;
  const headHeightFactor = headShape === 'tall' ? 1.12 : headShape === 'wide' ? 0.92 : 1;
  const generatedAlternateStyle = eyesRandom.chance(isCreature ? 0.55 : 0.22)
    ? eyesRandom.weighted(casting.eyes)
    : null;
  const alternateStyle = options.alternateEyeStyle !== undefined
    ? options.alternateEyeStyle
    : generatedAlternateStyle;
  // Preserve the established face-detail draw order. New traits use their own
  // namespaces so adding accessories cannot silently recast existing brows.
  const browsPresent = (species === 'human' || species === 'creature')
    && detailsRandom.chance(0.42);
  const browsLift = detailsRandom.float(0.2, 0.3);
  const browsTilt = detailsRandom.float(-0.18, 0.18);
  const generatedHairStyle = species === 'cat' || species === 'robot'
    ? 'none'
    : hairRandom.weighted<CharacterHairStyle>([
      { value: 'none', weight: 2 }, { value: 'cap', weight: 3 },
      { value: 'bob', weight: 2 }, { value: 'fringe', weight: 2 },
      { value: 'spikes', weight: 2 }, { value: 'tuft', weight: 1 },
      { value: 'quiff', weight: species === 'human' ? 1 : 0 },
      { value: 'crown', weight: species === 'creature' ? 1 : 0 },
    ]);
  const hairStyle = options.hairStyle ?? generatedHairStyle;
  const generatedNoseStyle: CharacterNoseStyle = detailsRandom.chance(
    species === 'human' ? 0.44 : 0.22,
  ) ? 'button' : 'none';
  const noseStyle = options.noseStyle ?? generatedNoseStyle;
  const generatedEarStyle: CharacterEarStyle = species === 'cat'
    || species === 'nightmare' || species === 'creature'
    ? 'pointed'
    : species === 'human' && earRandom.chance(0.32) ? 'round' : 'none';
  const earStyle = options.earStyle ?? generatedEarStyle;
  const generatedFacialHairStyle: CharacterFacialHairStyle = species === 'human'
    && facialHairRandom.chance(0.16) ? 'full-rounded' : 'none';
  const facialHairStyle = options.facialHairStyle ?? generatedFacialHairStyle;
  const generatedEyewearStyle: CharacterEyewearStyle = species === 'human'
    && eyewearRandom.chance(0.16) ? 'heavy-square' : 'none';
  const eyewearStyle = options.eyewearStyle ?? generatedEyewearStyle;
  const generatedOutfitStyle = species === 'cat'
    ? 'plain'
    : outfitRandom.weighted<CharacterOutfitStyle>([
      { value: 'plain', weight: 5 }, { value: 'stripe', weight: 3 },
      { value: 'star', weight: 2 },
      { value: 'buttons', weight: species === 'human' || species === 'robot' ? 2 : 1 },
    ]);
  const outfitStyle = options.outfitStyle ?? generatedOutfitStyle;
  const generatedMouthStyle = mouthFor(species, mouthStyleRandom);
  const mouthStyle = options.mouthStyle ?? generatedMouthStyle;
  const generatedDentalStyle = dentalFor(mouthStyle, species, mouthDentalRandom);
  const generatedTongue = (mouthStyle === 'open' || mouthStyle === 'maw')
    && mouthTongueRandom.chance(species === 'creature' || species === 'cat' ? 0.48 : 0.2);

  return Object.freeze({
    schemaVersion: 1,
    family: 'character',
    seed: normalizedSeed,
    species,
    palette: Object.freeze({
      skin: freezeColor(skin),
      cloth: freezeColor(cloth),
      hair: freezeColor(hair),
      accent: freezeColor(accent),
      ink: freezeColor([31, 29, 28]),
      sclera: freezeColor([241, 235, 215]),
      tear: freezeColor([91, 148, 176]),
      skinAccent: mixColor(skin, [211, 91, 91], 0.34),
    }),
    head: Object.freeze({
      shape: headShape,
      width: headRandom.float(0.82, 1.14) * headWidthFactor,
      height: headRandom.float(0.88, 1.16) * headHeightFactor,
      wobble: isCreature ? headRandom.float(0.75, 1.25) : headRandom.float(0.35, 0.72),
      tilt: headRandom.float(-0.09, 0.09),
      phase: headRandom.float(0, Math.PI * 2),
    }),
    eyes: Object.freeze({
      style: eyeStyle,
      alternateStyle,
      spacing: eyesRandom.float(0.44, 0.62),
      size: eyesRandom.float(0.82, 1.22),
      verticalOffset: eyesRandom.float(-0.08, 0.05),
      glint: eyesRandom.chance(0.82),
    }),
    brows: Object.freeze({
      present: browsPresent,
      lift: browsLift,
      tilt: browsTilt,
    }),
    ears: Object.freeze({ style: earStyle, size: earRandom.float(0.82, 1.18) }),
    nose: Object.freeze({
      present: noseStyle !== 'none',
      style: noseStyle,
      size: noseStyle === 'drop'
        ? detailsRandom.float(0.15, 0.2)
        : detailsRandom.float(0.08, 0.13),
      length: noseStyle === 'drop'
        ? detailsRandom.float(0.3, 0.4)
        : detailsRandom.float(0.07, 0.12),
    }),
    mouth: Object.freeze({
      style: mouthStyle,
      width: mouthMeasurementRandom.float(0.2, 0.43),
      verticalOffset: mouthMeasurementRandom.float(0.28, 0.43),
      teeth: options.mouthTeeth ?? generatedDentalStyle,
      toothCount: mouthMeasurementRandom.integer(3, 5),
      tongue: options.mouthTongue ?? generatedTongue,
    }),
    hair: Object.freeze({ style: hairStyle, height: hairRandom.float(0.2, 0.48) }),
    facialHair: Object.freeze({
      style: facialHairStyle,
      width: facialHairRandom.float(0.9, 1.08),
      length: facialHairRandom.float(0.92, 1.04),
      bulk: facialHairRandom.float(0.88, 1.12),
    }),
    accessories: Object.freeze(eyewearStyle === 'none' ? [] : [Object.freeze({
      kind: 'eyewear' as const,
      style: eyewearStyle,
      color: freezeColor(accent),
      lensWidth: eyewearRandom.float(0.36, 0.41),
      lensHeight: eyewearRandom.float(0.28, 0.34),
      bridgeWidth: eyewearRandom.float(0.1, 0.16),
      frameThickness: eyewearRandom.float(0.035, 0.052),
      verticalOffset: eyewearRandom.float(-0.025, 0.025),
      spatial: Object.freeze({
        kind: 'wrap' as const,
        host: 'head' as const,
        rearReach: eyewearRandom.float(0.72, 0.9),
      }),
    })]),
    body: Object.freeze({
      width: species === 'cat' ? bodyRandom.float(0.54, 0.72) : bodyRandom.float(0.42, 0.63),
      height: species === 'cat' ? bodyRandom.float(0.38, 0.54) : bodyRandom.float(0.5, 0.72),
      armLength: species === 'cat' ? bodyRandom.float(0.36, 0.5) : bodyRandom.float(0.44, 0.63),
      legLength: species === 'cat' ? bodyRandom.float(0.19, 0.3) : bodyRandom.float(0.25, 0.42),
      stance: species === 'cat' ? bodyRandom.float(0.24, 0.36) : bodyRandom.float(0.18, 0.32),
    }),
    outfit: Object.freeze({ style: outfitStyle, scale: outfitRandom.float(0.82, 1.18) }),
    tail: Object.freeze({
      present: species === 'cat' || (isCreature && tailRandom.chance(0.48)),
      length: tailRandom.float(0.72, 1.08),
      curl: tailRandom.float(-0.7, 0.86),
    }),
  });
}

export function characterIdentityFingerprint(identity: CharacterIdentityRecipe): string {
  return `${identity.schemaVersion}:${identity.seed}:${identity.species}:${identity.head.shape}`;
}
