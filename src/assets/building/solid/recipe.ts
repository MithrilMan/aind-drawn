import type { SolidFinishId } from '../../../materials/finish.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type SolidBuildingStyle = Readonly<{
  finish: SolidFinishId;
  windowFinish: SolidFinishId;
}>;

export type SolidBuildingRecipe = Readonly<{
  version: 1;
  kind: 'solid-building';
  representation: 'solid';
  identity: BuildingIdentityRecipe;
  style: SolidBuildingStyle;
}>;

export type SolidBuildingRecipeOptions = Readonly<{
  finish?: SolidFinishId;
}>;

export function createSolidBuildingRecipe(
  identity: BuildingIdentityRecipe,
  options: SolidBuildingRecipeOptions = {},
): SolidBuildingRecipe {
  return Object.freeze({
    version: 1,
    kind: 'solid-building',
    representation: 'solid',
    identity,
    style: Object.freeze({
      finish: options.finish ?? 'matte',
      windowFinish: 'glossy',
    }),
  });
}
