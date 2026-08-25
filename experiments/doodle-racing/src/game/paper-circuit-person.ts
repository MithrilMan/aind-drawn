import {
  createCharacterIdentity,
  type CharacterIdentityRecipe,
} from '../../../../src/index.js';

export type PaperCircuitPersonIdentity = CharacterIdentityRecipe & Readonly<{
  species: 'human';
}>;

/** Keeps the experiment's playable cast and crowd inside its human-only rule. */
export function createPaperCircuitPersonIdentity(seed: number): PaperCircuitPersonIdentity {
  return createCharacterIdentity(seed, { species: 'human' }) as PaperCircuitPersonIdentity;
}
