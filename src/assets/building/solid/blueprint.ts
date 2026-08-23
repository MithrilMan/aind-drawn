import type { Point } from '../../../core/geometry.js';
import type { Point3 } from '../../../core/geometry3.js';
import type { SolidMaterialSpec } from '../../../materials/finish.js';
import { createBuildingDrawingStyle } from '../identity/drawing-style.js';
import type { BuildingIdentityRecipe } from '../identity/recipe.js';
import type {
  BoxGeometrySpec,
  ExtrudedProfileGeometrySpec,
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../../../contracts/solid-asset.js';
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

function archedDoorInfills(width: number, height: number): readonly (readonly Point[])[] {
  return Object.freeze([
    Object.freeze([
      [-width * 0.5, height * 0.76],
      [-width * 0.5, height],
      [0, height],
      [-width * 0.34, height * 0.94],
    ] as const),
    Object.freeze([
      [width * 0.34, height * 0.94],
      [0, height],
      [width * 0.5, height],
      [width * 0.5, height * 0.76],
    ] as const),
  ]);
}

function prismFromProfile(profile: readonly Point[], depth: number): MeshGeometrySpec {
  const halfDepth = depth * 0.5;
  const vertices: Point3[] = [
    ...profile.map(([x, y]): Point3 => [x, y, halfDepth]),
    ...profile.map(([x, y]): Point3 => [x, y, -halfDepth]),
  ];
  const count = profile.length;
  const signedArea = profile.reduce((area, [x, y], index) => {
    const next = profile[(index + 1) % count];
    return next === undefined ? area : area + x * next[1] - next[0] * y;
  }, 0);
  if (Math.abs(signedArea) < 1e-9) {
    throw new RangeError('Prism profile must enclose a non-zero area');
  }
  const counterClockwise = signedArea > 0;
  const profileOrder = Array.from({ length: count }, (_, index) => index);
  const reverseOrder = profileOrder.toReversed();
  const faces: number[][] = [
    counterClockwise ? profileOrder : reverseOrder,
    (counterClockwise ? reverseOrder : profileOrder).map((index) => count + index),
  ];
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    faces.push(counterClockwise
      ? [count + index, count + next, next, index]
      : [index, next, count + next, count + index]);
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}

function shellWithDoorway(layout: SolidBuildingLayout): MeshGeometrySpec {
  const halfWidth = layout.width * 0.5;
  const halfHeight = layout.wallHeight * 0.5;
  const back = -layout.depth * 0.5;
  const front = layout.depth * 0.5;
  const recess = layout.door.recessZ;
  const doorLeft = layout.door.centerX - layout.door.width * 0.5;
  const doorRight = layout.door.centerX + layout.door.width * 0.5;
  const doorBottom = -halfHeight;
  const doorTop = doorBottom + layout.door.height;
  const vertices: Point3[] = [];
  const faces: (readonly number[])[] = [];
  const face = (points: readonly Point3[]): void => {
    const start = vertices.length;
    vertices.push(...points.map((point) => Object.freeze(point)));
    faces.push(Object.freeze(points.map((_, index) => start + index)));
  };

  face([[-halfWidth, -halfHeight, back], [halfWidth, -halfHeight, back], [halfWidth, halfHeight, back], [-halfWidth, halfHeight, back]]);
  face([[-halfWidth, -halfHeight, front], [-halfWidth, halfHeight, front], [-halfWidth, halfHeight, back], [-halfWidth, -halfHeight, back]]);
  face([[halfWidth, -halfHeight, back], [halfWidth, halfHeight, back], [halfWidth, halfHeight, front], [halfWidth, -halfHeight, front]]);
  face([[-halfWidth, halfHeight, back], [halfWidth, halfHeight, back], [halfWidth, halfHeight, front], [-halfWidth, halfHeight, front]]);
  face([[-halfWidth, -halfHeight, front], [halfWidth, -halfHeight, front], [halfWidth, -halfHeight, back], [-halfWidth, -halfHeight, back]]);
  face([[-halfWidth, -halfHeight, front], [doorLeft, -halfHeight, front], [doorLeft, halfHeight, front], [-halfWidth, halfHeight, front]]);
  face([[doorRight, -halfHeight, front], [halfWidth, -halfHeight, front], [halfWidth, halfHeight, front], [doorRight, halfHeight, front]]);
  face([[doorLeft, doorTop, front], [doorRight, doorTop, front], [doorRight, halfHeight, front], [doorLeft, halfHeight, front]]);
  face([[doorLeft, doorBottom, recess], [doorLeft, doorTop, recess], [doorLeft, doorTop, front], [doorLeft, doorBottom, front]]);
  face([[doorRight, doorBottom, front], [doorRight, doorTop, front], [doorRight, doorTop, recess], [doorRight, doorBottom, recess]]);
  face([[doorLeft, doorTop, front], [doorRight, doorTop, front], [doorRight, doorTop, recess], [doorLeft, doorTop, recess]]);

  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

function materialSpecs(recipe: SolidBuildingRecipe): readonly SolidMaterialSpec[] {
  const drawing = createBuildingDrawingStyle(recipe.identity);
  return Object.freeze([
    Object.freeze({
      id: 'wall', color: recipe.identity.palette.wall,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'pigment', tone: drawing.facadeTone }),
    }),
    Object.freeze({
      id: 'accent', color: recipe.identity.palette.accent,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'pigment', tone: 'hatch' }),
    }),
    Object.freeze({
      id: 'roof', color: recipe.identity.palette.accent,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'paper', tone: 'light' }),
    }),
    Object.freeze({
      id: 'balcony', color: recipe.identity.palette.accent,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'paper', tone: 'light' }),
    }),
    Object.freeze({
      id: 'chimney', color: recipe.identity.palette.wall,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'pigment', tone: 'hatch' }),
    }),
    Object.freeze({
      id: 'glass:dark', color: recipe.identity.palette.glass,
      finish: recipe.style.windowFinish, roughness: 0.18, clearcoat: 0.62,
      drawing: Object.freeze({ application: 'pigment', tone: 'black' }),
    }),
    Object.freeze({
      id: 'glass:lit', color: recipe.identity.palette.accent,
      finish: recipe.style.windowFinish, roughness: 0.18, clearcoat: 0.62,
      drawing: Object.freeze({ application: 'pigment', tone: 'light' }),
    }),
    Object.freeze({
      id: 'interior', color: recipe.identity.palette.interior,
      finish: 'matte', roughness: 1,
      drawing: Object.freeze({ application: 'pigment', tone: 'black' }),
    }),
  ]);
}

