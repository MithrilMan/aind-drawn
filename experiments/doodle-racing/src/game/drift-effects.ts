import * as THREE from 'three';

import {
  Random,
  SeedTree,
  SolidRig,
  createSemanticSurface,
  createUniformAssetAppearance,
  type MeshGeometrySpec,
  type Point3,
  type SolidAssetBlueprint,
  type SemanticSurfaceSpec,
  type SolidPartDefinition,
  type SuperellipsoidGeometrySpec,
} from '../../../../src/index.js';
import { nearestCoursePoint, type CourseLayout } from './course.js';
import type { DoodleSceneAsset } from './doodle-scene.js';

const SKID_SEGMENT_CAPACITY = 512;
const SMOKE_SLOT_COUNT = 40;
const DUST_SLOT_COUNT = 28;
const SPARK_SLOT_COUNT = 24;
const SKID_SURFACE_Y = 0.064;
const HIDDEN_SURFACE_Y = -2;
const SMOKE_INTERVAL = 0.075;
const DUST_INTERVAL = 0.11;

type EffectKind = 'smoke' | 'dust' | 'spark';

type GroundPoint = Readonly<{ x: number; z: number }>;

export type VehicleEffectSource = Readonly<{
  id: string;
  x: number;
  z: number;
  speed: number;
  drifting: boolean;
  slipAngle: number;
  impact: number;
  rearLeft: GroundPoint;
  rearRight: GroundPoint;
}>;

type TrailState = {
  rearLeft: GroundPoint;
  rearRight: GroundPoint;
  wasDrifting: boolean;
  wasOffRoad: boolean;
  smokeElapsed: number;
  dustElapsed: number;
  lastImpact: number;
};

type ParticleSlot = {
  id: string;
  kind: EffectKind;
  active: boolean;
  elapsed: number;
  lifetime: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  baseScale: number;
  spin: number;
};

export type DriftEffectsDiagnostics = Readonly<{
  skidSegments: number;
  skidCapacity: number;
  smokePuffs: number;
  dustPuffs: number;
  sparks: number;
}>;

const SURFACES: readonly SemanticSurfaceSpec[] = Object.freeze([
  createSemanticSurface({
    id: 'skid-rubber',
    color: Object.freeze([37, 36, 32] as const),
    substance: 'rubber',
    physical: Object.freeze({ roughness: 1, metalness: 0 }),
    drawing: Object.freeze({
      application: 'ink', drawing: Object.freeze({ value: 'solid', gesture: 'regular' }),
    }),
  }),
  createSemanticSurface({
    id: 'tyre-smoke',
    color: Object.freeze([132, 132, 124] as const),
    substance: 'generic',
    physical: Object.freeze({ roughness: 1, metalness: 0 }),
    drawing: Object.freeze({
      application: 'wash', drawing: Object.freeze({ value: 'light', gesture: 'quiet' }),
    }),
  }),
  createSemanticSurface({
    id: 'track-dust',
    color: Object.freeze([169, 139, 91] as const),
    substance: 'stone',
    physical: Object.freeze({ roughness: 1, metalness: 0 }),
    drawing: Object.freeze({
      application: 'wash', drawing: Object.freeze({ value: 'mid', gesture: 'granular' }),
    }),
  }),
  createSemanticSurface({
    id: 'impact-spark',
    color: Object.freeze([222, 119, 43] as const),
    substance: 'metal',
    physical: Object.freeze({ roughness: 0.9, metalness: 0 }),
    drawing: Object.freeze({
      application: 'pigment', drawing: Object.freeze({ value: 'mid', gesture: 'regular' }),
    }),
  }),
]);

function hiddenSkidVertices(index: number): readonly Point3[] {
  const x = index * 0.0001;
  return Object.freeze([
    Object.freeze([x, HIDDEN_SURFACE_Y, 0.01] as Point3),
    Object.freeze([x + 0.04, HIDDEN_SURFACE_Y, 0.01] as Point3),
    Object.freeze([x + 0.04, HIDDEN_SURFACE_Y, -0.01] as Point3),
    Object.freeze([x, HIDDEN_SURFACE_Y, -0.01] as Point3),
  ]);
}

