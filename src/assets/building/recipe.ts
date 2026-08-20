import { SeedTree } from '../../core/random.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type { BuildingIdentityRecipe } from '../building-identity/recipe.js';

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
  const random = new SeedTree(identity.seed).random('building:raster');
  return Object.freeze({
    version: 1,
    kind: 'raster-building',
    representation: 'raster',
    identity,
    style: Object.freeze({
      medium: options.medium ?? 'graphite',
      tone: random.pick<ToneStyle>(['light', 'hatch', 'scribble', 'stipple']),
    }),
  });
}
