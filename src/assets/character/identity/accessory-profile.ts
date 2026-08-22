import type { Point } from '../../../core/geometry.js';
import type {
  CharacterEyewearAccessoryRecipe,
  CharacterIdentityRecipe,
} from './recipe.js';
import { characterEyeCenterY } from './head-shape.js';

export type CharacterEyewearProfile = Readonly<{
  accessory: CharacterEyewearAccessoryRecipe;
  lensCenters: readonly [left: Point, right: Point];
  lensHalfSize: Point;
  bridgeHalfWidth: number;
  frameThickness: number;
  spatial: CharacterEyewearAccessoryRecipe['spatial'];
}>;

export function createCharacterEyewearProfile(
  identity: CharacterIdentityRecipe,
): CharacterEyewearProfile | null {
  const accessory = identity.accessories[0];
  if (accessory === undefined) return null;
  const y = characterEyeCenterY(identity) + accessory.verticalOffset;
  return Object.freeze({
    accessory,
    lensCenters: Object.freeze([
      Object.freeze([-identity.eyes.spacing, y] as const),
      Object.freeze([identity.eyes.spacing, y] as const),
    ] as const),
    lensHalfSize: Object.freeze([accessory.lensWidth, accessory.lensHeight] as const),
    bridgeHalfWidth: accessory.bridgeWidth,
    frameThickness: accessory.frameThickness,
    spatial: accessory.spatial,
  });
}
