import { SeedTree } from '../../core/random.js';
import type { ToneStyle } from '../../materials/medium.js';
import type { BuildingIdentityRecipe } from './recipe.js';

export type BuildingDrawingStyle = Readonly<{
  facadeTone: ToneStyle;
}>;

/** Resolves seeded drawing intent shared by raster and volumetric projections. */
export function createBuildingDrawingStyle(
  identity: BuildingIdentityRecipe,
): BuildingDrawingStyle {
  const random = new SeedTree(identity.seed).random('building:raster');
  return Object.freeze({
    facadeTone: random.pick<ToneStyle>(['light', 'hatch', 'scribble', 'stipple']),
  });
}
