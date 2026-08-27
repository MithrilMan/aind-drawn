import { hashString } from '../../core/random.js';

export const INKED_SOLID_VISUALIZATION_IDS = Object.freeze([
  'natural',
  'sepia-graphite',
  'paper-collage',
  'aged-paper-diorama',
] as const);

export type InkedSolidVisualizationId = typeof INKED_SOLID_VISUALIZATION_IDS[number];

export type InkedSolidVisualizationPolicy = Readonly<{
  id: InkedSolidVisualizationId;
  label: string;
  colorModel: 'preserve' | 'sepia' | 'collage' | 'diorama';
  colorStrength: number;
  contourBoost: number;
  contourWidthScale: number;
  creaseContourStrength: number;
  ownerContourStrength: number;
  secondaryContourStrength: number;
  posterizeSteps: number;
  surfaceFiberStrength: number;
  planeToneStrength: number;
  tornEdgeStrength: number;
  tornEdgeScale: number;
  cutShadowStrength: number;
  cutShadowOffset: readonly [x: number, y: number];
  cutShadowSoftness: number;
  seed: number;
}>;

function policy(
  value: Omit<InkedSolidVisualizationPolicy, 'seed'>,
): InkedSolidVisualizationPolicy {
  return Object.freeze({
    ...value,
    cutShadowOffset: Object.freeze([...value.cutShadowOffset] as [number, number]),
    seed: hashString(`inked-solid:visualization:${value.id}`),
  });
}

const NATURAL = policy({
  id: 'natural',
  label: 'Natural medium',
  colorModel: 'preserve',
  colorStrength: 0,
  contourBoost: 0,
  contourWidthScale: 1,
  creaseContourStrength: 1,
  ownerContourStrength: 1,
  secondaryContourStrength: 1,
  posterizeSteps: 0,
  surfaceFiberStrength: 0,
  planeToneStrength: 0,
  tornEdgeStrength: 0,
  tornEdgeScale: 1,
  cutShadowStrength: 0,
  cutShadowOffset: [0, 0],
  cutShadowSoftness: 1,
});

const SEPIA_GRAPHITE = policy({
  id: 'sepia-graphite',
  label: 'Sepia graphite study',
  colorModel: 'sepia',
  colorStrength: 0.92,
  contourBoost: 0.38,
  contourWidthScale: 1,
  creaseContourStrength: 1,
  ownerContourStrength: 1,
  secondaryContourStrength: 1,
  posterizeSteps: 0,
  surfaceFiberStrength: 0,
  planeToneStrength: 0,
  tornEdgeStrength: 0,
  tornEdgeScale: 1,
  cutShadowStrength: 0,
  cutShadowOffset: [0, 0],
  cutShadowSoftness: 1,
});

const PAPER_COLLAGE = policy({
  id: 'paper-collage',
  label: 'Clean paper cut',
  colorModel: 'collage',
  colorStrength: 1,
  contourBoost: 0.04,
  contourWidthScale: 0.52,
  creaseContourStrength: 0.46,
  ownerContourStrength: 0.3,
  secondaryContourStrength: 0.08,
  posterizeSteps: 12,
  surfaceFiberStrength: 0.18,
  planeToneStrength: 0.42,
  tornEdgeStrength: 0.24,
  tornEdgeScale: 3.8,
  cutShadowStrength: 0.52,
  cutShadowOffset: [3, -3.2],
  cutShadowSoftness: 1.8,
});

const AGED_PAPER_DIORAMA = policy({
  id: 'aged-paper-diorama',
  label: 'Aged paper diorama',
  colorModel: 'diorama',
  colorStrength: 1,
  contourBoost: 0.02,
  contourWidthScale: 0.48,
  creaseContourStrength: 0.38,
  ownerContourStrength: 0.24,
  secondaryContourStrength: 0.025,
  posterizeSteps: 16,
  surfaceFiberStrength: 0.4,
  planeToneStrength: 0.58,
  tornEdgeStrength: 0.32,
  tornEdgeScale: 6.2,
  cutShadowStrength: 0.82,
  cutShadowOffset: [3.6, -4.2],
  cutShadowSoftness: 2.35,
});

export const INKED_SOLID_VISUALIZATIONS: Readonly<
  Record<InkedSolidVisualizationId, InkedSolidVisualizationPolicy>
> = Object.freeze({
  natural: NATURAL,
  'sepia-graphite': SEPIA_GRAPHITE,
  'paper-collage': PAPER_COLLAGE,
  'aged-paper-diorama': AGED_PAPER_DIORAMA,
});

/**
 * Resolves scene-wide post-composition policy. This is deliberately separate
 * from MediumId (pigment mechanics) and ArtDirection (semantic appearance).
 */
export function inkedSolidVisualizationById(
  id: InkedSolidVisualizationId,
): InkedSolidVisualizationPolicy {
  const visualization = (
    INKED_SOLID_VISUALIZATIONS as Readonly<Record<string, InkedSolidVisualizationPolicy>>
  )[id];
  if (visualization === undefined) throw new RangeError(`Unknown inked-solid visualization ${id}`);
  return visualization;
}
