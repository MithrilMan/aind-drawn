import type { RgbColor } from '../core/sketch.js';
import type { ToneStyle } from './medium.js';

export type SolidDrawingMaterialHint = Readonly<{
  /** Representation-neutral tone intent shared by raster and inked-solid projections. */
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
  role: string;
  color: RgbColor;
  finish: SolidFinishId;
  drawing?: SolidDrawingMaterialHint;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
}>;

export const SOLID_FINISH_IDS: readonly SolidFinishId[] = Object.freeze(
  SOLID_FINISH_CATALOG.map(({ id }) => id),
);
