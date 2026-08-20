import type { RgbColor } from '../../core/sketch.js';
import { INK, PAPER_RGB } from '../../core/sketch.js';
import { SeedTree } from '../../core/random.js';
import type { SolidAssetBlueprint } from '../solid-types.js';

export type InkedSolidContourPolicy = Readonly<{
  color: RgbColor;
  width: number;
  opacity: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidHatchPolicy = Readonly<{
  color: RgbColor;
  scale: number;
  strength: number;
  shadowStart: number;
  crossHatchStart: number;
  lineWidth: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidPaperPolicy = Readonly<{
  color: RgbColor;
  tintStrength: number;
  grainStrength: number;
  seed: number;
}>;

export type InkedSolidBlueprint = Readonly<{
  representation: 'inked-solid';
  id: string;
  kind: string;
  seed: SolidAssetBlueprint['seed'];
  solid: SolidAssetBlueprint;
  contour: InkedSolidContourPolicy;
  hatching: InkedSolidHatchPolicy | null;
  paper: InkedSolidPaperPolicy;
}>;

export type InkedSolidBlueprintOptions = Readonly<{
  contour?: Partial<Omit<InkedSolidContourPolicy, 'seed'>>;
  hatching?: Partial<Omit<InkedSolidHatchPolicy, 'seed'>> | null;
  paper?: Partial<Omit<InkedSolidPaperPolicy, 'seed'>>;
}>;

const DEFAULT_CONTOUR = Object.freeze({
  color: INK,
  width: 1.35,
  opacity: 0.88,
  depthThreshold: 0.012,
  normalThreshold: 0.2,
  jitter: 0.34,
  boilFramesPerSecond: 6,
});

const DEFAULT_HATCH = Object.freeze({
  color: INK,
  scale: 8.5,
  strength: 0.19,
  shadowStart: 0.42,
  crossHatchStart: 0.76,
  lineWidth: 0.065,
  jitter: 0.025,
  boilFramesPerSecond: 5,
});

const DEFAULT_PAPER = Object.freeze({
  color: PAPER_RGB,
  tintStrength: 0.1,
  grainStrength: 0.025,
});

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function positive(name: string, value: number): number {
  if (finite(name, value) <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function unit(name: string, value: number): number {
  if (finite(name, value) < 0 || value > 1) {
    throw new RangeError(`${name} must be between zero and one`);
  }
  return value;
}

function nonNegative(name: string, value: number): number {
  if (finite(name, value) < 0) throw new RangeError(`${name} must not be negative`);
  return value;
}

function color(name: string, value: RgbColor): RgbColor {
  if (value.some((channel) => (
    !Number.isFinite(channel) || channel < 0 || channel > 255
  ))) {
    throw new RangeError(`${name} must contain three channels between zero and 255`);
  }
  return Object.freeze([value[0], value[1], value[2]] as const);
}

/**
 * Adds deterministic hand-drawn rendering policy to an existing solid asset.
 * The wrapped solid blueprint remains the sole owner of semantic geometry,
 * nodes, interactions, sockets, and colliders.
 */
export function createInkedSolidBlueprint(
  solid: SolidAssetBlueprint,
  options: InkedSolidBlueprintOptions = {},
): InkedSolidBlueprint {
  const tree = new SeedTree(solid.seed);
  const contour = { ...DEFAULT_CONTOUR, ...options.contour };
  const paper = { ...DEFAULT_PAPER, ...options.paper };
  const hatch = options.hatching === null
    ? null
    : { ...DEFAULT_HATCH, ...options.hatching };

  if (hatch !== null && hatch.crossHatchStart < hatch.shadowStart) {
    throw new RangeError('hatching.crossHatchStart must not be lower than hatching.shadowStart');
  }

  return Object.freeze({
    representation: 'inked-solid',
    id: `inked:${solid.id}`,
    kind: solid.kind,
    seed: solid.seed,
    solid,
    contour: Object.freeze({
      color: color('contour.color', contour.color),
      width: positive('contour.width', contour.width),
      opacity: unit('contour.opacity', contour.opacity),
      depthThreshold: positive('contour.depthThreshold', contour.depthThreshold),
      normalThreshold: unit('contour.normalThreshold', contour.normalThreshold),
      jitter: nonNegative('contour.jitter', contour.jitter),
      boilFramesPerSecond: nonNegative(
        'contour.boilFramesPerSecond',
        contour.boilFramesPerSecond,
      ),
      seed: tree.seed('inked-solid:contour'),
    }),
    hatching: hatch === null ? null : Object.freeze({
      color: color('hatching.color', hatch.color),
      scale: positive('hatching.scale', hatch.scale),
      strength: unit('hatching.strength', hatch.strength),
      shadowStart: unit('hatching.shadowStart', hatch.shadowStart),
      crossHatchStart: unit('hatching.crossHatchStart', hatch.crossHatchStart),
      lineWidth: unit('hatching.lineWidth', hatch.lineWidth),
      jitter: nonNegative('hatching.jitter', hatch.jitter),
      boilFramesPerSecond: nonNegative(
        'hatching.boilFramesPerSecond',
        hatch.boilFramesPerSecond,
      ),
      seed: tree.seed('inked-solid:hatching'),
    }),
    paper: Object.freeze({
      color: color('paper.color', paper.color),
      tintStrength: unit('paper.tintStrength', paper.tintStrength),
      grainStrength: unit('paper.grainStrength', paper.grainStrength),
      seed: tree.seed('inked-solid:paper'),
    }),
  });
}
