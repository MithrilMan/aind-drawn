import {
  boundsOfSuperellipsoid,
  moveOnSurface,
  pointOnSuperellipsoid,
  type Bounds3,
  type Point3,
  type SurfaceAnchor,
  type Superellipsoid,
} from '../../core/geometry3.js';
import { clamp } from '../../core/geometry.js';
import {
  characterEyeCenterY,
  characterHeadShapeField,
  characterMouthCenterY,
} from '../character-identity/head-shape.js';
import { createCharacterHairProfile } from '../character-identity/hair-profile.js';
import type { SolidFaceRecipe } from './recipe.js';
import type { SolidCharacterRecipe } from '../solid-character/recipe.js';

export type SolidFaceSourceRecipe = SolidFaceRecipe | SolidCharacterRecipe;

export type SolidFaceLayout = Readonly<{
  shape: Superellipsoid;
  surfaceBounds: Bounds3;
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
  const field = characterHeadShapeField(identity.head);
  const shape: Superellipsoid = Object.freeze({
    radii,
    exponent: field.exponent,
    deformation: field.deformation,
  });
  const surfaceBounds = boundsOfSuperellipsoid(shape);
  const center: Point3 = [0, -surfaceBounds.minimum[1], 0];
  const at = (x: number, y: number, proud = 0, roll = 0): SurfaceAnchor => {
    const targetX = clamp(x, -0.9, 0.9);
    const targetY = clamp(y, -0.9, 0.9);
    let directionZ = 1;
    if (Math.abs(targetX) > 1e-6 || Math.abs(targetY) > 1e-6) {
      const useX = Math.abs(targetX) >= Math.abs(targetY);
      const target = Math.abs(useX ? targetX : targetY);
      let minimum = 0;
      let maximum = 24;
      for (let iteration = 0; iteration < 28; iteration += 1) {
        const candidate = (minimum + maximum) * 0.5;
        const point = pointOnSuperellipsoid(shape, [
          targetX * radii[0],
          targetY * radii[1],
          candidate * radii[2],
        ]).point;
        const projected = Math.abs(useX ? point[0] / radii[0] : point[1] / radii[1]);
        if (projected > target) minimum = candidate;
        else maximum = candidate;
      }
      directionZ = (minimum + maximum) * 0.5;
    }
    const surface = pointOnSuperellipsoid(shape, [
      targetX * radii[0],
      targetY * radii[1],
      directionZ * radii[2],
    ]);
    return moveOnSurface(Object.freeze({ point: surface.point, normal: surface.normal, roll }), [0, 0], proud);
  };
  const eyeRadius = Math.min(radii[0], radii[1]) * 0.19 * identity.eyes.size;
  const eyeSpacing = identity.eyes.spacing;
  const eyeHeight = characterEyeCenterY(identity);
  const mouthHeight = characterMouthCenterY(identity);
  const leftEye = at(-eyeSpacing, eyeHeight);
  const rightEye = at(eyeSpacing, eyeHeight);
  const mouthAnchor = at(0, mouthHeight);
  const noseAnchor = at(0, (eyeHeight + mouthHeight) * 0.46);
  const browY = eyeHeight + identity.brows.lift;
  const leftBrow = at(-eyeSpacing, browY, 0, -identity.brows.tilt);
  const rightBrow = at(eyeSpacing, browY, 0, identity.brows.tilt);
  const hairProfile = createCharacterHairProfile(identity);
  const hairX = hairProfile?.outline.map(([x]) => x * radii[0]) ?? [];
  const hairY = hairProfile?.outline.map(([, y]) => y * radii[1]) ?? [];
  const hairExpansion = hairProfile === null
    ? 0
    : hairProfile.spatial.kind === 'head-shell'
      ? Math.min(...radii) * (
        hairProfile.spatial.radialClearance
        + hairProfile.spatial.thickness
        + hairProfile.spatial.crownLift
        + hairProfile.spatial.ridgeWave.amplitude
      )
      : hairProfile.spatial.kind === 'surface-cluster'
        ? Math.min(...radii) * (
          hairProfile.spatial.radialClearance + hairProfile.spatial.tufts.height
        )
        : Math.min(radii[0], radii[2]) * hairProfile.spatial.radialClearance
          + radii[1] * hairProfile.spatial.peakHeight;
  const localMinimum: Point3 = [
    Math.min(surfaceBounds.minimum[0] - hairExpansion, ...hairX),
    Math.min(surfaceBounds.minimum[1] - hairExpansion, ...hairY),
    surfaceBounds.minimum[2] - hairExpansion,
  ];
  const localMaximum: Point3 = [
    Math.max(surfaceBounds.maximum[0] + hairExpansion, ...hairX),
    Math.max(surfaceBounds.maximum[1] + hairExpansion, ...hairY),
    surfaceBounds.maximum[2] + hairExpansion,
  ];
  return Object.freeze({
    shape,
    surfaceBounds,
    center,
    bounds: Object.freeze({
      minimum: [localMinimum[0], localMinimum[1] + center[1], localMinimum[2]] as const,
      maximum: [localMaximum[0], localMaximum[1] + center[1], localMaximum[2]] as const,
    }),
    eyeRadius,
    eyeAnchors: [leftEye, rightEye] as const,
    mouthAnchor,
    noseAnchor,
    browAnchors: [leftBrow, rightBrow] as const,
    sockets: Object.freeze({
      floor: [0, 0, 0] as const,
      center,
      crown: [0, center[1] + surfaceBounds.maximum[1], 0] as const,
      face: [0, center[1], surfaceBounds.maximum[2]] as const,
    }),
    at,
  });
}
