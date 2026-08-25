import * as THREE from 'three';

import {
  SolidRig,
  createSemanticSurface,
  createUniformAssetAppearance,
  type Point3,
  type SolidAssetBlueprint,
  type DrawingApplication,
  type DrawingIntent,
  type SemanticSurfaceSpec,
  type SurfaceSubstance,
} from '../../../../src/index.js';
import type { DoodleSceneAsset } from './doodle-scene.js';

const surface = (
  id: string,
  color: readonly [number, number, number],
  substance: SurfaceSubstance,
  application: DrawingApplication,
  drawing: DrawingIntent,
): SemanticSurfaceSpec => createSemanticSurface({
  id, color, substance,
  physical: Object.freeze({ roughness: 1, metalness: 0 }),
  drawing: Object.freeze({ application, drawing }),
});

const MENU_PREVIEW_BACKDROP_BLUEPRINT: SolidAssetBlueprint<'menu-preview'> = Object.freeze({
  blueprintVersion: 1,
  family: 'menu-preview',
  representation: 'solid',
  assetId: 'paper-circuit:menu-preview:1',
  seed: 73_019,
  appearance: createUniformAssetAppearance(
    'storybook',
    ['field', 'spotlight', 'stripe'],
    ['primary-form'],
  ),
  bounds: Object.freeze({
    minimum: Object.freeze([-3.8, -4.25, -0.08] as Point3),
    maximum: Object.freeze([3.8, 4.25, 0.18] as Point3),
  }),
  manifest: Object.freeze({
    family: 'menu-preview',
    parts: Object.freeze([
      Object.freeze({ id: 'field', spatial: 'front-extrusion' as const }),
      Object.freeze({ id: 'spotlight', spatial: 'front-extrusion' as const }),
      Object.freeze({ id: 'stripe', spatial: 'front-extrusion' as const }),
    ]),
    socketIds: Object.freeze([]),
    colliderIds: Object.freeze([]),
    interactions: Object.freeze([]),
  }),
  nodes: Object.freeze([
    Object.freeze({
      id: 'root',
      restPose: Object.freeze({
        position: Object.freeze([0, 0, 0] as Point3),
        rotation: Object.freeze([0, 0, 0, 1] as const),
      }),
    }),
  ]),
  parts: Object.freeze([
    Object.freeze({
      id: 'field',
      semanticPartId: 'field',
      node: 'root',
      order: 0,
      geometry: Object.freeze({ type: 'box', size: Object.freeze([7.6, 8.5, 0.08] as Point3) }),
      surfaceId: 'oxide',
      placement: Object.freeze({ position: Object.freeze([0, 0, 0] as Point3) }),
      castShadow: false,
      receiveShadow: false,
    }),
    Object.freeze({
      id: 'spotlight',
      semanticPartId: 'spotlight',
      node: 'root',
      order: 1,
      geometry: Object.freeze({
        type: 'superellipsoid',
        radii: Object.freeze([1.48, 1.58, 0.045] as Point3),
        exponent: 2.15,
        widthSegments: 32,
        heightSegments: 12,
      }),
      surfaceId: 'paper',
      placement: Object.freeze({ position: Object.freeze([0.28, 0.26, 0.085] as Point3) }),
      castShadow: false,
      receiveShadow: false,
    }),
    Object.freeze({
      id: 'stripe',
      semanticPartId: 'stripe',
      node: 'root',
      order: 2,
      geometry: Object.freeze({ type: 'box', size: Object.freeze([7.9, 0.34, 0.06] as Point3) }),
      surfaceId: 'ink',
      placement: Object.freeze({
        position: Object.freeze([0, -3.65, 0.12] as Point3),
        rotation: Object.freeze([0, 0, -0.055] as Point3),
      }),
      castShadow: false,
      receiveShadow: false,
    }),
  ]),
  surfaces: Object.freeze([
    surface('oxide', [197, 78, 49], 'paint', 'pigment', { value: 'solid', gesture: 'regular' }),
    surface('paper', [241, 229, 200], 'paper', 'paper', { value: 'light', gesture: 'quiet' }),
    surface('ink', [23, 25, 24], 'paint', 'pigment', { value: 'solid', gesture: 'regular' }),
  ]),
  colliders: Object.freeze([]),
  sockets: Object.freeze([]),
  interactionBindings: Object.freeze([]),
});

export class MenuPreviewBackdrop {
  public readonly solid = MENU_PREVIEW_BACKDROP_BLUEPRINT;
  public readonly rig = new SolidRig(this.solid, {
    instanceId: 'paper-circuit:menu-preview-backdrop',
  });

  private readonly viewDirection = new THREE.Vector3();
  private readonly screenRight = new THREE.Vector3();

  public constructor() {
    this.rig.root.visible = false;
  }

  public doodleAsset(): DoodleSceneAsset {
    return Object.freeze({ solid: this.solid, rig: this.rig });
  }

  public update(camera: THREE.Camera, subject: Readonly<{ x: number; y: number; z: number }>): void {
    camera.getWorldDirection(this.viewDirection);
    this.screenRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
    const position = new THREE.Vector3(subject.x, subject.y + 1.25, subject.z)
      .addScaledVector(this.viewDirection, 1.32)
      .addScaledVector(this.screenRight, -0.28);
    this.rig.setWorldPose(Object.freeze({
      position: Object.freeze([position.x, position.y, position.z] as Point3),
      rotation: Object.freeze([
        camera.quaternion.x,
        camera.quaternion.y,
        camera.quaternion.z,
        camera.quaternion.w,
      ] as const),
    }));
  }

  public setVisible(visible: boolean): void {
    this.rig.root.visible = visible;
  }

  public dispose(): void {
    this.rig.dispose();
  }
}
