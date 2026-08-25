import {
  SolidRig,
  createSemanticSurface,
  createUniformAssetAppearance,
  type DrawingApplication,
  type DrawingIntent,
  type SemanticSurfaceSpec,
  type SolidAssetBlueprint,
  type SolidPartDefinition,
  type SurfaceSubstance,
} from '../../../../src/index.js';
import type { CourseLayout } from './course.js';
import {
  createCourseRibbonGeometry,
  createCourseSegmentRibbonGeometry,
} from './course-ribbon-geometry.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import { isRouteSegmentCovered } from './race-progress.js';

const IDENTITY_ROTATION = Object.freeze([0, 0, 0, 1] as const);

function surface(
  id: string,
  color: readonly [number, number, number],
  substance: SurfaceSubstance,
  application: DrawingApplication,
  drawing: DrawingIntent,
): SemanticSurfaceSpec {
  return createSemanticSurface({
    id,
    color,
    substance,
    drawing: Object.freeze({ application, drawing }),
    physical: Object.freeze({ roughness: 1, metalness: 0 }),
  });
}

export function createRouteDebugBlueprint(
  layout: CourseLayout,
): SolidAssetBlueprint<'race-route-debug'> {
  const halfTrack = layout.trackWidth * 0.5;
  const parts: SolidPartDefinition[] = [Object.freeze({
    id: 'valid-corridor',
    semanticPartId: 'valid-route',
    node: 'root',
    order: 0,
    geometry: createCourseRibbonGeometry(layout, -halfTrack, halfTrack, 0.059),
    surfaceId: 'valid-route',
    placement: Object.freeze({ position: [0, 0, 0] as const }),
    castShadow: false,
    receiveShadow: false,
  })];
  for (let index = 0; index < layout.samples.length; index += 1) {
    parts.push(Object.freeze({
      id: `covered:${index}`,
      semanticPartId: 'covered-route',
      node: 'root',
      order: 1,
      geometry: createCourseSegmentRibbonGeometry(
        layout,
        index,
        -halfTrack,
        halfTrack,
        0.071,
      ),
      surfaceId: 'covered-route',
      placement: Object.freeze({ position: [0, 0, 0] as const }),
      castShadow: false,
      receiveShadow: false,
    }));
  }
  return Object.freeze({
    blueprintVersion: 1,
    family: 'race-route-debug',
    representation: 'solid',
    assetId: 'race-route-debug:coverage:1',
    seed: 7302,
    appearance: createUniformAssetAppearance(
      'storybook',
      ['valid-route', 'covered-route'],
    ),
    bounds: Object.freeze({
      minimum: [layout.bounds.minimumX, 0, layout.bounds.minimumZ] as const,
      maximum: [layout.bounds.maximumX, 0.08, layout.bounds.maximumZ] as const,
    }),
    manifest: Object.freeze({
      family: 'race-route-debug',
      parts: Object.freeze([
        Object.freeze({ id: 'valid-route', spatial: 'surface' as const }),
        Object.freeze({ id: 'covered-route', spatial: 'surface' as const }),
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
      surface('valid-route', [221, 156, 61], 'paint', 'glaze', {
        value: 'light',
        gesture: 'regular',
      }),
      surface('covered-route', [70, 164, 111], 'paint', 'pigment', {
        value: 'mid',
        gesture: 'regular',
      }),
    ]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

export class RouteDebugOverlay {
  private readonly solid: SolidAssetBlueprint<'race-route-debug'>;
  private readonly rig: SolidRig;

  public constructor(private readonly course: CourseLayout) {
    this.solid = createRouteDebugBlueprint(course);
    this.rig = new SolidRig(this.solid, { instanceId: 'paper-circuit:route-debug' });
    this.update(Object.freeze([]));
  }

  public doodleAsset(): DoodleSceneAsset {
    return Object.freeze({ solid: this.solid, rig: this.rig });
  }

  public update(coverageWords: readonly number[]): void {
    for (let index = 0; index < this.course.samples.length; index += 1) {
      const segment = this.rig.getPart(`covered:${index}`);
      if (segment === null) throw new Error(`Missing route debug segment: ${index}`);
      segment.visible = isRouteSegmentCovered(coverageWords, index);
    }
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
