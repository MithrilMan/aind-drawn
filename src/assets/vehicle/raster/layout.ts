import type { Bounds, Point } from '../../../core/geometry.js';
import type { Size2, Vector2 } from '../../../contracts/raster-asset.js';
import { createVehicleDoorSideProfile } from '../identity/door-profile.js';
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
  doorWindowGlassOutline: readonly Point[];
  doorOpeningOutline: readonly Point[];
  doorHinge: Vector2;
  doorHandle: Vector2;
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
  const doorProfile = createVehicleDoorSideProfile(identity);
  const projectDoorPoints = (points: readonly Point[]): readonly Point[] => freezePoints(
    points.map(([x, y]) => [x + length * 0.5, y] as const),
  );
  const doorOutline = projectDoorPoints(doorProfile.panelOutline);
  const doorWindowOutline = projectDoorPoints(doorProfile.windowFrameOutline);
  const doorWindowGlassOutline = projectDoorPoints(doorProfile.windowGlassOutline);
  const doorOpeningOutline = projectDoorPoints(doorProfile.openingOutline);
  const doorHinge = Object.freeze({
    x: doorProfile.hingeX + length * 0.5,
    y: doorProfile.panelBottom,
  });
  const doorHandle = Object.freeze({
    x: doorProfile.handle[0] + length * 0.5,
    y: doorProfile.handle[1],
  });
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
    doorWindowGlassOutline,
    doorOpeningOutline,
    doorHinge,
    doorHandle,
    hoodOutline,
    cargoOutline,
  });
}
