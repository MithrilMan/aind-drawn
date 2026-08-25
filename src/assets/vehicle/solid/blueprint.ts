import type { Point3 } from '../../../core/geometry3.js';
import type { SolidMaterialSpec } from '../../../materials/finish.js';
import { createVehicleDrawingStyle } from '../identity/drawing-style.js';
import {
  VEHICLE_SEMANTIC_MANIFEST,
  vehicleSemanticPartId,
} from '../identity/semantics.js';
import {
  vehicleSideSign,
  type VehicleIdentityRecipe,
  type VehicleSide,
} from '../identity/recipe.js';
import type {
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
  SuperellipsoidGeometrySpec,
} from '../../../contracts/solid-asset.js';
import { buildSolidVehicleLayout } from './layout.js';
import { createVehicleBodyGeometry } from './body-shell.js';
import { createVehicleCabinGeometry } from './cabin-geometry.js';
import { createSolidVehicleDoorParts } from './door-assembly.js';
import { createVehicleRoofGeometry } from './roof-geometry.js';
import {
  createSolidVehicleRecipe,
  type SolidVehicleRecipe,
  type SolidVehicleRecipeOptions,
} from './recipe.js';
import { vehicleRollingPartCapability } from './capabilities.js';

function placement(position: Point3, rotation?: Point3) {
  return Object.freeze({ position, ...(rotation === undefined ? {} : { rotation }) });
}

function spatialPose(position: Point3) {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
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

function materialSpecs(recipe: SolidVehicleRecipe): readonly SolidMaterialSpec[] {
  const drawing = createVehicleDrawingStyle(recipe.identity);
  return Object.freeze([
    Object.freeze({
      id: 'body', color: recipe.identity.palette.body,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'pigment', tone: drawing.bodyTone }),
      clearcoat: 0.5,
    }),
    Object.freeze({
      id: 'accent', color: recipe.identity.palette.accent,
      finish: recipe.style.finish,
      drawing: Object.freeze({ application: 'pigment', tone: drawing.metalTone }),
    }),
    Object.freeze({
      id: 'glass', color: recipe.identity.palette.glass,
      finish: recipe.style.glassFinish,
      drawing: Object.freeze({ application: 'glaze', tone: drawing.glassTone }),
      roughness: 0.12, clearcoat: 0.82,
    }),
    Object.freeze({
      id: 'tyre', color: recipe.identity.palette.tyre,
      finish: 'rubber', drawing: Object.freeze({ application: 'pigment', tone: 'black' }), roughness: 0.92,
    }),
    Object.freeze({
      id: 'hub', color: recipe.identity.palette.hub,
      finish: recipe.identity.wheels.style === 'steel' ? 'metal' : 'chrome',
      drawing: Object.freeze({ application: 'pigment', tone: drawing.metalTone }), metalness: 0.82,
    }),
    Object.freeze({
      id: 'light', color: recipe.identity.palette.light,
      finish: 'glossy', drawing: Object.freeze({ application: 'pigment', tone: 'light' }), clearcoat: 1,
    }),
    Object.freeze({
      id: 'rear-light', color: recipe.identity.palette.rearLight,
      finish: 'glossy', drawing: Object.freeze({ application: 'pigment', tone: 'scribble' }), clearcoat: 1,
    }),
    Object.freeze({
      id: 'interior', color: recipe.identity.palette.interior,
      finish: 'matte', drawing: Object.freeze({ application: 'pigment', tone: 'black' }), roughness: 1,
    }),
  ]);
}