function buildSolidBuildingBlueprint(recipe: SolidBuildingRecipe): SolidAssetBlueprint<'building'> {
  const layout = buildSolidBuildingLayout(recipe);
  const identity = recipe.identity;
  const parts: SolidPartDefinition[] = [];
  const add = (part: SolidPartDefinition): void => { parts.push(Object.freeze(part)); };
  add({
    id: 'building:shell', node: 'root', order: 0,
    geometry: shellWithDoorway(layout),
    materialId: 'wall', placement: placement([0, layout.wallHeight * 0.5, 0]),
    castShadow: true, receiveShadow: true,
  });
  add({
    id: 'building:roof', node: 'root', order: 1,
    geometry: prismFromProfile(layout.facade.roofProfile, layout.depth * 1.08),
    materialId: 'roof', placement: placement([0, layout.wallHeight, 0]),
    castShadow: true, receiveShadow: true,
  });

  for (const window of layout.facade.windows) {
    add({
      id: window.id, node: 'root', order: 4,
      geometry: plate(window.profile, 0.055, 0.01),
      materialId: window.lit ? 'glass:lit' : 'glass:dark',
      placement: placement([window.center[0], window.center[1], layout.depth * 0.5 + 0.045]),
      castShadow: false, receiveShadow: false,
    });
  }

  const doorOutline = layout.facade.door.profile;
  add({
    id: 'door:opening', node: 'root', order: 7,
    geometry: plate(doorOutline, 0.045, 0.004),
    materialId: 'interior', placement: placement([
      layout.door.centerX,
      0,
      layout.door.recessZ,
    ]),
    castShadow: false, receiveShadow: false,
  });
  if (identity.door.style === 'arched') {
    for (const [index, infill] of archedDoorInfills(layout.door.width, layout.door.height).entries()) {
      add({
        id: `door:arch-infill:${index === 0 ? 'left' : 'right'}`,
        node: 'root',
        order: 7,
        geometry: plate(infill, 0.05, 0.004),
        materialId: 'wall',
        placement: placement([
          layout.door.centerX,
          0,
          identity.depth * 0.5 + 0.012,
        ]),
        castShadow: false,
        receiveShadow: false,
      });
    }
  }
  const doorOffset = identity.door.hinge === 'left'
    ? layout.door.width * 0.5
    : -layout.door.width * 0.5;
  add({
    id: 'door', node: 'door', order: 8,
    geometry: plate(doorOutline, 0.08, identity.door.style === 'plank' ? 0.006 : 0.018),
    materialId: 'accent', placement: placement([doorOffset, 0, 0]),
    castShadow: true, receiveShadow: false,
  });

  for (const balcony of layout.facade.balconies) {
    const { width, centerX: x, railHeight } = balcony;
    const y = layout.floorHeight * balcony.floorFromGround;
    const z = layout.depth * 0.5 + 0.2;
    add({
      id: `${balcony.id}:floor`, node: 'root', order: 5,
      geometry: box([width, 0.08, 0.48]), materialId: 'balcony',
      placement: placement([x, y, z]),
      castShadow: true, receiveShadow: true,
    });
    add({
      id: `${balcony.id}:rail`, node: 'root', order: 6,
      geometry: box([width, 0.055, 0.055]), materialId: 'balcony',
      placement: placement([x, y + railHeight, z + 0.22]),
      castShadow: true, receiveShadow: false,
    });
    const posts = balcony.postCount;
    for (let post = 0; post <= posts; post += 1) {
      add({
        id: `${balcony.id}:post:${post}`, node: 'root', order: 6,
        geometry: box([0.035, railHeight, 0.035]), materialId: 'balcony',
        placement: placement([
          x - width * 0.5 + width * post / posts,
          y + railHeight * 0.5,
          z + 0.22,
        ]),
        castShadow: true, receiveShadow: false,
      });
    }
  }

  const chimney = layout.facade.chimney;
  if (chimney.present) {
    const { centerX: x, width, height } = chimney;
    add({
      id: 'building:chimney', node: 'root', order: 2,
      geometry: box([width, height, 0.42]), materialId: 'chimney',
      placement: placement([x, layout.wallHeight + height * 0.58, 0]),
      castShadow: true, receiveShadow: true,
    });
  }

  return Object.freeze({
    blueprintVersion: 1,
    family: 'building',
    representation: 'solid',
    assetId: `building:${identity.seed}`,
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
          open: Object.freeze({
            rotation: [
              0,
              (identity.door.hinge === 'left' ? -1 : 1) * identity.door.openingAngle,
              0,
            ] as const,
          }),
        }),
      })]),
    })]),
  });
}

export function createSolidBuildingBlueprint(
  recipe: SolidBuildingRecipe,
): SolidAssetBlueprint<'building'>;
export function createSolidBuildingBlueprint(
  identity: BuildingIdentityRecipe,
  options?: SolidBuildingRecipeOptions,
): SolidAssetBlueprint<'building'>;
export function createSolidBuildingBlueprint(
  source: SolidBuildingRecipe | BuildingIdentityRecipe,
  options: SolidBuildingRecipeOptions = {},
): SolidAssetBlueprint<'building'> {
  const recipe = 'representation' in source
    ? source
    : createSolidBuildingRecipe(source, options);
  return buildSolidBuildingBlueprint(recipe);
}
