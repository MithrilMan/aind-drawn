import { createAssetCapability, readAssetCapability, type AssetCapability } from '../capabilities.js';
import type { SolidPartDefinition } from '../solid-types.js';

const VEHICLE_ROLLING_PART_CAPABILITY = 'aind.vehicle.rolling-part/v1';

export type VehicleRollingPartCapability = Readonly<{
  radius: number;
  steering: boolean;
  side: -1 | 1;
}>;

export function vehicleRollingPartCapability(
  data: VehicleRollingPartCapability,
): AssetCapability {
  return createAssetCapability(VEHICLE_ROLLING_PART_CAPABILITY, data);
}

export function vehicleRollingPartOf(
  part: SolidPartDefinition,
): VehicleRollingPartCapability | undefined {
  return readAssetCapability<VehicleRollingPartCapability>(
    part.capabilities,
    VEHICLE_ROLLING_PART_CAPABILITY,
    (data) => data as VehicleRollingPartCapability,
  );
}
