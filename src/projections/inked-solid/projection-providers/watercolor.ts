import {
  createInkedSolidProjectionProvider,
  fixedMark,
  toneMarks,
} from '../projection-provider.js';

const coverage = Object.freeze({
  black: 1 - (1 - 0.23) ** 4,
  hatch: 1 - (1 - 0.1936) ** 3,
  scribble: 1 - (1 - 0.1806) ** 3,
  stipple: 1 - (1 - 0.165) ** 3,
  light: 1 - (1 - 0.1442) ** 3,
});

const pigment = toneMarks({
  black: { style: 'none', strength: 0, coverage: coverage.black },
  hatch: { style: 'none', strength: 0, coverage: coverage.hatch },
  scribble: { style: 'none', strength: 0, coverage: coverage.scribble },
  stipple: { style: 'none', strength: 0, coverage: coverage.stipple },
  light: { style: 'none', strength: 0, coverage: coverage.light },
});

const glaze = toneMarks({
  black: { style: 'none', strength: 0, coverage: coverage.black * 0.55 },
  hatch: { style: 'none', strength: 0, coverage: coverage.hatch * 0.55 },
  scribble: { style: 'none', strength: 0, coverage: coverage.scribble * 0.55 },
  stipple: { style: 'none', strength: 0, coverage: coverage.stipple * 0.55 },
  light: { style: 'none', strength: 0, coverage: coverage.light * 0.55 },
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
