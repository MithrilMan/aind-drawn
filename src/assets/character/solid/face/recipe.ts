import type { Seed } from '../../../../core/random.js';
import {
  createCharacterIdentity,
  type CharacterHeadShape,
  type CharacterIdentitySpecies,
} from '../../identity/recipe.js';
import {
  createSolidCharacterRecipe,
  type SolidCharacterRecipeOptions,
  type SolidCharacterRecipe,
} from '../recipe.js';

export type SolidFaceSpecies = CharacterIdentitySpecies;
export type SolidHeadShape = CharacterHeadShape | 'block';

export type SolidFaceRecipe = SolidCharacterRecipe;

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
  return createSolidCharacterRecipe(identity, {
    ...(options.finish === undefined ? {} : { finish: options.finish }),
  });
}
