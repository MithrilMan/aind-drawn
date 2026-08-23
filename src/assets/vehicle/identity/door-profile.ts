import type { Point } from '../../../core/geometry.js';
import { createVehicleCabinSideProfile } from './geometry.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleDoorSideProfile = Readonly<{
  rearX: number;
  hingeX: number;
  panelBottom: number;
  beltHeight: number;
  length: number;
  panelHeight: number;
  assemblyHeight: number;
  lowerCorner: number;
  panelOutline: readonly Point[];
  windowFrameOutline: readonly Point[];
  windowGlassOutline: readonly Point[];
  openingOutline: readonly Point[];
  handle: Point;
}>;

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

function profileYAt(outline: readonly Point[], x: number): number {
  for (let index = 1; index < outline.length; index += 1) {
    const start = outline[index - 1] as Point;
    const end = outline[index] as Point;
    if (x < start[0] || x > end[0]) continue;
    const amount = (x - start[0]) / Math.max(1e-9, end[0] - start[0]);
    return start[1] + (end[1] - start[1]) * amount;
  }
  return outline[0]?.[1] ?? 0;
}

function insetProfile(outline: readonly Point[], scale: number): readonly Point[] {
  const minimumX = Math.min(...outline.map(([x]) => x));
  const maximumX = Math.max(...outline.map(([x]) => x));
  const minimumY = Math.min(...outline.map(([, y]) => y));
  const maximumY = Math.max(...outline.map(([, y]) => y));
  const centerX = (minimumX + maximumX) * 0.5;
  const centerY = (minimumY + maximumY) * 0.5;
  return freezePoints(outline.map(([x, y]) => [
    centerX + (x - centerX) * scale,
    centerY + (y - centerY) * scale,
  ] as const));
}

/**
 * Defines one canonical side construction for the articulated front door.
 * Raster projects it to an elevation; solid authoring bends its lower panel
 * over the body section and keeps the upper assembly on the cabin surface.
 */
export function createVehicleDoorSideProfile(
  identity: VehicleIdentityRecipe,
): VehicleDoorSideProfile {
  const cabin = createVehicleCabinSideProfile(identity);
  const { length, height } = identity.dimensions;
  const rearX = -length * 0.5 + identity.doors.frontStartRatio * length;
  const hingeX = -length * 0.5 + identity.doors.frontEndRatio * length;
  const doorLength = hingeX - rearX;
  const panelBottom = cabin.bodyBottom + identity.wheels.radius * 0.1;
  const panelHeight = cabin.beltHeight - panelBottom;
  const lowerCorner = Math.min(
    doorLength * 0.045,
    panelHeight * 0.09,
    identity.wheels.radius * 0.085,
  );
  const roofInset = Math.max(0.035, height * 0.022);
  const minimumWindowHeight = Math.max(0.16, (cabin.roofHeight - cabin.beltHeight) * 0.3);
  const frontUpperX = hingeX - Math.min(
    doorLength * 0.26,
    Math.max(length * 0.035, doorLength * 0.18),
  );
  const topXs = [
    rearX,
    ...cabin.outline
      .map(([x]) => x)
      .filter((x) => x > rearX + 1e-6 && x < frontUpperX - 1e-6),
    frontUpperX,
  ];
  const topPath = topXs.map((x): Point => Object.freeze([
    x,
    Math.max(
      cabin.beltHeight + minimumWindowHeight,
      profileYAt(cabin.outline, x) - roofInset,
    ),
  ] as const));
  const panelOutline = freezePoints([
    [rearX + lowerCorner, panelBottom],
    [rearX, panelBottom + lowerCorner],
    [rearX, cabin.beltHeight],
    [hingeX, cabin.beltHeight],
    [hingeX, panelBottom + lowerCorner],
    [hingeX - lowerCorner, panelBottom],
  ]);
  const windowFrameOutline = freezePoints([
    [rearX, cabin.beltHeight],
    ...topPath,
    [hingeX, cabin.beltHeight],
  ]);
  const windowGlassOutline = insetProfile(
    windowFrameOutline,
    identity.doors.windowFrame === 'framed' ? 0.88 : 0.965,
  );
  const openingOutline = freezePoints([
    [rearX + lowerCorner, panelBottom],
    [rearX, panelBottom + lowerCorner],
    [rearX, cabin.beltHeight],
    ...topPath,
    [hingeX, cabin.beltHeight],
    [hingeX, panelBottom + lowerCorner],
    [hingeX - lowerCorner, panelBottom],
  ]);
  const maximumY = Math.max(...openingOutline.map(([, y]) => y));
  return Object.freeze({
    rearX,
    hingeX,
    panelBottom,
    beltHeight: cabin.beltHeight,
    length: doorLength,
    panelHeight,
    assemblyHeight: maximumY - panelBottom,
    lowerCorner,
    panelOutline,
    windowFrameOutline,
    windowGlassOutline,
    openingOutline,
    handle: Object.freeze([
      hingeX - doorLength * 0.78,
      panelBottom + panelHeight * 0.72,
    ] as const),
  });
}
