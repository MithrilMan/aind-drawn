import {
  add3,
  pointOnSuperellipsoid,
  scale3,
  type MeshGeometrySpec,
  type Point3,
  type SuperellipsoidGeometrySpec,
} from '../../../../../src/index.js';
import type { PaperCircuitHelmetItemIdentity } from './identity.js';

export const PAPER_CIRCUIT_VISOR_COLUMNS = 20;
export const PAPER_CIRCUIT_VISOR_ROWS = 9;

/**
 * Half-width of the authored face aperture in front-plane slope coordinates.
 * Both the shell cut and visor sample this function; they cannot drift into
 * two independently shaped openings.
 */
export function paperCircuitFaceOpeningHalfWidthAt(
  item: PaperCircuitHelmetItemIdentity,
  normalizedY: number,
  overlap = 0,
): number {
  const opening = item.shell.faceOpening;
  const halfWidth = opening.halfWidth + overlap;
  const bottomY = opening.bottomY - overlap;
  const topY = opening.topY + overlap;
  const centerY = (bottomY + topY) * 0.5;
  const halfHeight = (topY - bottomY) * 0.5;
  const radius = Math.min(opening.cornerRadius + overlap, halfWidth, halfHeight);
  const curvedDistance = Math.max(0, Math.abs(normalizedY - centerY) - (halfHeight - radius));
  if (curvedDistance >= radius) return Math.max(0, halfWidth - radius);
  return halfWidth - radius + Math.sqrt(radius * radius - curvedDistance * curvedDistance);
}

function pointOnHelmetFront(
  shell: SuperellipsoidGeometrySpec,
  slopeX: number,
  slopeY: number,
): Readonly<{ point: Point3; normal: Point3 }> {
  return pointOnSuperellipsoid(shell, [
    slopeX * shell.radii[0],
    slopeY * shell.radii[1],
    shell.radii[2],
  ]);
}

function helmetShape(
  item: PaperCircuitHelmetItemIdentity,
  scale: number,
  inset = 0,
): SuperellipsoidGeometrySpec {
  return Object.freeze({
    type: 'superellipsoid',
    radii: Object.freeze(item.shell.radii.map(
      (radius) => (radius - inset) * scale,
    ) as unknown as Point3),
    exponent: item.shell.exponent,
    widthSegments: 32,
    heightSegments: 20,
  });
}

export function fitPaperCircuitHelmetScale(
  head: SuperellipsoidGeometrySpec,
  item: PaperCircuitHelmetItemIdentity,
  clearance: number,
): number {
  return Math.max(...head.radii.map((radius, axis) => (
    radius * (1 + clearance)
      / ((item.shell.radii[axis] as number) - item.shell.thickness)
  )));
}

export function createPaperCircuitHelmetShellGeometry(
  item: PaperCircuitHelmetItemIdentity,
  scale = 1,
): MeshGeometrySpec {
  const segments = 64;
  const rings = 30;
  const maximumLatitude = Math.PI / 2 - 0.11;
  const minimumLatitude = Math.asin(item.shell.bottomY);
  const outer = helmetShape(item, scale);
  const inner = helmetShape(item, scale, item.shell.thickness);
  const vertices: Point3[] = [];
  const faces: number[][] = [];
  const ring = (shape: SuperellipsoidGeometrySpec, latitude: number): number[] => {
    const offset = vertices.length;
    const radius = Math.cos(latitude);
    for (let index = 0; index < segments; index += 1) {
      const longitude = index / segments * Math.PI * 2;
      vertices.push(pointOnSuperellipsoid(shape, [
        Math.cos(longitude) * radius * shape.radii[0],
        Math.sin(latitude) * shape.radii[1],
        Math.sin(longitude) * radius * shape.radii[2],
      ]).point);
    }
    return Array.from({ length: segments }, (_, index) => offset + index);
  };
  const outerRings: number[][] = [];
  const innerRings: number[][] = [];
  const innerForOuter = new Map<number, number>();
  for (let index = 0; index < rings; index += 1) {
    const amount = index / (rings - 1);
    const latitude = minimumLatitude + (maximumLatitude - minimumLatitude) * amount;
    outerRings.push(ring(outer, latitude));
    innerRings.push(ring(inner, latitude));
    const outerRing = outerRings[index] as number[];
    const innerRing = innerRings[index] as number[];
    outerRing.forEach((outerIndex, column) => {
      innerForOuter.set(outerIndex, innerRing[column] as number);
    });
  }
  const boundaryEdges = new Map<string, { first: number; second: number; count: number }>();
  const recordOuterFace = (face: number[]): void => {
    faces.push(face);
    for (let index = 0; index < face.length; index += 1) {
      const first = face[index] as number;
      const second = face[(index + 1) % face.length] as number;
      const key = first < second ? `${first}:${second}` : `${second}:${first}`;
      const edge = boundaryEdges.get(key);
      if (edge === undefined) boundaryEdges.set(key, { first, second, count: 1 });
      else edge.count += 1;
    }
  };
  const insideRoundedFaceOpening = (x: number, y: number, z: number): boolean => {
    if (z <= 0) return false;
    const opening = item.shell.faceOpening;
    const slopeX = x / z;
    const slopeY = y / z;
    return slopeY >= opening.bottomY
      && slopeY <= opening.topY
      && Math.abs(slopeX) <= paperCircuitFaceOpeningHalfWidthAt(item, slopeY);
  };
  for (let ringIndex = 0; ringIndex < rings - 1; ringIndex += 1) {
    const lowAmount = ringIndex / (rings - 1);
    const highAmount = (ringIndex + 1) / (rings - 1);
    const lowLatitude = minimumLatitude + (maximumLatitude - minimumLatitude) * lowAmount;
    const highLatitude = minimumLatitude + (maximumLatitude - minimumLatitude) * highAmount;
    const centerLatitude = (lowLatitude + highLatitude) * 0.5;
    for (let index = 0; index < segments; index += 1) {
      const next = (index + 1) % segments;
      const centerLongitude = (index + 0.5) / segments * Math.PI * 2;
      const radius = Math.cos(centerLatitude);
      const outerLow = outerRings[ringIndex] as number[];
      const outerHigh = outerRings[ringIndex + 1] as number[];
      const innerLow = innerRings[ringIndex] as number[];
      const innerHigh = innerRings[ringIndex + 1] as number[];
      if (insideRoundedFaceOpening(
        Math.cos(centerLongitude) * radius,
        Math.sin(centerLatitude),
        Math.sin(centerLongitude) * radius,
      )) continue;
      recordOuterFace([
        outerLow[index] as number, outerLow[next] as number,
        outerHigh[next] as number, outerHigh[index] as number,
      ]);
      faces.push([
        innerHigh[index] as number, innerHigh[next] as number,
        innerLow[next] as number, innerLow[index] as number,
      ]);
    }
  }
  const outerTop = vertices.push(pointOnSuperellipsoid(outer, [0, 1, 0]).point) - 1;
  const innerTop = vertices.push(pointOnSuperellipsoid(inner, [0, 1, 0]).point) - 1;
  const outerLast = outerRings[outerRings.length - 1] as number[];
  const innerLast = innerRings[innerRings.length - 1] as number[];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    recordOuterFace([outerLast[index] as number, outerLast[next] as number, outerTop]);
    faces.push([innerLast[next] as number, innerLast[index] as number, innerTop]);
  }
  for (const edge of boundaryEdges.values()) {
    if (edge.count !== 1) continue;
    const innerFirst = innerForOuter.get(edge.first);
    const innerSecond = innerForOuter.get(edge.second);
    if (innerFirst === undefined || innerSecond === undefined) {
      throw new Error('Helmet shell boundary has no matching inner rim');
    }
    faces.push([
      edge.second,
      edge.first,
      innerFirst,
      innerSecond,
    ]);
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: true,
  });
}

