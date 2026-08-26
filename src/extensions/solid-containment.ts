import * as THREE from 'three';

import type {
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidContainmentDefinition,
  SolidPartDefinition,
  SuperellipsoidGeometrySpec,
} from '../contracts/solid-asset.js';
import { pointOnSuperellipsoid, surfaceFrame, type Point3 } from '../core/geometry3.js';
import { createSolidGeometry } from '../runtime/solid-geometry.js';

type ContainmentPlane = Readonly<{
  normal: THREE.Vector3;
  constant: number;
}>;

export type SolidSuperellipsoidContainment = Readonly<{
  id: string;
  ownerNode: string;
  semanticPartIds: readonly string[];
  volume: SuperellipsoidGeometrySpec;
  containedPartId: (sourcePartId: string) => string;
  planeCount?: number;
}>;

export type CompiledSolidContainment = Readonly<{
  definition: SolidContainmentDefinition;
  parts: readonly SolidPartDefinition[];
}>;

function placementMatrix(part: SolidPartDefinition): THREE.Matrix4 {
  const rotation = new THREE.Quaternion();
  if (part.placement.surface !== undefined) {
    const frame = surfaceFrame(
      part.placement.surface.normal,
      part.placement.surface.roll,
    );
    rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(
      new THREE.Vector3(...frame.right),
      new THREE.Vector3(...frame.up),
      new THREE.Vector3(...frame.normal),
    ));
  }
  if (part.placement.rotation !== undefined) {
    rotation.multiply(new THREE.Quaternion().setFromEuler(
      new THREE.Euler(...part.placement.rotation, 'XYZ'),
    ));
  }
  return new THREE.Matrix4().compose(
    new THREE.Vector3(...part.placement.position),
    rotation,
    new THREE.Vector3(1, 1, 1),
  );
}

function containmentPlanes(
  volume: SuperellipsoidGeometrySpec,
  requestedCount: number,
): readonly ContainmentPlane[] {
  const count = Math.max(32, Math.min(256, Math.round(requestedCount)));
  const directions: Point3[] = [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
  ];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  for (let index = 0; index < count; index += 1) {
    const y = 1 - 2 * (index + 0.5) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const angle = index * goldenAngle;
    directions.push([Math.cos(angle) * radius, y, Math.sin(angle) * radius]);
  }
  return Object.freeze(directions.map((direction) => {
    const surface = pointOnSuperellipsoid(volume, direction);
    const normal = new THREE.Vector3(...surface.normal).normalize();
    const point = new THREE.Vector3(...surface.point);
    return Object.freeze({ normal, constant: normal.dot(point) * 0.992 });
  }));
}

function clipPolygon(
  source: readonly THREE.Vector3[],
  plane: ContainmentPlane,
): THREE.Vector3[] {
  if (source.length === 0) return [];
  const result: THREE.Vector3[] = [];
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index] as THREE.Vector3;
    const previous = source[(index + source.length - 1) % source.length] as THREE.Vector3;
    const currentDistance = plane.normal.dot(current) - plane.constant;
    const previousDistance = plane.normal.dot(previous) - plane.constant;
    const currentInside = currentDistance <= 1e-8;
    const previousInside = previousDistance <= 1e-8;
    if (currentInside !== previousInside) {
      const denominator = previousDistance - currentDistance;
      const amount = Math.abs(denominator) < 1e-12 ? 0 : previousDistance / denominator;
      result.push(previous.clone().lerp(current, amount));
    }
    if (currentInside) result.push(current.clone());
  }
  return result;
}

