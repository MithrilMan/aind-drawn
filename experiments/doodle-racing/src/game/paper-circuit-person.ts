import {
  createCharacterIdentity,
  type CharacterIdentityOptions,
  type CharacterIdentityRecipe,
} from '../../../../src/index.js';

export type PaperCircuitPersonIdentity = CharacterIdentityRecipe & Readonly<{
  species: 'human';
}>;

/** Keeps the experiment's playable cast and crowd inside its human-only rule. */
export function createPaperCircuitPersonIdentity(
  seed: number,
  options: Omit<CharacterIdentityOptions, 'species'> = {},
): PaperCircuitPersonIdentity {
  return createCharacterIdentity(seed, { ...options, species: 'human' }) as PaperCircuitPersonIdentity;
}
