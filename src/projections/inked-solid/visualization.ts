import { hashString } from '../../core/random.js';

export const INKED_SOLID_VISUALIZATION_IDS = Object.freeze([
  'natural',
  'sepia-graphite',
  'paper-collage',
] as const);

export type InkedSolidVisualizationId = typeof INKED_SOLID_VISUALIZATION_IDS[number];

export type InkedSolidVisualizationPolicy = Readonly<{
  id: InkedSolidVisualizationId;
  label: string;
  colorModel: 'preserve' | 'sepia' | 'collage';
  colorStrength: number;
  contourBoost: number;
  posterizeSteps: number;
  tornEdgeStrength: number;
  tornEdgeScale: number;
  cutShadowStrength: number;
  cutShadowOffset: readonly [x: number, y: number];
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
  posterizeSteps: 0,
  tornEdgeStrength: 0,
  tornEdgeScale: 1,
  cutShadowStrength: 0,
  cutShadowOffset: [0, 0],
});

const SEPIA_GRAPHITE = policy({
  id: 'sepia-graphite',
  label: 'Sepia graphite study',
  colorModel: 'sepia',
  colorStrength: 0.92,
  contourBoost: 0.38,
  posterizeSteps: 0,
  tornEdgeStrength: 0,
  tornEdgeScale: 1,
  cutShadowStrength: 0,
  cutShadowOffset: [0, 0],
});

const PAPER_COLLAGE = policy({
  id: 'paper-collage',
  label: 'Pigment paper collage',
  colorModel: 'collage',
  colorStrength: 1,
  contourBoost: 0.22,
  posterizeSteps: 8,
  tornEdgeStrength: 0.24,
  tornEdgeScale: 3.4,
  cutShadowStrength: 0.5,
  cutShadowOffset: [2.4, -2],
});

export const INKED_SOLID_VISUALIZATIONS: Readonly<
  Record<InkedSolidVisualizationId, InkedSolidVisualizationPolicy>
> = Object.freeze({
  natural: NATURAL,
  'sepia-graphite': SEPIA_GRAPHITE,
  'paper-collage': PAPER_COLLAGE,
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
