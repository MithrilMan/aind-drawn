import type {
  InkedSolidStrokeDefinition,
} from '../../../projections/inked-solid/blueprint.js';
import { add3, pointOnSuperellipsoid, scale3, type Point3 } from '../../../core/geometry3.js';
import type { SolidAssetBlueprint, SuperellipsoidGeometrySpec } from '../../../contracts/solid-asset.js';

function surfaceDirections(
  count: number,
  sample: (amount: number) => Point3,
): readonly Point3[] {
  return Object.freeze(Array.from({ length: count }, (_, index) => Object.freeze(
    sample(index / Math.max(1, count - 1)),
  )));
}

function surfaceStroke(
  id: string,
  partId: string,
  directions: readonly Point3[],
  lift: number,
  radius: number,
  wobble = radius * 0.32,
): InkedSolidStrokeDefinition {
  return Object.freeze({
    id,
    partId,
    path: Object.freeze({ type: 'superellipsoid-surface', directions, lift }),
    radius,
    wobble,
  });
}

function headShape(solid: SolidAssetBlueprint): SuperellipsoidGeometrySpec | null {
  const geometry = solid.parts.find(({ id }) => id === 'head')?.geometry;
  return geometry?.type === 'superellipsoid' ? geometry : null;
}

function catWhiskers(
  shape: SuperellipsoidGeometrySpec,
  radius: number,
): readonly InkedSolidStrokeDefinition[] {
  const minimumRadius = Math.min(...shape.radii);
  const lift = minimumRadius * 0.035;
  return Object.freeze([-1, 1].flatMap((side) => (
    [-1, 0, 1].map((row): InkedSolidStrokeDefinition => {
      const direction: Point3 = [side * 0.2, -0.18 + row * 0.09, 1];
      const surface = pointOnSuperellipsoid(shape, direction);
      const start = add3(surface.point, scale3(surface.normal, lift));
      const endX = side * shape.radii[0] * (1.02 + Math.abs(row) * 0.08);
      const endY = start[1] + row * shape.radii[1] * 0.16;
      return Object.freeze({
        id: `face:whisker:${side < 0 ? 'left' : 'right'}:${row + 1}`,
        partId: 'head',
        path: Object.freeze({
          type: 'part-local',
          points: Object.freeze([
            start,
            Object.freeze([
              side * shape.radii[0] * 0.62,
              start[1] + row * shape.radii[1] * 0.06,
              start[2] + minimumRadius * 0.018,
            ] as const),
            Object.freeze([endX, endY, start[2] - minimumRadius * 0.025] as const),
          ]),
        }),
        radius: radius * 0.34,
        wobble: radius * 0.18,
      });
    })
  )));
}

/** Family-authored marks; the stroke runtime remains free of character logic. */
export function createSolidCharacterInkStrokes(
  solid: SolidAssetBlueprint,
): readonly InkedSolidStrokeDefinition[] {
  const shape = headShape(solid);
  if (shape === null) throw new RangeError('Character ink strokes require a head superellipsoid');
  const minimumRadius = Math.min(...shape.radii);
  const radius = Math.max(0.005, minimumRadius * 0.012);
  const strokes: InkedSolidStrokeDefinition[] = [];

  const hairPart = solid.parts.find(({ id }) => /^hair:(cap|bob|fringe)(:|$)/u.test(id));
  if (hairPart !== undefined) {
    for (const [index, horizontal] of [-0.58, -0.3, 0, 0.3, 0.58].entries()) {
      strokes.push(surfaceStroke(
        `hair:strand:${index}`,
        'head',
        surfaceDirections(8, (amount): Point3 => [
          horizontal * (0.9 - amount * 0.1),
          0.96 - amount * 0.42,
          0.48 + amount * 0.5,
        ]),
        minimumRadius * 0.155,
        radius * 0.76,
        radius * 0.22,
      ));
    }
  }

  const torso = solid.parts.find(({ id }) => id === 'body:torso');
  if (torso?.geometry.type === 'superellipsoid') {
    const torsoMinimum = Math.min(...torso.geometry.radii);
    strokes.push(surfaceStroke(
      'clothing:collar-seam',
      torso.id,
      surfaceDirections(11, (amount): Point3 => [
        -0.78 + amount * 1.56,
        0.5 - Math.abs(amount - 0.5) * 0.12,
        1,
      ]),
      torsoMinimum * 0.04,
      Math.max(0.004, torsoMinimum * 0.018),
    ));
  }

  if (solid.parts.some(({ id }) => id === 'muzzle:left')) {
    strokes.push(...catWhiskers(shape, radius));
  }
  return Object.freeze(strokes);
}
