import type { MeshGeometrySpec } from '../../../contracts/solid-asset.js';
import type { Point3 } from '../../../core/geometry3.js';
import type { VehicleIdentityRecipe } from '../identity/recipe.js';
import type { SolidVehicleLayout } from './layout.js';

export type VehicleBodyGeometry = Readonly<{
  shell: MeshGeometrySpec;
  hood: MeshGeometrySpec;
  cargo: MeshGeometrySpec;
}>;

type BodyRing = Readonly<{
  x: number;
  sideHalfWidth: number;
  ridgeHalfWidth: number;
  bottom: number;
  lowerSide: number;
  shoulder: number;
  top: number;
}>;

function freezeMesh(
  vertices: readonly Point3[],
  faces: readonly (readonly number[])[],
): MeshGeometrySpec {
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}

function ringVertices(ring: BodyRing): readonly Point3[] {
  const bottomHalfWidth = ring.sideHalfWidth * 0.84;
  return Object.freeze([
    [ring.x, ring.bottom, -bottomHalfWidth],
    [ring.x, ring.lowerSide, -ring.sideHalfWidth],
    [ring.x, ring.shoulder, -ring.sideHalfWidth],
    [ring.x, ring.top, -ring.ridgeHalfWidth],
    [ring.x, ring.top, ring.ridgeHalfWidth],
    [ring.x, ring.shoulder, ring.sideHalfWidth],
    [ring.x, ring.lowerSide, ring.sideHalfWidth],
    [ring.x, ring.bottom, bottomHalfWidth],
  ] as const);
}

function taperedLid(
  length: number,
  hingeHalfWidth: number,
  farHalfWidth: number,
  drop: number,
  direction: -1 | 1,
): MeshGeometrySpec {
  const thickness = Math.max(0.035, hingeHalfWidth * 0.07);
  const farX = direction * length;
  const vertices: readonly Point3[] = [
    [0, 0, -hingeHalfWidth],
    [0, 0, hingeHalfWidth],
    [farX, -drop, farHalfWidth],
    [farX, -drop, -farHalfWidth],
    [0, -thickness, -hingeHalfWidth],
    [0, -thickness, hingeHalfWidth],
    [farX, -drop - thickness, farHalfWidth],
    [farX, -drop - thickness, -farHalfWidth],
  ];
  const top = direction === 1 ? [0, 1, 2, 3] : [3, 2, 1, 0];
  const bottom = direction === 1 ? [7, 6, 5, 4] : [4, 5, 6, 7];
  return freezeMesh(vertices, [
    top,
    bottom,
    [0, 4, 5, 1],
    [1, 5, 6, 2],
    [2, 6, 7, 3],
    [3, 7, 4, 0],
  ]);
}

/**
 * Builds one authored hard-surface shell whose polygon boundaries represent
 * actual changes of plane. The upper run is covered by the articulated cargo
 * lid, cabin, and hood. Archetypes whose cabin ends before the hood begins get
 * a fixed deck bridge so the sheet-metal envelope remains watertight.
 */
export function createVehicleBodyGeometry(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
): VehicleBodyGeometry {
  const bodyHeight = Math.max(
    identity.wheels.radius * 0.95,
    layout.beltHeight - layout.bodyBottom,
  );
  const sideHalfWidth = layout.width * 0.5;
  const roundness = Math.max(0, Math.min(1, (identity.body.cornerRoundness - 0.72) / 0.46));
  const ridgeHalfWidth = sideHalfWidth * (0.62 + roundness * 0.06);
  const hoodDrop = Math.max(0.07, Math.min(bodyHeight * 0.3, layout.hoodLength * 0.18));
  const cargoDrop = Math.max(0.06, Math.min(bodyHeight * 0.25, layout.cargoLength * 0.14));
  const bottom = layout.bodyBottom - bodyHeight * 0.035;
  const lowerSide = layout.bodyBottom + bodyHeight * 0.18;
  const shoulder = layout.bodyBottom + bodyHeight * 0.7;
  const tipSideHalfWidth = sideHalfWidth * 0.86;
  const tipRidgeHalfWidth = ridgeHalfWidth * 0.78;
  const cabinFrontX = -layout.length * 0.5 + identity.cabin.endRatio * layout.length;
  const hasFrontDeck = layout.hoodHingeX - cabinFrontX > 1e-6;

  const rings: readonly BodyRing[] = Object.freeze([
    Object.freeze({
      x: layout.cargoHingeX - layout.cargoLength,
      sideHalfWidth: tipSideHalfWidth,
      ridgeHalfWidth: tipRidgeHalfWidth,
      bottom: bottom + cargoDrop * 0.05,
      lowerSide: lowerSide - cargoDrop * 0.08,
      shoulder: shoulder - cargoDrop * 0.38,
      top: layout.beltHeight - cargoDrop,
    }),
    Object.freeze({
      x: layout.cargoHingeX,
      sideHalfWidth,
      ridgeHalfWidth,
      bottom,
      lowerSide,
      shoulder,
      top: layout.beltHeight,
    }),
    ...(hasFrontDeck ? [Object.freeze({
      x: cabinFrontX,
      sideHalfWidth,
      ridgeHalfWidth,
      bottom,
      lowerSide,
      shoulder,
      top: layout.beltHeight,
    })] : []),
    Object.freeze({
      x: layout.hoodHingeX,
      sideHalfWidth,
      ridgeHalfWidth,
      bottom,
      lowerSide,
      shoulder,
      top: layout.beltHeight,
    }),
    Object.freeze({
      x: layout.hoodHingeX + layout.hoodLength,
      sideHalfWidth: tipSideHalfWidth,
      ridgeHalfWidth: tipRidgeHalfWidth,
      bottom: bottom + hoodDrop * 0.05,
      lowerSide: lowerSide - hoodDrop * 0.08,
      shoulder: shoulder - hoodDrop * 0.38,
      top: layout.beltHeight - hoodDrop,
    }),
  ]);
  const vertices = rings.flatMap((ring) => ringVertices(ring));
  const faces: number[][] = [];
  const ringSize = 8;
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const start = ringIndex * ringSize;
    const end = (ringIndex + 1) * ringSize;
    for (let edge = 0; edge < ringSize; edge += 1) {
      // Lids and cabin own the upper surface. Only the fixed interval between
      // the cabin front and hood hinge belongs to the body shell itself.
      const isFrontDeck = hasFrontDeck
        && Math.abs((rings[ringIndex]?.x ?? Number.NaN) - cabinFrontX) <= 1e-6
        && Math.abs((rings[ringIndex + 1]?.x ?? Number.NaN) - layout.hoodHingeX) <= 1e-6;
      if (edge === 3 && !isFrontDeck) continue;
      const next = (edge + 1) % ringSize;
      faces.push([start + edge, start + next, end + next, end + edge]);
    }
  }
  faces.push(
    Array.from({ length: ringSize }, (_, index) => ringSize - 1 - index),
    Array.from(
      { length: ringSize },
      (_, index) => (rings.length - 1) * ringSize + index,
    ),
  );

  return Object.freeze({
    shell: freezeMesh(vertices, faces),
    hood: taperedLid(
      layout.hoodLength,
      ridgeHalfWidth,
      tipRidgeHalfWidth,
      hoodDrop,
      1,
    ),
    cargo: taperedLid(
      layout.cargoLength,
      ridgeHalfWidth,
      tipRidgeHalfWidth,
      cargoDrop,
      -1,
    ),
  });
}
