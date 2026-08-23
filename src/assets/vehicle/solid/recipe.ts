import type { SolidFinishId } from '../../../materials/finish.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import type { VehicleIdentityRecipe } from '../identity/recipe.js';

export type SolidVehicleStyle = Readonly<{
  finish: SolidFinishId;
  glassFinish: SolidFinishId;
}>;

export type SolidVehicleRecipe = AssetRecipeEnvelope<
  'vehicle',
  'solid',
  VehicleIdentityRecipe,
  SolidVehicleStyle
>;

export type SolidVehicleRecipeOptions = Readonly<{
  finish?: SolidFinishId;
  glassFinish?: SolidFinishId;
}>;

export function createSolidVehicleRecipe(
  identity: VehicleIdentityRecipe,
  options: SolidVehicleRecipeOptions = {},
): SolidVehicleRecipe {
  return Object.freeze({
    schemaVersion: 1,
    family: 'vehicle',
    representation: 'solid',
    identity,
    style: Object.freeze({
      finish: options.finish ?? 'glossy',
      glassFinish: options.glassFinish ?? 'glossy',
    }),
  });
}
