import {
  assetExtensionScope,
  type InkedSolidStrokeDefinition,
  type Point3,
  type SolidAssetBlueprint,
} from '../../../../../src/index.js';
import type { PaperCircuitHelmetIdentity } from './identity.js';
import {
  PAPER_CIRCUIT_VISOR_COLUMNS,
  PAPER_CIRCUIT_VISOR_ROWS,
} from './geometry.js';

/** Makes the transparent visor boundary legible in the Doodle 3D projection. */
function createVisorOutline(
  solid: SolidAssetBlueprint,
  partId: string,
  strokeId: string,
): readonly InkedSolidStrokeDefinition[] {
  const geometry = solid.parts.find((part) => part.id === partId)?.geometry;
  if (geometry?.type !== 'mesh') {
    throw new RangeError('Paper Circuit helmet ink strokes require the visor mesh');
  }
  const vertex = (row: number, column: number): Point3 => {
    const point = geometry.vertices[row * PAPER_CIRCUIT_VISOR_COLUMNS + column];
    if (point === undefined) throw new RangeError('Paper Circuit visor topology is incomplete');
    return point;
  };
  const points: Point3[] = [
    ...Array.from({ length: PAPER_CIRCUIT_VISOR_COLUMNS }, (_, column) => vertex(0, column)),
    ...Array.from({ length: PAPER_CIRCUIT_VISOR_ROWS - 1 }, (_, index) => (
      vertex(index + 1, PAPER_CIRCUIT_VISOR_COLUMNS - 1)
    )),
    ...Array.from({ length: PAPER_CIRCUIT_VISOR_COLUMNS - 1 }, (_, index) => (
      vertex(
        PAPER_CIRCUIT_VISOR_ROWS - 1,
        PAPER_CIRCUIT_VISOR_COLUMNS - 2 - index,
      )
    )),
    ...Array.from({ length: PAPER_CIRCUIT_VISOR_ROWS - 2 }, (_, index) => (
      vertex(PAPER_CIRCUIT_VISOR_ROWS - 2 - index, 0)
    )),
  ];
  const surfaceId = solid.parts.find((part) => part.id === partId)?.surfaceId;
  const glazeSurface = solid.surfaces.find((surface) => surface.id === surfaceId);
  if (glazeSurface?.drawing.application !== 'glaze') {
    throw new RangeError('Paper Circuit visor requires a glaze surface');
  }
  const glazeColor = glazeSurface.color;
  const glazeStrokeCount = glazeSurface.drawing.drawing.gesture === 'quiet' ? 3 : 4;
  const sampleGrid = (u: number, v: number): Point3 => {
    const column = Math.max(0, Math.min(PAPER_CIRCUIT_VISOR_COLUMNS - 1, (
      u * (PAPER_CIRCUIT_VISOR_COLUMNS - 1)
    )));
    const row = Math.max(0, Math.min(PAPER_CIRCUIT_VISOR_ROWS - 1, (
      v * (PAPER_CIRCUIT_VISOR_ROWS - 1)
    )));
    const left = Math.floor(column);
    const right = Math.min(PAPER_CIRCUIT_VISOR_COLUMNS - 1, left + 1);
    const top = Math.floor(row);
    const bottom = Math.min(PAPER_CIRCUIT_VISOR_ROWS - 1, top + 1);
    const amountX = column - left;
    const amountY = row - top;
    const topLeft = vertex(top, left);
    const topRight = vertex(top, right);
    const bottomLeft = vertex(bottom, left);
    const bottomRight = vertex(bottom, right);
    return Object.freeze([0, 1, 2].map((axis) => {
      const upper = (topLeft[axis] as number) * (1 - amountX)
        + (topRight[axis] as number) * amountX;
      const lower = (bottomLeft[axis] as number) * (1 - amountX)
        + (bottomRight[axis] as number) * amountX;
      return upper * (1 - amountY) + lower * amountY;
    }) as unknown as Point3);
  };
  const glaze = (index: number) => Object.freeze({
    id: `${strokeId}:glaze:${index}`,
    partId,
    path: Object.freeze({
      type: 'part-local' as const,
      points: Object.freeze(Array.from({ length: 7 }, (_, sampleIndex) => {
        const v = 0.12 + sampleIndex / 6 * 0.76;
        const u = 0.02 + index * 0.2 + (v - 0.12) / 0.76 * 0.38;
        return sampleGrid(u, v);
      })),
    }),
    radius: 0.005,
    color: glazeColor,
    opacity: 0.14 + index % 2 * 0.03,
    closed: false,
    wobble: 0.011,
  });
  return Object.freeze([
    Object.freeze({
      id: strokeId,
      partId,
      path: Object.freeze({ type: 'part-local', points: Object.freeze(points) }),
      radius: 0.009,
      opacity: 0.72,
      closed: true,
      wobble: 0.006,
    }),
    ...Array.from({ length: glazeStrokeCount }, (_, index) => glaze(index)),
  ]);
}

export function createPaperCircuitHelmetInkStrokes(
  solid: SolidAssetBlueprint<'character'>,
  helmet: PaperCircuitHelmetIdentity,
): readonly InkedSolidStrokeDefinition[] {
  const scope = assetExtensionScope(helmet);
  return createVisorOutline(
    solid,
    scope.id('part:visor'),
    scope.id('stroke:visor-outline'),
  );
}

export function createPaperCircuitHelmetItemInkStrokes(
  solid: SolidAssetBlueprint<'paper-circuit-helmet'>,
): readonly InkedSolidStrokeDefinition[] {
  return createVisorOutline(solid, 'visor', 'visor-outline');
}
