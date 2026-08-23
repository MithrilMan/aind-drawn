import type { InkedSolidStrokeDefinition } from '../../../projections/inked-solid/blueprint.js';
import type { Point3 } from '../../../core/geometry3.js';
import type { SolidAssetBlueprint } from '../../../contracts/solid-asset.js';

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

/** Family-authored facade marks; the runtime contains no building branches. */
export function createSolidBuildingInkStrokes(
  solid: SolidAssetBlueprint,
): readonly InkedSolidStrokeDefinition[] {
  if (solid.family !== 'building') {
    throw new RangeError('Building ink strokes require a solid building blueprint');
  }
  const strokes: InkedSolidStrokeDefinition[] = [];
  for (const window of solid.parts.filter(({ id }) => id.startsWith('window:'))) {
    if (window.geometry.type !== 'extruded-profile') continue;
    const { outline, depth } = window.geometry;
    const minimumX = Math.min(...outline.map(([x]) => x));
    const maximumX = Math.max(...outline.map(([x]) => x));
    const minimumY = Math.min(...outline.map(([, y]) => y));
    const maximumY = Math.max(...outline.map(([, y]) => y));
    const centerX = (minimumX + maximumX) * 0.5;
    const radius = Math.max(
      0.006,
      Math.min(maximumX - minimumX, maximumY - minimumY) * 0.018,
    );
    const front = depth + Math.max(0.004, depth * 0.08);
    const insetY = (maximumY - minimumY) * 0.08;
    const points = Object.freeze([
      Object.freeze([centerX, minimumY + insetY, front] as const),
      Object.freeze([centerX, maximumY - insetY, front] as const),
    ]);
    strokes.push(localStroke(
      `${window.id}:mullion`,
      window.id,
      points,
      radius,
      { wobble: radius * 0.2 },
    ));
  }
  return Object.freeze(strokes);
}
