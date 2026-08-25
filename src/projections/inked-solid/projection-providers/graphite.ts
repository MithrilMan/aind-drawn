import {
  createInkedSolidProjectionProvider,
  fixedMark,
  valueMarks,
} from '../projection-provider.js';

const pigment = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'none', strength: 0, coverage: 0.03 },
  mid: { style: 'hatch', strength: 0.4, coverage: 0.06 },
  dark: { style: 'scribble', strength: 0.52, coverage: 0.18 },
  solid: { style: 'scribble', scale: 31, strength: 0.72, coverage: 0.68, lineWidth: 0.1352 },
}, {
  quiet: { style: 'none', strength: 0 },
  agitated: { style: 'scribble', strength: 0.42 },
  granular: { style: 'stipple', scale: 23.56, strength: 0.5 },
});

const tint = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'hatch', strength: 0.4, coverage: 0.08 },
  mid: { style: 'crosshatch', strength: 0.4, coverage: 0.12 },
  dark: { style: 'scribble', strength: 0.52, coverage: 0.24 },
  solid: { style: 'scribble', scale: 31, strength: 0.72, coverage: 0.68, lineWidth: 0.1352 },
}, {
  quiet: { style: 'hatch', strength: 0.24 },
  agitated: { style: 'scribble', strength: 0.45 },
  granular: { style: 'stipple', strength: 0.4 },
});

export const graphiteProjectionProvider = createInkedSolidProjectionProvider({
  contour: {
    width: 1.62,
    opacity: 0.9,
    echoOpacity: 0.12,
    ghostOpacity: 0.045,
    ghostSpread: 1.72,
    granulation: 0.3,
    wander: 1.85,
    jitter: 0.42,
  },
  deposition: {
    pigmentStrength: 0.38,
    planeSeparationStrength: 0.52,
    planeSeparationSteps: 4,
    variationStrength: 0.24,
    variationScale: 4.2,
  },
  viewMark: {
    style: 'hatch', strength: 0.46, coverage: 0.07, scale: 12.4, lineWidth: 0.052,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint,
    flat: fixedMark({ style: 'none', strength: 0, coverage: 0.58 }),
    ink: fixedMark({ style: 'solid', strength: 0.92, coverage: 0.94, lineWidth: 0.0609 }),
    wash: fixedMark({ style: 'wash', scale: 8.68, strength: 0.52, coverage: 0.24 }),
    glaze: fixedMark({ style: 'hatch', scale: 8.928, strength: 0.12, coverage: 0.04 }),
  }),
  paper: { grainStrength: 0.035 },
});
