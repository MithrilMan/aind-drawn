import type { Point } from '../../core/geometry.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterTearProfile = Readonly<{
  width: number;
  length: number;
  fallDistance: number;
  attachmentClearanceInEyeRadii: number;
  outline: readonly Point[];
}>;

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

/**
 * Representation-neutral tear proportions in head-radius units. Raster and
 * solid projections decide how the same authored liquid gesture is rendered.
 */
export function createCharacterTearProfile(
  identity: CharacterIdentityRecipe,
): CharacterTearProfile {
  const width = 0.038 + identity.eyes.size * 0.012;
  const length = 0.18 + identity.eyes.size * 0.045;
  return Object.freeze({
    width,
    length,
    fallDistance: length * 0.72,
    // The projections place the top of the drop below the lower eyelid, then
    // add this small semantic breathing room. They must account for their own
    // projected drop height instead of guessing from its centre.
    attachmentClearanceInEyeRadii: 0.08,
    outline: freezePoints([
      [0, length * 0.58],
      [width * 0.72, length * 0.18],
      [width, -length * 0.28],
      [width * 0.46, -length * 0.58],
      [0, -length * 0.7],
      [-width * 0.46, -length * 0.58],
      [-width, -length * 0.28],
      [-width * 0.72, length * 0.18],
    ]),
  });
}
