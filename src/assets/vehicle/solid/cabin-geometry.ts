import type { Point } from '../../../core/geometry.js';
import type { Point3 } from '../../../core/geometry3.js';
import type { MeshGeometrySpec } from '../../../contracts/solid-asset.js';
import {
  createVehicleCabinCrossSection,
  vehicleCabinHalfWidthAt,
} from '../identity/cabin-section.js';
import { createVehicleCabinSideProfile } from '../identity/geometry.js';
import { vehicleSideSign, type VehicleIdentityRecipe, type VehicleSide } from '../identity/recipe.js';
import type { SolidVehicleLayout } from './layout.js';

function profileYAt(profile: readonly Point[], x: number): number {
  for (let index = 1; index < profile.length; index += 1) {
    const start = profile[index - 1] as Point;
    const end = profile[index] as Point;
    if (x < start[0] - 1e-6 || x > end[0] + 1e-6) continue;
    const amount = (x - start[0]) / Math.max(1e-9, end[0] - start[0]);
    return start[1] + (end[1] - start[1]) * amount;
  }
  return profile[0]?.[1] ?? 0;
}

function uniqueSorted(values: readonly number[]): readonly number[] {
  return Object.freeze([...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => (
      index === 0 || value - (sorted[index - 1] ?? value) > 1e-6
    )));
}

function appendSideFace(
  vertices: Point3[],
  faces: number[][],
  points: readonly Point3[],
  side: VehicleSide,
): void {
  const start = vertices.length;
  vertices.push(...points);
  const face = Array.from({ length: points.length }, (_, index) => start + index);
  faces.push(vehicleSideSign(side) === 1 ? face : face.reverse());
}

function appendFixedSideGlass(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
  side: VehicleSide,
  vertices: Point3[],
  faces: number[][],
): void {
  const cabin = createVehicleCabinSideProfile(identity);
  const section = createVehicleCabinCrossSection(identity);
  const frame = layout.doorWindowOutline.map(([x, y]): Point => Object.freeze([
    x + layout.doorHingeX,
    y + layout.bodyBottom,
  ] as const));
  const doorRearX = frame[0]?.[0] ?? 0;
  const doorFrontX = frame[frame.length - 1]?.[0] ?? 0;
  const doorTop = frame.slice(1);
  const xs = uniqueSorted([
    ...cabin.outline.map(([x]) => x),
    ...doorTop.map(([x]) => x),
    doorRearX,
    doorFrontX,
  ]);
  const sideSign = vehicleSideSign(side);
  const minimumEdgeLength = Math.max(0.006, layout.length * 0.002);
  const point = (x: number, y: number): Point3 => Object.freeze([
    x,
    y,
    sideSign * vehicleCabinHalfWidthAt(section, y),
  ] as const);

  for (let index = 0; index < xs.length - 1; index += 1) {
    const rearX = xs[index] as number;
    const frontX = xs[index + 1] as number;
    if (frontX - rearX < minimumEdgeLength) continue;
    const midpoint = (rearX + frontX) * 0.5;
    const aboveDoor = midpoint > doorRearX && midpoint < doorFrontX;
    const rearTopY = profileYAt(cabin.outline, rearX);
    const frontTopY = profileYAt(cabin.outline, frontX);
    const rearBottomY = aboveDoor
      ? Math.min(rearTopY, profileYAt(doorTop, rearX))
      : cabin.beltHeight;
    const frontBottomY = aboveDoor
      ? Math.min(frontTopY, profileYAt(doorTop, frontX))
      : cabin.beltHeight;
    const rearCollapsed = rearTopY - rearBottomY < minimumEdgeLength;
    const frontCollapsed = frontTopY - frontBottomY < minimumEdgeLength;
    if (rearCollapsed && frontCollapsed) continue;
    if (rearCollapsed) {
      appendSideFace(vertices, faces, [
        point(rearX, rearBottomY),
        point(frontX, frontBottomY),
        point(frontX, frontTopY),
      ], side);
    } else if (frontCollapsed) {
      appendSideFace(vertices, faces, [
        point(rearX, rearBottomY),
        point(frontX, frontBottomY),
        point(rearX, rearTopY),
      ], side);
    } else {
      appendSideFace(vertices, faces, [
        point(rearX, rearBottomY),
        point(frontX, frontBottomY),
        point(frontX, frontTopY),
        point(rearX, rearTopY),
      ], side);
    }
  }
}

/** Builds the cabin shell while leaving the articulated door-window apertures physically open. */
export function createVehicleCabinGeometry(
  identity: VehicleIdentityRecipe,
  layout: SolidVehicleLayout,
): MeshGeometrySpec {
  const profile = createVehicleCabinSideProfile(identity).outline;
  const section = createVehicleCabinCrossSection(identity);
  const vertices: Point3[] = [
    ...profile.map(([x, y]): Point3 => Object.freeze([
      x,
      y,
      vehicleCabinHalfWidthAt(section, y),
    ] as const)),
    ...profile.map(([x, y]): Point3 => Object.freeze([
      x,
      y,
      -vehicleCabinHalfWidthAt(section, y),
    ] as const)),
  ];
  const count = profile.length;
  const faces: number[][] = [];
  for (let index = 0; index < count; index += 1) {
    // The roof owns the horizontal upper carrier surface.
    if (index === 2) continue;
    const next = (index + 1) % count;
    faces.push([index, next, count + next, count + index]);
  }
  for (const side of identity.doors.sides) {
    appendFixedSideGlass(identity, layout, side, vertices, faces);
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth: false,
  });
}
