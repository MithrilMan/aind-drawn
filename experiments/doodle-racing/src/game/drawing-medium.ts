import type { MediumId } from '../../../../src/index.js';

export const PAPER_CIRCUIT_MEDIUM_IDS = Object.freeze([
  'graphite',
  'ink',
  'oil',
] as const satisfies readonly MediumId[]);

export type PaperCircuitMediumId = typeof PAPER_CIRCUIT_MEDIUM_IDS[number];

export const DEFAULT_PAPER_CIRCUIT_MEDIUM: PaperCircuitMediumId = 'graphite';

export function isPaperCircuitMedium(value: string): value is PaperCircuitMediumId {
  return PAPER_CIRCUIT_MEDIUM_IDS.some((medium) => medium === value);
}

export function nextPaperCircuitMedium(current: PaperCircuitMediumId): PaperCircuitMediumId {
  const currentIndex = PAPER_CIRCUIT_MEDIUM_IDS.indexOf(current);
  return PAPER_CIRCUIT_MEDIUM_IDS[(currentIndex + 1) % PAPER_CIRCUIT_MEDIUM_IDS.length]
    ?? DEFAULT_PAPER_CIRCUIT_MEDIUM;
}
