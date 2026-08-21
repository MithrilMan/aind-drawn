import type { Point3 } from '../../core/geometry3.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import { createVehicleDrawingStyle } from '../vehicle-identity/drawing-style.js';
import type { VehicleIdentityRecipe } from '../vehicle-identity/recipe.js';
import type {
  BoxGeometrySpec,
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
  SuperellipsoidGeometrySpec,
} from '../solid-types.js';
import { buildSolidVehicleLayout, type SolidVehicleLayout } from './layout.js';
import {
  createSolidVehicleRecipe,
  type SolidVehicleRecipe,
  type SolidVehicleRecipeOptions,
} from './recipe.js';

function placement(position: Point3, rotation?: Point3) {
  return Object.freeze({ position, ...(rotation === undefined ? {} : { rotation }) });
}

function box(size: Point3, segments?: readonly [number, number, number]): BoxGeometrySpec {
  return Object.freeze({ type: 'box', size, ...(segments === undefined ? {} : { segments }) });
}

function roundedVolume(radii: Point3, exponent: number): SuperellipsoidGeometrySpec {
  return Object.freeze({
    type: 'superellipsoid', radii, exponent, widthSegments: 48, heightSegments: 28,
  });
}

function torusWheel(radius: number, width: number): MeshGeometrySpec {
  const radialThickness = radius * 0.27;
  const majorRadius = radius - radialThickness;
  const ringSegments = 32;
  const tubeSegments = 12;
  const vertices: Point3[] = [];
  const faces: (readonly number[])[] = [];
  for (let ring = 0; ring < ringSegments; ring += 1) {
    const angle = ring / ringSegments * Math.PI * 2;
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const tubeAngle = tube / tubeSegments * Math.PI * 2;
      const radial = majorRadius + Math.cos(tubeAngle) * radialThickness;
      vertices.push(Object.freeze([
        Math.cos(angle) * radial,
        Math.sin(angle) * radial,
        Math.sin(tubeAngle) * width * 0.5,
      ] as const));
    }
  }
  for (let ring = 0; ring < ringSegments; ring += 1) {
    const nextRing = (ring + 1) % ringSegments;
    for (let tube = 0; tube < tubeSegments; tube += 1) {
      const nextTube = (tube + 1) % tubeSegments;
      faces.push(Object.freeze([
        ring * tubeSegments + tube,
        nextRing * tubeSegments + tube,
        nextRing * tubeSegments + nextTube,
        ring * tubeSegments + nextTube,
      ]));
    }
  }
  return Object.freeze({
    type: 'mesh', vertices: Object.freeze(vertices), faces: Object.freeze(faces), smooth: true,
  });
}

function cylinder(radius: number, depth: number, segments = 24): MeshGeometrySpec {
  const vertices: Point3[] = [];
  const faces: (readonly number[])[] = [];
  for (const z of [-depth * 0.5, depth * 0.5]) {
    for (let index = 0; index < segments; index += 1) {
      const angle = index / segments * Math.PI * 2;
      vertices.push(Object.freeze([Math.cos(angle) * radius, Math.sin(angle) * radius, z] as const));
    }
  }
  faces.push(
    Object.freeze(Array.from({ length: segments }, (_, index) => segments - 1 - index)),
    Object.freeze(Array.from({ length: segments }, (_, index) => segments + index)),
  );
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push(Object.freeze([index, next, segments + next, segments + index]));
  }
  return Object.freeze({
    type: 'mesh', vertices: Object.freeze(vertices), faces: Object.freeze(faces), smooth: true,
  });
}

