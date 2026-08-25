import type { Seed } from '../../../core/random.js';
import type { AssetRecipeEnvelope } from '../../../contracts/asset-envelope.js';
import type { ArtDirectionRecipe, ArtDirectionSource } from '../../../appearance/art-direction.js';
import { resolveArtDirection } from '../../../appearance/art-direction.js';
import type { DrawingIntent } from '../../../materials/drawing.js';
import type { MediumId } from '../../../materials/medium.js';
import { createCharacterDrawingStyle } from '../identity/drawing-style.js';
import {
  createCharacterIdentity,
  type CharacterEyeStyle,
  type CharacterHairStyle,
  type CharacterHeadShape,
  type CharacterIdentityRecipe,
  type CharacterIdentitySpecies,
  type CharacterMouthStyle,
  type CharacterOutfitStyle,
} from '../identity/recipe.js';

export type CharacterSpecies = CharacterIdentitySpecies;
export type HeadShape = CharacterHeadShape;
export type EyeStyle = CharacterEyeStyle;
export type MouthStyle = CharacterMouthStyle;
export type HairStyle = CharacterHairStyle;
export type OutfitStyle = CharacterOutfitStyle;

export type RasterCharacterStyle = Readonly<{
  medium: MediumId;
  linePressure: number;
  headDrawing: DrawingIntent;
  hairDrawing: DrawingIntent;
  bodyDrawing: DrawingIntent;
  artDirection: ArtDirectionRecipe;
}>;

export type CharacterRecipe = AssetRecipeEnvelope<
  'character',
  'raster',
  CharacterIdentityRecipe,
  RasterCharacterStyle
>;

export type RasterCharacterRecipeOptions = Readonly<{
  medium?: MediumId;
  artDirection?: ArtDirectionSource;
}>;

export type CharacterRecipeOptions = RasterCharacterRecipeOptions & Readonly<{
  species?: CharacterSpecies;
  shape?: HeadShape;
}>;

export function createRasterCharacterRecipe(
  identity: CharacterIdentityRecipe,
  options: RasterCharacterRecipeOptions = {},
): CharacterRecipe {
  const drawing = createCharacterDrawingStyle(identity);
  return Object.freeze({
    schemaVersion: 1,
    family: 'character',
    representation: 'raster',
    identity,
    style: Object.freeze({
      medium: options.medium ?? 'graphite',
      linePressure: drawing.linePressure,
      headDrawing: drawing.headDrawing,
      hairDrawing: drawing.hairDrawing,
      bodyDrawing: drawing.bodyDrawing,
      artDirection: resolveArtDirection(options.artDirection),
    }),
  });
}

export function createCharacterRecipe(
  seed: Seed,
  options: CharacterRecipeOptions = {},
): CharacterRecipe {
  const identity = createCharacterIdentity(seed, {
    ...(options.species === undefined ? {} : { species: options.species }),
    ...(options.shape === undefined ? {} : { shape: options.shape }),
  });
  return createRasterCharacterRecipe(identity, {
    ...(options.medium === undefined ? {} : { medium: options.medium }),
    ...(options.artDirection === undefined ? {} : { artDirection: options.artDirection }),
  });
}
