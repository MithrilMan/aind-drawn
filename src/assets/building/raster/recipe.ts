import { resolveArtDirection, type ArtDirectionRecipe, type ArtDirectionSource } from '../../../appearance/art-direction.js';
import type { DrawingIntent } from '../../../materials/drawing.js';
import type { MediumId } from '../../../materials/medium.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import { createBuildingDrawingStyle } from '../identity/drawing-style.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type RasterBuildingStyle = Readonly<{
  medium: MediumId;
  drawing: DrawingIntent;
  artDirection: ArtDirectionRecipe;
}>;

export type RasterBuildingRecipe = AssetRecipeEnvelope<
  'building',
  'raster',
  BuildingIdentityRecipe,
  RasterBuildingStyle
>;

export type RasterBuildingRecipeOptions = Readonly<{
  medium?: MediumId;
  artDirection?: ArtDirectionSource;
}>;

export function createRasterBuildingRecipe(
  identity: BuildingIdentityRecipe,
  options: RasterBuildingRecipeOptions = {},
): RasterBuildingRecipe {
  const drawing = createBuildingDrawingStyle(identity);
  return Object.freeze({
    schemaVersion: 1,
    family: 'building',
    representation: 'raster',
    identity,
    style: Object.freeze({
      medium: options.medium ?? 'graphite',
      drawing: drawing.facadeDrawing,
      artDirection: resolveArtDirection(options.artDirection),
    }),
  });
}
