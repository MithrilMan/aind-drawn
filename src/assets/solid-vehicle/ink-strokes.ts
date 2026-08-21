import type { Point3 } from '../../core/geometry3.js';
import type { InkedSolidStrokeDefinition } from '../inked-solid/blueprint.js';
import type { SolidAssetBlueprint } from '../solid-types.js';

function localStroke(
  id: string,
  partId: string,
  points: readonly Point3[],
  radius: number,
  options: Readonly<{ closed?: boolean; wobble?: number }> = {},
): InkedSolidStrokeDefinition {
  return Object.freeze({
    id,
    partId,
    path: Object.freeze({ type: 'part-local', points: Object.freeze(points) }),
    radius,
    ...(options.closed === undefined ? {} : { closed: options.closed }),
    ...(options.wobble === undefined ? {} : { wobble: options.wobble }),
  });
}

/** Spatial seams and grooves that belong to vehicle parts rather than the camera contour pass. */
export function createSolidVehicleInkStrokes(
  solid: SolidAssetBlueprint,
): readonly InkedSolidStrokeDefinition[] {
  if (solid.kind !== 'solid-vehicle') {
    throw new RangeError('Vehicle ink strokes require a solid vehicle blueprint');
  }
  const body = solid.parts.find(({ id }) => id === 'body');
  if (body?.geometry.type !== 'superellipsoid') {
    throw new RangeError('Vehicle ink strokes require the semantic body volume');
  }
  const [bodyRadiusX, bodyRadiusY, bodyRadiusZ] = body.geometry.radii;
  const radius = Math.max(0.008, Math.min(bodyRadiusY, bodyRadiusZ) * 0.018);
  const strokes: InkedSolidStrokeDefinition[] = [];
  for (const side of [-1, 1] as const) {
    const z = side * bodyRadiusZ * 1.015;
    for (let index = -1; index <= 1; index += 1) {
      const y = -bodyRadiusY * 0.08 + index * bodyRadiusY * 0.19;
      strokes.push(localStroke(
        `grille:${side}:${index}`,
        body.id,
        Object.freeze([
          Object.freeze([bodyRadiusX * 0.94, y, z * 0.42] as const),
          Object.freeze([bodyRadiusX * 0.99, y + radius * 0.4, z * 0.18] as const),
        ]),
        radius * 0.66,
        { wobble: radius * 0.35 },
      ));
    }
  }

  const cabin = solid.parts.find(({ id }) => id === 'cabin');
  if (cabin?.geometry.type === 'mesh') {
    const minimumX = Math.min(...cabin.geometry.vertices.map(([x]) => x));
    const maximumX = Math.max(...cabin.geometry.vertices.map(([x]) => x));
    const minimumY = Math.min(...cabin.geometry.vertices.map(([, y]) => y));
    const maximumY = Math.max(...cabin.geometry.vertices.map(([, y]) => y));
    const maximumZ = Math.max(...cabin.geometry.vertices.map(([, , z]) => z));
    const divisionX = minimumX + (maximumX - minimumX) * 0.56;
    strokes.push(localStroke(
      'window:division:left',
      cabin.id,
      Object.freeze([
        Object.freeze([divisionX, minimumY + (maximumY - minimumY) * 0.08, maximumZ + radius] as const),
        Object.freeze([divisionX + radius, maximumY * 0.96, maximumZ + radius] as const),
      ]),
      radius * 0.72,
      { wobble: radius * 0.25 },
    ));
    strokes.push(localStroke(
      'window:division:right',
      cabin.id,
      Object.freeze([
        Object.freeze([divisionX, minimumY + (maximumY - minimumY) * 0.08, -maximumZ - radius] as const),
        Object.freeze([divisionX + radius, maximumY * 0.96, -maximumZ - radius] as const),
      ]),
      radius * 0.72,
      { wobble: radius * 0.25 },
    ));
  }

  for (const tyre of solid.parts.filter(({ id }) => id.endsWith(':tyre'))) {
    if (tyre.geometry.type !== 'mesh') continue;
    const outerRadius = Math.max(...tyre.geometry.vertices.map(([x, y]) => Math.hypot(x, y)));
    const maximumZ = Math.max(...tyre.geometry.vertices.map(([, , z]) => Math.abs(z)));
    for (const side of [-1, 1] as const) {
      const points = Object.freeze(Array.from({ length: 28 }, (_, index): Point3 => {
        const angle = index / 28 * Math.PI * 2;
        return Object.freeze([
          Math.cos(angle) * outerRadius * 0.74,
          Math.sin(angle) * outerRadius * 0.74,
          side * maximumZ * 1.015,
        ] as const);
      }));
      strokes.push(localStroke(
        `${tyre.id}:tread:${side}`,
        tyre.id,
        points,
        radius * 0.52,
        { closed: true, wobble: radius * 0.18 },
      ));
    }
  }
  return Object.freeze(strokes);
}
