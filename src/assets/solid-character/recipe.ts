import { SeedTree } from '../../core/random.js';
import type { SolidFinishId } from '../../materials/finish.js';
import type { CharacterHeadShape, CharacterIdentityRecipe } from '../character-identity/recipe.js';

export type SolidCharacterStyle = Readonly<{
  finish: SolidFinishId;
  depth: number;
  exponent: number;
  pupilScale: number;
}>;

export type SolidCharacterRecipe = Readonly<{
  version: 1;
  kind: 'solid-character';
  representation: 'solid';
  identity: CharacterIdentityRecipe;
  style: SolidCharacterStyle;
}>;

export type SolidCharacterRecipeOptions = Readonly<{
  finish?: SolidFinishId;
}>;

function shapeExponent(shape: CharacterHeadShape): number {
  if (shape === 'square') return 6.8;
  if (shape === 'wide' || shape === 'tall') return 3.1;
  if (shape === 'lump') return 2.55;
  return 2.2;
}

export function createSolidCharacterRecipe(
  identity: CharacterIdentityRecipe,
  options: SolidCharacterRecipeOptions = {},
): SolidCharacterRecipe {
  const random = new SeedTree(identity.seed).random('character:solid');
  return Object.freeze({
    version: 1,
    kind: 'solid-character',
    representation: 'solid',
    identity,
    style: Object.freeze({
      finish: options.finish ?? (identity.species === 'robot' ? 'metal' : 'skin'),
      depth: random.float(0.88, 1.08),
      exponent: shapeExponent(identity.head.shape),
      pupilScale: random.float(0.27, 0.43),
    }),
  });
}
