import { SeedTree } from '../../../core/random.js';
import { DRAWING_INTENTS, type DrawingIntent } from '../../../materials/drawing.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleDrawingStyle = Readonly<{
  bodyDrawing: DrawingIntent;
  glassDrawing: DrawingIntent;
  metalDrawing: DrawingIntent;
}>;

export function createVehicleDrawingStyle(identity: VehicleIdentityRecipe): VehicleDrawingStyle {
  const random = new SeedTree(identity.seed).random('vehicle:drawing-style');
  return Object.freeze({
    bodyDrawing: random.pick<DrawingIntent>([
      DRAWING_INTENTS.light, DRAWING_INTENTS.mid, DRAWING_INTENTS.agitated,
      DRAWING_INTENTS.granular,
    ]),
    glassDrawing: random.pick<DrawingIntent>([
      DRAWING_INTENTS.solid, DRAWING_INTENTS.mid, DRAWING_INTENTS.agitated,
    ]),
    metalDrawing: random.pick<DrawingIntent>([
      DRAWING_INTENTS.light, DRAWING_INTENTS.mid, DRAWING_INTENTS.granular,
    ]),
  });
}
