import type { MediumId } from '../../../materials/medium.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import {
  createVehicleDrawingStyle,
  type VehicleDrawingStyle,
} from '../identity/drawing-style.js';
import type { VehicleIdentityRecipe, VehicleSide } from '../identity/recipe.js';

export type RasterVehicleStyle = VehicleDrawingStyle & Readonly<{
  medium: MediumId;
  side: VehicleSide;
}>;

export type RasterVehicleRecipe = AssetRecipeEnvelope<
  'vehicle',
  'raster',
  VehicleIdentityRecipe,
  RasterVehicleStyle
>;

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
    schemaVersion: 1,
    family: 'vehicle',
    representation: 'raster',
    identity,
    style: Object.freeze({
      ...createVehicleDrawingStyle(identity),
      medium: options.medium ?? 'graphite',
      side: options.side ?? 'right',
    }),
  });
}
