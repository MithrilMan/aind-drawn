import type { Bounds, Point } from '../../core/geometry.js';
import type { Size2, Vector2 } from '../types.js';
import type { VehicleIdentityRecipe } from '../vehicle-identity/recipe.js';

export const VEHICLE_PIXELS_PER_UNIT = 86;
export const VEHICLE_CANVAS_MARGIN = 22;

export type VehicleLayout = Readonly<{
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
  hoodOutline: readonly Point[];
  cargoOutline: readonly Point[];
}>;

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

export function createVehicleLayout(identity: VehicleIdentityRecipe): VehicleLayout {
  const { length, height, groundClearance } = identity.dimensions;
  const radius = identity.wheels.radius;
  const bodyBottom = Math.max(groundClearance, radius * 0.58);
  const beltHeight = bodyBottom + (height - bodyBottom) * identity.body.beltHeightRatio;
  const roofHeight = bodyBottom + (height - bodyBottom) * identity.cabin.roofHeightRatio;
  const axleInset = length * (1 - identity.wheels.wheelbaseRatio) / 2;
  const rearWheel = Object.freeze({ x: axleInset, y: radius });
  const frontWheel = Object.freeze({ x: length - axleInset, y: radius });
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
  const cabinOutline = freezePoints([
    [identity.cabin.startRatio * length, beltHeight],
    [(identity.cabin.startRatio + 0.075 / identity.cabin.windscreenSlope) * length, roofHeight * 0.94],
    [(identity.cabin.startRatio + 0.15) * length, roofHeight],
    [(identity.cabin.endRatio - 0.12) * length, roofHeight],
    [(identity.cabin.endRatio - 0.055 / identity.cabin.rearSlope) * length, roofHeight * 0.93],
    [identity.cabin.endRatio * length, beltHeight],
  ]);
  const doorTop = beltHeight * 0.985;
  const doorBottom = bodyBottom + radius * 0.1;
  const doorOutline = freezePoints([
    [identity.doors.frontStartRatio * length, doorBottom],
    [identity.doors.frontStartRatio * length, doorTop],
    [identity.doors.frontEndRatio * length, doorTop],
    [identity.doors.frontEndRatio * length, doorBottom],
  ]);
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
    hoodOutline,
    cargoOutline,
  });
}
