import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterNoseProfile = Readonly<{
  radii: readonly [x: number, y: number];
  verticalOffset: number;
}>;

/** Shared human nose anatomy in character world units. */
export function createCharacterNoseProfile(
  identity: CharacterIdentityRecipe,
): CharacterNoseProfile | null {
  if (!identity.nose.present || identity.species === 'cat') return null;
  const radiusX = 3 / 96 + identity.nose.size * 0.5;
  const radiusY = identity.nose.style === 'drop'
    ? 5 / 96 + identity.nose.length * 0.5
    : 3 / 96 + identity.nose.length * 0.375;
  return Object.freeze({
    radii: Object.freeze([radiusX, radiusY] as const),
    verticalOffset: identity.nose.style === 'drop' ? -radiusY * 0.18 : 0,
  });
}
