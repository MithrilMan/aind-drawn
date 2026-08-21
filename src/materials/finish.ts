import type { RgbColor } from '../core/sketch.js';
import type { ToneStyle } from './medium.js';

export const SOLID_DRAWING_APPLICATIONS = Object.freeze([
  'paper',
  'pigment',
  'tint',
  'flat',
  'ink',
  'wash',
  'glaze',
] as const);

export type SolidDrawingApplication = typeof SOLID_DRAWING_APPLICATIONS[number];

export type SolidDrawingMaterialSpec = Readonly<{
  /** Generic deposition operation; asset-specific material names never enter the compiler. */
  application: SolidDrawingApplication;
  /** Representation-neutral density intent shared by raster and inked-solid projections. */
  tone: ToneStyle;
}>;

export const SOLID_FINISH_CATALOG = Object.freeze([
  Object.freeze({ id: 'matte', label: 'Matte' }),
  Object.freeze({ id: 'glossy', label: 'Glossy' }),
  Object.freeze({ id: 'rubber', label: 'Rubber' }),
  Object.freeze({ id: 'ceramic', label: 'Ceramic' }),
  Object.freeze({ id: 'pearl', label: 'Pearl' }),
  Object.freeze({ id: 'flocked', label: 'Flocked' }),
  Object.freeze({ id: 'wood', label: 'Wood' }),
  Object.freeze({ id: 'wool', label: 'Wool' }),
  Object.freeze({ id: 'resin', label: 'Resin' }),
  Object.freeze({ id: 'chrome', label: 'Chrome' }),
  Object.freeze({ id: 'metal', label: 'Metal' }),
  Object.freeze({ id: 'crazed', label: 'Crazed glaze' }),
  Object.freeze({ id: 'skin', label: 'Skin' }),
] as const);

export type SolidFinishId = (typeof SOLID_FINISH_CATALOG)[number]['id'];

export type SolidMaterialSpec = Readonly<{
  id: string;
  color: RgbColor;
  finish: SolidFinishId;
  drawing: SolidDrawingMaterialSpec;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
}>;

export const SOLID_FINISH_IDS: readonly SolidFinishId[] = Object.freeze(
  SOLID_FINISH_CATALOG.map(({ id }) => id),
);
