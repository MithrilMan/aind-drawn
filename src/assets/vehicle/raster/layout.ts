import type { Bounds, Point } from '../../../core/geometry.js';
import type { Size2, Vector2 } from '../../../contracts/raster-asset.js';
import { createVehicleCabinSideProfile } from '../identity/geometry.js';
import type { VehicleIdentityRecipe, VehicleSide } from '../identity/recipe.js';

export const VEHICLE_PIXELS_PER_UNIT = 86;
export const VEHICLE_CANVAS_MARGIN = 22;

export type VehicleLayout = Readonly<{
  side: VehicleSide;
  canvas: Size2;
  bounds: Bounds;
  bodyBottom: number;
  beltHeight: number;
  roofHeight: number;
  rearWheel: Vector2;
  frontWheel: Vector2;
  bodyOutline: readonly Point[];
  cabinOutline: readonly Point[];
  doorOutline: readonly Point[];
  doorWindowOutline: readonly Point[];
  doorOpeningOutline: readonly Point[];
  doorHinge: Vector2;
  hoodOutline: readonly Point[];
  cargoOutline: readonly Point[];
}>;

export function vehicleViewX(
  identity: VehicleIdentityRecipe,
  side: VehicleSide,
  vehicleX: number,
): number {
  return side === 'left' ? identity.dimensions.length - vehicleX : vehicleX;
}

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

export function createVehicleLayout(
  identity: VehicleIdentityRecipe,
  side: VehicleSide = 'right',
): VehicleLayout {
  const { length, height } = identity.dimensions;
  const radius = identity.wheels.radius;
  const cabinProfile = createVehicleCabinSideProfile(identity);
  const { bodyBottom, beltHeight, roofHeight } = cabinProfile;
  const axleInset = length * (1 - identity.wheels.wheelbaseRatio) / 2;
  const rearWheel = Object.freeze({ x: vehicleViewX(identity, side, axleInset), y: radius });
  const frontWheel = Object.freeze({ x: vehicleViewX(identity, side, length - axleInset), y: radius });
  const lowerShoulder = Math.max(bodyBottom + radius * 0.52, radius * 1.28);
  const bodyOutline = freezePoints([
    [0.04 * length, lowerShoulder],
    [0.02 * length, beltHeight * 0.9],
    [0.08 * length, beltHeight],
    [0.92 * length, beltHeight],
    [0.985 * length, beltHeight * 0.88],
    [0.965 * length, lowerShoulder],
    [0.89 * length, bodyBottom],
    [0.11 * length, bodyBottom],
  ]);
  const cabinOutline = freezePoints(cabinProfile.outline.map(([x, y]) => (
    [x + length * 0.5, y] as const
  )));
  const doorTop = beltHeight * 0.985;
  const doorBottom = bodyBottom + radius * 0.1;
  const doorOutline = freezePoints([
    [identity.doors.frontStartRatio * length, doorBottom],
    [identity.doors.frontStartRatio * length, doorTop],
    [identity.doors.frontEndRatio * length, doorTop],
    [identity.doors.frontEndRatio * length, doorBottom],
  ]);
  const roofAt = (x: number): number => {
    for (let index = 1; index < cabinOutline.length; index += 1) {
      const start = cabinOutline[index - 1] as Point;
      const end = cabinOutline[index] as Point;
      if (x < start[0] || x > end[0]) continue;
      const amount = (x - start[0]) / Math.max(1e-9, end[0] - start[0]);
      return start[1] + (end[1] - start[1]) * amount;
    }
    return beltHeight;
  };
  const doorStartX = identity.doors.frontStartRatio * length;
  const doorEndX = identity.doors.frontEndRatio * length;
  const doorWindowOutline = freezePoints([
    [doorStartX, doorTop],
    [doorStartX, Math.max(doorTop + 0.08, roofAt(doorStartX) - 0.055)],
    [doorEndX, Math.max(doorTop + 0.08, roofAt(doorEndX) - 0.055)],
    [doorEndX, doorTop],
  ]);
  const doorOpeningOutline = freezePoints([
    [doorStartX, doorBottom],
    [doorStartX, (doorWindowOutline[1] as Point)[1]],
    [doorEndX, (doorWindowOutline[2] as Point)[1]],
    [doorEndX, doorBottom],
  ]);
  const doorHinge = Object.freeze({ x: doorEndX, y: doorBottom });
  const hoodStart = Math.max(identity.cabin.endRatio, 1 - identity.body.bonnetRatio) * length;
  const hoodOutline = freezePoints([
    [hoodStart, beltHeight * 0.985], [0.97 * length, beltHeight * 0.92],
    [0.96 * length, lowerShoulder], [hoodStart, lowerShoulder + radius * 0.18],
  ]);
  const cargoEnd = identity.cabin.startRatio * length;
  const cargoOutline = freezePoints([
    [0.045 * length, lowerShoulder], [cargoEnd, lowerShoulder + radius * 0.18],
    [cargoEnd, beltHeight * 0.985], [0.065 * length, beltHeight * 0.92],
  ]);
  const bounds = Object.freeze({
    x: 0,
    y: 0,
    width: length,
    height: Math.max(height, roofHeight + radius * 1.05),
  });
  const canvas = Object.freeze({
    width: Math.ceil(bounds.width * VEHICLE_PIXELS_PER_UNIT + VEHICLE_CANVAS_MARGIN * 2),
    height: Math.ceil(bounds.height * VEHICLE_PIXELS_PER_UNIT + VEHICLE_CANVAS_MARGIN * 2),
  });
  return Object.freeze({
    side,
    canvas,
    bounds,
    bodyBottom,
    beltHeight,
    roofHeight,
    rearWheel,
    frontWheel,
    bodyOutline,
    cabinOutline,
    doorOutline,
    doorWindowOutline,
    doorOpeningOutline,
    doorHinge,
    hoodOutline,
    cargoOutline,
  });
}
