import { chaikin, closePath } from '../../core/geometry.js';
import { mediumById } from '../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition, Size2 } from '../types.js';
import type { PlatformRecipe } from './recipe.js';

const PIXELS_PER_UNIT = 72;

export function createPlatformBlueprint(recipe: PlatformRecipe): AssetBlueprint {
  const canvas: Size2 = Object.freeze({
    width: Math.ceil(recipe.width * PIXELS_PER_UNIT) + 20,
    height: Math.ceil(recipe.height * PIXELS_PER_UNIT) + 20,
  });
  const layer: LayerDefinition = Object.freeze({
    id: 'platform',
    bone: 'root',
    order: 0,
    depth: 0,
    canvas,
    world: Object.freeze({
      width: canvas.width / PIXELS_PER_UNIT,
      height: canvas.height / PIXELS_PER_UNIT,
    }),
    position: Object.freeze({ x: 0, y: -10 / PIXELS_PER_UNIT }),
    pivot: [0.5, 0] as const,
    states: Object.freeze(['idle']),
    draw: ({ sketch }): void => {
      const medium = mediumById(recipe.medium);
      const top = 14;
      const bottom = sketch.height - 8;
      const shape = chaikin([
        [8, top + sketch.jitter(-3, 3)],
        [sketch.width - 8, top + sketch.jitter(-3, 3)],
        [sketch.width - 13, bottom],
        [14, bottom - sketch.jitter(0, 5)],
      ], true, 1);
      sketch.paperFill(shape);
      medium.tone(sketch, shape, {
        style: recipe.tone, color: recipe.palette.ground, gap: 9,
      });
      medium.edge(sketch, closePath(shape), 4.2, { ghost: true, amplitude: 0.9 });
      sketch.stroke([[7, top], [sketch.width - 7, top]], 5.2, {
        alpha: 0.88, ghost: true,
      });
      for (let x = 35; x < sketch.width - 20; x += 52) {
        sketch.stroke([[x, top + 12], [x + sketch.jitter(-8, 8), bottom - 6]], 1.6, {
          alpha: 0.3,
        });
      }
    },
  });

  return Object.freeze({
    id: `platform:${recipe.seed}`,
    kind: 'platform',
    seed: recipe.seed,
    medium: recipe.medium,
    bounds: Object.freeze({
      x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
    }),
    layers: Object.freeze([layer]),
    colliders: Object.freeze([Object.freeze({
      id: 'body', kind: 'solid', shape: 'rectangle',
      x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
    })]),
    sockets: Object.freeze({
      base: Object.freeze({ x: 0, y: 0 }),
      top: Object.freeze({ x: 0, y: recipe.height }),
    }),
    interactions: Object.freeze([]),
  });
}
