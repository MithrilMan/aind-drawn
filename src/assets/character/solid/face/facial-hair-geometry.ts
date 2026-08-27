import type { MeshGeometrySpec } from '../../../../contracts/solid-asset.js';
import type { Point3, SurfaceAnchor } from '../../../../core/geometry3.js';
import type { CharacterFacialHairProfile } from '../../identity/facial-hair-profile.js';

/** Builds a gravity-hanging beard curtain whose inner wall remains a real mouth aperture. */
export function createFacialHairRingGeometry(
  profile: CharacterFacialHairProfile,
  radiusX: number,
  radiusY: number,
  radiusZ: number,
  at: (x: number, y: number) => SurfaceAnchor,
): MeshGeometrySpec {
  const outer = profile.beard.outline;
  const inner = profile.opening.outline;
  if (outer.length !== inner.length) {
    throw new RangeError('Beard outline and aperture must use the same segment count');
  }
  const count = outer.length;
  const depth = radiusZ * profile.beard.spatial.depth;
  const radialSegments = 12;
  const ringCount = radialSegments + 1;
  // A single vertical tangent keeps the hanging mass attached without turning its side view into a horn.
  const attachmentY = profile.opening.spatial.center[1] * 0.72;
  const curtainZ = at(0, attachmentY).point[2];
  const boundaryDepth = depth * 0.24;
  const peakDepth = depth * 0.64;
  const vertices: Point3[] = [];
  const project = (x: number, y: number, proud: number): Point3 => {
    return Object.freeze([x * radiusX, y * radiusY, curtainZ + proud] as const);
  };
  for (const surfaceSide of ['front', 'back'] as const) {
    for (let radialIndex = 0; radialIndex < ringCount; radialIndex += 1) {
      const amount = radialIndex / radialSegments;
      const bulge = Math.sin(Math.PI * amount) ** 0.68;
      for (let index = 0; index < count; index += 1) {
        const outerPoint = outer[index] as Point3 | readonly [number, number];
        const innerPoint = inner[index] as Point3 | readonly [number, number];
        const x = outerPoint[0] + (innerPoint[0] - outerPoint[0]) * amount;
        const y = outerPoint[1] + (innerPoint[1] - outerPoint[1]) * amount;
        const clearance = radiusZ * 0.025;
        const frontVolume = depth * (0.12 + bulge * 0.08);
        const shellDepth = boundaryDepth + (peakDepth - boundaryDepth) * bulge;
        const proud = surfaceSide === 'front'
          ? clearance + frontVolume
          : clearance + frontVolume - shellDepth;
        vertices.push(project(x, y, proud));
      }
    }
  }
  const surfaceStride = ringCount * count;
  const atVertex = (side: 0 | 1, radial: number, angle: number): number => (
    side * surfaceStride + radial * count + angle
  );
  const faces: number[][] = [];
  const triangleAreaSquared = (first: number, second: number, third: number): number => {
    const a = vertices[first] as Point3;
    const b = vertices[second] as Point3;
    const c = vertices[third] as Point3;
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const crossX = aby * acz - abz * acy;
    const crossY = abz * acx - abx * acz;
    const crossZ = abx * acy - aby * acx;
    return crossX * crossX + crossY * crossY + crossZ * crossZ;
  };
  const pushTriangle = (first: number, second: number, third: number): void => {
    if (triangleAreaSquared(first, second, third) <= 1e-9) return;
    faces.push([first, second, third]);
  };
  const pushQuad = (first: number, second: number, third: number, fourth: number): void => {
    const firstDiagonal = Math.min(
      triangleAreaSquared(first, second, third),
      triangleAreaSquared(first, third, fourth),
    );
    const secondDiagonal = Math.min(
      triangleAreaSquared(first, second, fourth),
      triangleAreaSquared(second, third, fourth),
    );
    if (secondDiagonal > firstDiagonal) {
      pushTriangle(first, second, fourth);
      pushTriangle(second, third, fourth);
      return;
    }
    pushTriangle(first, second, third);
    pushTriangle(first, third, fourth);
  };
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      pushQuad(
        atVertex(0, radial, index), atVertex(0, radial, next),
        atVertex(0, radial + 1, next), atVertex(0, radial + 1, index),
      );
      pushQuad(
        atVertex(1, radial, next), atVertex(1, radial, index),
        atVertex(1, radial + 1, index), atVertex(1, radial + 1, next),
      );
    }
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    pushQuad(
      atVertex(1, 0, index), atVertex(1, 0, next),
      atVertex(0, 0, next), atVertex(0, 0, index),
    );
    pushQuad(
      atVertex(0, radialSegments, index), atVertex(0, radialSegments, next),
      atVertex(1, radialSegments, next), atVertex(1, radialSegments, index),
    );
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: true,
  });
}
