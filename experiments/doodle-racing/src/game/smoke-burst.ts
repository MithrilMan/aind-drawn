import {
  SeedTree,
  SolidRig,
  createSemanticSurface,
  createUniformAssetAppearance,
  type Point3,
  type SolidAssetBlueprint,
  type SuperellipsoidGeometrySpec,
  type SemanticSurfaceSpec,
} from '../../../../src/index.js';
import type { DoodleSceneAsset } from './doodle-scene.js';

const SMOKE_DURATION = 2.3;
const SMOKE_COVER_PROGRESS = 0.36;
const SMOKE_TAIL_START = 0.58;
const SMOKE_GROWTH_EASE = 1.35;
const PUFF_COUNT = 8;

type SmokePuff = Readonly<{
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  phase: number;
}>;

type WorldPosition = Readonly<{ x: number; y: number; z: number; heading?: number }>;

const SMOKE_SURFACE: SemanticSurfaceSpec = createSemanticSurface({
  id: 'smoke',
  color: Object.freeze([104, 107, 101] as [number, number, number]),
  substance: 'generic',
  physical: Object.freeze({ roughness: 0.98, metalness: 0 }),
  drawing: Object.freeze({
    application: 'pigment', drawing: Object.freeze({ value: 'mid', gesture: 'agitated' }),
  }),
});

function puffGeometry(radius: number, phase: number): SuperellipsoidGeometrySpec {
  return Object.freeze({
    type: 'superellipsoid',
    radii: Object.freeze([radius, radius * 0.86, radius * 0.8] as Point3),
    exponent: 2.4,
    deformation: Object.freeze({
      verticalTaper: -0.08,
      equatorBulge: 0.12,
      lobeAmplitude: 0.04,
      lobeCount: 7,
      lobePhase: phase,
    }),
    widthSegments: 10,
    heightSegments: 6,
  });
}

function smoothStep(value: number): number {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
}

const PUFF_LAYOUT: readonly SmokePuff[] = Object.freeze([
  Object.freeze({ id: 'puff:0', x: -0.55, y: 0.32, z: 0.02, radius: 0.5, phase: 0.2 }),
  Object.freeze({ id: 'puff:1', x: 0.55, y: 0.36, z: -0.08, radius: 0.52, phase: 1.1 }),
  Object.freeze({ id: 'puff:2', x: -0.2, y: 0.62, z: 0.16, radius: 0.56, phase: 2.2 }),
  Object.freeze({ id: 'puff:3', x: 0.38, y: 0.9, z: 0.05, radius: 0.46, phase: 2.9 }),
  Object.freeze({ id: 'puff:4', x: -0.5, y: 1.04, z: -0.16, radius: 0.42, phase: 3.7 }),
  Object.freeze({ id: 'puff:5', x: 0.08, y: 1.34, z: 0.12, radius: 0.38, phase: 4.4 }),
  Object.freeze({ id: 'puff:6', x: -0.18, y: 0.22, z: 0.32, radius: 0.5, phase: 5.2 }),
  Object.freeze({ id: 'puff:7', x: 0.18, y: 0.25, z: -0.32, radius: 0.5, phase: 5.8 }),
]);

