import {
  createInkedSolidProjectionProvider,
  fixedMark,
  valueMarks,
} from '../projection-provider.js';

const pigment = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'stipple', strength: 0.4228, coverage: 0.29, scale: 9.03 },
  mid: { style: 'stipple', strength: 0.5824, coverage: 0.48 },
  dark: { style: 'stipple', strength: 0.64, coverage: 0.55, scale: 11 },
  solid: { style: 'stipple', strength: 0.7, coverage: 0.62, scale: 12.18 },
});

const glaze = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'stipple', strength: 0.4228, coverage: 0.2156, scale: 9.03 },
  mid: { style: 'stipple', strength: 0.5824, coverage: 0.24 },
  dark: { style: 'stipple', strength: 0.64, coverage: 0.24, scale: 11 },
  solid: { style: 'stipple', strength: 0.7, coverage: 0.24, scale: 12.18 },
});

export const chalkProjectionProvider = createInkedSolidProjectionProvider({
  contour: { width: 1.48, opacity: 0.68, jitter: 0.46, wander: 1.95 },
  deposition: {
    pigmentStrength: 0.72,
    planeSeparationStrength: 0.26,
    planeSeparationSteps: 3,
    variationStrength: 0.25,
    variationScale: 8.2,
  },
  viewMark: {
    style: 'stipple', strength: 0.68, coverage: 0.28, scale: 10.5, lineWidth: 0.08,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint: pigment,
    flat: pigment,
    ink: fixedMark({ style: 'solid', strength: 0.82, coverage: 0.94, lineWidth: 0.1 }),
    wash: fixedMark({ style: 'wash', scale: 7.35, strength: 0.48, coverage: 0.3 }),
    glaze,
  }),
  paper: { grainStrength: 0.045 },
});
