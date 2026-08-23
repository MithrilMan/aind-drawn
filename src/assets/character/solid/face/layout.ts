import {
  boundsOfSuperellipsoid,
  moveOnSurface,
  pointOnSuperellipsoid,
  type Bounds3,
  type Point3,
  type SurfaceAnchor,
  type Superellipsoid,
} from '../../../../core/geometry3.js';
import { clamp } from '../../../../core/geometry.js';
import {
  characterEyeCenterY,
  characterHeadShapeField,
  characterMouthCenterY,
} from '../../identity/head-shape.js';
import { createCharacterHairProfile } from '../../identity/hair-profile.js';
import { characterEyeRadius } from '../../identity/eye-profile.js';
import { createCharacterFacialHairProfile } from '../../identity/facial-hair-profile.js';
import { createCharacterEyewearProfile } from '../../identity/accessory-profile.js';
import { createCharacterRoundEarProfile } from '../../identity/ear-profile.js';
import type { SolidFaceRecipe } from './recipe.js';
import type { Pose3, SolidSocketDefinition } from '../../../../contracts/solid-asset.js';

export type SolidFaceSourceRecipe = SolidFaceRecipe;

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
  sockets: readonly SolidSocketDefinition[];
  at: (x: number, y: number, proud?: number, roll?: number) => SurfaceAnchor;
}>;

function pose(position: Point3): Pose3 {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
}

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
  const eyeRadius = characterEyeRadius(identity);
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
  const facialHairProfile = createCharacterFacialHairProfile(identity);
  const eyewearProfile = createCharacterEyewearProfile(identity);
  const roundEarProfile = createCharacterRoundEarProfile(identity);
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
  const facialHairOutlines = facialHairProfile === null
    ? []
    : [facialHairProfile.beard.outline, ...facialHairProfile.components.map(({ outline }) => outline)];
  const facialHairX = facialHairOutlines.flatMap((outline) => (
    outline.map(([x]) => x * radii[0])
  ));
  const facialHairY = facialHairOutlines.flatMap((outline) => (
    outline.map(([, y]) => y * radii[1])
  ));
  const facialHairDepth = facialHairProfile === null
    ? 0
    : radii[2] * Math.max(
      facialHairProfile.beard.spatial.depth,
      ...facialHairProfile.components.map(({ spatial }) => spatial.radii[2] * 1.2),
    );
  const earExtentX = identity.ears.style === 'none'
    ? 0
    : roundEarProfile === null
      ? radii[0] * 0.86
      : roundEarProfile.center[0] + roundEarProfile.radii[0];
  const eyewearExtentX = eyewearProfile === null
    ? 0
    : radii[0] * Math.max(
      1.04,
      identity.eyes.spacing + eyewearProfile.lensHalfSize[0],
    );
  const eyewearMinimumZ = eyewearProfile === null
    ? surfaceBounds.minimum[2]
    : -radii[2] * eyewearProfile.spatial.rearReach;
  const eyewearMaximumZ = eyewearProfile === null
    ? surfaceBounds.maximum[2]
    : surfaceBounds.maximum[2] + eyeRadius * 1.35;
  const localMinimum: Point3 = [
    Math.min(surfaceBounds.minimum[0] - hairExpansion, ...hairX, ...facialHairX, -earExtentX, -eyewearExtentX),
    Math.min(surfaceBounds.minimum[1] - hairExpansion, ...hairY, ...facialHairY),
    Math.min(surfaceBounds.minimum[2] - hairExpansion, eyewearMinimumZ),
  ];
  const localMaximum: Point3 = [
    Math.max(surfaceBounds.maximum[0] + hairExpansion, ...hairX, ...facialHairX, earExtentX, eyewearExtentX),
    Math.max(surfaceBounds.maximum[1] + hairExpansion, ...hairY, ...facialHairY),
    Math.max(surfaceBounds.maximum[2] + hairExpansion + facialHairDepth, eyewearMaximumZ),
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
    sockets: Object.freeze([
      Object.freeze({ id: 'floor', node: 'head', localPose: pose([0, -center[1], 0] as const) }),
      Object.freeze({ id: 'center', node: 'head', localPose: pose([0, 0, 0] as const) }),
      Object.freeze({
        id: 'crown', node: 'head',
        localPose: pose([0, surfaceBounds.maximum[1], 0] as const),
      }),
      Object.freeze({
        id: 'face', node: 'head',
        localPose: pose([0, 0, surfaceBounds.maximum[2]] as const),
      }),
    ]),
    at,
  });
}
