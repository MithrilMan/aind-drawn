import type { MediumId, ToneStyle } from '../../../materials/medium.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import { createBuildingDrawingStyle } from '../identity/drawing-style.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type RasterBuildingStyle = Readonly<{
  medium: MediumId;
  tone: ToneStyle;
}>;

export type RasterBuildingRecipe = AssetRecipeEnvelope<
  'building',
  'raster',
  BuildingIdentityRecipe,
  RasterBuildingStyle
>;

export type RasterBuildingRecipeOptions = Readonly<{
  medium?: MediumId;
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
      tone: drawing.facadeTone,
    }),
  });
}
