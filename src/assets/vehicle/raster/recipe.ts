import type { MediumId } from '../../../materials/medium.js';
import {
  createVehicleDrawingStyle,
  type VehicleDrawingStyle,
} from '../identity/drawing-style.js';
import type { VehicleIdentityRecipe, VehicleSide } from '../identity/recipe.js';

export type RasterVehicleRecipe = Readonly<{
  version: 1;
  kind: 'raster-vehicle';
  seed: number;
  medium: MediumId;
  side: VehicleSide;
  identity: VehicleIdentityRecipe;
  style: VehicleDrawingStyle;
}>;

export type RasterVehicleOptions = Readonly<{
  medium?: MediumId;
  /** Side shown by the orthographic elevation. */
  side?: VehicleSide;
}>;

export function createRasterVehicleRecipe(
  identity: VehicleIdentityRecipe,
  options: RasterVehicleOptions = {},
): RasterVehicleRecipe {
  return Object.freeze({
    version: 1,
    kind: 'raster-vehicle',
    seed: identity.seed,
    medium: options.medium ?? 'graphite',
    side: options.side ?? 'right',
    identity,
    style: createVehicleDrawingStyle(identity),
  });
}
