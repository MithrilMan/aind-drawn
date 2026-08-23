import type {
  MeshGeometrySpec,
  Point3,
  SolidAssetBlueprint,
  SolidMaterialSpec,
  SolidPartDefinition,
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
    return Object.freeze([index * 2, next * 2, next * 2 + 1, index * 2 + 1]);
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

function material(
  id: string,
  color: readonly [number, number, number],
  application: SolidMaterialSpec['drawing']['application'],
  tone: SolidMaterialSpec['drawing']['tone'],
): SolidMaterialSpec {
  return Object.freeze({
    id,
    color: Object.freeze(color),
    finish: 'matte',
    drawing: Object.freeze({ application, tone }),
    roughness: 0.96,
    metalness: 0,
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
      materialId: 'grass',
      placement: Object.freeze({ position: [centreX, -0.09, centreZ] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'road', semanticPartId: 'road', node: 'root', order: 1,
      geometry: ribbonGeometry(layout, -halfTrack, halfTrack),
      materialId: 'road', placement: Object.freeze({ position: [0, 0, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'edge:left', semanticPartId: 'edge', node: 'root', order: 2,
      geometry: ribbonGeometry(layout, halfTrack, halfTrack + 0.38),
      materialId: 'edge', placement: Object.freeze({ position: [0, 0.016, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
    part({
      id: 'edge:right', semanticPartId: 'edge', node: 'root', order: 2,
      geometry: ribbonGeometry(layout, -halfTrack, -halfTrack - 0.38),
      materialId: 'edge', placement: Object.freeze({ position: [0, 0.016, 0] as const }),
      castShadow: false, receiveShadow: true,
    }),
  ];
  for (let index = 0; index < stripeCount; index += 1) {
    const offset = -halfTrack + stripeWidth * (index + 0.5);
    parts.push(part({
      id: `finish:${index}`,
      semanticPartId: 'finish',
      node: 'root',
      order: 3,
      geometry: Object.freeze({ type: 'box', size: [0.52, 0.035, stripeWidth] as const }),
      materialId: index % 2 === 0 ? 'finish-dark' : 'finish-light',
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
    materials: Object.freeze([
      material('grass', [179, 181, 132], 'pigment', 'scribble'),
      material('road', [111, 102, 91], 'pigment', 'hatch'),
      material('edge', [187, 69, 47], 'glaze', 'scribble'),
      material('finish-dark', [42, 42, 38], 'ink', 'black'),
      material('finish-light', [237, 225, 201], 'paper', 'light'),
    ]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}
