import type { Point } from '../../../core/geometry.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterRoundEarProfile = Readonly<{
  kind: 'round';
  /** Head-local identity units shared by raster and solid projections. */
  center: Point;
  radii: readonly [x: number, y: number];
}>;

/** Shared round-ear anatomy. Adapters only decide how much physical depth to add. */
export function createCharacterRoundEarProfile(
  identity: CharacterIdentityRecipe,
): CharacterRoundEarProfile | null {
  if (identity.ears.style !== 'round') return null;
  return Object.freeze({
    kind: 'round',
    center: Object.freeze([58 / 106, -2 / 106] as const),
    radii: Object.freeze([
      22 / 106 * identity.ears.size,
      27 / 106 * identity.ears.size,
    ] as const),
  });
}
