import type { Point } from '../core/geometry.js';
import { type RgbColor, Sketch } from '../core/sketch.js';

export type ToneStyle = 'black' | 'hatch' | 'scribble' | 'stipple' | 'light';
export type MediumId = 'graphite' | 'ink' | 'watercolor' | 'oil' | 'chalk' | 'marker';

export type ToneOptions = Readonly<{
  style?: ToneStyle;
  gap?: number;
  color?: RgbColor;
  darkness?: number;
}>;

export type SkinOptions = Readonly<{
  gap?: number;
  scribble?: boolean;
}>;

export type EdgeOptions = Readonly<{
  alpha?: number;
  ghost?: boolean;
  amplitude?: number;
}>;

export type Medium = Readonly<{
  id: MediumId;
  label: string;
  underdraw: boolean;
  tone: (sketch: Sketch, points: readonly Point[], options?: ToneOptions) => void;
  skin: (
    sketch: Sketch,
    points: readonly Point[],
    color: RgbColor,
    options?: SkinOptions,
  ) => void;
  edge: (
    sketch: Sketch,
    points: readonly Point[],
    width: number,
    options?: EdgeOptions,
  ) => void;
}>;

const DENSITY: Readonly<Record<ToneStyle, number>> = {
  black: 1,
  hatch: 0.72,
  scribble: 0.62,
  stipple: 0.5,
  light: 0.34,
};

function strokeOptions(options: EdgeOptions, widthFactor: number, ghost: boolean) {
  return {
    ...(options.alpha === undefined ? {} : { alpha: options.alpha }),
    ...(options.amplitude === undefined ? {} : { amplitude: options.amplitude }),
    ghost: options.ghost ?? ghost,
    taper: 0.12,
    widthFactor,
  };
}

export const MEDIA: Readonly<Record<MediumId, Medium>> = {
  graphite: {
    id: 'graphite',
    label: 'graphite',
    underdraw: true,
    tone(sketch, points, options = {}) {
      const style = options.style ?? 'hatch';
      sketch.paperFill(points);
      sketch.setInk(options.color ?? null);
      if (style === 'black') {
        sketch.pencilFill(points, options.darkness ?? 1);
      } else if (style === 'hatch') {
        sketch.inkFill(points, 0.06);
        sketch.hatchFill(points, options.gap ?? 7, sketch.jitter(1.1, 1.7), 0.4, 1.15);
      } else if (style === 'scribble') {
        sketch.inkFill(points, 0.05);
        sketch.scribbleFill(points, options.gap ?? 8, 0.42);
      } else if (style === 'stipple') {
        sketch.inkFill(points, 0.04);
        sketch.stippleFill(points, (options.gap ?? 7) * 0.6, 0.5);
      } else {
        sketch.inkFill(points, 0.03);
      }
      sketch.setInk(null);
    },
    skin(sketch, points, color, options = {}) {
      sketch.setInk(color);
      sketch.polygon(points);
      sketch.context.fillStyle = sketch.inkAlpha(0.08);
      sketch.context.fill();
      if (options.scribble === true) {
        sketch.scribbleFill(points, options.gap ?? 6, 0.45);
      } else {
        sketch.hatchFill(points, options.gap ?? 7, sketch.jitter(0.7, 1.5), 0.4, 1.4);
      }
      sketch.setInk(null);
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 1, true);
      sketch.brokenStroke(points, width * resolved.widthFactor, resolved);
    },
  },
  ink: {
    id: 'ink',
    label: 'ink',
    underdraw: true,
    tone(sketch, points, options = {}) {
      const density = DENSITY[options.style ?? 'hatch'];
      sketch.paperFill(points);
      sketch.setInk(options.color ?? null);
      sketch.inkFill(points, 0.16 + density * 0.74);
      if (density > 0.6) {
        sketch.hatchFill(points, 9, sketch.jitter(1, 1.6), 0.2, 1.2);
      }
      sketch.setInk(null);
    },
    skin(sketch, points, color, options = {}) {
      sketch.setInk(color);
      sketch.washFill(points, color, { layers: 2, alpha: 0.13, bleed: 0.8, blooms: false });
      sketch.hatchFill(points, options.gap ?? 8, sketch.jitter(0.7, 1.5), 0.22, 1.2);
      sketch.setInk(null);
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 1.25, true);
      sketch.brokenStroke(points, width * resolved.widthFactor, resolved);
    },
  },
  watercolor: {
    id: 'watercolor',
    label: 'watercolour',
    underdraw: true,
    tone(sketch, points, options = {}) {
      const density = DENSITY[options.style ?? 'hatch'];
      const color = options.color ?? [86, 92, 104];
      sketch.washFill(points, color, {
        layers: 2 + Math.round(density * 2),
        alpha: 0.1 + density * 0.13,
        bleed: 1.1,
      });
    },
    skin(sketch, points, color) {
      sketch.washFill(points, color, { layers: 2, alpha: 0.14, bleed: 1.2 });
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 0.8, false);
      sketch.brokenStroke(points, width * resolved.widthFactor, {
        ...resolved,
        alpha: options.alpha ?? 0.62,
      });
    },
  },
  oil: {
    id: 'oil',
    label: 'oil',
    underdraw: false,
    tone(sketch, points, options = {}) {
      const density = DENSITY[options.style ?? 'hatch'];
      const color = options.color ?? sketch.mixColor([70, 66, 62], 0.6 + density * 0.8);
      sketch.oilFill(points, color, { density: 0.9 + density * 0.5 });
    },
    skin(sketch, points, color) {
      sketch.oilFill(points, color, { density: 1 });
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 0.85, false);
      sketch.brokenStroke(points, width * resolved.widthFactor, {
        ...resolved,
        alpha: options.alpha ?? 0.5,
      });
    },
  },
  chalk: {
    id: 'chalk',
    label: 'charcoal',
    underdraw: true,
    tone(sketch, points, options = {}) {
      const density = DENSITY[options.style ?? 'hatch'];
      sketch.chalkFill(points, options.color ?? [52, 48, 44], {
        alpha: 0.28 + density * 0.5,
        density: 0.8 + density * 0.7,
      });
    },
    skin(sketch, points, color) {
      sketch.chalkFill(points, color, { alpha: 0.34, density: 0.7 });
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 1.1, true);
      sketch.brokenStroke(points, width * resolved.widthFactor, {
        ...resolved,
        alpha: options.alpha ?? 0.62,
      });
    },
  },
  marker: {
    id: 'marker',
    label: 'marker',
    underdraw: true,
    tone(sketch, points, options = {}) {
      const density = DENSITY[options.style ?? 'hatch'];
      const color = options.color ?? [78, 74, 70];
      sketch.markerFill(points, color, 0.16 + density * 0.3);
      if (density > 0.8) {
        sketch.markerFill(points, sketch.mixColor(color, 0.85), 0.22);
      }
    },
    skin(sketch, points, color) {
      sketch.markerFill(points, color, 0.22);
    },
    edge(sketch, points, width, options = {}) {
      const resolved = strokeOptions(options, 1.15, false);
      sketch.brokenStroke(points, width * resolved.widthFactor, {
        ...resolved,
        alpha: options.alpha ?? 0.9,
      });
    },
  },
};

export const MEDIUM_IDS = Object.freeze(Object.keys(MEDIA) as MediumId[]);

export function mediumById(id: MediumId): Medium {
  return MEDIA[id];
}
