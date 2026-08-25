import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import {
  resolveArtDirection,
  type ArtDirectionRecipe,
  type ArtDirectionSource,
} from '../../../appearance/art-direction.js';
import type { PhysicalSurfaceTreatmentOverride } from '../../../materials/surface.js';
import type { VehicleIdentityRecipe } from '../identity/recipe.js';

export type SolidVehicleStyle = Readonly<{
  artDirection: ArtDirectionRecipe;
  physical: PhysicalSurfaceTreatmentOverride;
}>;

export type SolidVehicleRecipe = AssetRecipeEnvelope<
  'vehicle',
  'solid',
  VehicleIdentityRecipe,
  SolidVehicleStyle
>;

export type SolidVehicleRecipeOptions = Readonly<{
  artDirection?: ArtDirectionSource;
  physical?: PhysicalSurfaceTreatmentOverride;
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
      artDirection: resolveArtDirection(options.artDirection),
      physical: Object.freeze({ ...(options.physical ?? {}) }),
    }),
  });
}
