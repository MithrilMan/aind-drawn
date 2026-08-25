import type { Point3 } from '../../core/geometry3.js';
import type { RgbColor } from '../../core/sketch.js';
import type { SurfaceDrawingIntent } from '../../materials/surface.js';
import type { MediumId } from '../../materials/medium.js';

export type InkedSolidContourPolicy = Readonly<{
  color: RgbColor;
  width: number;
  opacity: number;
  echoOpacity: number;
  ghostOpacity: number;
  ghostSpread: number;
  granulation: number;
  /** Static low-frequency contour displacement in device pixels. */
  wander: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidMarkStyle =
  | 'none'
  | 'hatch'
  | 'crosshatch'
  | 'scribble'
  | 'stipple'
  | 'wash'
  | 'bristle'
  | 'marker'
  | 'solid';

export const INKED_SOLID_MARK_STYLES: readonly InkedSolidMarkStyle[] = Object.freeze([
  'none', 'hatch', 'crosshatch', 'scribble', 'stipple', 'wash', 'bristle', 'marker', 'solid',
]);

export type InkedSolidViewMarkPolicy = Readonly<{
  surfaceId: string;
  semanticPartId: string;
  application: SurfaceDrawingIntent['application'];
  drawing: SurfaceDrawingIntent['drawing'];
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
  seed: number;
}>;

export type InkedSolidViewMarkOverride = Partial<Readonly<{
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
}>>;

export type InkedSolidViewMarkOverrides = Readonly<{
  surfaces?: Readonly<Record<string, InkedSolidViewMarkOverride>>;
  semanticParts?: Readonly<Record<string, InkedSolidViewMarkOverride>>;
}>;

export type InkedSolidPaperPolicy = Readonly<{
  color: RgbColor;
  grainStrength: number;
  seed: number;
}>;

export type InkedSolidDepositionPolicy = Readonly<{
  texture: MediumId;
  pigmentStrength: number;
  /** Extra mark pressure used only to separate authored faceted planes. */
  planeSeparationStrength: number;
  /** Quantized plane-pressure levels; smooth carriers ignore them. */
  planeSeparationSteps: number;
  variationStrength: number;
  variationScale: number;
  seed: number;
}>;

export type InkedSolidStrokePath =
  | Readonly<{
    type: 'part-local';
    points: readonly Point3[];
  }>
  | Readonly<{
    type: 'superellipsoid-surface';
    directions: readonly Point3[];
    lift: number;
  }>;

export type InkedSolidStrokeDefinition = Readonly<{
  id: string;
  partId: string;
  path: InkedSolidStrokePath;
  radius: number;
  color?: RgbColor;
  opacity?: number;
  closed?: boolean;
  wobble?: number;
}>;

export type InkedSolidStrokeRevealPolicy = Readonly<{
  /** Normalized scene reveal progress at which this stroke begins. */
  start: number;
  /** Normalized scene reveal progress at which this stroke is complete. */
  end: number;
}>;

export type InkedSolidStrokeRevealSequence = Readonly<{
  /** Delay between consecutive stroke starts, relative to one stroke duration. */
  stagger?: number;
}>;

export type InkedSolidStrokeSpec = Readonly<{
  id: string;
  partId: string;
  path: InkedSolidStrokePath;
  radius: number;
  color: RgbColor;
  opacity: number;
  closed: boolean;
  wobble: number;
  seed: number;
  reveal: InkedSolidStrokeRevealPolicy;
}>;
