import { SeedTree } from '../../../core/random.js';
import { DRAWING_INTENTS, type DrawingIntent } from '../../../materials/drawing.js';
import type { BuildingIdentityRecipe } from './recipe.js';

export type BuildingDrawingStyle = Readonly<{
  facadeDrawing: DrawingIntent;
}>;

/** Resolves seeded drawing intent shared by raster and volumetric projections. */
export function createBuildingDrawingStyle(
  identity: BuildingIdentityRecipe,
): BuildingDrawingStyle {
  const random = new SeedTree(identity.seed).random('building:raster');
  return Object.freeze({
    facadeDrawing: random.pick<DrawingIntent>([
      DRAWING_INTENTS.light,
      DRAWING_INTENTS.mid,
      DRAWING_INTENTS.agitated,
      DRAWING_INTENTS.granular,
    ]),
  });
}
