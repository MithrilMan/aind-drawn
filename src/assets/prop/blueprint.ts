import { mediumById } from '../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition, Size2 } from '../types.js';
import { propDefinition } from './definition.js';
import type { PropRecipe } from './recipe.js';

const PIXELS_PER_UNIT = 112;

export function createPropBlueprint(recipe: PropRecipe): AssetBlueprint {
  const definition = propDefinition(recipe.prop);
  const canvas: Size2 = Object.freeze({
    width: Math.ceil(recipe.width * PIXELS_PER_UNIT),
    height: Math.ceil(recipe.height * PIXELS_PER_UNIT),
  });
  const layer: LayerDefinition = Object.freeze({
    id: 'prop',
    bone: 'root',
    order: 0,
    depth: 0,
    canvas,
    world: Object.freeze({ width: recipe.width, height: recipe.height }),
    position: Object.freeze({ x: 0, y: 0 }),
    pivot: [0.5, 0] as const,
    states: ['idle'] as const,
    draw: ({ sketch }) => {
      definition.draw(sketch, recipe, mediumById(recipe.medium));
    },
  });
  return Object.freeze({
    id: `prop:${recipe.prop}:${recipe.seed}`,
    kind: `prop:${recipe.prop}`,
    seed: recipe.seed,
    medium: recipe.medium,
    bounds: Object.freeze({
      x: -recipe.width / 2,
      y: 0,
      width: recipe.width,
      height: recipe.height,
    }),
    layers: Object.freeze([layer]),
    colliders: definition.colliders(recipe),
    sockets: definition.sockets(recipe),
    interactions: Object.freeze([]),
  });
}
