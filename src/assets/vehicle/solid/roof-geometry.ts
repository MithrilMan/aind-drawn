import type { Point3 } from '../../../core/geometry3.js';
import type { MeshGeometrySpec } from '../../../contracts/solid-asset.js';
import {
  createVehicleCabinCrossSection,
  vehicleCabinHalfWidthAt,
} from '../identity/cabin-section.js';
import { createVehicleCabinSideProfile } from '../identity/geometry.js';
import type { VehicleIdentityRecipe } from '../identity/recipe.js';
import type { SolidVehicleLayout } from './layout.js';

/** Builds the exclusive upper skin and its physical thickness around the tapered cabin. */
export function createVehicleRoofGeometry(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
): MeshGeometrySpec {
  const thickness = Math.max(0.055, layout.height * 0.045);
  const section = createVehicleCabinCrossSection(identity);
  const outer = createVehicleCabinSideProfile(identity).outline.slice(1, 5);
  const inner = outer.map(([x, y]) => Object.freeze([x, y - thickness] as const));
  const proud = Math.max(0.004, layout.height * 0.003);
  const halfWidth = (y: number): number => (
    vehicleCabinHalfWidthAt(section, y) + section.roofOverhang
  );
  const vertices: Point3[] = [
    ...outer.map(([x, y]): Point3 => Object.freeze([x, y + proud, halfWidth(y)] as const)),
    ...outer.map(([x, y]): Point3 => Object.freeze([x, y + proud, -halfWidth(y)] as const)),
    ...inner.map(([x, y]): Point3 => Object.freeze([x, y + proud, halfWidth(y)] as const)),
    ...inner.map(([x, y]): Point3 => Object.freeze([x, y + proud, -halfWidth(y)] as const)),
  ];
  const count = outer.length;
  const positiveOuter = 0;
  const negativeOuter = count;
  const positiveInner = count * 2;
  const negativeInner = count * 3;
  const faces: number[][] = [];
  for (let index = 0; index < count - 1; index += 1) {
    const next = index + 1;
    faces.push(
      [positiveOuter + index, positiveOuter + next, positiveInner + next, positiveInner + index],
      [negativeOuter + next, negativeOuter + index, negativeInner + index, negativeInner + next],
      [positiveOuter + index, negativeOuter + index, negativeOuter + next, positiveOuter + next],
      [positiveInner + next, negativeInner + next, negativeInner + index, positiveInner + index],
    );
  }
  faces.push(
    [positiveOuter, positiveInner, negativeInner, negativeOuter],
    [positiveOuter + count - 1, negativeOuter + count - 1,
      negativeInner + count - 1, positiveInner + count - 1],
  );
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}
