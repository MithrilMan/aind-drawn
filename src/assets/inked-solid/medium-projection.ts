import { INK, PAPER_RGB, type RgbColor } from '../../core/sketch.js';
import type { MediumId, ToneStyle } from '../../materials/medium.js';
import type {
  InkedSolidContourPolicy,
  InkedSolidDepositionPolicy,
  InkedSolidMarkStyle,
  InkedSolidPaperPolicy,
} from './blueprint.js';

type Unseeded<T> = Omit<T, 'seed'>;

export type InkedSolidMediumDefaults = Readonly<{
  contour: Unseeded<InkedSolidContourPolicy>;
  deposition: Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>;
  viewMark: (
    materialRole: string,
    authoredTone?: ToneStyle,
  ) => InkedSolidViewMarkDefaults;
  paper: Unseeded<InkedSolidPaperPolicy>;
}>;

export type InkedSolidViewMarkDefaults = Readonly<{
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
}>;

const BASE_CONTOUR = Object.freeze({
  color: INK,
  width: 1.35,
  opacity: 0.88,
  echoOpacity: 0.18,
  ghostOpacity: 0.12,
  ghostSpread: 2.15,
  granulation: 0.18,
  wander: 0.82,
  depthThreshold: 0.012,
  normalThreshold: 0.2,
  jitter: 0.34,
  boilFramesPerSecond: 6,
});

const BASE_MARK: InkedSolidViewMarkDefaults = Object.freeze({
  style: 'hatch',
  scale: 8.5,
  strength: 0.24,
  coverage: 0.18,
  lineWidth: 0.065,
});

const BASE_DEPOSITION = Object.freeze({
  pigmentStrength: 0.84,
  planeSeparationStrength: 0.24,
  planeSeparationSteps: 4,
  variationStrength: 0.14,
  variationScale: 3.6,
});

const BASE_PAPER = Object.freeze({
  color: PAPER_RGB,
  grainStrength: 0.025,
});

const TONE_DENSITY: Readonly<Record<ToneStyle, number>> = Object.freeze({
  black: 1,
  hatch: 0.72,
  scribble: 0.62,
  stipple: 0.5,
  light: 0.34,
});

function projection(
  medium: MediumId,
  options: Readonly<{
    contour?: Partial<Unseeded<InkedSolidContourPolicy>>;
    deposition?: Partial<Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>>;
    viewMark?: Partial<InkedSolidViewMarkDefaults>;
    paper?: Partial<Unseeded<InkedSolidPaperPolicy>>;
  }>,
): InkedSolidMediumDefaults {
  const contour = { ...BASE_CONTOUR, ...options.contour };
  const paper = { ...BASE_PAPER, ...options.paper };
  const freezeColor = (value: RgbColor): RgbColor => Object.freeze([...value] as RgbColor);
  return Object.freeze({
    contour: Object.freeze({ ...contour, color: freezeColor(contour.color) }),
    deposition: Object.freeze({ ...BASE_DEPOSITION, ...options.deposition }),
    viewMark: (role, authoredTone) => projectViewMark(
      medium,
      { ...BASE_MARK, ...options.viewMark },
      role,
      authoredTone,
    ),
    paper: Object.freeze({ ...paper, color: freezeColor(paper.color) }),
  });
}

function graphiteViewMark(
  base: InkedSolidViewMarkDefaults,
  role: string,
  authoredTone?: ToneStyle,
): InkedSolidViewMarkDefaults {
  const resolveTone = (tone: ToneStyle): InkedSolidViewMarkDefaults => {
    if (tone === 'black') {
      return Object.freeze({
        ...base,
        style: 'scribble',
        scale: base.scale * 2.5,
        strength: 0.72,
        coverage: 0.68,
        lineWidth: base.lineWidth * 2.6,
      });
    }
    if (tone === 'scribble') {
      return Object.freeze({
        ...base, style: 'scribble', strength: 0.42, coverage: 0.05,
      });
    }
    if (tone === 'stipple') {
      return Object.freeze({
        ...base, style: 'stipple', scale: base.scale * 1.9,
        strength: 0.5, coverage: 0.04,
      });
    }
    if (tone === 'light') {
      return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0.03 });
    }
    return Object.freeze({
      ...base, style: 'hatch', strength: 0.4, coverage: 0.06,
    });
  };

  if (role === 'eye-white') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0 });
  }
  if (role === 'linework') {
    return Object.freeze({
      ...base, style: 'solid', strength: 0.92, coverage: 0.94,
      lineWidth: base.lineWidth * 1.45,
    });
  }
  if (role === 'liquid') {
    return Object.freeze({
      ...base, style: 'wash', scale: base.scale * 0.7,
      strength: 0.52, coverage: 0.24,
    });
  }
  if (role === 'body') {
    if (authoredTone === 'black') return resolveTone('black');
    if (authoredTone === 'scribble') {
      return Object.freeze({
        ...base, style: 'scribble', strength: 0.45, coverage: 0.08,
      });
    }
    if (authoredTone === 'hatch') {
      return Object.freeze({
        ...base, style: 'crosshatch', strength: 0.4, coverage: 0.12,
      });
    }
    // Raster graphite skin always has an 8 px hatch over an 8% pigment bed,
    // even when the additional authored head tone is light.
    return Object.freeze({
      ...base, style: 'hatch', strength: 0.4, coverage: 0.08,
    });
  }
  if (role === 'accent') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0.5 });
  }
  if (role === 'window') {
    return Object.freeze({
      ...base, style: 'hatch', scale: base.scale * 0.72,
      strength: 0.12, coverage: 0.04,
    });
  }
  if (authoredTone !== undefined) return resolveTone(authoredTone);
  if (role === 'hair') return resolveTone('black');
  return resolveTone('hatch');
}

