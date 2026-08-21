import type { SolidFinishId } from '../../materials/finish.js';
import type { VehicleIdentityRecipe } from '../vehicle-identity/recipe.js';

export type SolidVehicleRecipe = Readonly<{
  version: 1;
  kind: 'solid-vehicle';
  seed: number;
  identity: VehicleIdentityRecipe;
  style: Readonly<{
    finish: SolidFinishId;
    glassFinish: SolidFinishId;
  }>;
}>;

export type SolidVehicleRecipeOptions = Readonly<{
  finish?: SolidFinishId;
  glassFinish?: SolidFinishId;
}>;

export function createSolidVehicleRecipe(
  identity: VehicleIdentityRecipe,
  options: SolidVehicleRecipeOptions = {},
): SolidVehicleRecipe {
  return Object.freeze({
    version: 1,
    kind: 'solid-vehicle',
    seed: identity.seed,
    identity,
    style: Object.freeze({
      finish: options.finish ?? 'glossy',
      glassFinish: options.glassFinish ?? 'glossy',
    }),
  });
}
