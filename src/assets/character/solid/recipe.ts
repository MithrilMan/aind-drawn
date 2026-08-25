import { SeedTree } from '../../../core/random.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import {
  resolveArtDirection,
  type ArtDirectionRecipe,
  type ArtDirectionSource,
} from '../../../appearance/art-direction.js';
import type { PhysicalSurfaceTreatmentOverride } from '../../../materials/surface.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';

export type SolidCharacterStyle = Readonly<{
  artDirection: ArtDirectionRecipe;
  physical: PhysicalSurfaceTreatmentOverride;
  depth: number;
}>;

export type SolidCharacterRecipe = AssetRecipeEnvelope<
  'character',
  'solid',
  CharacterIdentityRecipe,
  SolidCharacterStyle
>;

export type SolidCharacterRecipeOptions = Readonly<{
  artDirection?: ArtDirectionSource;
  physical?: PhysicalSurfaceTreatmentOverride;
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
      artDirection: resolveArtDirection(options.artDirection),
      physical: Object.freeze({ ...(options.physical ?? {}) }),
      depth: random.float(0.88, 1.08),
    }),
  });
}
