import {
  moveOnSurface,
  pointOnSuperellipsoid,
  type Bounds3,
  type Point3,
  type SurfaceAnchor,
  type Superellipsoid,
} from '../../core/geometry3.js';
import { clamp } from '../../core/geometry.js';
import type { SolidFaceRecipe } from './recipe.js';
import type { SolidCharacterRecipe } from '../solid-character/recipe.js';

export type SolidFaceSourceRecipe = SolidFaceRecipe | SolidCharacterRecipe;

export type SolidFaceLayout = Readonly<{
  shape: Superellipsoid;
  center: Point3;
  bounds: Bounds3;
  eyeRadius: number;
  eyeAnchors: readonly [left: SurfaceAnchor, right: SurfaceAnchor];
  mouthAnchor: SurfaceAnchor;
  noseAnchor: SurfaceAnchor;
  browAnchors: readonly [left: SurfaceAnchor, right: SurfaceAnchor];
  sockets: Readonly<Record<string, Point3>>;
  at: (x: number, y: number, proud?: number, roll?: number) => SurfaceAnchor;
}>;

export function buildSolidFaceLayout(recipe: SolidFaceSourceRecipe): SolidFaceLayout {
  const identity = recipe.identity;
  const radii: Point3 = [
    identity.head.width * 0.5,
    identity.head.height * 0.5,
    recipe.style.depth * 0.5,
  ];
  const shape: Superellipsoid = Object.freeze({ radii, exponent: recipe.style.exponent });
  const center: Point3 = [0, radii[1], 0];
  const at = (x: number, y: number, proud = 0, roll = 0): SurfaceAnchor => {
    const surface = pointOnSuperellipsoid(shape, [x * radii[0], y * radii[1], radii[2]]);
    return moveOnSurface(Object.freeze({ point: surface.point, normal: surface.normal, roll }), [0, 0], proud);
  };
  const eyeRadius = Math.min(radii[0], radii[1]) * 0.19 * identity.eyes.size;
  const eyeSpacing = clamp(0.3 + (identity.eyes.spacing - 0.37) / 0.15 * 0.13, 0.28, 0.45);
  const eyeHeight = 0.14 + identity.eyes.verticalOffset;
  const mouthHeight = -identity.mouth.verticalOffset * 0.68;
  const leftEye = at(-eyeSpacing, eyeHeight, eyeRadius * 0.08);
  const rightEye = at(eyeSpacing, eyeHeight, eyeRadius * 0.08);
  const mouthAnchor = at(0, mouthHeight, eyeRadius * 0.05);
  const noseAnchor = at(0, (eyeHeight + mouthHeight) * 0.46, eyeRadius * 0.04);
  const browY = eyeHeight + identity.brows.lift;
  const leftBrow = at(-eyeSpacing, browY, eyeRadius * 0.1, -identity.brows.tilt);
  const rightBrow = at(eyeSpacing, browY, eyeRadius * 0.1, identity.brows.tilt);
  return Object.freeze({
    shape,
    center,
    bounds: Object.freeze({
      minimum: [-radii[0], 0, -radii[2]] as const,
      maximum: [radii[0], radii[1] * 2.18, radii[2] * 1.08] as const,
    }),
    eyeRadius,
    eyeAnchors: [leftEye, rightEye] as const,
    mouthAnchor,
    noseAnchor,
    browAnchors: [leftBrow, rightBrow] as const,
    sockets: Object.freeze({
      floor: [0, 0, 0] as const,
      center,
      crown: [0, radii[1] * 2, 0] as const,
      face: [0, radii[1], radii[2]] as const,
    }),
    at,
  });
}
