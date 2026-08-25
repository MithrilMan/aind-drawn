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

const IDENTITY_ROTATION = Object.freeze([0, 0, 0, 1] as const);

function ribbonGeometry(
  layout: CourseLayout,
  innerOffset: number,
  outerOffset: number,
): MeshGeometrySpec {
  const vertices: Point3[] = [];
  for (const sample of layout.samples) {
    vertices.push(
      Object.freeze([
        sample.x + sample.normalX * innerOffset,
        0.035,
        sample.z + sample.normalZ * innerOffset,
      ] as const),
      Object.freeze([
        sample.x + sample.normalX * outerOffset,
        0.035,
        sample.z + sample.normalZ * outerOffset,
      ] as const),
    );
  }
  const faces = layout.samples.map((_, index) => {
    const next = (index + 1) % layout.samples.length;
    return Object.freeze([index * 2, index * 2 + 1, next * 2 + 1, next * 2]);
  });
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

function part(definition: SolidPartDefinition): SolidPartDefinition {
  return Object.freeze(definition);
}

function surface(
  id: string,
  color: readonly [number, number, number],
  substance: SurfaceSubstance,
  application: DrawingApplication,
  drawing: DrawingIntent,
): SemanticSurfaceSpec {
  return createSemanticSurface({
    id, color, substance, drawing: Object.freeze({ application, drawing }),
    physical: Object.freeze({ roughness: 0.96, metalness: 0 }),
  });
}

export function createCourseBlueprint(
  layout: CourseLayout,
): SolidAssetBlueprint<'race-course'> {
  const width = layout.bounds.maximumX - layout.bounds.minimumX;
  const depth = layout.bounds.maximumZ - layout.bounds.minimumZ;
  const centreX = (layout.bounds.minimumX + layout.bounds.maximumX) * 0.5;
  const centreZ = (layout.bounds.minimumZ + layout.bounds.maximumZ) * 0.5;
  const halfTrack = layout.trackWidth * 0.5;
  const start = layout.samples[0];
  if (start === undefined) throw new RangeError('Course requires at least one sample');
  const heading = Math.atan2(-start.tangentZ, start.tangentX);
  const stripeCount = 8;
  const stripeWidth = layout.trackWidth / stripeCount;
  const parts: SolidPartDefinition[] = [
    part({
      id: 'ground', semanticPartId: 'ground', node: 'root', order: 0,
      geometry: Object.freeze({ type: 'box', size: [width, 0.16, depth] as const }),
      surfaceId: 'grass',
      placement: Object.freeze({ position: [centreX, -0.09, centreZ] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'road', semanticPartId: 'road', node: 'root', order: 1,
      geometry: ribbonGeometry(layout, -halfTrack, halfTrack),
      surfaceId: 'road', placement: Object.freeze({ position: [0, 0, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'edge:left', semanticPartId: 'edge', node: 'root', order: 2,
      geometry: ribbonGeometry(layout, halfTrack, halfTrack + 0.38),
      surfaceId: 'edge', placement: Object.freeze({ position: [0, 0.016, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'edge:right', semanticPartId: 'edge', node: 'root', order: 2,
      geometry: ribbonGeometry(layout, -halfTrack, -halfTrack - 0.38),
      surfaceId: 'edge', placement: Object.freeze({ position: [0, 0.016, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
  ];
  for (const checkpoint of layout.checkpoints.slice(1)) {
    const checkpointHeading = Math.atan2(-checkpoint.tangentZ, checkpoint.tangentX);
    parts.push(part({
      id: `checkpoint:${checkpoint.index}`,
      semanticPartId: 'checkpoint',
      node: 'root',
      order: 3,
      geometry: Object.freeze({
        type: 'box',
        size: [0.32, 0.035, checkpoint.halfWidth * 2] as const,
      }),
      surfaceId: 'checkpoint',
      placement: Object.freeze({
        position: Object.freeze([checkpoint.x, 0.085, checkpoint.z] as const),
        rotation: Object.freeze([0, checkpointHeading, 0] as const),
      }),
      castShadow: false,
      receiveShadow: false,
    }));
  }
  for (let index = 0; index < stripeCount; index += 1) {
    const offset = -halfTrack + stripeWidth * (index + 0.5);
    parts.push(part({
      id: `finish:${index}`,
      semanticPartId: 'finish',
      node: 'root',
      order: 3,
      geometry: Object.freeze({ type: 'box', size: [0.52, 0.035, stripeWidth] as const }),
      surfaceId: index % 2 === 0 ? 'finish-dark' : 'finish-light',
      placement: Object.freeze({
        position: Object.freeze([
          start.x + start.normalX * offset,
          0.085,
          start.z + start.normalZ * offset,
        ] as const),
        rotation: Object.freeze([0, heading, 0] as const),
      }),
      castShadow: false,
      receiveShadow: false,
    }));
  }
  return Object.freeze({
    blueprintVersion: 1,
    family: 'race-course',
    representation: 'solid',
    assetId: 'race-course:paper-loop:1',
    seed: 7301,
    appearance: createUniformAssetAppearance(
      'storybook',
      ['ground', 'road', 'edge', 'checkpoint', 'finish'],
    ),
    bounds: Object.freeze({
      minimum: [layout.bounds.minimumX, -0.2, layout.bounds.minimumZ] as const,
      maximum: [layout.bounds.maximumX, 0.2, layout.bounds.maximumZ] as const,
    }),
    manifest: Object.freeze({
      family: 'race-course',
      parts: Object.freeze([
        Object.freeze({ id: 'ground', spatial: 'surface' as const }),
        Object.freeze({ id: 'road', spatial: 'surface' as const }),
        Object.freeze({ id: 'edge', spatial: 'surface' as const }),
        Object.freeze({ id: 'checkpoint', spatial: 'surface' as const }),
        Object.freeze({ id: 'finish', spatial: 'surface' as const }),
      ]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    nodes: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({ position: [0, 0, 0] as const, rotation: IDENTITY_ROTATION }),
    })]),
    parts: Object.freeze(parts),
    surfaces: Object.freeze([
      surface('grass', [179, 181, 132], 'foliage', 'pigment', { value: 'mid', gesture: 'agitated' }),
      surface('road', [111, 102, 91], 'stone', 'pigment', { value: 'mid', gesture: 'regular' }),
      surface('edge', [187, 69, 47], 'paint', 'glaze', { value: 'mid', gesture: 'agitated' }),
      surface('checkpoint', [235, 177, 52], 'paint', 'pigment', { value: 'mid', gesture: 'agitated' }),
      surface('finish-dark', [42, 42, 38], 'paint', 'ink', { value: 'solid', gesture: 'regular' }),
      surface('finish-light', [237, 225, 201], 'paper', 'paper', { value: 'light', gesture: 'quiet' }),
    ]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}