export type PaperCircuitVisorGeometry = Readonly<{
  geometry: MeshGeometrySpec;
  hinge: Point3;
}>;

export function createPaperCircuitVisorGeometry(
  item: PaperCircuitHelmetItemIdentity,
  scale = 1,
): PaperCircuitVisorGeometry {
  const shell = helmetShape(item, scale);
  const columns = PAPER_CIRCUIT_VISOR_COLUMNS;
  const rows = PAPER_CIRCUIT_VISOR_ROWS;
  const overlap = item.visor.edgeOverlap;
  const topY = item.shell.faceOpening.topY + overlap;
  const bottomY = item.shell.faceOpening.bottomY - overlap;
  const hinge: Point3 = Object.freeze([0, shell.radii[1] * topY, 0]);
  const vertices: Point3[] = [];
  const faces: number[][] = [];
  const grid = (offset: number): number[][] => Array.from({ length: rows }, (_, rowIndex) => {
    const amountY = rowIndex / (rows - 1);
    const normalizedY = topY + (bottomY - topY) * amountY;
    const halfWidth = paperCircuitFaceOpeningHalfWidthAt(item, normalizedY, overlap);
    return Array.from({ length: columns }, (_, columnIndex) => {
      const normalizedX = -halfWidth
        + columnIndex / (columns - 1) * halfWidth * 2;
      const surface = pointOnHelmetFront(shell, normalizedX, normalizedY);
      const proud = scale * (item.visor.clearance + offset);
      const world = add3(surface.point, scale3(surface.normal, proud));
      vertices.push([world[0] - hinge[0], world[1] - hinge[1], world[2] - hinge[2]]);
      return vertices.length - 1;
    });
  });
  const front = grid(item.visor.thickness);
  const back = grid(0);
  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const nextRow = row + 1;
      const nextColumn = column + 1;
      faces.push(
        [front[row]?.[column] as number, front[row]?.[nextColumn] as number,
          front[nextRow]?.[nextColumn] as number, front[nextRow]?.[column] as number],
        [back[row]?.[column] as number, back[nextRow]?.[column] as number,
          back[nextRow]?.[nextColumn] as number, back[row]?.[nextColumn] as number],
      );
    }
  }
  const connect = (frontEdge: readonly number[], backEdge: readonly number[]): void => {
    for (let index = 0; index < frontEdge.length - 1; index += 1) {
      faces.push([
        frontEdge[index] as number,
        backEdge[index] as number,
        backEdge[index + 1] as number,
        frontEdge[index + 1] as number,
      ]);
    }
  };
  connect(front[0] as number[], back[0] as number[]);
  connect(
    [...(front[rows - 1] as number[])].reverse(),
    [...(back[rows - 1] as number[])].reverse(),
  );
  connect(front.map((row) => row[0] as number), back.map((row) => row[0] as number));
  connect(
    front.map((row) => row[columns - 1] as number).reverse(),
    back.map((row) => row[columns - 1] as number).reverse(),
  );
  return Object.freeze({
    hinge,
    geometry: Object.freeze({
      type: 'mesh',
      vertices: Object.freeze(vertices),
      faces: Object.freeze(faces.map((face) => Object.freeze(face))),
      smooth: true,
    }),
  });
}
