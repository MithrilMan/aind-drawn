import {
  createInkedSolidProjectionProvider,
  fixedMark,
  valueMarks,
} from '../projection-provider.js';

const coverage = Object.freeze({
  paper: 0,
  light: 1 - (1 - 0.1442) ** 3,
  mid: 1 - (1 - 0.1936) ** 3,
  dark: 1 - (1 - 0.21) ** 4,
  solid: 1 - (1 - 0.23) ** 4,
});

const pigment = valueMarks({
  paper: { style: 'none', strength: 0, coverage: coverage.paper },
  light: { style: 'none', strength: 0, coverage: coverage.light },
  mid: { style: 'none', strength: 0, coverage: coverage.mid },
  dark: { style: 'none', strength: 0, coverage: coverage.dark },
  solid: { style: 'none', strength: 0, coverage: coverage.solid },
});

const glaze = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'none', strength: 0, coverage: coverage.light * 0.55 },
  mid: { style: 'none', strength: 0, coverage: coverage.mid * 0.55 },
  dark: { style: 'none', strength: 0, coverage: coverage.dark * 0.55 },
  solid: { style: 'none', strength: 0, coverage: coverage.solid * 0.55 },
});

export const watercolorProjectionProvider = createInkedSolidProjectionProvider({
  contour: {
    width: 1.08, opacity: 0.66, jitter: 0.18, wander: 1.5, normalThreshold: 0.08,
  },
  deposition: {
    pigmentStrength: 0.68,
    planeSeparationStrength: 0.12,
    planeSeparationSteps: 5,
    variationStrength: 0.5,
    variationScale: 1.8,
  },
  viewMark: {
    style: 'none', strength: 0, coverage: 0.38, scale: 4.2, lineWidth: 0.08,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint: fixedMark({ style: 'none', strength: 0, coverage: 1 - (1 - 0.14) ** 2 }),
    flat: pigment,
    ink: fixedMark({ style: 'solid', strength: 0.72, coverage: 0.94, lineWidth: 0.092 }),
    wash: fixedMark({ style: 'wash', scale: 2.94, strength: 0.46, coverage: 0.32 }),
    glaze,
  }),
  paper: { grainStrength: 0.012 },
});
