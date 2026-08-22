import type { MeshGeometrySpec } from '../../../../contracts/solid-asset.js';
import type { Point3 } from '../../../../core/geometry3.js';

function signedPower(value: number, power: number): number {
  return Math.sign(value) * Math.abs(value) ** power;
}

/** Creates a real open rim, not a filled face plate masquerading as eyewear. */
export function createEyewearRimGeometry(
  halfWidth: number,
  halfHeight: number,
  thickness: number,
  depth: number,
  segments = 32,
): MeshGeometrySpec {
  const innerWidth = Math.max(thickness, halfWidth - thickness);
  const innerHeight = Math.max(thickness, halfHeight - thickness);
  const vertices: Point3[] = [];
  const exponent = 0.5;
  for (const z of [-depth * 0.5, depth * 0.5]) {
    for (const [width, height] of [
      [halfWidth, halfHeight], [innerWidth, innerHeight],
    ] as const) {
      for (let index = 0; index < segments; index += 1) {
        const angle = index / segments * Math.PI * 2;
        vertices.push(Object.freeze([
          signedPower(Math.cos(angle), exponent) * width,
          signedPower(Math.sin(angle), exponent) * height,
          z,
        ] as const));
      }
    }
  }
  const outerBack = 0;
  const innerBack = segments;
  const outerFront = segments * 2;
  const innerFront = segments * 3;
  const faces: number[][] = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    faces.push(
      [outerFront + index, outerFront + next, innerFront + next, innerFront + index],
      [outerBack + next, outerBack + index, innerBack + index, innerBack + next],
      [outerBack + index, outerBack + next, outerFront + next, outerFront + index],
      [innerBack + next, innerBack + index, innerFront + index, innerFront + next],
    );
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: true,
  });
}
