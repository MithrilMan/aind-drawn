import type { MediumId } from '../../materials/medium.js';
import {
  createVehicleDrawingStyle,
  type VehicleDrawingStyle,
} from '../vehicle-identity/drawing-style.js';
import type { VehicleIdentityRecipe } from '../vehicle-identity/recipe.js';

export type RasterVehicleRecipe = Readonly<{
  version: 1;
  kind: 'raster-vehicle';
  seed: number;
  medium: MediumId;
  identity: VehicleIdentityRecipe;
  style: VehicleDrawingStyle;
}>;

export type RasterVehicleOptions = Readonly<{ medium?: MediumId }>;

export function createRasterVehicleRecipe(
  identity: VehicleIdentityRecipe,
  options: RasterVehicleOptions = {},
): RasterVehicleRecipe {
  return Object.freeze({
    version: 1,
    kind: 'raster-vehicle',
    seed: identity.seed,
    medium: options.medium ?? 'graphite',
    identity,
    style: createVehicleDrawingStyle(identity),
  });
}
