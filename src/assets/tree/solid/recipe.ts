import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import {
  resolveArtDirection,
  type ArtDirectionRecipe,
  type ArtDirectionSource,
} from '../../../appearance/art-direction.js';
import type { PhysicalSurfaceTreatmentOverride } from '../../../materials/surface.js';
import type { TreeIdentityRecipe } from '../identity/recipe.js';

export type SolidTreeStyle = Readonly<{
  artDirection: ArtDirectionRecipe;
  physical: PhysicalSurfaceTreatmentOverride;
}>;

export type SolidTreeRecipe = AssetRecipeEnvelope<
  'tree',
  'solid',
  TreeIdentityRecipe,
  SolidTreeStyle
>;

export type SolidTreeRecipeOptions = Readonly<{
  artDirection?: ArtDirectionSource;
  physical?: PhysicalSurfaceTreatmentOverride;
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
    style: Object.freeze({
      artDirection: resolveArtDirection(options.artDirection),
      physical: Object.freeze({ ...(options.physical ?? {}) }),
    }),
  });
}
