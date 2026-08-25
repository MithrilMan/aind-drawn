import * as THREE from 'three';

import type { InkedSolidBlueprint } from '../blueprint.js';
import type { InkedSolidStrokeSpec } from '../contracts.js';
import { add3, pointOnSuperellipsoid, scale3, type Point3 } from '../../../core/geometry3.js';
import { Random } from '../../../core/random.js';
import type { RgbColor } from '../../../core/sketch.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';

type StrokeRuntime = Readonly<{
  stroke: InkedSolidStrokeSpec;
  group: THREE.Group;
  meshes: readonly THREE.Mesh[];
  geometries: readonly THREE.BufferGeometry[];
  material: THREE.MeshBasicMaterial;
}>;

function colorFromRgb(color: RgbColor): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255).convertSRGBToLinear();
}

function resolveStrokePoints(
  blueprint: InkedSolidBlueprint,
  stroke: InkedSolidStrokeSpec,
): readonly Point3[] {
  const path = stroke.path;
  if (path.type === 'part-local') return path.points;
  const part = blueprint.solid.parts.find(({ id }) => id === stroke.partId);
  if (part?.geometry.type !== 'superellipsoid') {
    throw new Error(`Stroke ${stroke.id} has an incompatible owner part`);
  }
  const shape = {
    radii: part.geometry.radii,
    exponent: part.geometry.exponent,
    ...(part.geometry.deformation === undefined ? {} : {
      deformation: part.geometry.deformation,
    }),
  };
  return Object.freeze(path.directions.map((direction) => {
    const surface = pointOnSuperellipsoid(shape, direction);
    return add3(surface.point, scale3(surface.normal, path.lift));
  }));
}

function roughen(points: readonly Point3[], stroke: InkedSolidStrokeSpec): readonly Point3[] {
  if (stroke.wobble === 0) return points;
  const random = new Random(stroke.seed);
  return Object.freeze(points.map((point, index) => {
    if (!stroke.closed && (index === 0 || index === points.length - 1)) return point;
    return Object.freeze([
      point[0] + random.float(-stroke.wobble, stroke.wobble),
      point[1] + random.float(-stroke.wobble, stroke.wobble),
      point[2] + random.float(-stroke.wobble, stroke.wobble),
    ] as const);
  }));
}

function curveFromPoints(points: readonly Point3[], closed: boolean): THREE.Curve<THREE.Vector3> {
  const vectors = points.map((point) => new THREE.Vector3(...point));
  if (vectors.length === 2 && !closed) {
    return new THREE.LineCurve3(vectors[0], vectors[1]);
  }
  return new THREE.CatmullRomCurve3(vectors, closed, 'centripetal');
}

const REVEAL_ATTRIBUTE = 'inkedStrokeProgress';

function setTubeRevealProgress(
  geometry: THREE.BufferGeometry,
  tubularSegments: number,
  radialSegments: number,
): void {
  const count = geometry.getAttribute('position').count;
  const ringSize = radialSegments + 1;
  const progress = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    progress[index] = Math.min(1, Math.floor(index / ringSize) / tubularSegments);
  }
  geometry.setAttribute(REVEAL_ATTRIBUTE, new THREE.BufferAttribute(progress, 1));
}

function setConstantRevealProgress(geometry: THREE.BufferGeometry, value: number): void {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(
    REVEAL_ATTRIBUTE,
    new THREE.BufferAttribute(new Float32Array(count).fill(value), 1),
  );
}

/**
 * Resolves renderer-neutral, part-local stroke paths into thin three-dimensional
 * ink volumes. Parenting each stroke to its owner mesh preserves articulation,
 * state visibility, and authored part placement without runtime branches for
 * asset families.
 */
export class InkedSolidStrokeRig {
  private readonly runtimes = new Map<string, StrokeRuntime>();
  private disposed = false;

  public constructor(
    public readonly blueprint: InkedSolidBlueprint,
    public readonly solidRig: SolidRig,
  ) {
    if (solidRig.blueprint !== blueprint.solid) {
      throw new Error('InkedSolidStrokeRig requires the exact wrapped solid blueprint');
    }
    try {
      for (const stroke of blueprint.strokes) this.addStroke(stroke);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get strokeIds(): readonly string[] {
    return [...this.runtimes.keys()];
  }

  public set visible(value: boolean) {
    for (const { group } of this.runtimes.values()) group.visible = value;
  }

  public get visible(): boolean {
    return this.runtimes.values().next().value?.group.visible ?? false;
  }

  /** Visits registration-time renderer data without exposing mutable ownership. */
  public forEachRuntimeStroke(
    visitor: (stroke: InkedSolidStrokeSpec, meshes: readonly THREE.Mesh[]) => void,
  ): void {
    this.assertAlive();
    for (const { stroke, meshes } of this.runtimes.values()) visitor(stroke, meshes);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { group, geometries, material } of this.runtimes.values()) {
      group.removeFromParent();
      for (const geometry of geometries) geometry.dispose();
      material.dispose();
      group.clear();
    }
    this.runtimes.clear();
  }

  private addStroke(stroke: InkedSolidStrokeSpec): void {
    const owner = this.solidRig.getPart(stroke.partId);
    if (owner === null) throw new Error(`Unknown stroke owner part: ${stroke.partId}`);
    const points = roughen(resolveStrokePoints(this.blueprint, stroke), stroke);
    const curve = curveFromPoints(points, stroke.closed);
    const tubularSegments = Math.max(8, points.length * 6);
    const radialSegments = 5;
    const geometry = new THREE.TubeGeometry(
      curve,
      tubularSegments,
      stroke.radius,
      radialSegments,
      stroke.closed,
    );
    setTubeRevealProgress(geometry, tubularSegments, radialSegments);
    const material = new THREE.MeshBasicMaterial({
      color: colorFromRgb(stroke.color),
      opacity: stroke.opacity,
      transparent: stroke.opacity < 1,
      toneMapped: false,
    });
    const group = new THREE.Group();
    group.name = `stroke:${stroke.id}`;
    group.renderOrder = owner.renderOrder + 0.5;
    group.userData.inkedSolidStrokeId = stroke.id;
    const tube = new THREE.Mesh(geometry, material);
    tube.castShadow = false;
    tube.receiveShadow = false;
    group.add(tube);
    const meshes: THREE.Mesh[] = [tube];
    const geometries: THREE.BufferGeometry[] = [geometry];
    if (!stroke.closed) {
      for (const [endpointIndex, endpoint] of [points[0], points[points.length - 1]].entries()) {
        if (endpoint === undefined) continue;
        const capGeometry = new THREE.SphereGeometry(stroke.radius, 6, 4);
        setConstantRevealProgress(capGeometry, endpointIndex);
        const cap = new THREE.Mesh(capGeometry, material);
        cap.position.set(...endpoint);
        group.add(cap);
        meshes.push(cap);
        geometries.push(capGeometry);
      }
    }
    owner.add(group);
    this.runtimes.set(stroke.id, Object.freeze({
      stroke,
      group,
      meshes: Object.freeze(meshes),
      geometries: Object.freeze(geometries),
      material,
    }));
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('InkedSolidStrokeRig has been disposed');
  }
}
