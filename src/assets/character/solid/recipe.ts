import { SeedTree } from '../../../core/random.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import type { SolidFinishId } from '../../../materials/finish.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';

export type SolidCharacterStyle = Readonly<{
  finish: SolidFinishId;
  depth: number;
}>;

export type SolidCharacterRecipe = AssetRecipeEnvelope<
  'character',
  'solid',
  CharacterIdentityRecipe,
  SolidCharacterStyle
>;

export type SolidCharacterRecipeOptions = Readonly<{
  finish?: SolidFinishId;
}>;

export function createSolidCharacterRecipe(
  identity: CharacterIdentityRecipe,
  options: SolidCharacterRecipeOptions = {},
): SolidCharacterRecipe {
  const random = new SeedTree(identity.seed).random('character:solid');
  return Object.freeze({
    schemaVersion: 1,
    family: 'character',
    representation: 'solid',
    identity,
    style: Object.freeze({
      finish: options.finish ?? (identity.species === 'robot' ? 'metal' : 'skin'),
      depth: random.float(0.88, 1.08),
    }),
  });
}