function inkViewMark(
  base: InkedSolidViewMarkDefaults,
  role: string,
  authoredTone?: ToneStyle,
): InkedSolidViewMarkDefaults {
  if (role === 'eye-white') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0 });
  }
  if (role === 'linework') {
    return Object.freeze({
      ...base, style: 'solid', strength: 0.96, coverage: 0.98,
      lineWidth: base.lineWidth * 1.3,
    });
  }
  if (role === 'liquid') {
    return Object.freeze({
      ...base, style: 'wash', strength: 0.44, coverage: 0.3,
      scale: base.scale * 0.7,
    });
  }
  if (role === 'body') {
    // Raster ink skin is two translucent washes plus a fine hatch. It is not
    // a shadow field and must remain lighter than authored black ink masses.
    return Object.freeze({
      ...base, style: 'hatch', strength: 0.22, coverage: 0.26,
    });
  }

  const tone = authoredTone ?? (role === 'hair' ? 'black' : 'hatch');
  const density = TONE_DENSITY[tone];
  return Object.freeze({
    ...base,
    // Raster Ink always uses the same restrained hatch vocabulary; tone only
    // changes deposited coverage and whether that hatch becomes visible.
    style: density > 0.6 ? 'hatch' : 'none',
    strength: density > 0.6 ? 0.2 : 0,
    coverage: role === 'window' ? Math.min(0.18, 0.16 + density * 0.74)
      : 0.16 + density * 0.74,
  });
}

function watercolorViewMark(
  base: InkedSolidViewMarkDefaults,
  role: string,
  authoredTone?: ToneStyle,
): InkedSolidViewMarkDefaults {
  if (role === 'eye-white') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0 });
  }
  if (role === 'linework') {
    return Object.freeze({
      ...base, style: 'solid', strength: 0.72, coverage: 0.94,
      lineWidth: base.lineWidth * 1.15,
    });
  }
  if (role === 'liquid') {
    return Object.freeze({
      ...base, style: 'wash', strength: 0.46, coverage: 0.32,
      scale: base.scale * 0.7,
    });
  }

  const tone = authoredTone ?? (role === 'hair' ? 'black' : 'hatch');
  const density = TONE_DENSITY[tone];
  const layers = 2 + Math.round(density * 2);
  const alpha = 0.1 + density * 0.13;
  const rasterCoverage = 1 - (1 - alpha) ** layers;
  return Object.freeze({
    ...base,
    // Watercolour is layered translucent filler. Blooms and granulation come
    // from deposition variation; a directional view mark would invent bands
    // that the raster medium never draws.
    style: 'none',
    strength: 0,
    coverage: role === 'body' ? 1 - (1 - 0.14) ** 2
      : role === 'window' ? rasterCoverage * 0.55 : rasterCoverage,
  });
}

function oilViewMark(
  base: InkedSolidViewMarkDefaults,
  role: string,
  authoredTone?: ToneStyle,
): InkedSolidViewMarkDefaults {
  if (role === 'eye-white') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0 });
  }
  if (role === 'linework') {
    return Object.freeze({
      ...base, style: 'solid', strength: 0.94, coverage: 0.97,
      lineWidth: base.lineWidth * 1.18,
    });
  }
  if (role === 'liquid') {
    return Object.freeze({
      ...base, style: 'wash', strength: 0.58, coverage: 0.62,
      scale: base.scale * 0.72,
    });
  }

  // Raster oil lays down an almost opaque pigment bed before the bristle
  // daubs. Tone describes the character of those daubs, not transparency.
  const strengthByTone: Readonly<Record<ToneStyle, number>> = Object.freeze({
    light: 0.7,
    hatch: 0.82,
    scribble: 0.86,
    stipple: 0.74,
    black: 0.94,
  });
  const tone = authoredTone ?? (role === 'hair' ? 'black' : 'hatch');
  return Object.freeze({
    ...base,
    style: tone === 'stipple' ? 'stipple' : tone === 'scribble' ? 'scribble' : 'bristle',
    strength: strengthByTone[tone],
    coverage: role === 'window' ? 0.78 : tone === 'black' ? 0.99 : 0.98,
    scale: base.scale * (tone === 'light' ? 0.9 : tone === 'black' ? 1.12 : 1),
    lineWidth: base.lineWidth * (tone === 'black' ? 1.16 : 1),
  });
}

