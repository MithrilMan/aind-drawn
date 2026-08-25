import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import {
  resolveArtDirection,
  type ArtDirectionRecipe,
  type ArtDirectionSource,
} from '../../../appearance/art-direction.js';
import type { PhysicalSurfaceTreatmentOverride } from '../../../materials/surface.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type SolidBuildingStyle = Readonly<{
  artDirection: ArtDirectionRecipe;
  physical: PhysicalSurfaceTreatmentOverride;
}>;

export type SolidBuildingRecipe = AssetRecipeEnvelope<
  'building',
  'solid',
  BuildingIdentityRecipe,
  SolidBuildingStyle
>;

export type SolidBuildingRecipeOptions = Readonly<{
  artDirection?: ArtDirectionSource;
  physical?: PhysicalSurfaceTreatmentOverride;
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
      artDirection: resolveArtDirection(options.artDirection),
      physical: Object.freeze({ ...(options.physical ?? {}) }),
    }),
  });
}
