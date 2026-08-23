import { createVehicleBodySideSection } from './body-side-section.js';
import { createVehicleCabinSideProfile } from './geometry.js';
import type { VehicleIdentityRecipe } from './recipe.js';

export type VehicleCabinCrossSection = Readonly<{
  beltHeight: number;
  roofHeight: number;
  beltHalfWidth: number;
  roofHalfWidth: number;
  roofOverhang: number;
}>;

const ROOF_TAPER_BY_ARCHETYPE = Object.freeze({
  city: 0.92,
  coupe: 0.9,
  sedan: 0.92,
  van: 0.96,
  pickup: 0.92,
} as const);

/** Defines the transverse cabin envelope shared by the shell, roof, and door glass. */
export function createVehicleCabinCrossSection(
  identity: VehicleIdentityRecipe,
): VehicleCabinCrossSection {
  const cabin = createVehicleCabinSideProfile(identity);
  const body = createVehicleBodySideSection(identity);
  const beltHalfWidth = body.ridgeHalfWidth * 0.94;
  const roofHalfWidth = beltHalfWidth * ROOF_TAPER_BY_ARCHETYPE[identity.archetype];
  return Object.freeze({
    beltHeight: cabin.beltHeight,
    roofHeight: cabin.roofHeight,
    beltHalfWidth,
    roofHalfWidth,
    roofOverhang: Math.max(0.02, identity.dimensions.width * 0.012),
  });
}

export function vehicleCabinHalfWidthAt(
  section: VehicleCabinCrossSection,
  y: number,
): number {
  const amount = Math.max(0, Math.min(
    1,
    (y - section.beltHeight) / Math.max(1e-9, section.roofHeight - section.beltHeight),
  ));
  return section.beltHalfWidth
    + (section.roofHalfWidth - section.beltHalfWidth) * amount;
}
