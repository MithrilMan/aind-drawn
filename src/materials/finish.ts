import type { RgbColor } from '../core/sketch.js';

export type SolidFinishId = 'matte' | 'glossy' | 'rubber' | 'ceramic' | 'skin' | 'metal';

export type SolidMaterialSpec = Readonly<{
  id: string;
  role: string;
  color: RgbColor;
  finish: SolidFinishId;
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
