import type {
  ArtDirectionId,
  InkedSolidVisualizationId,
  MediumId,
} from '../../../../src/index.js';

export const PAPER_CIRCUIT_RENDER_STYLE_IDS = Object.freeze([
  'graphite',
  'ink',
  'oil',
  'sepia-graphite',
  'paper-collage',
  'paper-diorama',
] as const);

export type PaperCircuitRenderStyleId = typeof PAPER_CIRCUIT_RENDER_STYLE_IDS[number];

export type PaperCircuitRenderStyle = Readonly<{
  id: PaperCircuitRenderStyleId;
  label: string;
  medium: MediumId;
  visualization: InkedSolidVisualizationId;
  artDirection: ArtDirectionId | null;
  viewMarks: boolean;
}>;

function style(value: PaperCircuitRenderStyle): PaperCircuitRenderStyle {
  return Object.freeze(value);
}

export const PAPER_CIRCUIT_RENDER_STYLES: Readonly<
  Record<PaperCircuitRenderStyleId, PaperCircuitRenderStyle>
> = Object.freeze({
  graphite: style({
    id: 'graphite',
    label: 'Graphite',
    medium: 'graphite',
    visualization: 'natural',
    artDirection: null,
    viewMarks: true,
  }),
  ink: style({
    id: 'ink',
    label: 'Ink',
    medium: 'ink',
    visualization: 'natural',
    artDirection: null,
    viewMarks: true,
  }),
  oil: style({
    id: 'oil',
    label: 'Oil',
    medium: 'oil',
    visualization: 'natural',
    artDirection: null,
    viewMarks: true,
  }),
  'sepia-graphite': style({
    id: 'sepia-graphite',
    label: 'Sepia study',
    medium: 'graphite',
    visualization: 'sepia-graphite',
    artDirection: null,
    viewMarks: true,
  }),
  'paper-collage': style({
    id: 'paper-collage',
    label: 'Paper cut',
    medium: 'ink',
    visualization: 'paper-collage',
    artDirection: 'cut-paper',
    viewMarks: true,
  }),
  'paper-diorama': style({
    id: 'paper-diorama',
    label: 'Aged diorama',
    medium: 'ink',
    visualization: 'aged-paper-diorama',
    artDirection: 'aged-paper',
    viewMarks: false,
  }),
});

export const DEFAULT_PAPER_CIRCUIT_RENDER_STYLE: PaperCircuitRenderStyleId = 'graphite';

export function isPaperCircuitRenderStyle(value: string): value is PaperCircuitRenderStyleId {
  return PAPER_CIRCUIT_RENDER_STYLE_IDS.some((styleId) => styleId === value);
}

export function paperCircuitRenderStyleById(
  id: PaperCircuitRenderStyleId,
): PaperCircuitRenderStyle {
  return PAPER_CIRCUIT_RENDER_STYLES[id];
}

export function nextPaperCircuitRenderStyle(
  current: PaperCircuitRenderStyleId,
): PaperCircuitRenderStyleId {
  const currentIndex = PAPER_CIRCUIT_RENDER_STYLE_IDS.indexOf(current);
  return PAPER_CIRCUIT_RENDER_STYLE_IDS[
    (currentIndex + 1) % PAPER_CIRCUIT_RENDER_STYLE_IDS.length
  ] ?? DEFAULT_PAPER_CIRCUIT_RENDER_STYLE;
}