function skidGeometry(): MeshGeometrySpec {
  const vertices: Point3[] = [];
  const faces: (readonly number[])[] = [];
  for (let index = 0; index < SKID_SEGMENT_CAPACITY; index += 1) {
    const first = vertices.length;
    vertices.push(...hiddenSkidVertices(index));
    faces.push(Object.freeze([first, first + 1, first + 2, first + 3]));
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

function puffGeometry(index: number): SuperellipsoidGeometrySpec {
  const radius = 0.3 + index % 4 * 0.025;
  return Object.freeze({
    type: 'superellipsoid',
    radii: Object.freeze([radius, radius * 0.78, radius * 0.9] as Point3),
    exponent: 2.35,
    deformation: Object.freeze({
      verticalTaper: -0.08,
      equatorBulge: 0.12,
      lobeAmplitude: 0.045,
      lobeCount: 7,
      lobePhase: index * 0.73,
    }),
    widthSegments: 10,
    heightSegments: 6,
  });
}

function particleParts(kind: 'smoke' | 'dust', count: number): readonly SolidPartDefinition[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze({
    id: `${kind}:${index}`,
    semanticPartId: kind,
    node: 'root',
    order: kind === 'smoke' ? 2 : 1,
    geometry: puffGeometry(index + (kind === 'dust' ? 41 : 0)),
    surfaceId: kind === 'smoke' ? 'tyre-smoke' : 'track-dust',
    placement: Object.freeze({ position: Object.freeze([0, HIDDEN_SURFACE_Y, 0] as Point3) }),
    castShadow: false,
    receiveShadow: false,
  })));
}

function sparkParts(): readonly SolidPartDefinition[] {
  return Object.freeze(Array.from({ length: SPARK_SLOT_COUNT }, (_, index) => Object.freeze({
    id: `spark:${index}`,
    semanticPartId: 'spark',
    node: 'root',
    order: 3,
    geometry: Object.freeze({ type: 'box', size: Object.freeze([0.13, 0.025, 0.035] as Point3) }),
    surfaceId: 'impact-spark',
    placement: Object.freeze({ position: Object.freeze([0, HIDDEN_SURFACE_Y, 0] as Point3) }),
    castShadow: false,
    receiveShadow: false,
  })));
}

