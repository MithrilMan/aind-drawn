import { INK, PAPER_RGB, type RgbColor } from '../../core/sketch.js';
import type { SolidDrawingApplication, SolidDrawingMaterialSpec } from '../../materials/finish.js';
import type {
  InkedSolidContourPolicy,
  InkedSolidDepositionPolicy,
  InkedSolidMarkStyle,
  InkedSolidPaperPolicy,
} from './blueprint.js';

type Unseeded<T> = Omit<T, 'seed'>;

export type InkedSolidViewMarkDefaults = Readonly<{
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
}>;

export type InkedSolidViewMarkProjector = (
  drawing: SolidDrawingMaterialSpec,
) => InkedSolidViewMarkDefaults;

export type InkedSolidMediumDefaults = Readonly<{
  contour: Unseeded<InkedSolidContourPolicy>;
  deposition: Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>;
  viewMark: InkedSolidViewMarkProjector;
  paper: Unseeded<InkedSolidPaperPolicy>;
}>;

export type InkedSolidViewMarkOverride = Partial<InkedSolidViewMarkDefaults>;
export type InkedSolidApplicationProjector = (
  base: InkedSolidViewMarkDefaults,
  tone: SolidDrawingMaterialSpec['tone'],
) => InkedSolidViewMarkDefaults;

export type InkedSolidProjectionProviderOptions = Readonly<{
  contour?: Partial<Unseeded<InkedSolidContourPolicy>>;
  deposition?: Partial<Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>>;
  viewMark?: Partial<InkedSolidViewMarkDefaults>;
  applications: Readonly<Record<SolidDrawingApplication, InkedSolidApplicationProjector>>;
  paper?: Partial<Unseeded<InkedSolidPaperPolicy>>;
}>;

const BASE_CONTOUR = Object.freeze({
  color: INK,
  width: 1.35,
  opacity: 0.88,
  echoOpacity: 0.18,
  ghostOpacity: 0.12,
  ghostSpread: 2.15,
  granulation: 0.18,
  wander: 0.82,
  depthThreshold: 0.012,
  normalThreshold: 0.2,
  jitter: 0.34,
  boilFramesPerSecond: 6,
});

const BASE_MARK: InkedSolidViewMarkDefaults = Object.freeze({
  style: 'hatch',
  scale: 8.5,
  strength: 0.24,
  coverage: 0.18,
  lineWidth: 0.065,
});

const BASE_DEPOSITION = Object.freeze({
  pigmentStrength: 0.84,
  planeSeparationStrength: 0.24,
  planeSeparationSteps: 4,
  variationStrength: 0.14,
  variationScale: 3.6,
});

const BASE_PAPER = Object.freeze({
  color: PAPER_RGB,
  grainStrength: 0.025,
});

function freezeColor(value: RgbColor): RgbColor {
  return Object.freeze([...value] as RgbColor);
}

export function fixedMark(
  override: InkedSolidViewMarkOverride,
): InkedSolidApplicationProjector {
  return (base) => Object.freeze({ ...base, ...override });
}

export function toneMarks(
  overrides: Readonly<Record<SolidDrawingMaterialSpec['tone'], InkedSolidViewMarkOverride>>,
): InkedSolidApplicationProjector {
  return (base, tone) => Object.freeze({ ...base, ...overrides[tone] });
}

export function createInkedSolidProjectionProvider(
  options: InkedSolidProjectionProviderOptions,
): InkedSolidMediumDefaults {
  const contour = { ...BASE_CONTOUR, ...options.contour };
  const paper = { ...BASE_PAPER, ...options.paper };
  const baseMark = Object.freeze({ ...BASE_MARK, ...options.viewMark });
  return Object.freeze({
    contour: Object.freeze({ ...contour, color: freezeColor(contour.color) }),
    deposition: Object.freeze({ ...BASE_DEPOSITION, ...options.deposition }),
    viewMark: (drawing) => options.applications[drawing.application](baseMark, drawing.tone),
    paper: Object.freeze({ ...paper, color: freezeColor(paper.color) }),
  });
}
