import type { RadialDeformation } from '../../core/geometry3.js';
import { radialDeformationScale } from '../../core/geometry3.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterHeadShapeField = Readonly<{
  exponent: number;
  deformation: RadialDeformation;
}>;

export function characterHeadShapeField(
  head: CharacterIdentityRecipe['head'],
): CharacterHeadShapeField {
  const shape = head.shape;
  const exponent = shape === 'square' ? 5.5 : shape === 'lump' ? 2.35 : 2.2;
  const verticalTaper = shape === 'pear' ? 0.15 : shape === 'drop' ? -0.15 : 0;
  const equatorBulge = shape === 'lump' ? 0.035 : 0;
  const baseWobble = 0.012 + head.wobble * 0.016;
  const lobeAmplitude = baseWobble + (shape === 'lump' ? 0.052 : 0);
  return Object.freeze({
    exponent,
    deformation: Object.freeze({
      verticalTaper,
      equatorBulge,
      lobeAmplitude,
      lobeCount: shape === 'lump' ? 3 : 4,
      lobePhase: head.phase,
    }),
  });
}

/** Radius of the shared head field in a front-facing semantic XY plane. */
export function characterHeadRadius2d(
  head: CharacterIdentityRecipe['head'],
  angle: number,
): number {
  const field = characterHeadShapeField(head);
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const baseRadius = 1 / Math.pow(
    Math.pow(Math.abs(cosine), field.exponent)
      + Math.pow(Math.abs(sine), field.exponent),
    1 / field.exponent,
  );
  return baseRadius * radialDeformationScale(field.deformation, [cosine, sine, 0]);
}

export function characterEyeCenterY(identity: CharacterIdentityRecipe): number {
  return 0.06 + identity.eyes.verticalOffset;
}

export function characterMouthCenterY(identity: CharacterIdentityRecipe): number {
  return -identity.mouth.verticalOffset * 2;
}
