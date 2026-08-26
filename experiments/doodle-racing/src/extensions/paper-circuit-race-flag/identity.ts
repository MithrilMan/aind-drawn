import {
  SeedTree,
  normalizeSeed,
  type AssetIdentityEnvelope,
  type JsonObject,
  type RgbColor,
} from '../../../../../src/index.js';

export const PAPER_CIRCUIT_RACE_FLAG_FAMILY = 'paper-circuit-race-flag';

export type PaperCircuitRaceFlagIdentity = AssetIdentityEnvelope<
  typeof PAPER_CIRCUIT_RACE_FLAG_FAMILY
> & JsonObject & Readonly<{
  palette: Readonly<{
    cloth: RgbColor;
    mark: RgbColor;
    pole: RgbColor;
  }>;
}>;

export function createPaperCircuitRaceFlagIdentity(seed: number): PaperCircuitRaceFlagIdentity {
  const normalizedSeed = normalizeSeed(seed);
  const random = new SeedTree(normalizedSeed).random(`${PAPER_CIRCUIT_RACE_FLAG_FAMILY}:identity`);
  const greens = Object.freeze<RgbColor[]>([
    Object.freeze([47, 132, 76] as const),
    Object.freeze([38, 151, 91] as const),
    Object.freeze([68, 143, 73] as const),
  ]);
  return Object.freeze({
    schemaVersion: 1,
    family: PAPER_CIRCUIT_RACE_FLAG_FAMILY,
    seed: normalizedSeed,
    palette: Object.freeze({
      cloth: random.pick(greens),
      mark: Object.freeze([239, 225, 191] as const),
      pole: Object.freeze([66, 58, 48] as const),
    }),
  });
}

