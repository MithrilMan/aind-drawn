import { chaikin, type Point } from '../../../core/geometry.js';
import type { BuildingIdentityRecipe, RoofStyle } from './recipe.js';

export type BuildingFacadeWindow = Readonly<{
  id: string;
  floorFromGround: number;
  column: number;
  center: Point;
  profile: readonly Point[];
  lit: boolean;
}>;

export type BuildingFacadeBalcony = Readonly<{
  id: string;
  floorFromGround: number;
  centerX: number;
  width: number;
  railHeight: number;
  postCount: number;
}>;

export type BuildingFacadeGeometry = Readonly<{
  width: number;
  height: number;
  wallHeight: number;
  roofRise: number;
  floorHeight: number;
  bayWidth: number;
  wallProfile: readonly Point[];
  roofProfile: readonly Point[];
  windows: readonly BuildingFacadeWindow[];
  balconies: readonly BuildingFacadeBalcony[];
  chimney: Readonly<{
    present: boolean;
    centerX: number;
    width: number;
    height: number;
  }>;
  door: Readonly<{
    centerX: number;
    width: number;
    height: number;
    hingeX: number;
    profile: readonly Point[];
  }>;
}>;

const ROOF_RISE: Readonly<Record<RoofStyle, number>> = Object.freeze({
  flat: 20 / 72,
  gable: 50 / 72,
  crooked: 50 / 72,
  shed: 38 / 72,
  mansard: 52 / 72,
});

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

function rectangle(width: number, height: number): readonly Point[] {
  return freezePoints([
    [-width * 0.5, -height * 0.5],
    [width * 0.5, -height * 0.5],
    [width * 0.5, height * 0.5],
    [-width * 0.5, height * 0.5],
  ]);
}

function roundedWindow(width: number, height: number): readonly Point[] {
  return freezePoints(chaikin(rectangle(width, height), true, 1));
}

function doorProfile(
  width: number,
  height: number,
  arched: boolean,
): readonly Point[] {
  if (!arched) {
    return freezePoints([
      [-width * 0.5, 0],
      [width * 0.5, 0],
      [width * 0.5, height],
      [-width * 0.5, height],
    ]);
  }
  return freezePoints([
    [-width * 0.5, 0],
    [width * 0.5, 0],
    [width * 0.5, height * 0.76],
    [width * 0.34, height * 0.94],
    [0, height],
    [-width * 0.34, height * 0.94],
    [-width * 0.5, height * 0.76],
  ]);
}

function roofProfile(
  width: number,
  rise: number,
  style: RoofStyle,
): readonly Point[] {
  const halfWidth = width * 0.54;
  if (style === 'flat') {
    return freezePoints([
      [-halfWidth, 0], [halfWidth, 0], [halfWidth, rise], [-halfWidth, rise],
    ]);
  }
  if (style === 'shed') {
    return freezePoints([
      [-halfWidth, 0], [halfWidth, 0], [halfWidth, rise * 0.18], [-halfWidth, rise],
    ]);
  }
  if (style === 'mansard') {
    return freezePoints([
      [-halfWidth, 0], [-halfWidth * 0.7, rise * 0.86],
      [halfWidth * 0.66, rise], [halfWidth, 0],
    ]);
  }
  const peakX = style === 'crooked' ? halfWidth * 0.28 : 0;
  return freezePoints([[-halfWidth, 0], [peakX, rise], [halfWidth, 0]]);
}

/**
 * Builds the representation-neutral front elevation consumed by both the
 * raster drawing and the solid facade. Drawing wobble belongs to each medium;
 * roof, aperture, and opening geometry do not.
 */
export function createBuildingFacadeGeometry(
  identity: BuildingIdentityRecipe,
): BuildingFacadeGeometry {
  const roofRise = Math.min(identity.height * 0.28, ROOF_RISE[identity.roof]);
  const wallHeight = identity.height - roofRise;
  const floorHeight = wallHeight / identity.floors;
  const bayWidth = identity.width / identity.columns;
  const windowWidth = Math.min(bayWidth * 0.45, 42 / 72);
  const windowHeight = Math.min(floorHeight * 0.46, 42 / 72);
  const sharedWindowProfile = roundedWindow(windowWidth, windowHeight);
  const doorWidth = Math.min(bayWidth * 0.58, 50 / 72);
  const doorHeight = Math.min(floorHeight * 0.88, 1);
  const doorCenterX = -identity.width * 0.5
    + bayWidth * (identity.door.column + 0.5);
  const hingeX = doorCenterX
    + (identity.door.hinge === 'left' ? -doorWidth * 0.5 : doorWidth * 0.5);
  const windows: BuildingFacadeWindow[] = [];
  for (let floorFromGround = 0; floorFromGround < identity.floors; floorFromGround += 1) {
    for (let column = 0; column < identity.columns; column += 1) {
      if (floorFromGround === 0 && column === identity.door.column) continue;
      windows.push(Object.freeze({
        id: `window:${floorFromGround}:${column}`,
        floorFromGround,
        column,
        center: Object.freeze([
          -identity.width * 0.5 + bayWidth * (column + 0.5),
          floorHeight * (floorFromGround + 0.5),
        ] as const),
        profile: sharedWindowProfile,
        lit: ((floorFromGround * 17 + column * 31 + identity.seed) & 3) === 0,
      }));
    }
  }

  return Object.freeze({
    width: identity.width,
    height: identity.height,
    wallHeight,
    roofRise,
    floorHeight,
    bayWidth,
    wallProfile: freezePoints([
      [-identity.width * 0.5, 0],
      [identity.width * 0.5, 0],
      [identity.width * 0.5, wallHeight],
      [-identity.width * 0.5, wallHeight],
    ]),
    roofProfile: roofProfile(identity.width, roofRise, identity.roof),
    windows: Object.freeze(windows),
    balconies: Object.freeze(identity.balconies.map((balcony, index) => {
      const width = bayWidth * balcony.columnSpan * 0.88;
      return Object.freeze({
        id: `balcony:${index}`,
        floorFromGround: balcony.floorFromGround,
        centerX: -identity.width * 0.5
          + bayWidth * (balcony.startColumn + balcony.columnSpan * 0.5),
        width,
        railHeight: Math.min(0.42, floorHeight * 0.28),
        postCount: Math.max(2, balcony.columnSpan * 2),
      });
    })),
    chimney: Object.freeze({
      present: identity.chimney.present,
      centerX: (identity.chimney.side === 'left' ? -1 : 1) * identity.width * 0.28,
      width: 0.38,
      height: identity.chimney.height,
    }),
    door: Object.freeze({
      centerX: doorCenterX,
      width: doorWidth,
      height: doorHeight,
      hingeX,
      profile: doorProfile(
        doorWidth,
        doorHeight,
        identity.door.style === 'arched',
      ),
    }),
  });
}
