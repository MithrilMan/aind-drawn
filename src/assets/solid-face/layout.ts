import {
  moveOnSurface,
  pointOnSuperellipsoid,
  type Bounds3,
  type Point3,
  type SurfaceAnchor,
  type Superellipsoid,
} from '../../core/geometry3.js';
import type { SolidFaceRecipe } from './recipe.js';

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

export function buildSolidFaceLayout(recipe: SolidFaceRecipe): SolidFaceLayout {
  const radii: Point3 = [recipe.head.width, recipe.head.height, recipe.head.depth];
  const shape: Superellipsoid = Object.freeze({ radii, exponent: recipe.head.exponent });
  const center: Point3 = [0, radii[1], 0];
  const at = (x: number, y: number, proud = 0, roll = 0): SurfaceAnchor => {
    const surface = pointOnSuperellipsoid(shape, [x * radii[0], y * radii[1], radii[2]]);
    return moveOnSurface(Object.freeze({ point: surface.point, normal: surface.normal, roll }), [0, 0], proud);
  };
  const eyeRadius = Math.min(radii[0], radii[1]) * 0.19 * recipe.eyes.size;
  const leftEye = at(-recipe.eyes.spacing, recipe.eyes.height, eyeRadius * 0.08);
  const rightEye = at(recipe.eyes.spacing, recipe.eyes.height, eyeRadius * 0.08);
  const mouthAnchor = at(0, recipe.mouth.height, eyeRadius * 0.05);
  const noseAnchor = at(0, (recipe.eyes.height + recipe.mouth.height) * 0.46, eyeRadius * 0.04);
  const browY = recipe.eyes.height + recipe.brows.lift;
  const leftBrow = at(-recipe.eyes.spacing, browY, eyeRadius * 0.1, -recipe.brows.tilt);
  const rightBrow = at(recipe.eyes.spacing, browY, eyeRadius * 0.1, recipe.brows.tilt);
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
