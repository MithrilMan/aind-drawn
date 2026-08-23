import type { SolidFinishId } from '../../../materials/finish.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type SolidBuildingStyle = Readonly<{
  finish: SolidFinishId;
  windowFinish: SolidFinishId;
}>;

export type SolidBuildingRecipe = AssetRecipeEnvelope<
  'building',
  'solid',
  BuildingIdentityRecipe,
  SolidBuildingStyle
>;

export type SolidBuildingRecipeOptions = Readonly<{
  finish?: SolidFinishId;
}>;

export function createSolidBuildingRecipe(
  identity: BuildingIdentityRecipe,
  options: SolidBuildingRecipeOptions = {},
): SolidBuildingRecipe {
  return Object.freeze({
    schemaVersion: 1,
    family: 'building',
    representation: 'solid',
    identity,
    style: Object.freeze({
      finish: options.finish ?? 'matte',
      windowFinish: 'glossy',
    }),
  });
}
