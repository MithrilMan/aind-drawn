import type { Point } from '../../../core/geometry.js';
import type { CharacterEyeStyle, CharacterIdentityRecipe } from './recipe.js';

export type CharacterEyeProfile = Readonly<{
  style: CharacterEyeStyle;
  field: 'none' | 'sclera' | 'ink' | 'star';
  fieldScale: readonly [width: number, height: number];
  pupilRadius: number;
  pupilWidth: number;
  pupilOffsetY: number;
  glintRadius: number;
  glintOffset: readonly [x: number, y: number];
  strokes: readonly Readonly<{ id: string; points: readonly Point[]; width: number }>[];
}>;

const CHARACTER_REFERENCE_UNITS = 106;

/** Representation-neutral eye radius in the same world units as the head. */
export function characterEyeRadius(identity: CharacterIdentityRecipe): number {
  return Math.min(21, 12 + identity.eyes.size * 6) / CHARACTER_REFERENCE_UNITS;
}

/**
 * Representation-neutral eye construction in eye-radius units.
 * Raster and solid adapters project this profile instead of rerolling ratios.
 */
export function createCharacterEyeProfile(
  identity: CharacterIdentityRecipe,
  style: CharacterEyeStyle,
): CharacterEyeProfile {
  const catWidth = identity.species === 'cat' ? 0.28 : 1;
  const common = {
    style,
    fieldScale: [1, 1.02] as const,
    glintRadius: 0.095,
    glintOffset: [-0.12, 0.14] as const,
    strokes: Object.freeze([]),
  };
  if (style === 'sleepy') {
    return Object.freeze({
      ...common,
      field: 'none',
      pupilRadius: 0.35,
      pupilWidth: 0.35 * catWidth,
      pupilOffsetY: -0.16,
      strokes: Object.freeze([Object.freeze({
        id: 'upper-lid',
        points: Object.freeze([[-1, 0.24], [0, 0.4], [1, 0.24]] as const),
        width: 0.075,
      })]),
    });
  }
  if (style === 'dot') {
    return Object.freeze({
      ...common, field: 'none', pupilRadius: 0.38, pupilWidth: 0.38 * catWidth,
      pupilOffsetY: 0,
    });
  }
  if (style === 'star') {
    return Object.freeze({
      ...common, field: 'star', pupilRadius: 0, pupilWidth: 0, pupilOffsetY: 0,
    });
  }
  if (style === 'void') {
    return Object.freeze({
      ...common, field: 'ink', pupilRadius: 0, pupilWidth: 0, pupilOffsetY: 0,
      glintRadius: 0.16,
      glintOffset: [-0.2, 0.26] as const,
    });
  }
  return Object.freeze({
    ...common, field: 'sclera', pupilRadius: 0.34, pupilWidth: 0.34 * catWidth,
    pupilOffsetY: -0.05,
  });
}
