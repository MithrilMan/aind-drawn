import {
  createSemanticSurface,
  createUniformAssetAppearance,
  type DrawingApplication,
  type DrawingIntent,
  type MeshGeometrySpec,
  type Point3,
  type SolidAssetBlueprint,
  type SolidPartDefinition,
  type SemanticSurfaceSpec,
  type SurfaceSubstance,
} from '../../../../src/index.js';
import type { CourseLayout } from './course.js';
import {
  GRANDSTAND_ROW_SPACING,
  grandstandStepHeight,
  grandstandStepSpan,
  type RaceWorldLayout,
} from './race-world.js';

function surface(
  id: string,
  color: readonly [number, number, number],
  substance: SurfaceSubstance,
  application: DrawingApplication,
  drawing: DrawingIntent,
): SemanticSurfaceSpec {
  return createSemanticSurface({
    id, color, substance, drawing: Object.freeze({ application, drawing }),
    physical: Object.freeze({ roughness: 0.95, metalness: 0 }),
  });
}

function coneGeometry(radius: number, height: number, sides = 8): MeshGeometrySpec {
  const vertices: Point3[] = [];
  for (let index = 0; index < sides; index += 1) {
    const angle = index / sides * Math.PI * 2;
    vertices.push(Object.freeze([Math.cos(angle) * radius, 0, Math.sin(angle) * radius] as const));
  }
  vertices.push(Object.freeze([0, height, 0] as const));
  const faces: (readonly number[])[] = [
    Object.freeze(Array.from({ length: sides }, (_, index) => sides - 1 - index)),
  ];
  for (let index = 0; index < sides; index += 1) {
    faces.push(Object.freeze([index, (index + 1) % sides, sides]));
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

function semanticPartId(id: string): 'barriers' | 'tyres' | 'markers' | 'grandstand' {
  if (id.startsWith('barrier:')) return 'barriers';
  if (id.startsWith('tyres:')) return 'tyres';
  if (id.startsWith('cone:')) return 'markers';
  return 'grandstand';
}

function standPoint(
  world: RaceWorldLayout,
  along: number,
  away: number,
  y: number,
): Point3 {
  const { x, z, heading } = world.grandstand;
  return Object.freeze([
    x + Math.cos(heading) * along + Math.sin(heading) * away,
    y,
    z - Math.sin(heading) * along + Math.cos(heading) * away,
  ] as const);
}

function yawQuaternion(yaw: number): readonly [number, number, number, number] {
  return Object.freeze([0, Math.sin(yaw * 0.5), 0, Math.cos(yaw * 0.5)] as const);
}

export function createRaceSceneryBlueprint(
  course: CourseLayout,
  world: RaceWorldLayout,
): SolidAssetBlueprint<'race-scenery'> {
  const parts: SolidPartDefinition[] = [];
  const add = (definition: Omit<SolidPartDefinition, 'semanticPartId'>): void => {
    parts.push(Object.freeze({ ...definition, semanticPartId: semanticPartId(definition.id) }));
  };

  for (const [index, barrier] of world.barriers.entries()) {
    const deltaX = barrier.endX - barrier.startX;
    const deltaZ = barrier.endZ - barrier.startZ;
    const length = Math.hypot(deltaX, deltaZ);
    const heading = Math.atan2(-deltaZ, deltaX);
    add({
      id: barrier.id,
      node: 'root',
      order: 1,
      geometry: Object.freeze({
        type: 'box',
        size: [length + 0.04, barrier.height, barrier.radius * 2] as const,
      }),
      surfaceId: index % 2 === 0 ? 'barrier:red' : 'barrier:paper',
      placement: Object.freeze({
        position: Object.freeze([
          (barrier.startX + barrier.endX) * 0.5,
          barrier.height * 0.5,
          (barrier.startZ + barrier.endZ) * 0.5,
        ] as const),
        rotation: Object.freeze([0, heading, 0] as const),
      }),
      castShadow: true,
      receiveShadow: true,
    });
  }

  for (const stack of world.tyreStacks) {
    for (let tyre = 0; tyre < 3; tyre += 1) {
      add({
        id: `${stack.id}:${tyre}`,
        node: 'root',
        order: 2,
        geometry: Object.freeze({
          type: 'superellipsoid',
          radii: [stack.radius * 0.72, 0.18, stack.radius * 0.72] as const,
          exponent: 2.8,
          deformation: Object.freeze({
            verticalTaper: 0,
            equatorBulge: 0.12,
            lobeAmplitude: 0.025,
            lobeCount: 8,
            lobePhase: tyre * 0.7,
          }),
          widthSegments: 14,
          heightSegments: 7,
        }),
        surfaceId: 'tyre',
        placement: Object.freeze({ position: [stack.x, 0.2 + tyre * 0.3, stack.z] as const }),
        castShadow: true,
        receiveShadow: true,
      });
    }
  }

  for (const cone of world.cones) {
    add({
      id: cone.id,
      node: 'root',
      order: 3,
      geometry: coneGeometry(0.23, 0.72),
      surfaceId: 'cone',
      placement: Object.freeze({ position: [cone.x, 0.02, cone.z] as const }),
      castShadow: true,
      receiveShadow: true,
    });
  }

  const stand = world.grandstand;
  for (let row = 0; row < stand.rows; row += 1) {
    const stepHeight = grandstandStepHeight(row);
    const stepSpan = grandstandStepSpan(row, stand.rows);
    add({
      id: `grandstand:step:${row}`,
      node: 'root',
      order: 0,
      geometry: Object.freeze({
        type: 'box',
        size: [stand.length, stepHeight, stepSpan.depth] as const,
      }),
      surfaceId: row % 2 === 0 ? 'stand:paper' : 'stand:dark',
      placement: Object.freeze({
        position: standPoint(world, 0, stepSpan.centreAway, stepHeight * 0.5),
        rotation: Object.freeze([0, stand.heading, 0] as const),
      }),
      castShadow: true,
      receiveShadow: true,
    });
  }
  const roofHeight = 2.1 + stand.rows * 0.45;
  const roofAway = (stand.rows - 1) * GRANDSTAND_ROW_SPACING * 0.5;
  add({
    id: 'grandstand:roof', node: 'root', order: 4,
    geometry: Object.freeze({ type: 'box', size: [stand.length + 0.7, 0.16, 2.7] as const }),
    surfaceId: 'stand:roof',
    placement: Object.freeze({
      position: standPoint(world, 0, roofAway, roofHeight),
      rotation: Object.freeze([0, stand.heading, -0.05] as const),
    }),
    castShadow: true, receiveShadow: true,
  });
  const standPostAlong = Object.freeze([-stand.length * 0.46, stand.length * 0.46]);
  for (const along of standPostAlong) {
    const postHeight = roofHeight - 0.1;
    add({
      id: `grandstand:post:${along < 0 ? 'left' : 'right'}`, node: 'root', order: 3,
      geometry: Object.freeze({ type: 'box', size: [0.16, postHeight, 0.16] as const }),
      surfaceId: 'stand:dark',
      placement: Object.freeze({ position: standPoint(world, along, roofAway, postHeight * 0.5) }),
      castShadow: true, receiveShadow: true,
    });
  }

  const sceneryColliderIds = Object.freeze([
    ...world.barriers.map(({ id }) => id),
    ...world.tyreStacks.map(({ id }) => id),
    ...world.cones.map(({ id }) => id),
    ...standPostAlong.map((along) => `grandstand:post:${along < 0 ? 'left' : 'right'}`),
  ]);
  return Object.freeze({
    blueprintVersion: 1,
    family: 'race-scenery',
    representation: 'solid',
    assetId: 'race-scenery:technical-circuit:1',
    seed: 7391,
    appearance: createUniformAssetAppearance(
      'storybook',
      ['barriers', 'tyres', 'markers', 'grandstand'],
    ),
    bounds: Object.freeze({
      minimum: [course.bounds.minimumX - 3, 0, course.bounds.minimumZ - 3] as const,
      maximum: [course.bounds.maximumX + 3, 3.8, course.bounds.maximumZ + 3] as const,
    }),
    manifest: Object.freeze({
      family: 'race-scenery',
      parts: Object.freeze([
        Object.freeze({ id: 'barriers', spatial: 'volume' as const }),
        Object.freeze({ id: 'tyres', spatial: 'cluster' as const }),
        Object.freeze({ id: 'markers', spatial: 'volume' as const }),
        Object.freeze({ id: 'grandstand', spatial: 'volume' as const }),
      ]),
      socketIds: Object.freeze([]),
      colliderIds: sceneryColliderIds,
      interactions: Object.freeze([]),
    }),
    nodes: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({ position: [0, 0, 0] as const, rotation: [0, 0, 0, 1] as const }),
    })]),
    parts: Object.freeze(parts),
    surfaces: Object.freeze([
      surface('barrier:red', [181, 64, 43], 'paint', 'pigment', { value: 'mid', gesture: 'agitated' }),
      surface('barrier:paper', [231, 219, 190], 'paper', 'paper', { value: 'light', gesture: 'quiet' }),
      surface('tyre', [45, 45, 40], 'rubber', 'pigment', { value: 'solid', gesture: 'regular' }),
      surface('cone', [207, 108, 42], 'rubber', 'pigment', { value: 'mid', gesture: 'regular' }),
      surface('stand:paper', [191, 180, 151], 'paper', 'paper', { value: 'light', gesture: 'quiet' }),
      surface('stand:dark', [68, 70, 63], 'paint', 'pigment', { value: 'solid', gesture: 'regular' }),
      surface('stand:roof', [135, 61, 43], 'paint', 'pigment', { value: 'mid', gesture: 'regular' }),
    ]),
    colliders: Object.freeze([
      ...world.barriers.map((barrier) => {
        const deltaX = barrier.endX - barrier.startX;
        const deltaZ = barrier.endZ - barrier.startZ;
        const heading = Math.atan2(-deltaZ, deltaX);
        return Object.freeze({
          id: barrier.id,
          kind: 'solid' as const,
          shape: 'box' as const,
          node: 'root',
          localPose: Object.freeze({
            position: Object.freeze([
              (barrier.startX + barrier.endX) * 0.5,
              barrier.height * 0.5,
              (barrier.startZ + barrier.endZ) * 0.5,
            ] as const),
            rotation: yawQuaternion(heading),
          }),
          size: Object.freeze([
            Math.hypot(deltaX, deltaZ),
            barrier.height,
            barrier.radius * 2,
          ] as const),
        });
      }),
      ...world.tyreStacks.map((stack) => Object.freeze({
        id: stack.id,
        kind: 'solid' as const,
        shape: 'sphere' as const,
        node: 'root',
        localPose: Object.freeze({
          position: Object.freeze([stack.x, 0.55, stack.z] as const),
          rotation: Object.freeze([0, 0, 0, 1] as const),
        }),
        radius: stack.radius,
      })),
      ...world.cones.map((cone) => Object.freeze({
        id: cone.id,
        kind: 'solid' as const,
        shape: 'capsule' as const,
        node: 'root',
        localPose: Object.freeze({
          position: Object.freeze([cone.x, 0.36, cone.z] as const),
          rotation: Object.freeze([0, 0, 0, 1] as const),
        }),
        radius: 0.23,
        length: 0.26,
        axis: 'y' as const,
      })),
      ...standPostAlong.map((along) => {
        const postHeight = roofHeight - 0.1;
        return Object.freeze({
          id: `grandstand:post:${along < 0 ? 'left' : 'right'}`,
          kind: 'solid' as const,
          shape: 'box' as const,
          node: 'root',
          localPose: Object.freeze({
            position: standPoint(world, along, roofAway, postHeight * 0.5),
            rotation: yawQuaternion(stand.heading),
          }),
          size: Object.freeze([0.16, postHeight, 0.16] as const),
        });
      }),
    ]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}
