import * as THREE from 'three';

import type { SolidGeometrySpec } from '../assets/solid-types.js';
import { pointOnSuperellipsoid, type Point3 } from '../core/geometry3.js';

function createSuperellipsoidGeometry(
  spec: Extract<SolidGeometrySpec, { type: 'superellipsoid' }>,
): THREE.BufferGeometry {
  const geometry = new THREE.SphereGeometry(
    1,
    Math.max(8, Math.floor(spec.widthSegments)),
    Math.max(6, Math.floor(spec.heightSegments)),
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
    curveSegments: Math.max(1, Math.floor(spec.curveSegments)),
    bevelEnabled: bevel > 0,
    bevelSegments: bevel > 0 ? 2 : 0,
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
  for (const face of spec.faces) {
    if (face.length < 3) continue;
    const first = spec.vertices[face[0] ?? -1];
    if (first === undefined) {
      throw new RangeError('Mesh face references an unknown vertex');
    }
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
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  if (spec.smooth) {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(spec.vertices.flat(), 3));
    geometry.setIndex(triangles);
  } else {
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(triangles, 3));
  }
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

export function createSolidGeometry(spec: SolidGeometrySpec): THREE.BufferGeometry {
  if (spec.type === 'superellipsoid') return createSuperellipsoidGeometry(spec);
  if (spec.type === 'extruded-profile') return createExtrudedProfileGeometry(spec);
  return createMeshGeometry(spec);
}
