import { SeedTree } from '../../../core/random.js';
import type { ToneStyle } from '../../../materials/medium.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterDrawingStyle = Readonly<{
  linePressure: number;
  headTone: ToneStyle;
  hairTone: ToneStyle;
  bodyTone: ToneStyle;
}>;

/**
 * Resolves drawing choices that belong to the character rather than to a
 * raster or solid representation. Every projection therefore receives the
 * same tonal hierarchy for the same identity seed.
 */
export function createCharacterDrawingStyle(
  identity: CharacterIdentityRecipe,
): CharacterDrawingStyle {
  const tree = new SeedTree(identity.seed);
  const isCreature = identity.species === 'nightmare' || identity.species === 'creature';
  return Object.freeze({
    linePressure: tree.random('character:line').float(0.86, 1.2),
    headTone: isCreature
      ? 'scribble'
      : tree.random('character:raster:head-tone').pick<ToneStyle>(['light', 'light', 'hatch']),
    hairTone: tree.random('character:raster:hair-tone').pick<ToneStyle>([
      'hatch', 'scribble', 'black',
    ]),
    bodyTone: tree.random('character:raster:body-tone').pick<ToneStyle>([
      'light', 'hatch', 'scribble',
    ]),
  });
}
