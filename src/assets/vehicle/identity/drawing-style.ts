import { SeedTree } from '../../../core/random.js';
import type { ToneStyle } from '../../../materials/medium.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleDrawingStyle = Readonly<{
  bodyTone: ToneStyle;
  glassTone: ToneStyle;
  metalTone: ToneStyle;
}>;

export function createVehicleDrawingStyle(identity: VehicleIdentityRecipe): VehicleDrawingStyle {
  const random = new SeedTree(identity.seed).random('vehicle:drawing-style');
  return Object.freeze({
    bodyTone: random.pick<ToneStyle>(['light', 'hatch', 'scribble', 'stipple']),
    glassTone: random.pick<ToneStyle>(['black', 'hatch', 'scribble']),
    metalTone: random.pick<ToneStyle>(['light', 'hatch', 'stipple']),
  });
}
