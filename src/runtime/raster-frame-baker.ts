import type { LayerDefinition } from '../contracts/raster-asset.js';
import type { CanvasFactory, DrawingCanvas, DrawingContext } from '../core/canvas.js';
import { combineSeed } from '../core/random.js';
import { Sketch } from '../core/sketch.js';

export type BakedRasterFrame = Readonly<{
  canvas: DrawingCanvas;
  context: DrawingContext;
}>;

/**
 * Resolves the exact redraw namespace used by both the runtime and visual audit.
 * Semantic generation must never consume this seed.
 */
export function rasterBoilFrameSeed(
  blueprintSeed: number,
  layerId: string,
  state: string,
  frame: number,
): number {
  return combineSeed(blueprintSeed, `asset:boil:${layerId}:${state}:${frame}`);
}

/** Bakes one raster layer through the same path used by SpriteRig. */
export function bakeRasterLayerFrame(
  blueprintSeed: number,
  layer: LayerDefinition,
  state: string,
  frame: number,
  canvasFactory: CanvasFactory,
): BakedRasterFrame {
  if (!layer.states.includes(state)) {
    throw new RangeError(`Layer ${layer.id} does not define state ${state}`);
  }
  if (!Number.isInteger(frame) || frame < 0) {
    throw new RangeError('raster boil frame must be a non-negative integer');
  }
  const sketch = new Sketch(
    layer.canvas.width,
    layer.canvas.height,
    rasterBoilFrameSeed(blueprintSeed, layer.id, state, frame),
    canvasFactory,
  );
  layer.draw({ sketch, state, frame });
  return Object.freeze({ canvas: sketch.canvas, context: sketch.context });
}
