import {
  createInkedSolidProjectionProvider,
  fixedMark,
  valueMarks,
} from '../projection-provider.js';

const pigment = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'bristle', strength: 0.7, coverage: 0.98, scale: 6.384 },
  mid: { style: 'bristle', strength: 0.82, coverage: 0.98, scale: 7.296 },
  dark: { style: 'bristle', strength: 0.88, coverage: 0.985, scale: 7.8 },
  solid: { style: 'bristle', strength: 0.94, coverage: 0.99, scale: 8.36, lineWidth: 0.087 },
});

const glaze = valueMarks({
  paper: { style: 'none', strength: 0, coverage: 0 },
  light: { style: 'bristle', strength: 0.7, coverage: 0.78, scale: 6.384 },
  mid: { style: 'bristle', strength: 0.82, coverage: 0.78, scale: 7.296 },
  dark: { style: 'bristle', strength: 0.88, coverage: 0.78, scale: 7.8 },
  solid: { style: 'bristle', strength: 0.94, coverage: 0.78, scale: 8.36, lineWidth: 0.087 },
});

export const oilProjectionProvider = createInkedSolidProjectionProvider({
  contour: {
    width: 1.34, opacity: 0.58, echoOpacity: 0.14, jitter: 0.08, wander: 1.3,
  },
  deposition: {
    pigmentStrength: 0.88,
    planeSeparationStrength: 0.34,
    planeSeparationSteps: 7,
    variationStrength: 0.32,
    variationScale: 4.2,
  },
  viewMark: {
    style: 'bristle', strength: 0.82, coverage: 0.95, scale: 15.2, lineWidth: 0.075,
  },
  applications: Object.freeze({
    paper: fixedMark({ style: 'none', strength: 0, coverage: 0 }),
    pigment,
    tint: pigment,
    flat: pigment,
    ink: fixedMark({ style: 'solid', strength: 0.94, coverage: 0.97, lineWidth: 0.0885 }),
    wash: fixedMark({ style: 'wash', scale: 10.944, strength: 0.58, coverage: 0.62 }),
    glaze,
  }),
  paper: { grainStrength: 0.008 },
});
