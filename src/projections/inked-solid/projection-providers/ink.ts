import {
  createInkedSolidProjectionProvider,
  fixedMark,
  toneMarks,
} from '../projection-provider.js';

const pigment = toneMarks({
  black: { style: 'hatch', strength: 0.2, coverage: 0.9 },
  hatch: { style: 'hatch', strength: 0.2, coverage: 0.6928 },
  scribble: { style: 'hatch', strength: 0.2, coverage: 0.6188 },
  stipple: { style: 'none', strength: 0, coverage: 0.53 },
  light: { style: 'none', strength: 0, coverage: 0.4116 },
});

const glaze = toneMarks({
  black: { style: 'hatch', strength: 0.2, coverage: 0.18 },
  hatch: { style: 'hatch', strength: 0.2, coverage: 0.18 },
  scribble: { style: 'hatch', strength: 0.2, coverage: 0.18 },
  stipple: { style: 'none', strength: 0, coverage: 0.18 },
  light: { style: 'none', strength: 0, coverage: 0.18 },
});

export const inkProjectionProvider = createInkedSolidProjectionProvider({
  contour: { width: 1.6, opacity: 0.96, jitter: 0.26, wander: 1.15 },
  deposition: {
    pigmentStrength: 0.9,
    planeSeparationStrength: 0.12,
    planeSeparationSteps: 3,
    variationStrength: 0.1,
    variationScale: 3.2,
  },
  viewMark: {
    style: 'hatch', strength: 0.2, coverage: 0.34, scale: 12.5, lineWidth: 0.045,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint: fixedMark({ style: 'hatch', strength: 0.22, coverage: 0.26 }),
    flat: pigment,
    ink: fixedMark({ style: 'solid', strength: 0.96, coverage: 0.98, lineWidth: 0.0585 }),
    wash: fixedMark({ style: 'wash', scale: 8.75, strength: 0.44, coverage: 0.3 }),
    glaze,
  }),
  paper: { grainStrength: 0.012 },
});
