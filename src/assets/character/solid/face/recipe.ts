import type { Seed } from '../../../../core/random.js';
import {
  createCharacterIdentity,
  type CharacterHeadShape,
  type CharacterIdentityRecipe,
  type CharacterIdentitySpecies,
} from '../../identity/recipe.js';
import {
  createSolidCharacterRecipe,
  type SolidCharacterRecipeOptions,
  type SolidCharacterStyle,
} from '../recipe.js';

export type SolidFaceSpecies = CharacterIdentitySpecies;
export type SolidHeadShape = CharacterHeadShape | 'block';

export type SolidFaceRecipe = Readonly<{
  version: 1;
  kind: 'solid-face';
  representation: 'solid';
  identity: CharacterIdentityRecipe;
  style: SolidCharacterStyle;
}>;

export type SolidFaceRecipeOptions = SolidCharacterRecipeOptions & Readonly<{
  species?: SolidFaceSpecies;
  shape?: SolidHeadShape;
}>;

export function createSolidFaceRecipe(
  seed: Seed,
  options: SolidFaceRecipeOptions = {},
): SolidFaceRecipe {
  const shape = options.shape === 'block' ? 'square' : options.shape;
  const identity = createCharacterIdentity(seed, {
    ...(options.species === undefined ? {} : { species: options.species }),
    ...(shape === undefined ? {} : { shape }),
  });
  const characterRecipe = createSolidCharacterRecipe(identity, {
    ...(options.finish === undefined ? {} : { finish: options.finish }),
  });
  return Object.freeze({
    ...characterRecipe,
    kind: 'solid-face',
  });
}