const SMOKE_BLUEPRINT: SolidAssetBlueprint<'explore-smoke'> = Object.freeze({
  blueprintVersion: 1,
  family: 'explore-smoke',
  representation: 'solid',
  assetId: 'paper-circuit:explore-smoke:1',
  seed: 47_221,
  appearance: createUniformAssetAppearance('storybook', ['puff'], ['primary-form']),
  bounds: Object.freeze({
    minimum: Object.freeze([-1.25, 0, -1.25] as Point3),
    maximum: Object.freeze([1.35, 2.8, 1.35] as Point3),
  }),
  manifest: Object.freeze({
    family: 'explore-smoke',
    parts: Object.freeze([
      Object.freeze({ id: 'puff', spatial: 'cluster' as const }),
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
  parts: Object.freeze(PUFF_LAYOUT.map((puff, index) => Object.freeze({
    id: puff.id,
    semanticPartId: 'puff',
    node: 'root',
    order: index,
    geometry: puffGeometry(puff.radius, puff.phase),
    surfaceId: SMOKE_SURFACE.id,
    placement: Object.freeze({
      position: Object.freeze([puff.x, puff.y, puff.z] as Point3),
    }),
    castShadow: false,
    receiveShadow: false,
  }))),
  surfaces: Object.freeze([SMOKE_SURFACE]),
  colliders: Object.freeze([]),
  sockets: Object.freeze([]),
  interactionBindings: Object.freeze([]),
});

export class SmokeBurst {
  public readonly solid = SMOKE_BLUEPRINT;
  public readonly rig = new SolidRig(this.solid, {
    instanceId: 'paper-circuit:explore-smoke',
  });

  private elapsed = SMOKE_DURATION;
  private readonly wobble = new Float32Array(PUFF_COUNT);

  public constructor() {
    this.rig.root.visible = false;
  }

  public doodleAsset(): DoodleSceneAsset {
    return Object.freeze({ solid: this.solid, rig: this.rig });
  }

  public trigger(position: WorldPosition, seed: number): void {
    this.elapsed = 0;
    const random = new SeedTree(seed).random('paper-circuit:explore-smoke:burst');
    for (let index = 0; index < PUFF_COUNT; index += 1) {
      this.wobble[index] = random.float(-0.09, 0.09);
    }
    this.rig.root.visible = true;
    const heading = position.heading ?? 0;
    const halfAngle = heading * 0.5;
    this.rig.setWorldPose(Object.freeze({
      // The burst starts at the actor's feet and grows upward around the body.
      position: Object.freeze([position.x, position.y, position.z] as Point3),
      rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
    }));
    this.updatePuffs(0);
  }

  public get isCovered(): boolean {
    return this.rig.root.visible && this.elapsed / SMOKE_DURATION >= SMOKE_COVER_PROGRESS;
  }

  public get isActive(): boolean {
    return this.rig.root.visible;
  }

  public update(deltaSeconds: number): void {
    if (!this.rig.root.visible) return;
    this.elapsed += Math.max(0, Math.min(0.05, deltaSeconds));
    if (this.elapsed >= SMOKE_DURATION) {
      this.rig.root.visible = false;
      return;
    }
    this.updatePuffs(this.elapsed / SMOKE_DURATION);
  }

  public cancel(): void {
    this.elapsed = SMOKE_DURATION;
    this.rig.root.visible = false;
  }

  public dispose(): void {
    this.rig.dispose();
  }

  private updatePuffs(progress: number): void {
    const growthProgress = Math.min(1, progress / SMOKE_COVER_PROGRESS);
    const growth = 1 - Math.pow(1 - growthProgress, SMOKE_GROWTH_EASE);
    const tail = smoothStep((progress - SMOKE_TAIL_START) / (1 - SMOKE_TAIL_START));
    for (let index = 0; index < PUFF_COUNT; index += 1) {
      const puff = PUFF_LAYOUT[index] as SmokePuff;
      const part = this.rig.getPart(puff.id);
      if (part === null) continue;
      const delay = index * 0.045;
      const puffProgress = Math.max(0, Math.min(1, (progress - delay) / (1 - delay)));
      const wobble = this.wobble[index] ?? 0;
      const floatOffset = tail * (0.78 + index * 0.09);
      part.position.set(
        puff.x * growth + Math.sin(puffProgress * 4.5 + puff.phase) * (0.12 + tail * 0.12) * growth
          + wobble * growth,
        0.06 + puff.y * growth + puffProgress * (0.7 + index * 0.035) * growth + floatOffset,
        puff.z * growth + Math.cos(puffProgress * 3.8 + puff.phase) * (0.11 + tail * 0.12) * growth
          + wobble * 0.5 * growth,
      );
      const fullScale = 0.12 + growth * (1.12 + Math.sin(Math.min(1, puffProgress) * Math.PI) * 0.22);
      part.scale.setScalar(fullScale * (1 - tail * 0.9));
    }
  }
}
