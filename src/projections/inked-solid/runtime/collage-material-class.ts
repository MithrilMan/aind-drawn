import {
  artRolesForPart,
  type AssetAppearance,
} from '../../../appearance/art-direction.js';
import type { SurfaceSubstance } from '../../../materials/surface.js';

export const INKED_SOLID_COLLAGE_MATERIAL_CLASS = Object.freeze({
  neutral: 0,
  ground: 1,
  secondary: 2,
  accent: 3,
  primary: 4,
  darkSheet: 5,
} as const);

export type InkedSolidCollageMaterialClass = (
  typeof INKED_SOLID_COLLAGE_MATERIAL_CLASS
)[keyof typeof INKED_SOLID_COLLAGE_MATERIAL_CLASS];

/**
 * Compacts semantic art roles into the material class needed by scene-wide
 * paper visualizations. Foliage wins over primary because course ground is
 * deliberately authored as both; focal and primary forms remain pigment-safe.
 */
export function inkedSolidCollageMaterialClass(
  appearance: AssetAppearance,
  semanticPartId: string,
  substance?: SurfaceSubstance,
): InkedSolidCollageMaterialClass {
  const roles = artRolesForPart(appearance, semanticPartId);
  if (roles.includes('foliage')) return INKED_SOLID_COLLAGE_MATERIAL_CLASS.ground;
  if (roles.includes('accent')) return INKED_SOLID_COLLAGE_MATERIAL_CLASS.accent;
  if (roles.includes('primary-form') || roles.includes('focal-feature')) {
    return INKED_SOLID_COLLAGE_MATERIAL_CLASS.primary;
  }
  if (roles.includes('secondary-form')) {
    if (substance === 'stone') return INKED_SOLID_COLLAGE_MATERIAL_CLASS.darkSheet;
    return INKED_SOLID_COLLAGE_MATERIAL_CLASS.secondary;
  }
  return INKED_SOLID_COLLAGE_MATERIAL_CLASS.neutral;
}

/** Packs the collage class into the integral half of the existing mark-scale channel. */
export function packInkedSolidMarkScale(
  markScale: number,
  materialClass: InkedSolidCollageMaterialClass,
): number {
  return materialClass + 0.5 + Math.min(0.49, markScale / 48);
}
