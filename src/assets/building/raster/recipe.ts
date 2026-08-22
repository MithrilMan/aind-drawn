import type { MediumId, ToneStyle } from '../../../materials/medium.js';
import { createBuildingDrawingStyle } from '../identity/drawing-style.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';

export type RasterBuildingStyle = Readonly<{
  medium: MediumId;
  tone: ToneStyle;
}>;

export type RasterBuildingRecipe = Readonly<{
  version: 1;
  kind: 'raster-building';
  representation: 'raster';
  identity: BuildingIdentityRecipe;
  style: RasterBuildingStyle;
}>;

export type RasterBuildingRecipeOptions = Readonly<{
  medium?: MediumId;
}>;

export function createRasterBuildingRecipe(
  identity: BuildingIdentityRecipe,
  options: RasterBuildingRecipeOptions = {},
): RasterBuildingRecipe {
  const drawing = createBuildingDrawingStyle(identity);
  return Object.freeze({
    version: 1,
    kind: 'raster-building',
    representation: 'raster',
    identity,
    style: Object.freeze({
      medium: options.medium ?? 'graphite',
      tone: drawing.facadeTone,
    }),
  });
}
