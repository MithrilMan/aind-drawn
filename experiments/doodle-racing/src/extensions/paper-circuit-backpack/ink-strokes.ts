import type {
  InkedSolidStrokeDefinition,
  Point3,
  SolidAssetBlueprint,
} from '../../../../../src/index.js';
import type { PaperCircuitBackpackIdentity } from './identity.js';

export function createPaperCircuitBackpackInkStrokes(
  solid: SolidAssetBlueprint<'paper-circuit-backpack'>,
  identity: PaperCircuitBackpackIdentity,
): readonly InkedSolidStrokeDefinition[] {
  if (!solid.parts.some(({ id }) => id === 'body') || !solid.parts.some(({ id }) => id === 'flap')) {
    throw new RangeError('Paper Circuit backpack strokes require body and flap parts');
  }
  const [radiusX, radiusY, radiusZ] = identity.dimensions.radii;
  const seam = (id: string, x: number): InkedSolidStrokeDefinition => Object.freeze({
    id,
    partId: 'body',
    path: Object.freeze({
      type: 'part-local' as const,
      points: Object.freeze(Array.from({ length: 7 }, (_, index): Point3 => {
        const y = -radiusY * 0.68 + index / 6 * radiusY * 1.38;
        return Object.freeze([x, y, radiusZ * 0.94] as Point3);
      })),
    }),
    radius: 0.006,
    opacity: 0.54,
    closed: false,
    wobble: 0.008,
  });
  return Object.freeze([
    seam('seam:left', -radiusX * 0.62),
    seam('seam:right', radiusX * 0.62),
    Object.freeze({
      id: 'flap-stitch',
      partId: 'flap',
      path: Object.freeze({
        type: 'part-local' as const,
        points: Object.freeze([
          [-radiusX * 0.72, -radiusY * 0.2, 0.035],
          [0, -radiusY * 0.25, 0.035],
          [radiusX * 0.72, -radiusY * 0.2, 0.035],
        ] as readonly Point3[]),
      }),
      radius: 0.006,
      opacity: 0.62,
      closed: false,
      wobble: 0.007,
    }),
  ]);
}
