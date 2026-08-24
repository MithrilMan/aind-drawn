import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import type { SolidFinishId } from '../../../materials/finish.js';
import type { TreeIdentityRecipe } from '../identity/recipe.js';

export type SolidTreeStyle = Readonly<{
  finish: SolidFinishId;
}>;

export type SolidTreeRecipe = AssetRecipeEnvelope<
  'tree',
  'solid',
  TreeIdentityRecipe,
  SolidTreeStyle
>;

export type SolidTreeRecipeOptions = Readonly<{
  finish?: SolidFinishId;
}>;

export function createSolidTreeRecipe(
  identity: TreeIdentityRecipe,
  options: SolidTreeRecipeOptions = {},
): SolidTreeRecipe {
  return Object.freeze({
    schemaVersion: 1,
    family: 'tree',
    representation: 'solid',
    identity,
    style: Object.freeze({ finish: options.finish ?? 'matte' }),
  });
}
