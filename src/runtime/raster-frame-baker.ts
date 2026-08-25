import type { AssetBlueprint, LayerDefinition } from '../contracts/raster-asset.js';
import type { CanvasFactory, DrawingCanvas, DrawingContext } from '../core/canvas.js';
import type { RgbColor } from '../core/sketch.js';
import { automaticCanvasFactory } from '../core/canvas.js';
import { combineSeed } from '../core/random.js';
import { CANVAS_RASTER_HAND, type RasterHand } from './raster-hand.js';

export type BakedRasterFrame = Readonly<{
  canvas: DrawingCanvas;
  context: DrawingContext;
  paperColor: RgbColor;
}>;

export type RasterFrameBakeOptions = Readonly<{
  canvasFactory?: CanvasFactory;
  rasterHand?: RasterHand;
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
  blueprint: AssetBlueprint,
  layer: LayerDefinition,
  state: string,
  frame: number,
  options: RasterFrameBakeOptions = {},
): BakedRasterFrame {
  if (!blueprint.layers.includes(layer)) {
    throw new RangeError(`Layer ${layer.id} does not belong to blueprint ${blueprint.assetId}`);
  }
  if (!layer.states.includes(state)) {
    throw new RangeError(`Layer ${layer.id} does not define state ${state}`);
  }
  if (!Number.isInteger(frame) || frame < 0) {
    throw new RangeError('raster boil frame must be a non-negative integer');
  }
  const seed = rasterBoilFrameSeed(blueprint.seed, layer.id, state, frame);
  const sketch = (options.rasterHand ?? CANVAS_RASTER_HAND).createSketch({
    blueprint,
    layer,
    state,
    frame,
    seed,
    canvasFactory: options.canvasFactory ?? automaticCanvasFactory,
  });
  if (sketch.canvas.width !== layer.canvas.width
      || sketch.canvas.height !== layer.canvas.height) {
    throw new RangeError(
      `Raster hand must create a ${layer.canvas.width}x${layer.canvas.height} surface for layer ${layer.id}`,
    );
  }
  layer.draw({ sketch, state, frame });
  return Object.freeze({
    canvas: sketch.canvas,
    context: sketch.context,
    paperColor: Object.freeze([...sketch.paperColor] as [number, number, number]),
  });
}
