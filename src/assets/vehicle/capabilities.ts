import { createAssetCapability, readAssetCapability, type AssetCapability } from '../capabilities.js';
import type { LayerDefinition } from '../types.js';

const VEHICLE_ROLLING_LAYER_CAPABILITY = 'aind.vehicle.rolling-layer/v1';

export type VehicleRollingLayerCapability = Readonly<{
  radius: number;
  steering: boolean;
}>;

export function vehicleRollingLayerCapability(
  data: VehicleRollingLayerCapability,
): AssetCapability {
  return createAssetCapability(VEHICLE_ROLLING_LAYER_CAPABILITY, data);
}

export function vehicleRollingLayerOf(
  layer: LayerDefinition,
): VehicleRollingLayerCapability | undefined {
  return readAssetCapability<VehicleRollingLayerCapability>(
    layer.capabilities,
    VEHICLE_ROLLING_LAYER_CAPABILITY,
    (data) => data as VehicleRollingLayerCapability,
  );
}