function buildBlueprint(recipe: SolidVehicleRecipe): SolidAssetBlueprint<'vehicle'> {
  const identity = recipe.identity;
  const layout = buildSolidVehicleLayout(identity);
  const parts: SolidPartDefinition[] = [];
  const add = (part: Omit<SolidPartDefinition, 'semanticPartId'>): void => {
    parts.push(Object.freeze({ ...part, semanticPartId: vehicleSemanticPartId(part.id) }));
  };
  const bodyHeight = Math.max(identity.wheels.radius * 0.95, layout.beltHeight - layout.bodyBottom);
  const bodyGeometry = createVehicleBodyGeometry(identity, layout);

  add({
    id: 'body', node: 'chassis', order: 0,
    geometry: bodyGeometry.shell,
    materialId: 'body', placement: placement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
  });
  add({
    id: 'cabin', node: 'chassis', order: 1,
    geometry: createVehicleCabinGeometry(identity, layout), materialId: 'glass',
    placement: placement([0, 0, 0]), castShadow: true, receiveShadow: true,
  });
  const roofPartGeometry = createVehicleRoofGeometry(identity, layout);
  add({
    id: 'roof', node: 'chassis', order: 2,
    geometry: roofPartGeometry,
    materialId: 'body', placement: placement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
  });

  for (const axle of ['rear', 'front'] as const) {
    for (const side of identity.doors.sides) {
      const sideSign = vehicleSideSign(side);
      const node = `wheel:${axle}:${side}`;
      add({
        id: `${node}:tyre`, node, order: 4,
        geometry: torusWheel(identity.wheels.radius, identity.wheels.width),
        materialId: 'tyre', placement: placement([0, 0, 0]),
        capabilities: Object.freeze([vehicleRollingPartCapability({
          steering: axle === 'front',
          side: sideSign,
        })]),
        castShadow: true, receiveShadow: true,
      });
      add({
        id: `${node}:hub`, node, order: 5,
        geometry: cylinder(
          identity.wheels.radius * identity.wheels.hubRadiusRatio,
          identity.wheels.width * 1.05,
          identity.wheels.style === 'sport' ? 20 : 28,
        ),
        materialId: 'hub', placement: placement([0, 0, 0]),
        castShadow: true, receiveShadow: true,
      });
    }
  }

  for (const side of identity.doors.sides) {
    for (const doorPart of createSolidVehicleDoorParts(identity, layout, side)) add(doorPart);
  }
  const hoodGeometry = bodyGeometry.hood;
  const cargoGeometry = bodyGeometry.cargo;
  add({
    id: 'hood:opening', node: 'chassis', order: 6,
    geometry: hoodGeometry, materialId: 'interior',
    placement: placement([layout.hoodHingeX, layout.beltHeight - 0.025, 0]),
    castShadow: false, receiveShadow: false,
  });
  add({
    id: 'hood', node: 'hood', order: 7,
    geometry: hoodGeometry,
    materialId: 'body', placement: placement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
  });
  add({
    id: 'cargo:opening', node: 'chassis', order: 6,
    geometry: cargoGeometry, materialId: 'interior',
    placement: placement([layout.cargoHingeX, layout.beltHeight - 0.025, 0]),
    castShadow: false, receiveShadow: false,
  });
  add({
    id: 'cargo', node: 'cargo', order: 7,
    geometry: cargoGeometry,
    materialId: 'body', placement: placement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
  });

  const headlightVolumes = identity.details.headlight === 'stacked'
    ? Object.freeze([
      Object.freeze({ id: 'lower', y: -0.075, radii: [0.075, 0.065, 0.15] as const, exponent: 2.2 }),
      Object.freeze({ id: 'upper', y: 0.075, radii: [0.075, 0.065, 0.15] as const, exponent: 2.2 }),
    ])
    : Object.freeze([Object.freeze({
      id: identity.details.headlight,
      y: 0,
      radii: identity.details.headlight === 'round'
        ? [0.09, 0.105, 0.105] as const
        : identity.details.headlight === 'pill'
          ? [0.085, 0.075, 0.19] as const
          : identity.details.headlight === 'slit'
            ? [0.07, 0.045, 0.22] as const
            : [0.08, 0.105, 0.16] as const,
      exponent: identity.details.headlight === 'square' ? 4.2 : 2.2,
    })]);
  for (const side of identity.doors.sides) {
    const sideSign = vehicleSideSign(side);
    for (const light of headlightVolumes) {
      add({
        id: headlightVolumes.length === 1
          ? `headlight:${side}`
          : `headlight:${side}:${light.id}`,
        node: 'chassis', order: 10,
        geometry: roundedVolume(light.radii, light.exponent), materialId: 'light',
        placement: placement([
          layout.length * 0.488,
          layout.bodyBottom + bodyHeight * 0.58 + light.y,
          sideSign * layout.width * 0.29,
        ]), castShadow: false, receiveShadow: false,
      });
    }
    add({
      id: `taillight:${side}`, node: 'chassis', order: 10,
      geometry: roundedVolume([0.065, 0.15, 0.105], 2.8), materialId: 'rear-light',
      placement: placement([
        -layout.length * 0.49,
        layout.bodyBottom + bodyHeight * 0.62,
        sideSign * layout.width * 0.34,
      ]), castShadow: false, receiveShadow: false,
    });
  }
  add({
    id: 'grille:front', node: 'chassis', order: 9,
    geometry: roundedVolume([0.045, bodyHeight * 0.2, layout.width * 0.25], 3.6),
    materialId: 'accent',
    placement: placement([
      layout.length * 0.505,
      layout.bodyBottom + bodyHeight * 0.34,
      0,
    ]),
    castShadow: false, receiveShadow: false,
  });
  add({
    id: 'bumper:front', node: 'chassis', order: 10,
    geometry: roundedVolume([0.08, 0.08, layout.width * 0.43], 3.4), materialId: 'accent',
    placement: placement([layout.length * 0.5, layout.bodyBottom + 0.14, 0]),
    castShadow: true, receiveShadow: true,
  });
  add({
    id: 'bumper:rear', node: 'chassis', order: 10,
    geometry: roundedVolume([0.08, 0.08, layout.width * 0.43], 3.4), materialId: 'accent',
    placement: placement([-layout.length * 0.5, layout.bodyBottom + 0.14, 0]),
    castShadow: true, receiveShadow: true,
  });

  if (identity.details.roofRack) {
    const rackLength = (identity.cabin.endRatio - identity.cabin.startRatio) * layout.length * 0.54;
    for (const side of identity.doors.sides) {
      add({
        id: `roof-rack:${side}`, node: 'chassis', order: 11,
        geometry: roundedVolume([rackLength * 0.5, 0.025, 0.025], 2.4), materialId: 'accent',
        placement: placement([
          0,
          layout.roofHeight + 0.16,
          vehicleSideSign(side) * (layout.cabinRoofHalfWidth + layout.roofOverhang * 0.35),
        ]),
        castShadow: true, receiveShadow: false,
      });
    }
  }
  if (identity.details.spoiler) {
    const spoilerX = -layout.length * 0.43;
    const spoilerY = layout.beltHeight + 0.2;
    add({
      id: 'spoiler', node: 'chassis', order: 11,
      geometry: roundedVolume([0.3, 0.035, layout.width * 0.42], 3.6), materialId: 'accent',
      placement: placement([spoilerX, spoilerY, 0]),
      castShadow: true, receiveShadow: false,
    });
    for (const side of identity.doors.sides) {
      add({
        id: `spoiler:support:${side}`, node: 'chassis', order: 10,
        geometry: roundedVolume([0.035, 0.13, 0.035], 3.2), materialId: 'accent',
        placement: placement([
          spoilerX,
          spoilerY - 0.13,
          vehicleSideSign(side) * layout.width * 0.26,
        ]),
        castShadow: true, receiveShadow: false,
      });
    }
  }
  if (identity.details.towHitch) {
    add({
      id: 'tow-hitch', node: 'chassis', order: 11,
      geometry: roundedVolume([0.13, 0.07, 0.07], 2.2), materialId: 'hub',
      placement: placement([-layout.length * 0.55, layout.bodyBottom, 0]),
      castShadow: true, receiveShadow: false,
    });
  }

  const doorMinimumY = Math.min(...layout.doorOpeningOutline.map(([, y]) => y));
  const doorMaximumY = Math.max(...layout.doorOpeningOutline.map(([, y]) => y));
  const doorAssemblyHeight = doorMaximumY - doorMinimumY;
  const doorSensorSize: Point3 = [layout.doorLength, doorAssemblyHeight, 1.2];
  const interaction = (
    id: 'door:left' | 'door:right',
    side: VehicleSide,
  ) => Object.freeze({
    interactionId: id,
    nodes: Object.freeze([Object.freeze({
      nodeId: id,
      stateByInteractionState: Object.freeze({
        closed: Object.freeze({ rotation: [0, 0, 0] as const }),
        open: Object.freeze({
          rotation: [0, vehicleSideSign(side) * identity.doors.openingAngle, 0] as const,
        }),
      }),
    })]),
  });

  return Object.freeze({
    blueprintVersion: 1,
    family: 'vehicle',
    representation: 'solid',
    assetId: `vehicle:${identity.seed}`,
    seed: identity.seed,
    manifest: VEHICLE_SEMANTIC_MANIFEST,
    bounds: layout.bounds,
    nodes: layout.nodes,
    parts: Object.freeze(parts),
    materials: materialSpecs(recipe),
    colliders: Object.freeze([
      Object.freeze({
        id: 'vehicle:body', kind: 'solid', shape: 'box',
        node: 'chassis', localPose: spatialPose([0, layout.height * 0.5, 0] as const),
        size: [layout.length, layout.height, layout.width] as const,
      }),
      ...identity.doors.sides.map((side) => Object.freeze({
        id: `door:${side}:leaf`, kind: 'solid' as const, shape: 'box' as const,
        node: `door:${side}`,
        localPose: spatialPose([
          -layout.doorLength * 0.5,
          doorMinimumY + doorAssemblyHeight * 0.5,
          0,
        ] as const),
        size: [layout.doorLength, doorAssemblyHeight, 0.1] as const,
      })),
      Object.freeze({
        id: 'door:left:sensor', kind: 'sensor', shape: 'box',
        node: 'root', localPose: spatialPose([
          layout.doorHingeX - layout.doorLength * 0.5,
          layout.bodyBottom + doorMinimumY + doorAssemblyHeight * 0.5,
          vehicleSideSign('left') * (layout.width * 0.5 + 0.6),
        ] as const),
        size: doorSensorSize,
      }),
      Object.freeze({
        id: 'door:right:sensor', kind: 'sensor', shape: 'box',
        node: 'root', localPose: spatialPose([
          layout.doorHingeX - layout.doorLength * 0.5,
          layout.bodyBottom + doorMinimumY + doorAssemblyHeight * 0.5,
          vehicleSideSign('right') * (layout.width * 0.5 + 0.6),
        ] as const),
        size: doorSensorSize,
      }),
      Object.freeze({
        id: 'hood:sensor', kind: 'sensor', shape: 'box',
        node: 'root',
        localPose: spatialPose([
          layout.hoodHingeX + layout.hoodLength * 0.5,
          layout.beltHeight,
          0,
        ] as const),
        size: [layout.hoodLength, 0.8, layout.width] as const,
      }),
      Object.freeze({
        id: 'cargo:sensor', kind: 'sensor', shape: 'box',
        node: 'root',
        localPose: spatialPose([
          layout.cargoHingeX - layout.cargoLength * 0.5,
          layout.beltHeight,
          0,
        ] as const),
        size: [layout.cargoLength, 0.8, layout.width] as const,
      }),
    ]),
    sockets: layout.sockets,
    interactionBindings: Object.freeze([
      interaction('door:left', 'left'),
      interaction('door:right', 'right'),
      Object.freeze({
        interactionId: 'hood',
        nodes: Object.freeze([Object.freeze({
          nodeId: 'hood', stateByInteractionState: Object.freeze({
            closed: Object.freeze({ rotation: [0, 0, 0] as const }),
            open: Object.freeze({ rotation: [0, 0, Math.PI * 0.34] as const }),
          }),
        })]),
      }),
      Object.freeze({
        interactionId: 'cargo',
        nodes: Object.freeze([Object.freeze({
          nodeId: 'cargo', stateByInteractionState: Object.freeze({
            closed: Object.freeze({ rotation: [0, 0, 0] as const }),
            open: Object.freeze({ rotation: [0, 0, -Math.PI * 0.34] as const }),
          }),
        })]),
      }),
    ]),
  });
}

export function createSolidVehicleBlueprint(recipe: SolidVehicleRecipe): SolidAssetBlueprint<'vehicle'>;
export function createSolidVehicleBlueprint(
  identity: VehicleIdentityRecipe,
  options?: SolidVehicleRecipeOptions,
): SolidAssetBlueprint<'vehicle'>;
export function createSolidVehicleBlueprint(
  source: SolidVehicleRecipe | VehicleIdentityRecipe,
  options: SolidVehicleRecipeOptions = {},
): SolidAssetBlueprint<'vehicle'> {
  return buildBlueprint('representation' in source
    ? source
    : createSolidVehicleRecipe(source, options));
}
