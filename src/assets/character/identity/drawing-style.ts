import { SeedTree } from '../../../core/random.js';
import { DRAWING_INTENTS, type DrawingIntent } from '../../../materials/drawing.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterDrawingStyle = Readonly<{
  linePressure: number;
  headDrawing: DrawingIntent;
  hairDrawing: DrawingIntent;
  bodyDrawing: DrawingIntent;
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
    headDrawing: isCreature
      ? DRAWING_INTENTS.agitated
      : tree.random('character:raster:head-tone').pick<DrawingIntent>([
        DRAWING_INTENTS.light, DRAWING_INTENTS.light, DRAWING_INTENTS.mid,
      ]),
    hairDrawing: tree.random('character:raster:hair-tone').pick<DrawingIntent>([
      DRAWING_INTENTS.mid, DRAWING_INTENTS.agitated, DRAWING_INTENTS.solid,
    ]),
    bodyDrawing: tree.random('character:raster:body-tone').pick<DrawingIntent>([
      DRAWING_INTENTS.light, DRAWING_INTENTS.mid, DRAWING_INTENTS.agitated,
    ]),
  });
}
