import {
  createInkedSolidProjectionProvider,
  fixedMark,
  toneMarks,
} from '../projection-provider.js';

const pigment = toneMarks({
  black: { style: 'scribble', scale: 31, strength: 0.72, coverage: 0.68, lineWidth: 0.1092 },
  hatch: { style: 'hatch', strength: 0.4, coverage: 0.06 },
  scribble: { style: 'scribble', strength: 0.42, coverage: 0.05 },
  stipple: { style: 'stipple', scale: 23.56, strength: 0.5, coverage: 0.04 },
  light: { style: 'none', strength: 0, coverage: 0.03 },
});

const tint = toneMarks({
  black: { style: 'scribble', scale: 31, strength: 0.72, coverage: 0.68, lineWidth: 0.1092 },
  hatch: { style: 'crosshatch', strength: 0.4, coverage: 0.12 },
  scribble: { style: 'scribble', strength: 0.45, coverage: 0.08 },
  stipple: { style: 'hatch', strength: 0.4, coverage: 0.08 },
  light: { style: 'hatch', strength: 0.4, coverage: 0.08 },
});

export const graphiteProjectionProvider = createInkedSolidProjectionProvider({
  contour: {
    width: 1.82,
    opacity: 0.9,
    echoOpacity: 0.3,
    ghostOpacity: 0.22,
    ghostSpread: 2.55,
    granulation: 0.3,
    wander: 2.8,
    jitter: 0.66,
  },
  deposition: {
    pigmentStrength: 0.38,
    planeSeparationStrength: 0.52,
    planeSeparationSteps: 4,
    variationStrength: 0.24,
    variationScale: 4.2,
  },
  viewMark: {
    style: 'hatch', strength: 0.4, coverage: 0.06, scale: 12.4, lineWidth: 0.042,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint,
    flat: fixedMark({ style: 'none', strength: 0, coverage: 0.5 }),
    ink: fixedMark({ style: 'solid', strength: 0.92, coverage: 0.94, lineWidth: 0.0609 }),
    wash: fixedMark({ style: 'wash', scale: 8.68, strength: 0.52, coverage: 0.24 }),
    glaze: fixedMark({ style: 'hatch', scale: 8.928, strength: 0.12, coverage: 0.04 }),
  }),
  paper: { grainStrength: 0.035 },
});