function cabinGeometry(identity: VehicleIdentityRecipe, layout: SolidVehicleLayout): MeshGeometrySpec {
  const left = -layout.length * 0.5 + identity.cabin.startRatio * layout.length;
  const right = -layout.length * 0.5 + identity.cabin.endRatio * layout.length;
  const roofLeft = left + layout.length * 0.1 / identity.cabin.windscreenSlope;
  const roofRight = right - layout.length * 0.075 / identity.cabin.rearSlope;
  const profile: readonly (readonly [number, number])[] = Object.freeze([
    [left, layout.beltHeight], [roofLeft, layout.roofHeight * 0.96],
    [roofLeft + layout.length * 0.08, layout.roofHeight],
    [roofRight - layout.length * 0.06, layout.roofHeight],
    [roofRight, layout.roofHeight * 0.96], [right, layout.beltHeight],
  ]);
  const halfDepth = layout.width * 0.44;
  const vertices: Point3[] = [
    ...profile.map(([x, y]): Point3 => Object.freeze([x, y, halfDepth] as const)),
    ...profile.map(([x, y]): Point3 => Object.freeze([x, y, -halfDepth] as const)),
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

function materialSpecs(recipe: SolidVehicleRecipe): readonly SolidMaterialSpec[] {
  const drawing = createVehicleDrawingStyle(recipe.identity);
  return Object.freeze([
    Object.freeze({
      id: 'body', role: 'vehicle-body', color: recipe.identity.palette.body,
      finish: recipe.style.finish, drawing: Object.freeze({ tone: drawing.bodyTone }),
      clearcoat: 0.5,
    }),
    Object.freeze({
      id: 'accent', role: 'vehicle-accent', color: recipe.identity.palette.accent,
      finish: recipe.style.finish, drawing: Object.freeze({ tone: drawing.metalTone }),
    }),
    Object.freeze({
      id: 'glass', role: 'window', color: recipe.identity.palette.glass,
      finish: recipe.style.glassFinish, drawing: Object.freeze({ tone: drawing.glassTone }),
      roughness: 0.12, clearcoat: 0.82,
    }),
    Object.freeze({
      id: 'tyre', role: 'tyre', color: recipe.identity.palette.tyre,
      finish: 'rubber', drawing: Object.freeze({ tone: 'black' as const }), roughness: 0.92,
    }),
    Object.freeze({
      id: 'hub', role: 'wheel-metal', color: recipe.identity.palette.hub,
      finish: recipe.identity.wheels.style === 'steel' ? 'metal' : 'chrome',
      drawing: Object.freeze({ tone: drawing.metalTone }), metalness: 0.82,
    }),
    Object.freeze({
      id: 'light', role: 'lamp', color: recipe.identity.palette.light,
      finish: 'glossy', drawing: Object.freeze({ tone: 'light' as const }), clearcoat: 1,
    }),
  ]);
}

function buildBlueprint(recipe: SolidVehicleRecipe): SolidAssetBlueprint {
  const identity = recipe.identity;
  const layout = buildSolidVehicleLayout(identity);
  const parts: SolidPartDefinition[] = [];
  const add = (part: SolidPartDefinition): void => { parts.push(Object.freeze(part)); };
  const fixed = Object.freeze({ role: 'fixed' as const });
  const bodyHeight = Math.max(identity.wheels.radius * 0.95, layout.beltHeight - layout.bodyBottom);

  add({
    id: 'body', node: 'chassis', order: 0,
    geometry: roundedVolume([
      layout.length * 0.49,
      bodyHeight * 0.56,
      layout.width * 0.5,
    ], 3.6 + identity.body.cornerRoundness),
    materialId: 'body', placement: placement([0, layout.bodyBottom + bodyHeight * 0.52, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });
  add({
    id: 'cabin', node: 'chassis', order: 1,
    geometry: cabinGeometry(identity, layout), materialId: 'glass',
    placement: placement([0, 0, 0]), motion: fixed, castShadow: true, receiveShadow: true,
  });
  const roofLength = (identity.cabin.endRatio - identity.cabin.startRatio) * layout.length * 0.74;
  add({
    id: 'roof', node: 'chassis', order: 2,
    geometry: roundedVolume([roofLength * 0.5, 0.055, layout.width * 0.47], 3.8),
    materialId: 'body', placement: placement([
      -layout.length * 0.5 + (identity.cabin.startRatio + identity.cabin.endRatio) * layout.length * 0.5,
      layout.roofHeight + 0.025,
      0,
    ]), motion: fixed, castShadow: true, receiveShadow: true,
  });

  for (const axle of ['rear', 'front'] as const) {
    for (const side of ['left', 'right'] as const) {
      const sideSign = side === 'left' ? 1 : -1;
      const node = `wheel:${axle}:${side}`;
      add({
        id: `${node}:tyre`, node, order: 4,
        geometry: torusWheel(identity.wheels.radius, identity.wheels.width),
        materialId: 'tyre', placement: placement([0, 0, 0]),
        motion: Object.freeze({
          role: 'rolling' as const,
          radius: identity.wheels.radius,
          steering: axle === 'front',
          side: sideSign,
        }),
        castShadow: true, receiveShadow: true,
      });
      add({
        id: `${node}:hub`, node, order: 5,
        geometry: cylinder(
          identity.wheels.radius * identity.wheels.hubRadiusRatio,
          identity.wheels.width * 1.05,
          identity.wheels.style === 'sport' ? 20 : 28,
        ),
        materialId: 'hub', placement: placement([0, 0, 0]), motion: fixed,
        castShadow: true, receiveShadow: true,
      });
    }
  }

  for (const side of ['left', 'right'] as const) {
    add({
      id: `door:${side}`, node: `door:${side}`, order: 8,
      geometry: box([layout.doorLength, layout.doorHeight, 0.065], [2, 2, 1]),
      materialId: 'body',
      placement: placement([-layout.doorLength * 0.5, layout.doorHeight * 0.5, 0]),
      motion: fixed, castShadow: true, receiveShadow: true,
    });
    add({
      id: `door:${side}:handle`, node: `door:${side}`, order: 9,
      geometry: roundedVolume([0.11, 0.025, 0.025], 2.8), materialId: 'accent',
      placement: placement([-layout.doorLength * 0.78, layout.doorHeight * 0.78, side === 'left' ? 0.055 : -0.055]),
      motion: fixed, castShadow: true, receiveShadow: false,
    });
  }
  add({
    id: 'hood', node: 'hood', order: 7,
    geometry: box([layout.hoodLength, 0.065, layout.width * 0.91], [2, 1, 2]),
    materialId: 'body', placement: placement([layout.hoodLength * 0.5, 0, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });
  add({
    id: 'cargo', node: 'cargo', order: 7,
    geometry: box([layout.cargoLength, 0.065, layout.width * 0.91], [2, 1, 2]),
    materialId: 'body', placement: placement([-layout.cargoLength * 0.5, 0, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });

  for (const side of [-1, 1] as const) {
    add({
      id: `headlight:${side === 1 ? 'left' : 'right'}`, node: 'chassis', order: 10,
      geometry: roundedVolume([0.09, 0.13, 0.18], 2.2), materialId: 'light',
      placement: placement([
        layout.length * 0.485,
        layout.bodyBottom + bodyHeight * 0.58,
        side * layout.width * 0.29,
      ]), motion: fixed, castShadow: false, receiveShadow: false,
    });
  }
  add({
    id: 'bumper:front', node: 'chassis', order: 10,
    geometry: roundedVolume([0.08, 0.08, layout.width * 0.43], 3.4), materialId: 'accent',
    placement: placement([layout.length * 0.5, layout.bodyBottom + 0.14, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });
  add({
    id: 'bumper:rear', node: 'chassis', order: 10,
    geometry: roundedVolume([0.08, 0.08, layout.width * 0.43], 3.4), materialId: 'accent',
    placement: placement([-layout.length * 0.5, layout.bodyBottom + 0.14, 0]),
    motion: fixed, castShadow: true, receiveShadow: true,
  });

  if (identity.details.roofRack) {
    const rackLength = roofLength * 0.72;
    for (const z of [-layout.width * 0.32, layout.width * 0.32]) {
      add({
        id: `roof-rack:${z < 0 ? 'right' : 'left'}`, node: 'chassis', order: 11,
        geometry: roundedVolume([rackLength * 0.5, 0.025, 0.025], 2.4), materialId: 'accent',
        placement: placement([0, layout.roofHeight + 0.16, z]), motion: fixed,
        castShadow: true, receiveShadow: false,
      });
    }
  }
  if (identity.details.spoiler) {
    add({
      id: 'spoiler', node: 'chassis', order: 11,
      geometry: roundedVolume([0.3, 0.035, layout.width * 0.42], 3.6), materialId: 'accent',
      placement: placement([-layout.length * 0.43, layout.beltHeight + 0.2, 0]),
      motion: fixed, castShadow: true, receiveShadow: false,
    });
  }
  if (identity.details.towHitch) {
    add({
      id: 'tow-hitch', node: 'chassis', order: 11,
      geometry: roundedVolume([0.13, 0.07, 0.07], 2.2), materialId: 'hub',
      placement: placement([-layout.length * 0.55, layout.bodyBottom, 0]),
      motion: fixed, castShadow: true, receiveShadow: false,
    });
  }

  const doorSensorSize: Point3 = [layout.doorLength, layout.doorHeight, 1.2];
  const interaction = (
    id: 'door:left' | 'door:right',
    side: -1 | 1,
  ) => Object.freeze({
    id,
    kind: 'portal' as const,
    sensorColliderId: `${id}:sensor`,
    activationSocketId: `entry:${side === 1 ? 'left' : 'right'}`,
    initialState: 'closed',
    states: Object.freeze(['closed', 'open']),
    nodeBindings: Object.freeze([Object.freeze({
      nodeId: id,
      stateByInteractionState: Object.freeze({
        closed: Object.freeze({ rotation: [0, 0, 0] as const }),
        open: Object.freeze({ rotation: [0, side * Math.PI * 0.4, 0] as const }),
      }),
    })]),
  });

  return Object.freeze({
    representation: 'solid',
    id: `solid-vehicle:${identity.seed}`,
    kind: 'solid-vehicle',
    seed: identity.seed,
    bounds: layout.bounds,
    nodes: layout.nodes,
    parts: Object.freeze(parts),
    materials: materialSpecs(recipe),
    colliders: Object.freeze([
      Object.freeze({
        id: 'vehicle:body', kind: 'solid', shape: 'box',
        center: [0, layout.height * 0.5, 0] as const,
        size: [layout.length, layout.height, layout.width] as const,
      }),
      Object.freeze({
        id: 'door:left:sensor', kind: 'sensor', shape: 'box',
        center: [layout.doorHingeX - layout.doorLength * 0.5, layout.bodyBottom + layout.doorHeight * 0.5, layout.width * 0.5 + 0.6] as const,
        size: doorSensorSize,
      }),
      Object.freeze({
        id: 'door:right:sensor', kind: 'sensor', shape: 'box',
        center: [layout.doorHingeX - layout.doorLength * 0.5, layout.bodyBottom + layout.doorHeight * 0.5, -layout.width * 0.5 - 0.6] as const,
        size: doorSensorSize,
      }),
      Object.freeze({
        id: 'hood:sensor', kind: 'sensor', shape: 'box',
        center: [layout.hoodHingeX + layout.hoodLength * 0.5, layout.beltHeight, 0] as const,
        size: [layout.hoodLength, 0.8, layout.width] as const,
      }),
      Object.freeze({
        id: 'cargo:sensor', kind: 'sensor', shape: 'box',
        center: [layout.cargoHingeX - layout.cargoLength * 0.5, layout.beltHeight, 0] as const,
        size: [layout.cargoLength, 0.8, layout.width] as const,
      }),
    ]),
    sockets: layout.sockets,
    interactions: Object.freeze([
      interaction('door:left', 1),
      interaction('door:right', -1),
      Object.freeze({
        id: 'hood', kind: 'toggle', sensorColliderId: 'hood:sensor', activationSocketId: 'driver',
        initialState: 'closed', states: Object.freeze(['closed', 'open']),
        nodeBindings: Object.freeze([Object.freeze({
          nodeId: 'hood', stateByInteractionState: Object.freeze({
            closed: Object.freeze({ rotation: [0, 0, 0] as const }),
            open: Object.freeze({ rotation: [0, 0, Math.PI * 0.34] as const }),
          }),
        })]),
      }),
      Object.freeze({
        id: 'cargo', kind: 'toggle', sensorColliderId: 'cargo:sensor', activationSocketId: 'cargo',
        initialState: 'closed', states: Object.freeze(['closed', 'open']),
        nodeBindings: Object.freeze([Object.freeze({
          nodeId: 'cargo', stateByInteractionState: Object.freeze({
            closed: Object.freeze({ rotation: [0, 0, 0] as const }),
            open: Object.freeze({ rotation: [0, 0, -Math.PI * 0.34] as const }),
          }),
        })]),
      }),
    ]),
  });
}

export function createSolidVehicleBlueprint(recipe: SolidVehicleRecipe): SolidAssetBlueprint;
export function createSolidVehicleBlueprint(
  identity: VehicleIdentityRecipe,
  options?: SolidVehicleRecipeOptions,
): SolidAssetBlueprint;
export function createSolidVehicleBlueprint(
  source: SolidVehicleRecipe | VehicleIdentityRecipe,
  options: SolidVehicleRecipeOptions = {},
): SolidAssetBlueprint {
  return buildBlueprint(source.kind === 'vehicle-identity'
    ? createSolidVehicleRecipe(source, options)
    : source);
}
