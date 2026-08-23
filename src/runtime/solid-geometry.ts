import * as THREE from 'three';

import type { SolidGeometrySpec } from '../contracts/solid-asset.js';
import { pointOnSuperellipsoid, type Point3 } from '../core/geometry3.js';

export type SolidGeometryFactoryOptions = Readonly<{
  /** Runtime tessellation scale. One is authored quality; values clamp to 0.2–1. */
  detail?: number;
}>;

function resolveDetail(value: number | undefined): number {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) throw new RangeError('Solid geometry detail must be finite');
  return Math.max(0.2, Math.min(1, value));
}

function scaledSegments(value: number, minimum: number, detail: number): number {
  return Math.max(minimum, Math.round(value * detail));
}

function createSuperellipsoidGeometry(
  spec: Extract<SolidGeometrySpec, { type: 'superellipsoid' }>,
  detail: number,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    1,
    scaledSegments(spec.widthSegments, 12, detail),
    scaledSegments(spec.heightSegments, 8, detail),
  );
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const shape = {
    radii: spec.radii,
    exponent: spec.exponent,
    ...(spec.deformation === undefined ? {} : { deformation: spec.deformation }),
  };
  for (let index = 0; index < positions.count; index += 1) {
    const direction: Point3 = [positions.getX(index), positions.getY(index), positions.getZ(index)];
    const surface = pointOnSuperellipsoid(shape, direction);
    positions.setXYZ(index, ...surface.point);
    normals.setXYZ(index, ...surface.normal);
  }
  positions.needsUpdate = true;
  normals.needsUpdate = true;
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createExtrudedProfileGeometry(
  spec: Extract<SolidGeometrySpec, { type: 'extruded-profile' }>,
  detail: number,
): THREE.BufferGeometry {
  if (spec.outline.length < 3) {
    throw new RangeError('An extruded profile requires at least three outline points');
  }
  const first = spec.outline[0];
  if (first === undefined) {
    throw new RangeError('An extruded profile requires an outline');
  }
  const shape = new THREE.Shape();
  shape.moveTo(first[0], first[1]);
  for (const point of spec.outline.slice(1)) {
    shape.lineTo(point[0], point[1]);
  }
  shape.closePath();
  const bevel = Math.max(0, Math.min(spec.bevel, spec.depth * 0.48));
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: spec.depth,
    steps: 1,
    // The serialized outline is a polyline; subdividing its line segments
    // cannot improve the silhouette and only duplicates vertices.
    curveSegments: 1,
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? scaledSegments(2, 1, detail) : 0,
    bevelSize: bevel,
    bevelThickness: bevel,
  });
  geometry.translate(0, 0, -spec.depth);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createMeshGeometry(
  spec: Extract<SolidGeometrySpec, { type: 'mesh' }>,
): THREE.BufferGeometry {
  const triangles: number[] = [];
  const normals: number[] = [];
  for (const face of spec.faces) {
    if (face.length < 3) continue;
    const first = spec.vertices[face[0] ?? -1];
    if (first === undefined) {
      throw new RangeError('Mesh face references an unknown vertex');
    }
    const faceNormal = spec.smooth ? undefined : (() => {
      const normal = new THREE.Vector3();
      for (let index = 0; index < face.length; index += 1) {
        const current = spec.vertices[face[index] ?? -1];
        const next = spec.vertices[face[(index + 1) % face.length] ?? -1];
        if (current === undefined || next === undefined) {
          throw new RangeError('Mesh face references an unknown vertex');
        }
        normal.x += (current[1] - next[1]) * (current[2] + next[2]);
        normal.y += (current[2] - next[2]) * (current[0] + next[0]);
        normal.z += (current[0] - next[0]) * (current[1] + next[1]);
      }
      if (normal.lengthSq() < 1e-18) {
        throw new RangeError('Mesh face must have a non-zero surface normal');
      }
      return normal.normalize();
    })();
    for (let index = 1; index < face.length - 1; index += 1) {
      const second = spec.vertices[face[index] ?? -1];
      const third = spec.vertices[face[index + 1] ?? -1];
      if (second === undefined || third === undefined) {
        throw new RangeError('Mesh face references an unknown vertex');
      }
      if (spec.smooth) {
        triangles.push(face[0] as number, face[index] as number, face[index + 1] as number);
      } else {
        triangles.push(...first, ...second, ...third);
        if (faceNormal === undefined) {
          throw new Error('Faceted mesh face normal was not generated');
        }
        for (let vertex = 0; vertex < 3; vertex += 1) {
          normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
        }
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  if (spec.smooth) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(spec.vertices.flat(), 3));
    geometry.setIndex(triangles);
  } else {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  }
  if (spec.smooth) geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createBoxGeometry(
  spec: Extract<SolidGeometrySpec, { type: 'box' }>,
  detail: number,
): THREE.BufferGeometry {
  if (spec.size.some((value) => !(value > 0) || !Number.isFinite(value))) {
    throw new RangeError('Box dimensions must be positive finite numbers');
  }
  const segments = spec.segments ?? [1, 1, 1];
  return new THREE.BoxGeometry(
    ...spec.size,
    ...segments.map((value) => scaledSegments(value, 1, detail)) as [number, number, number],
  );
}

export function createSolidGeometry(
  spec: SolidGeometrySpec,
  options: SolidGeometryFactoryOptions = {},
): THREE.BufferGeometry {
  const detail = resolveDetail(options.detail);
  if (spec.type === 'superellipsoid') return createSuperellipsoidGeometry(spec, detail);
  if (spec.type === 'extruded-profile') return createExtrudedProfileGeometry(spec, detail);
  if (spec.type === 'box') return createBoxGeometry(spec, detail);
  return createMeshGeometry(spec);
}
