import type { RgbColor } from '../core/sketch.js';
import type { ToneStyle } from './medium.js';

export type SolidDrawingMaterialHint = Readonly<{
  /** Representation-neutral tone intent shared by raster and inked-solid projections. */
  tone: ToneStyle;
}>;

export type SolidFinishId = 'matte' | 'glossy' | 'rubber' | 'ceramic' | 'skin' | 'metal';

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

export const SOLID_FINISH_IDS: readonly SolidFinishId[] = Object.freeze([
  'matte',
  'glossy',
  'rubber',
  'ceramic',
  'skin',
  'metal',
]);