function createEffectsBlueprint(course: CourseLayout): SolidAssetBlueprint<'race-effects'> {
  const skidPart: SolidPartDefinition = Object.freeze({
    id: 'skid-marks',
    semanticPartId: 'skid-marks',
    node: 'root',
    order: 0,
    geometry: skidGeometry(),
    surfaceId: 'skid-rubber',
    placement: Object.freeze({ position: Object.freeze([0, 0, 0] as Point3) }),
    castShadow: false,
    receiveShadow: false,
  });
  return Object.freeze({
    blueprintVersion: 1,
    family: 'race-effects',
    representation: 'solid',
    assetId: 'paper-circuit:race-effects:1',
    seed: 73_911,
    appearance: createUniformAssetAppearance(
      'storybook',
      ['skid-marks', 'smoke', 'dust', 'spark'],
    ),
    bounds: Object.freeze({
      minimum: Object.freeze([course.bounds.minimumX - 3, -2.1, course.bounds.minimumZ - 3] as Point3),
      maximum: Object.freeze([course.bounds.maximumX + 3, 4, course.bounds.maximumZ + 3] as Point3),
    }),
    manifest: Object.freeze({
      family: 'race-effects',
      parts: Object.freeze([
        Object.freeze({ id: 'skid-marks', spatial: 'surface' as const }),
        Object.freeze({ id: 'smoke', spatial: 'cluster' as const }),
        Object.freeze({ id: 'dust', spatial: 'cluster' as const }),
        Object.freeze({ id: 'spark', spatial: 'cluster' as const }),
      ]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    nodes: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({
        position: Object.freeze([0, 0, 0] as Point3),
        rotation: Object.freeze([0, 0, 0, 1] as const),
      }),
    })]),
    parts: Object.freeze([
      skidPart,
      ...particleParts('smoke', SMOKE_SLOT_COUNT),
      ...particleParts('dust', DUST_SLOT_COUNT),
      ...sparkParts(),
    ]),
    surfaces: SURFACES,
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

function point(value: GroundPoint): GroundPoint {
  return Object.freeze({ x: value.x, z: value.z });
}

function midpoint(left: GroundPoint, right: GroundPoint): GroundPoint {
  return Object.freeze({ x: (left.x + right.x) * 0.5, z: (left.z + right.z) * 0.5 });
}

function applyAuthoredGeometryBounds(
  geometry: THREE.BufferGeometry,
  bounds: SolidAssetBlueprint['bounds'],
): void {
  const box = new THREE.Box3(
    new THREE.Vector3(...bounds.minimum),
    new THREE.Vector3(...bounds.maximum),
  );
  geometry.boundingBox = box;
  geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
}

function slot(id: string, kind: EffectKind): ParticleSlot {
  return {
    id,
    kind,
    active: false,
    elapsed: 0,
    lifetime: 1,
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    baseScale: 1,
    spin: 0,
  };
}

export class DriftEffects {
  public readonly solid: SolidAssetBlueprint<'race-effects'>;
  public readonly rig: SolidRig;

  private readonly course: CourseLayout;
  private readonly skidPositions: THREE.BufferAttribute;
  private readonly trails = new Map<string, TrailState>();
  private readonly smoke = Array.from(
    { length: SMOKE_SLOT_COUNT },
    (_, index) => slot(`smoke:${index}`, 'smoke'),
  );
  private readonly dust = Array.from(
    { length: DUST_SLOT_COUNT },
    (_, index) => slot(`dust:${index}`, 'dust'),
  );
  private readonly sparks = Array.from(
    { length: SPARK_SLOT_COUNT },
    (_, index) => slot(`spark:${index}`, 'spark'),
  );
  private readonly particles = [...this.smoke, ...this.dust, ...this.sparks];
  private skidCursor = 0;
  private skidCount = 0;
  private smokeCursor = 0;
  private dustCursor = 0;
  private sparkCursor = 0;
  private emissionSerial = 0;

  public constructor(course: CourseLayout) {
    this.course = course;
    this.solid = createEffectsBlueprint(course);
    this.rig = new SolidRig(this.solid, { instanceId: 'paper-circuit:race-effects' });
    const skidMesh = this.rig.getPart('skid-marks');
    if (skidMesh === null) throw new Error('Race effects require the skid-mark carrier');
    // The ring buffer rewrites positions across the complete circuit. Keep a
    // stable authored bound so Three.js never culls it using the initial quads
    // hidden below the origin.
    applyAuthoredGeometryBounds(skidMesh.geometry, this.solid.bounds);
    this.skidPositions = skidMesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (const particle of this.allParticles()) {
      const part = this.rig.getPart(particle.id);
      if (part !== null) part.visible = false;
    }
    this.reset();
  }

  public doodleAsset(): DoodleSceneAsset {
    return Object.freeze({
      solid: this.solid,
      rig: this.rig,
      geometryUsage: 'dynamic',
    });
  }

  public setVisible(visible: boolean): void {
    this.rig.root.visible = visible;
  }

  public reset(): void {
    this.trails.clear();
    this.skidCursor = 0;
    this.skidCount = 0;
    this.smokeCursor = 0;
    this.dustCursor = 0;
    this.sparkCursor = 0;
    this.emissionSerial = 0;
    for (let index = 0; index < SKID_SEGMENT_CAPACITY; index += 1) {
      const x = index * 0.0001;
      this.writeQuad(
        index,
        Object.freeze({ x, z: 0 }),
        Object.freeze({ x: x + 0.04, z: 0 }),
        0.01,
        HIDDEN_SURFACE_Y,
      );
    }
    this.skidPositions.needsUpdate = true;
    for (const particle of this.allParticles()) this.deactivate(particle);
  }

  public update(
    sources: readonly VehicleEffectSource[],
    deltaSeconds: number,
    emitting: boolean,
  ): void {
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05);
    this.updateParticles(delta);
    for (const source of sources) this.updateVehicle(source, delta, emitting);
  }

  public diagnostics(): DriftEffectsDiagnostics {
    return Object.freeze({
      skidSegments: this.skidCount,
      skidCapacity: SKID_SEGMENT_CAPACITY,
      smokePuffs: this.smoke.filter(({ active }) => active).length,
      dustPuffs: this.dust.filter(({ active }) => active).length,
      sparks: this.sparks.filter(({ active }) => active).length,
    });
  }

  public dispose(): void {
    this.rig.dispose();
    this.trails.clear();
  }

  private updateVehicle(source: VehicleEffectSource, delta: number, emitting: boolean): void {
    let trail = this.trails.get(source.id);
    if (trail === undefined) {
      trail = {
        rearLeft: point(source.rearLeft),
        rearRight: point(source.rearRight),
        wasDrifting: false,
        wasOffRoad: false,
        smokeElapsed: 0,
        dustElapsed: 0,
        lastImpact: 0,
      };
      this.trails.set(source.id, trail);
    }
    const projection = nearestCoursePoint(this.course, source.x, source.z);
    const offRoad = projection.distanceFromCentre > this.course.trackWidth * 0.5 - 0.34;
    const roadDrift = emitting && source.drifting && !offRoad;
    if (roadDrift && trail.wasDrifting) {
      const width = THREE.MathUtils.lerp(0.105, 0.17, Math.min(1, Math.abs(source.slipAngle) * 3.2));
      this.appendSkid(trail.rearLeft, source.rearLeft, width);
      this.appendSkid(trail.rearRight, source.rearRight, width);
    }
    if (roadDrift) {
      trail.smokeElapsed += delta;
      if (!trail.wasDrifting || trail.smokeElapsed >= SMOKE_INTERVAL) {
        trail.smokeElapsed = 0;
        this.emitSmoke(midpoint(source.rearLeft, source.rearRight), source);
      }
    } else {
      trail.smokeElapsed = 0;
    }
    const raisingDust = emitting && offRoad && source.speed > 7;
    if (raisingDust) {
      trail.dustElapsed += delta;
      if (!trail.wasOffRoad || trail.dustElapsed >= DUST_INTERVAL) {
        trail.dustElapsed = 0;
        this.emitDust(midpoint(source.rearLeft, source.rearRight), source);
      }
    } else {
      trail.dustElapsed = 0;
    }
    if (emitting && source.impact > 0.18 && source.impact > trail.lastImpact + 0.08) {
      this.emitSparks(Object.freeze({ x: source.x, z: source.z }), source);
    }
    trail.rearLeft = point(source.rearLeft);
    trail.rearRight = point(source.rearRight);
    trail.wasDrifting = roadDrift;
    trail.wasOffRoad = raisingDust;
    trail.lastImpact = source.impact;
  }

  private appendSkid(start: GroundPoint, end: GroundPoint, width: number): void {
    const distance = Math.hypot(end.x - start.x, end.z - start.z);
    if (distance < 0.045 || distance > 1.4) return;
    this.writeQuad(this.skidCursor, start, end, width * 0.5, SKID_SURFACE_Y);
    this.skidPositions.needsUpdate = true;
    this.skidCursor = (this.skidCursor + 1) % SKID_SEGMENT_CAPACITY;
    this.skidCount = Math.min(SKID_SEGMENT_CAPACITY, this.skidCount + 1);
  }

  private writeQuad(
    index: number,
    start: GroundPoint,
    end: GroundPoint,
    halfWidth: number,
    y: number,
  ): void {
    const length = Math.max(0.0001, Math.hypot(end.x - start.x, end.z - start.z));
    const normalX = -(end.z - start.z) / length * halfWidth;
    const normalZ = (end.x - start.x) / length * halfWidth;
    const vertices = [
      [start.x + normalX, y, start.z + normalZ],
      [end.x + normalX, y, end.z + normalZ],
      [end.x - normalX, y, end.z - normalZ],
      [start.x - normalX, y, start.z - normalZ],
    ] as const;
    const triangleOrder = [0, 1, 2, 0, 2, 3] as const;
    const offset = index * 6;
    for (let vertex = 0; vertex < triangleOrder.length; vertex += 1) {
      const triangleIndex = triangleOrder[vertex];
      if (triangleIndex === undefined) continue;
      const value = vertices[triangleIndex];
      this.skidPositions.setXYZ(offset + vertex, value[0], value[1], value[2]);
    }
  }

  private emitSmoke(origin: GroundPoint, source: VehicleEffectSource): void {
    const random = this.emissionRandom(`smoke:${source.id}`);
    const slotValue = this.smoke[this.smokeCursor] as ParticleSlot;
    this.smokeCursor = (this.smokeCursor + 1) % this.smoke.length;
    this.activate(slotValue, origin, 0.13, random, {
      lifetime: random.float(0.82, 1.25),
      baseScale: random.float(0.52, 0.78),
      velocityX: random.float(-0.22, 0.22),
      velocityY: random.float(0.55, 0.9),
      velocityZ: random.float(-0.22, 0.22),
    });
  }

  private emitDust(origin: GroundPoint, source: VehicleEffectSource): void {
    const random = this.emissionRandom(`dust:${source.id}`);
    const slotValue = this.dust[this.dustCursor] as ParticleSlot;
    this.dustCursor = (this.dustCursor + 1) % this.dust.length;
    this.activate(slotValue, origin, 0.08, random, {
      lifetime: random.float(0.72, 1.05),
      baseScale: random.float(0.55, 0.86),
      velocityX: random.float(-0.42, 0.42),
      velocityY: random.float(0.3, 0.62),
      velocityZ: random.float(-0.42, 0.42),
    });
  }

  private emitSparks(origin: GroundPoint, source: VehicleEffectSource): void {
    const random = this.emissionRandom(`sparks:${source.id}`);
    for (let index = 0; index < 7; index += 1) {
      const slotValue = this.sparks[this.sparkCursor] as ParticleSlot;
      this.sparkCursor = (this.sparkCursor + 1) % this.sparks.length;
      const angle = random.float(-Math.PI, Math.PI);
      const speed = random.float(1.2, 3.4);
      this.activate(slotValue, origin, random.float(0.12, 0.32), random, {
        lifetime: random.float(0.28, 0.52),
        baseScale: random.float(0.75, 1.25),
        velocityX: Math.cos(angle) * speed,
        velocityY: random.float(1.1, 2.4),
        velocityZ: Math.sin(angle) * speed,
      });
    }
  }

  private activate(
    particle: ParticleSlot,
    origin: GroundPoint,
    y: number,
    random: Random,
    motion: Readonly<{
      lifetime: number;
      baseScale: number;
      velocityX: number;
      velocityY: number;
      velocityZ: number;
    }>,
  ): void {
    const part = this.rig.getPart(particle.id);
    if (part === null) return;
    particle.active = true;
    particle.elapsed = 0;
    particle.lifetime = motion.lifetime;
    particle.baseScale = motion.baseScale;
    particle.velocityX = motion.velocityX;
    particle.velocityY = motion.velocityY;
    particle.velocityZ = motion.velocityZ;
    particle.spin = random.float(-8, 8);
    part.visible = true;
    part.position.set(origin.x, y, origin.z);
    part.rotation.set(0, random.float(-Math.PI, Math.PI), random.float(-0.4, 0.4));
    part.scale.setScalar(particle.kind === 'spark' ? particle.baseScale : particle.baseScale * 0.38);
  }

  private updateParticles(delta: number): void {
    for (const particle of this.allParticles()) {
      if (!particle.active) continue;
      const part = this.rig.getPart(particle.id);
      if (part === null) continue;
      particle.elapsed += delta;
      if (particle.elapsed >= particle.lifetime) {
        this.deactivate(particle);
        continue;
      }
      const progress = particle.elapsed / particle.lifetime;
      if (particle.kind === 'spark') particle.velocityY -= 8.5 * delta;
      else particle.velocityY += (particle.kind === 'smoke' ? 0.12 : -0.22) * delta;
      part.position.x += particle.velocityX * delta;
      part.position.y += particle.velocityY * delta;
      part.position.z += particle.velocityZ * delta;
      part.rotation.y += particle.spin * delta;
      part.rotation.z += particle.spin * delta * 0.45;
      if (particle.kind === 'spark') {
        part.scale.setScalar(particle.baseScale * (1 - progress));
      } else {
        const bloom = THREE.MathUtils.lerp(0.38, 1.15, Math.sin(progress * Math.PI * 0.72));
        part.scale.setScalar(particle.baseScale * bloom * (1 - progress * 0.58));
      }
    }
  }

  private deactivate(particle: ParticleSlot): void {
    particle.active = false;
    particle.elapsed = 0;
    const part = this.rig.getPart(particle.id);
    if (part === null) return;
    part.visible = false;
    part.position.set(0, HIDDEN_SURFACE_Y, 0);
  }

  private allParticles(): readonly ParticleSlot[] {
    return this.particles;
  }

  private emissionRandom(namespace: string): Random {
    const seed = 73_911 + this.emissionSerial * 7_919;
    this.emissionSerial += 1;
    return new SeedTree(seed).random(`paper-circuit:race-effects:${namespace}`);
  }
}
