import {
  SeedTree,
  createAssetExtensionIdentity,
  normalizeSeed,
  type AssetExtensionIdentity,
  type AssetIdentityEnvelope,
  type CharacterIdentityRecipe,
  type JsonObject,
  type Point3,
  type RgbColor,
  type Seed,
} from '../../../../../src/index.js';
import type { PaperCircuitPersonIdentity } from '../../game/characters/shared/paper-circuit-person.js';

export const PAPER_CIRCUIT_HELMET_EXTENSION_ID = 'doodle-racing/paper-circuit-helmet';
export const PAPER_CIRCUIT_HELMET_FAMILY = 'paper-circuit-helmet';

export type PaperCircuitHelmetItemIdentity = AssetIdentityEnvelope<
  typeof PAPER_CIRCUIT_HELMET_FAMILY
> & JsonObject & Readonly<{
  model: 'rally-bubble';
  shell: Readonly<{
    radii: Point3;
    exponent: number;
    thickness: number;
    bottomY: number;
    faceOpening: Readonly<{
      halfWidth: number;
      bottomY: number;
      topY: number;
      cornerRadius: number;
    }>;
  }>;
  visor: Readonly<{
    edgeOverlap: number;
    clearance: number;
    thickness: number;
    openAngle: number;
  }>;
  palette: Readonly<{
    shell: RgbColor;
    visor: RgbColor;
  }>;
}>;

export type PaperCircuitHelmetData = JsonObject & Readonly<{
  item: PaperCircuitHelmetItemIdentity;
  fitClearance: number;
  transitionSeconds: number;
}>;

export type PaperCircuitHelmetIdentity = AssetExtensionIdentity<
  typeof PAPER_CIRCUIT_HELMET_EXTENSION_ID,
  PaperCircuitHelmetData
>;

export type PaperCircuitHelmetItemOptions = Readonly<{
  shellColor?: RgbColor;
  visorColor?: RgbColor;
}>;

export type PaperCircuitHelmetOptions = PaperCircuitHelmetItemOptions & Readonly<{
  item?: PaperCircuitHelmetItemIdentity;
  fitClearance?: number;
  transitionSeconds?: number;
}>;

const SHELL_COLORS: readonly RgbColor[] = Object.freeze([
  Object.freeze([206, 67, 48] as const),
  Object.freeze([42, 112, 142] as const),
  Object.freeze([226, 166, 48] as const),
  Object.freeze([63, 69, 76] as const),
]);

function finiteRange(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

export function createPaperCircuitHelmetItemIdentity(
  seed: Seed,
  options: PaperCircuitHelmetItemOptions = {},
): PaperCircuitHelmetItemIdentity {
  const normalizedSeed = normalizeSeed(seed);
  const random = new SeedTree(normalizedSeed).random(`${PAPER_CIRCUIT_HELMET_FAMILY}:identity`);
  return Object.freeze({
    schemaVersion: 1,
    family: PAPER_CIRCUIT_HELMET_FAMILY,
    seed: normalizedSeed,
    model: 'rally-bubble',
    shell: Object.freeze({
      radii: Object.freeze([0.66, 0.61, 0.58] as const),
      exponent: 3.35,
      thickness: 0.07,
      bottomY: -0.42,
      faceOpening: Object.freeze({
        halfWidth: 0.78,
        bottomY: -0.42,
        topY: 0.5,
        cornerRadius: 0.14,
      }),
    }),
    visor: Object.freeze({
      edgeOverlap: 0.035,
      clearance: 0.055,
      thickness: 0.018,
      openAngle: 0.94,
    }),
    palette: Object.freeze({
      shell: options.shellColor ?? random.pick(SHELL_COLORS),
      visor: options.visorColor ?? Object.freeze([53, 126, 151] as const),
    }),
  });
}

export function createPaperCircuitHelmetIdentity(
  person: PaperCircuitPersonIdentity,
  options: PaperCircuitHelmetOptions = {},
): PaperCircuitHelmetIdentity {
  const item = options.item ?? createPaperCircuitHelmetItemIdentity(person.seed, options);
  return createAssetExtensionIdentity({
    id: PAPER_CIRCUIT_HELMET_EXTENSION_ID,
    instanceId: 'rider',
    seed: person.seed,
    data: Object.freeze({
      item,
      fitClearance: finiteRange('Helmet fitClearance', options.fitClearance ?? 0.09, 0.02, 0.3),
      transitionSeconds: finiteRange(
        'Helmet visor transitionSeconds',
        options.transitionSeconds ?? 0.38,
        0.12,
        1.5,
      ),
    }),
  });
}

function isColor(value: unknown): value is RgbColor {
  return Array.isArray(value)
    && value.length === 3
    && value.every((channel) => typeof channel === 'number' && Number.isFinite(channel));
}

export function readPaperCircuitHelmetIdentity(
  extension: AssetExtensionIdentity,
  person: CharacterIdentityRecipe,
): PaperCircuitHelmetIdentity {
  if (person.species !== 'human') {
    throw new RangeError('The Paper Circuit helmet can only extend human characters');
  }
  if (extension.id !== PAPER_CIRCUIT_HELMET_EXTENSION_ID) {
    throw new RangeError(`Expected ${PAPER_CIRCUIT_HELMET_EXTENSION_ID}`);
  }
  const data = extension.data as Partial<PaperCircuitHelmetData>;
  const item = data.item as Partial<PaperCircuitHelmetItemIdentity> | undefined;
  if (
    item?.family !== PAPER_CIRCUIT_HELMET_FAMILY
    || item.model !== 'rally-bubble'
    || item.shell === undefined
    || item.visor === undefined
    || !isColor(item.palette?.shell)
    || !isColor(item.palette.visor)
    || typeof data.fitClearance !== 'number'
    || typeof data.transitionSeconds !== 'number'
  ) {
    throw new RangeError('Paper Circuit helmet identity is incomplete');
  }
  return extension as PaperCircuitHelmetIdentity;
}
