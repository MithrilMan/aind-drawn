import type { MeshGeometrySpec } from '../../../../contracts/solid-asset.js';
import { clamp } from '../../../../core/geometry.js';
import type { Point3, SurfaceAnchor } from '../../../../core/geometry3.js';
import type { CharacterFacialHairProfile } from '../../identity/facial-hair-profile.js';

function smoothUnit(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

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
  const vertices: Point3[] = [];
  const project = (x: number, y: number, curtainAmount: number, proud: number): Point3 => {
    const surface = at(x, y);
    const verticalPlane = at(x, 0);
    const verticalZ = surface.point[2]
      + (verticalPlane.point[2] - surface.point[2]) * curtainAmount;
    return Object.freeze([x * radiusX, y * radiusY, verticalZ + proud] as const);
  };
  for (const surfaceSide of ['front', 'back'] as const) {
    for (let radialIndex = 0; radialIndex < ringCount; radialIndex += 1) {
      const amount = radialIndex / radialSegments;
      const bulge = Math.sin(Math.PI * amount) ** 0.68;
      const curtainAmount = 1 - smoothUnit(amount);
      for (let index = 0; index < count; index += 1) {
        const outerPoint = outer[index] as Point3 | readonly [number, number];
        const innerPoint = inner[index] as Point3 | readonly [number, number];
        const x = outerPoint[0] + (innerPoint[0] - outerPoint[0]) * amount;
        const y = outerPoint[1] + (innerPoint[1] - outerPoint[1]) * amount;
        const volume = depth * bulge * 0.16;
        const proud = surfaceSide === 'front'
          ? radiusZ * 0.035 + volume
          : -radiusZ * 0.018 - depth * 0.025 * curtainAmount;
        vertices.push(project(x, y, curtainAmount, proud));
      }
    }
  }
  const surfaceStride = ringCount * count;
  const atVertex = (side: 0 | 1, radial: number, angle: number): number => (
    side * surfaceStride + radial * count + angle
  );
  const faces: number[][] = [];
  for (let radial = 0; radial < radialSegments; radial += 1) {
    for (let index = 0; index < count; index += 1) {
      const next = (index + 1) % count;
      faces.push(
        [
          atVertex(0, radial, index), atVertex(0, radial, next),
          atVertex(0, radial + 1, next), atVertex(0, radial + 1, index),
        ],
        [
          atVertex(1, radial, next), atVertex(1, radial, index),
          atVertex(1, radial + 1, index), atVertex(1, radial + 1, next),
        ],
      );
    }
  }
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    faces.push(
      [atVertex(1, 0, index), atVertex(1, 0, next), atVertex(0, 0, next), atVertex(0, 0, index)],
      [
        atVertex(0, radialSegments, index), atVertex(0, radialSegments, next),
        atVertex(1, radialSegments, next), atVertex(1, radialSegments, index),
      ],
    );
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: true,
  });
}
