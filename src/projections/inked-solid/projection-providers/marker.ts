import {
  createInkedSolidProjectionProvider,
  fixedMark,
  toneMarks,
} from '../projection-provider.js';

const pigment = toneMarks({
  black: { style: 'marker', strength: 0.72, coverage: 0.56, scale: 10.44, lineWidth: 0.28 },
  hatch: { style: 'marker', strength: 0.6472, coverage: 0.376, scale: 10.44, lineWidth: 0.28 },
  scribble: { style: 'marker', strength: 0.6212, coverage: 0.346, scale: 10.44, lineWidth: 0.28 },
  stipple: { style: 'marker', strength: 0.59, coverage: 0.31, scale: 10.44, lineWidth: 0.28 },
  light: { style: 'marker', strength: 0.5484, coverage: 0.262, scale: 10.44, lineWidth: 0.28 },
});

const tint = toneMarks({
  black: { style: 'marker', strength: 0.72, coverage: 0.34, scale: 10.44, lineWidth: 0.28 },
  hatch: { style: 'marker', strength: 0.6472, coverage: 0.3064, scale: 10.44, lineWidth: 0.28 },
  scribble: { style: 'marker', strength: 0.6212, coverage: 0.2944, scale: 10.44, lineWidth: 0.28 },
  stipple: { style: 'marker', strength: 0.59, coverage: 0.28, scale: 10.44, lineWidth: 0.28 },
  light: { style: 'marker', strength: 0.5484, coverage: 0.22, scale: 10.44, lineWidth: 0.28 },
});

const glaze = toneMarks({
  black: { style: 'marker', strength: 0.72, coverage: 0.24, scale: 10.44, lineWidth: 0.28 },
  hatch: { style: 'marker', strength: 0.6472, coverage: 0.24, scale: 10.44, lineWidth: 0.28 },
  scribble: { style: 'marker', strength: 0.6212, coverage: 0.24, scale: 10.44, lineWidth: 0.28 },
  stipple: { style: 'marker', strength: 0.59, coverage: 0.24, scale: 10.44, lineWidth: 0.28 },
  light: { style: 'marker', strength: 0.5484, coverage: 0.24, scale: 10.44, lineWidth: 0.28 },
});

export const markerProjectionProvider = createInkedSolidProjectionProvider({
  contour: { width: 1.48, opacity: 0.9, jitter: 0.12, wander: 0.95 },
  deposition: {
    pigmentStrength: 0.82,
    planeSeparationStrength: 0.12,
    planeSeparationSteps: 3,
    variationStrength: 0.14,
    variationScale: 2.4,
  },
  viewMark: {
    style: 'marker', strength: 0.74, coverage: 0.5, scale: 5.8, lineWidth: 0.12,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint,
    flat: pigment,
    ink: fixedMark({ style: 'solid', strength: 0.94, coverage: 0.98, lineWidth: 0.1416 }),
    wash: fixedMark({ style: 'wash', scale: 4.06, strength: 0.5, coverage: 0.34 }),
    glaze,
  }),
  paper: { grainStrength: 0.01 },
});
