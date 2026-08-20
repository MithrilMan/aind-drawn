import { INK, PAPER_RGB, type RgbColor } from '../../core/sketch.js';
import type { MediumId } from '../../materials/medium.js';
import type {
  InkedSolidContourPolicy,
  InkedSolidFillPolicy,
  InkedSolidHatchPolicy,
  InkedSolidPaperPolicy,
} from './blueprint.js';

type Unseeded<T> = Omit<T, 'seed'>;

export type InkedSolidMediumDefaults = Readonly<{
  contour: Unseeded<InkedSolidContourPolicy>;
  fill: Omit<InkedSolidFillPolicy, 'seed' | 'texture'>;
  hatching: Unseeded<InkedSolidHatchPolicy> | null;
  paper: Unseeded<InkedSolidPaperPolicy>;
}>;

const BASE_CONTOUR = Object.freeze({
  color: INK,
  width: 1.35,
  opacity: 0.88,
  depthThreshold: 0.012,
  normalThreshold: 0.2,
  jitter: 0.34,
  boilFramesPerSecond: 6,
});

const BASE_HATCH = Object.freeze({
  color: INK,
  scale: 8.5,
  strength: 0.19,
  shadowStart: 0.42,
  crossHatchStart: 0.76,
  lineWidth: 0.065,
  jitter: 0.025,
  boilFramesPerSecond: 5,
});

const BASE_FILL = Object.freeze({
  pigmentStrength: 0.84,
  shadeStrength: 0.24,
  shadeSteps: 4,
  variationStrength: 0.14,
  variationScale: 3.6,
});

const BASE_PAPER = Object.freeze({
  color: PAPER_RGB,
  tintStrength: 0.1,
  grainStrength: 0.025,
});

function projection(
  options: Readonly<{
    contour?: Partial<Unseeded<InkedSolidContourPolicy>>;
    fill?: Partial<Omit<InkedSolidFillPolicy, 'seed' | 'texture'>>;
    hatching?: Partial<Unseeded<InkedSolidHatchPolicy>> | null;
    paper?: Partial<Unseeded<InkedSolidPaperPolicy>>;
  }>,
): InkedSolidMediumDefaults {
  const contour = { ...BASE_CONTOUR, ...options.contour };
  const hatching = options.hatching === null
    ? null
    : { ...BASE_HATCH, ...options.hatching };
  const paper = { ...BASE_PAPER, ...options.paper };
  const freezeColor = (value: RgbColor): RgbColor => Object.freeze([...value] as RgbColor);
  return Object.freeze({
    contour: Object.freeze({ ...contour, color: freezeColor(contour.color) }),
    fill: Object.freeze({ ...BASE_FILL, ...options.fill }),
    hatching: hatching === null
      ? null
      : Object.freeze({ ...hatching, color: freezeColor(hatching.color) }),
    paper: Object.freeze({ ...paper, color: freezeColor(paper.color) }),
  });
}

const MEDIUM_DEFAULTS: Readonly<Record<MediumId, InkedSolidMediumDefaults>> = Object.freeze({
  graphite: projection({
    contour: { width: 1.3, opacity: 0.82, jitter: 0.42 },
    fill: {
      pigmentStrength: 0.64,
      shadeStrength: 0.18,
      shadeSteps: 4,
      variationStrength: 0.24,
      variationScale: 4.2,
    },
    hatching: { strength: 0.22, scale: 8.8, lineWidth: 0.06 },
    paper: { tintStrength: 0.18, grainStrength: 0.035 },
  }),
  ink: projection({
    contour: { width: 1.6, opacity: 0.96, jitter: 0.26 },
    fill: {
      pigmentStrength: 0.9,
      shadeStrength: 0.2,
      shadeSteps: 3,
      variationStrength: 0.1,
      variationScale: 3.2,
    },
    hatching: {
      strength: 0.14,
      scale: 7.4,
      lineWidth: 0.078,
      shadowStart: 0.52,
      crossHatchStart: 0.84,
    },
    paper: { tintStrength: 0.06, grainStrength: 0.012 },
  }),
  watercolor: projection({
    contour: { width: 1.08, opacity: 0.66, jitter: 0.18, normalThreshold: 0.25 },
    fill: {
      pigmentStrength: 0.68,
      shadeStrength: 0.12,
      shadeSteps: 5,
      variationStrength: 0.5,
      variationScale: 1.8,
    },
    hatching: null,
    paper: { tintStrength: 0.13, grainStrength: 0.012 },
  }),
  oil: projection({
    contour: { width: 0.88, opacity: 0.46, jitter: 0.08 },
    fill: {
      pigmentStrength: 0.88,
      shadeStrength: 0.34,
      shadeSteps: 7,
      variationStrength: 0.32,
      variationScale: 4.2,
    },
    hatching: null,
    paper: { tintStrength: 0.01, grainStrength: 0.008 },
  }),
  chalk: projection({
    contour: { width: 1.48, opacity: 0.68, jitter: 0.46 },
    fill: {
      pigmentStrength: 0.72,
      shadeStrength: 0.26,
      shadeSteps: 3,
      variationStrength: 0.25,
      variationScale: 8.2,
    },
    hatching: null,
    paper: { tintStrength: 0.16, grainStrength: 0.045 },
  }),
  marker: projection({
    contour: { width: 1.48, opacity: 0.9, jitter: 0.12 },
    fill: {
      pigmentStrength: 0.82,
      shadeStrength: 0.12,
      shadeSteps: 3,
      variationStrength: 0.14,
      variationScale: 2.4,
    },
    hatching: null,
    paper: { tintStrength: 0.06, grainStrength: 0.01 },
  }),
});

/**
 * Projects the shared raster medium vocabulary into volumetric coverage,
 * surface marks, and contours. Asset families may override values, but they do
 * not define competing medium taxonomies.
 */
export function inkedSolidMediumDefaults(medium: MediumId): InkedSolidMediumDefaults {
  return MEDIUM_DEFAULTS[medium];
}
