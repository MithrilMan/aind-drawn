import type { Point } from '../../core/geometry.js';
import type { Point3 } from '../../core/geometry3.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import type { BuildingIdentityRecipe } from '../building-identity/recipe.js';
import type {
  BoxGeometrySpec,
  ExtrudedProfileGeometrySpec,
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../solid-types.js';
import { buildSolidBuildingLayout, type SolidBuildingLayout } from './layout.js';
import {
  createSolidBuildingRecipe,
  type SolidBuildingRecipe,
  type SolidBuildingRecipeOptions,
} from './recipe.js';

function placement(position: Point3) {
  return Object.freeze({ position });
}

function box(size: Point3, segments?: readonly [number, number, number]): BoxGeometrySpec {
  return Object.freeze({
    type: 'box',
    size,
    ...(segments === undefined ? {} : { segments }),
  });
}

function plate(
  outline: readonly Point[],
  depth: number,
  bevel = 0.015,
): ExtrudedProfileGeometrySpec {
  return Object.freeze({
    type: 'extruded-profile', outline, depth, bevel, curveSegments: 3,
  });
}

function rectangle(width: number, height: number): readonly Point[] {
  return Object.freeze([
    [-width * 0.5, 0],
    [width * 0.5, 0],
    [width * 0.5, height],
    [-width * 0.5, height],
  ] as const);
}

function archedDoor(width: number, height: number): readonly Point[] {
  const shoulder = height * 0.78;
  return Object.freeze([
    [-width * 0.5, 0],
    [width * 0.5, 0],
    [width * 0.5, shoulder],
    [width * 0.38, height * 0.93],
    [0, height],
    [-width * 0.38, height * 0.93],
    [-width * 0.5, shoulder],
  ] as const);
}

function prismFromProfile(profile: readonly Point[], depth: number): MeshGeometrySpec {
  const halfDepth = depth * 0.5;
  const vertices: Point3[] = [
    ...profile.map(([x, y]): Point3 => [x, y, halfDepth]),
    ...profile.map(([x, y]): Point3 => [x, y, -halfDepth]),
  ];
  const count = profile.length;
  const faces: number[][] = [
    Array.from({ length: count }, (_, index) => count - 1 - index),
    Array.from({ length: count }, (_, index) => count + index),
  ];
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    faces.push([index, next, count + next, count + index]);
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}

function roofProfile(layout: SolidBuildingLayout, recipe: SolidBuildingRecipe): readonly Point[] {
  const halfWidth = layout.width * 0.54;
  const rise = layout.roofRise;
  if (recipe.identity.roof === 'flat') {
    return Object.freeze([
      [-halfWidth, 0], [halfWidth, 0], [halfWidth, rise], [-halfWidth, rise],
    ] as const);
  }
  if (recipe.identity.roof === 'shed') {
    return Object.freeze([
      [-halfWidth, 0], [halfWidth, 0], [halfWidth, rise * 0.18], [-halfWidth, rise],
    ] as const);
  }
  if (recipe.identity.roof === 'mansard') {
    return Object.freeze([
      [-halfWidth, 0], [-halfWidth * 0.7, rise * 0.86],
      [halfWidth * 0.66, rise], [halfWidth, 0],
    ] as const);
  }
  const peakX = recipe.identity.roof === 'crooked' ? halfWidth * 0.28 : 0;
  return Object.freeze([[-halfWidth, 0], [peakX, rise], [halfWidth, 0]] as const);
}

function materialSpecs(recipe: SolidBuildingRecipe): readonly SolidMaterialSpec[] {
  return Object.freeze([
    Object.freeze({
      id: 'wall', role: 'facade', color: recipe.identity.palette.wall,
      finish: recipe.style.finish, roughness: 0.84,
    }),
    Object.freeze({
      id: 'accent', role: 'architectural-accent', color: recipe.identity.palette.accent,
      finish: recipe.style.finish, roughness: 0.72,
    }),
    Object.freeze({
      id: 'glass', role: 'window', color: recipe.identity.palette.glass,
      finish: recipe.style.windowFinish, roughness: 0.18, clearcoat: 0.62,
    }),
  ]);
}

function buildSolidBuildingBlueprint(recipe: SolidBuildingRecipe): SolidAssetBlueprint {
  const layout = buildSolidBuildingLayout(recipe);
  const identity = recipe.identity;
  const parts: SolidPartDefinition[] = [];
  const add = (part: SolidPartDefinition): void => { parts.push(Object.freeze(part)); };
  const fixed = Object.freeze({ role: 'fixed' as const });

  add({
    id: 'building:shell', node: 'root', order: 0,
    geometry: box([layout.width, layout.wallHeight, layout.depth], [2, 2, 2]),
    materialId: 'wall', placement: placement([0, layout.wallHeight * 0.5, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });
  add({
    id: 'building:roof', node: 'root', order: 1,
    geometry: prismFromProfile(roofProfile(layout, recipe), layout.depth * 1.08),
    materialId: 'accent', placement: placement([0, layout.wallHeight, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });

  const windowWidth = Math.min(layout.bayWidth * 0.48, 0.72);
  const windowHeight = Math.min(layout.floorHeight * 0.44, 0.68);
  for (let floor = 0; floor < identity.floors; floor += 1) {
    for (let column = 0; column < identity.columns; column += 1) {
      if (floor === 0 && column === identity.door.column) continue;
      const x = -layout.width * 0.5 + layout.bayWidth * (column + 0.5);
      const y = layout.floorHeight * (floor + 0.5);
      add({
        id: `window:${floor}:${column}`, node: 'root', order: 4,
        geometry: plate(rectangle(windowWidth, windowHeight), 0.055, 0.01),
        materialId: 'glass',
        placement: placement([x, y - windowHeight * 0.5, layout.depth * 0.5 + 0.045]),
        motion: fixed, castShadow: false, receiveShadow: false,
      });
    }
  }

  const doorOutline = identity.door.style === 'arched'
    ? archedDoor(layout.door.width, layout.door.height)
    : rectangle(layout.door.width, layout.door.height);
  add({
    id: 'door', node: 'door', order: 8,
    geometry: plate(doorOutline, 0.08, identity.door.style === 'plank' ? 0.006 : 0.018),
    materialId: 'accent', placement: placement([layout.door.width * 0.5, 0, 0]),
    motion: fixed, castShadow: true, receiveShadow: false,
  });

  for (const [balconyIndex, balcony] of identity.balconies.entries()) {
    const width = layout.bayWidth * balcony.columnSpan * 0.88;
    const x = -layout.width * 0.5
      + layout.bayWidth * (balcony.startColumn + balcony.columnSpan * 0.5);
    const y = layout.floorHeight * balcony.floorFromGround;
    const z = layout.depth * 0.5 + 0.2;
    add({
      id: `balcony:${balconyIndex}:floor`, node: 'root', order: 5,
      geometry: box([width, 0.08, 0.48]), materialId: 'accent',
      placement: placement([x, y, z]), motion: fixed,
      castShadow: true, receiveShadow: true,
    });
    add({
      id: `balcony:${balconyIndex}:rail`, node: 'root', order: 6,
      geometry: box([width, 0.055, 0.055]), materialId: 'accent',
      placement: placement([x, y + 0.42, z + 0.22]), motion: fixed,
      castShadow: true, receiveShadow: false,
    });
    const posts = Math.max(2, balcony.columnSpan * 2);
    for (let post = 0; post <= posts; post += 1) {
      add({
        id: `balcony:${balconyIndex}:post:${post}`, node: 'root', order: 6,
        geometry: box([0.035, 0.42, 0.035]), materialId: 'accent',
        placement: placement([
          x - width * 0.5 + width * post / posts,
          y + 0.21,
          z + 0.22,
        ]),
        motion: fixed, castShadow: true, receiveShadow: false,
      });
    }
  }

  if (identity.chimney.present) {
    const x = identity.chimney.side === 'left' ? -layout.width * 0.28 : layout.width * 0.28;
    const height = identity.chimney.height;
    add({
      id: 'building:chimney', node: 'root', order: 2,
      geometry: box([0.38, height, 0.42]), materialId: 'wall',
      placement: placement([x, layout.wallHeight + height * 0.58, 0]),
      motion: fixed, castShadow: true, receiveShadow: true,
    });
  }

  return Object.freeze({
    representation: 'solid',
    id: `solid-building:${identity.seed}`,
    kind: 'solid-building',
    seed: identity.seed,
    bounds: layout.bounds,
    nodes: layout.nodes,
    parts: Object.freeze(parts),
    materials: materialSpecs(recipe),
    colliders: Object.freeze([
      Object.freeze({
        id: 'body', kind: 'solid', shape: 'box',
        center: [0, layout.height * 0.5, 0] as const,
        size: [layout.width, layout.height, layout.depth] as const,
      }),
      Object.freeze({
        id: 'door:sensor', kind: 'sensor', shape: 'box',
        center: [layout.door.centerX, layout.door.height * 0.5, layout.depth * 0.5 + 0.65] as const,
        size: [Math.max(1.2, layout.door.width * 1.6), layout.door.height, 1.3] as const,
      }),
    ]),
    sockets: layout.sockets,
    interactions: Object.freeze([Object.freeze({
      id: 'door',
      kind: 'portal',
      sensorColliderId: 'door:sensor',
      activationSocketId: 'door:entry',
      initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      nodeBindings: Object.freeze([Object.freeze({
        nodeId: 'door',
        stateByInteractionState: Object.freeze({
          closed: Object.freeze({ rotation: [0, 0, 0] as const }),
          open: Object.freeze({ rotation: [0, -Math.PI * 0.48, 0] as const }),
        }),
      })]),
    })]),
  });
}

export function createSolidBuildingBlueprint(
  recipe: SolidBuildingRecipe,
): SolidAssetBlueprint;
export function createSolidBuildingBlueprint(
  identity: BuildingIdentityRecipe,
  options?: SolidBuildingRecipeOptions,
): SolidAssetBlueprint;
export function createSolidBuildingBlueprint(
  source: SolidBuildingRecipe | BuildingIdentityRecipe,
  options: SolidBuildingRecipeOptions = {},
): SolidAssetBlueprint {
  const recipe = source.kind === 'building-identity'
    ? createSolidBuildingRecipe(source, options)
    : source;
  return buildSolidBuildingBlueprint(recipe);
}