function clippedMesh(
  part: SolidPartDefinition,
  volume: SuperellipsoidGeometrySpec,
  planeCount: number,
): MeshGeometrySpec | null {
  const source = createSolidGeometry(part.geometry);
  const transform = placementMatrix(part);
  const inverse = transform.clone().invert();
  const planes = containmentPlanes(volume, planeCount);
  const positions = source.getAttribute('position');
  const indices = source.index;
  const triangles = indices === null ? positions.count / 3 : indices.count / 3;
  const vertices: Point3[] = [];
  const faces: (readonly number[])[] = [];
  const vertexIndex = new Map<string, number>();
  const addVertex = (value: THREE.Vector3): number => {
    const local = value.clone().applyMatrix4(inverse);
    const point: Point3 = Object.freeze([local.x, local.y, local.z]);
    const key = point.map((coordinate) => Math.round(coordinate * 1e7)).join(':');
    const existing = vertexIndex.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.length;
    vertices.push(point);
    vertexIndex.set(key, index);
    return index;
  };
  try {
    for (let triangle = 0; triangle < triangles; triangle += 1) {
      const polygon: THREE.Vector3[] = [];
      for (let corner = 0; corner < 3; corner += 1) {
        const offset = triangle * 3 + corner;
        const index = indices?.getX(offset) ?? offset;
        polygon.push(new THREE.Vector3(
          positions.getX(index), positions.getY(index), positions.getZ(index),
        ).applyMatrix4(transform));
      }
      let clipped = polygon;
      for (const plane of planes) {
        clipped = clipPolygon(clipped, plane);
        if (clipped.length < 3) break;
      }
      for (let index = 1; index < clipped.length - 1; index += 1) {
        const first = clipped[0] as THREE.Vector3;
        const second = clipped[index] as THREE.Vector3;
        const third = clipped[index + 1] as THREE.Vector3;
        const area = new THREE.Vector3().crossVectors(
          second.clone().sub(first),
          third.clone().sub(first),
        ).lengthSq();
        if (area <= 2e-9) continue;
        const face = [addVertex(first), addVertex(second), addVertex(third)];
        if (new Set(face).size < 3) continue;
        faces.push(Object.freeze(face));
      }
    }
  } finally {
    source.dispose();
  }
  if (faces.length === 0) {
    return null;
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: true,
  });
}

/**
 * Precompiles paired original/contained part geometry. The volume and selected
 * parts must share one node-local coordinate space, keeping the result
 * deterministic and renderer-independent at runtime.
 */
export function compileSolidSuperellipsoidContainment(
  blueprint: SolidAssetBlueprint,
  definition: SolidSuperellipsoidContainment,
): CompiledSolidContainment {
  if (!blueprint.nodes.some(({ id }) => id === definition.ownerNode)) {
    throw new RangeError(`Unknown containment owner node ${definition.ownerNode}`);
  }
  const selected = new Set(definition.semanticPartIds);
  const sources = blueprint.parts.filter((part) => selected.has(part.semanticPartId));
  if (sources.length === 0) throw new RangeError('Solid containment selected no source parts');
  const ids = new Set(blueprint.parts.map(({ id }) => id));
  const variants = sources.map((source) => {
    if (source.node !== definition.ownerNode) {
      throw new RangeError(
        `Containment ${definition.id} requires ${source.id} on node ${definition.ownerNode}`,
      );
    }
    const containedPartId = definition.containedPartId(source.id);
    if (ids.has(containedPartId)) throw new RangeError(`Duplicate solid part ${containedPartId}`);
    ids.add(containedPartId);
    const geometry = clippedMesh(source, definition.volume, definition.planeCount ?? 112);
    return Object.freeze({
      sourcePartId: source.id,
      ...(geometry === null ? {} : { containedPartId }),
      part: geometry === null ? null : Object.freeze({
        ...source,
        id: containedPartId,
        geometry,
        visible: false,
      }),
    });
  });
  return Object.freeze({
    definition: Object.freeze({
      id: definition.id,
      variants: Object.freeze(variants.map(({ sourcePartId, containedPartId }) => (
        Object.freeze({
          sourcePartId,
          ...(containedPartId === undefined ? {} : { containedPartId }),
        })
      ))),
    }),
    parts: Object.freeze(variants.flatMap(({ part }) => part === null ? [] : [part])),
  });
}
