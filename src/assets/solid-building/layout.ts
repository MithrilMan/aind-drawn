import type { Bounds3, Point3 } from '../../core/geometry3.js';
import type { SolidNodeDefinition, SocketMap3 } from '../solid-types.js';
import type { SolidBuildingRecipe } from './recipe.js';

export type SolidBuildingLayout = Readonly<{
  width: number;
  height: number;
  depth: number;
  wallHeight: number;
  roofRise: number;
  floorHeight: number;
  bayWidth: number;
  door: Readonly<{
    centerX: number;
    width: number;
    height: number;
    hingeX: number;
    frontZ: number;
  }>;
  nodes: readonly SolidNodeDefinition[];
  bounds: Bounds3;
  sockets: SocketMap3;
}>;

function point(x: number, y: number, z: number): Point3 {
  return Object.freeze([x, y, z] as const);
}

export function buildSolidBuildingLayout(recipe: SolidBuildingRecipe): SolidBuildingLayout {
  const identity = recipe.identity;
  const roofRatio = ({
    flat: 0.035,
    gable: 0.18,
    crooked: 0.2,
    shed: 0.12,
    mansard: 0.2,
  } as const)[identity.roof];
  const roofRise = Math.max(identity.roof === 'flat' ? 0.16 : 0.45, identity.height * roofRatio);
  const wallHeight = Math.max(identity.height * 0.62, identity.height - roofRise);
  const floorHeight = wallHeight / identity.floors;
  const bayWidth = identity.width / identity.columns;
  const doorWidth = Math.min(bayWidth * 0.58, 0.86);
  const doorHeight = Math.min(floorHeight * 0.86, 1.42);
  const centerX = -identity.width * 0.5 + bayWidth * (identity.door.column + 0.5);
  const hingeX = centerX - doorWidth * 0.5;
  const frontZ = identity.depth * 0.5 + 0.025;
  const nodes: readonly SolidNodeDefinition[] = Object.freeze([
    Object.freeze({ id: 'root', position: point(0, 0, 0) }),
    Object.freeze({ id: 'door', parentNode: 'root', position: point(hingeX, 0, frontZ) }),
  ]);

  return Object.freeze({
    width: identity.width,
    height: identity.height,
    depth: identity.depth,
    wallHeight,
    roofRise,
    floorHeight,
    bayWidth,
    door: Object.freeze({ centerX, width: doorWidth, height: doorHeight, hingeX, frontZ }),
    nodes,
    bounds: Object.freeze({
      minimum: point(-identity.width * 0.5, 0, -identity.depth * 0.5),
      maximum: point(identity.width * 0.5, identity.height, identity.depth * 0.5),
    }),
    sockets: Object.freeze({
      base: point(0, 0, 0),
      top: point(0, identity.height, 0),
      'door:entry': point(centerX, 0, identity.depth * 0.5 + 0.48),
      roof: point(0, wallHeight, 0),
    }),
  });
}