function projectViewMark(
  medium: MediumId,
  base: InkedSolidViewMarkDefaults,
  role: string,
  authoredTone?: ToneStyle,
): InkedSolidViewMarkDefaults {
  if (medium === 'graphite') return graphiteViewMark(base, role, authoredTone);
  if (medium === 'ink') return inkViewMark(base, role, authoredTone);
  if (medium === 'watercolor') return watercolorViewMark(base, role, authoredTone);
  if (medium === 'oil') return oilViewMark(base, role, authoredTone);
  if (role === 'liquid') {
    return Object.freeze({
      ...base,
      style: 'wash',
      strength: Math.max(0.48, base.strength),
      coverage: Math.max(0.3, base.coverage),
      scale: base.scale * 0.7,
    });
  }
  if (role === 'eye-white') {
    return Object.freeze({ ...base, style: 'none', strength: 0, coverage: 0 });
  }
  if (role === 'linework') {
    return Object.freeze({
      ...base,
      style: 'solid',
      strength: base.style === 'hatch' ? 0.88 : Math.max(0.72, base.strength),
      coverage: Math.max(0.92, base.coverage),
      scale: base.scale * 1.7,
    });
  }
  if (authoredTone !== undefined) {
    if (authoredTone === 'black') {
      return Object.freeze({
        ...base,
        style: base.style === 'hatch' ? 'scribble' : base.style,
        strength: Math.max(0.86, base.strength),
        coverage: Math.max(0.86, base.coverage),
        scale: base.scale * 1.12,
        lineWidth: base.lineWidth * 1.12,
      });
    }
    if (authoredTone === 'light') {
      return Object.freeze({
        ...base,
        style: base.style === 'hatch' ? 'hatch' : base.style,
        strength: base.strength * 0.54,
        coverage: base.coverage * 0.56,
      });
    }
    if (authoredTone === 'scribble') {
      return Object.freeze({
        ...base,
        style: 'scribble',
        strength: Math.max(0.58, base.strength),
        coverage: Math.max(0.3, base.coverage),
      });
    }
    if (authoredTone === 'stipple') {
      return Object.freeze({
        ...base,
        style: 'stipple',
        strength: Math.max(0.5, base.strength),
      });
    }
    return Object.freeze({ ...base, style: 'hatch' });
  }
  if (role === 'hair' && base.style !== 'hatch') {
    return Object.freeze({
      ...base,
      coverage: Math.max(0.66, base.coverage),
      strength: Math.max(0.62, base.strength),
    });
  }
  if ((role === 'clothing' || role === 'architectural-accent') && base.style !== 'hatch') {
    return Object.freeze({
      ...base,
      coverage: Math.max(role === 'clothing' ? 0.38 : 0.44, base.coverage),
    });
  }
  if (role === 'accent') {
    return Object.freeze({ ...base, coverage: Math.max(0.42, base.coverage) });
  }
  if (base.style === 'hatch') {
    if (role === 'hair') {
      return Object.freeze({
        ...base,
        style: 'scribble',
        scale: base.scale * 1.18,
        strength: 0.72,
        coverage: Math.max(0.72, base.coverage),
        lineWidth: base.lineWidth * 1.25,
      });
    }
    if (role === 'clothing' || role === 'architectural-accent') {
      return Object.freeze({
        ...base,
        style: 'crosshatch',
        strength: role === 'clothing' ? 0.5 : base.strength * 1.15,
        coverage: role === 'clothing'
          ? Math.max(0.34, base.coverage)
          : Math.max(0.42, base.coverage),
      });
    }
    if (role === 'window') {
      return Object.freeze({
        ...base,
        style: 'hatch',
        scale: base.scale * 0.72,
        strength: 0.12,
        coverage: Math.min(0.09, base.coverage),
      });
    }
  }
  return Object.freeze({ ...base });
}

const MEDIUM_DEFAULTS: Readonly<Record<MediumId, InkedSolidMediumDefaults>> = Object.freeze({
  graphite: projection('graphite', {
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
    paper: { grainStrength: 0.035 },
  }),
  ink: projection('ink', {
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
    paper: { grainStrength: 0.012 },
  }),
  watercolor: projection('watercolor', {
    contour: {
      width: 1.08, opacity: 0.66, jitter: 0.18, wander: 1.5, normalThreshold: 0.25,
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
    paper: { grainStrength: 0.012 },
  }),
  oil: projection('oil', {
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
    paper: { grainStrength: 0.008 },
  }),
  chalk: projection('chalk', {
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
    paper: { grainStrength: 0.045 },
  }),
  marker: projection('marker', {
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
    paper: { grainStrength: 0.01 },
  }),
});

/**
 * Projects the shared raster medium vocabulary into volumetric coverage,
 * view-synthesized marks, and contours. Asset families may override values,
 * but they do
 * not define competing medium taxonomies.
 */
export function inkedSolidMediumDefaults(medium: MediumId): InkedSolidMediumDefaults {
  return MEDIUM_DEFAULTS[medium];
}
