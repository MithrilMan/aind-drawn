import type { InkedSolidStrokeDefinition } from '../inked-solid/blueprint.js';
import { SeedTree } from '../../core/random.js';
import type { Point3 } from '../../core/geometry3.js';
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

function floorCount(solid: SolidAssetBlueprint): number {
  return solid.parts.reduce((maximum, { id }) => {
    const match = /^window:(\d+):/u.exec(id);
    return match === null ? maximum : Math.max(maximum, Number(match[1]) + 1);
  }, 1);
}

/** Family-authored facade marks; the runtime contains no building branches. */
export function createSolidBuildingInkStrokes(
  solid: SolidAssetBlueprint,
): readonly InkedSolidStrokeDefinition[] {
  const shell = solid.parts.find(({ id }) => id === 'building:shell');
  if (shell?.geometry.type !== 'box') {
    throw new RangeError('Building ink strokes require the semantic shell box');
  }
  const [width, wallHeight, depth] = shell.geometry.size;
  const radius = Math.max(0.009, Math.min(width, wallHeight) * 0.0025);
  const front = depth * 0.5 + radius * 1.25;
  const floors = floorCount(solid);
  const strokes: InkedSolidStrokeDefinition[] = [];

  for (let floor = 1; floor < floors; floor += 1) {
    const y = -wallHeight * 0.5 + wallHeight * floor / floors;
    const points = Object.freeze(Array.from({ length: 11 }, (_, index): Point3 => {
      const amount = index / 10;
      return Object.freeze([-width * 0.48 + width * 0.96 * amount, y, front] as const);
    }));
    strokes.push(localStroke(
      `facade:floor-seam:${floor}`,
      shell.id,
      points,
      radius,
      { wobble: radius * 0.7 },
    ));
  }

  const markRandom = new SeedTree(solid.seed).random('inked-solid:building:facade-marks');
  const markCount = Math.max(5, Math.min(12, Math.round(width + wallHeight * 0.3)));
  for (let index = 0; index < markCount; index += 1) {
    const x = markRandom.float(-width * 0.42, width * 0.35);
    const y = markRandom.float(-wallHeight * 0.42, wallHeight * 0.4);
    const length = markRandom.float(width * 0.035, width * 0.09);
    strokes.push(localStroke(
      `facade:pencil-mark:${index}`,
      shell.id,
      Object.freeze([
        Object.freeze([x, y, front] as const),
        Object.freeze([x + length, y + markRandom.float(-radius, radius), front] as const),
      ]),
      radius * 0.68,
      { wobble: radius * 0.25 },
    ));
  }

  const door = solid.parts.find(({ id }) => id === 'door');
  if (door?.geometry.type === 'extruded-profile') {
    const outline = door.geometry.outline;
    const minimumX = Math.min(...outline.map(([x]) => x));
    const maximumX = Math.max(...outline.map(([x]) => x));
    const minimumY = Math.min(...outline.map(([, y]) => y));
    const maximumY = Math.max(...outline.map(([, y]) => y));
    const centerX = (minimumX + maximumX) * 0.5;
    const inset = Object.freeze(outline.map(([x, y]): Point3 => Object.freeze([
      centerX + (x - centerX) * 0.72,
      minimumY + (y - minimumY) * 0.76 + (maximumY - minimumY) * 0.08,
      radius,
    ] as const)));
    strokes.push(localStroke('door:inset-line', door.id, inset, radius * 0.82, {
      closed: true,
      wobble: radius * 0.18,
    }));
  }

  const roof = solid.parts.find(({ id }) => id === 'building:roof');
  if (roof?.geometry.type === 'mesh') {
    const maximumZ = Math.max(...roof.geometry.vertices.map(([, , z]) => z));
    const frontProfile = roof.geometry.vertices.filter(([, , z]) => z === maximumZ)
      .map(([x, y, z]): Point3 => Object.freeze([x, y, z + radius] as const));
    if (frontProfile.length >= 3) {
      strokes.push(localStroke('roof:front-seam', roof.id, Object.freeze(frontProfile), radius, {
        closed: true,
        wobble: radius * 0.28,
      }));
    }
  }
  return Object.freeze(strokes);
}
