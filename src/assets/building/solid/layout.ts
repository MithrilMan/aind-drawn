import type { Bounds3, Point3 } from '../../../core/geometry3.js';
import {
  createBuildingFacadeGeometry,
  type BuildingFacadeGeometry,
} from '../identity/geometry.js';
import type { SolidNodeDefinition, SocketMap3 } from '../../../contracts/solid-asset.js';
import type { SolidBuildingRecipe } from './recipe.js';

export type SolidBuildingLayout = Readonly<{
  width: number;
  height: number;
  depth: number;
  wallHeight: number;
  roofRise: number;
  floorHeight: number;
  bayWidth: number;
  facade: BuildingFacadeGeometry;
  door: Readonly<{
    centerX: number;
    width: number;
    height: number;
    hingeX: number;
    frontZ: number;
    recessZ: number;
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
  const facade = createBuildingFacadeGeometry(identity);
  const { wallHeight, roofRise, floorHeight, bayWidth } = facade;
  const { centerX, width: doorWidth, height: doorHeight, hingeX } = facade.door;
  const frontZ = identity.depth * 0.5 + 0.025;
  const recessZ = identity.depth * 0.5 - Math.min(0.28, identity.depth * 0.1);
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
    facade,
    door: Object.freeze({ centerX, width: doorWidth, height: doorHeight, hingeX, frontZ, recessZ }),
    nodes,
    bounds: Object.freeze({
      minimum: point(-identity.width * 0.5, 0, -identity.depth * 0.5),
      maximum: point(
        identity.width * 0.5,
        identity.height,
        identity.depth * 0.5 + doorWidth * Math.sin(identity.door.openingAngle),
      ),
    }),
    sockets: Object.freeze({
      base: point(0, 0, 0),
      top: point(0, identity.height, 0),
      'door:entry': point(centerX, 0, identity.depth * 0.5 + 0.48),
      roof: point(0, wallHeight, 0),
    }),
  });
}
