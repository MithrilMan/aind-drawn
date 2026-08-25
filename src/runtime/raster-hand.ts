import type { AssetBlueprint, LayerDefinition } from '../contracts/raster-asset.js';
import type { CanvasFactory } from '../core/canvas.js';
import type { Seed } from '../core/random.js';
import {
  INK,
  PAPER_RGB,
  Sketch,
  type RgbColor,
} from '../core/sketch.js';

export type RasterSketchRequest = Readonly<{
  blueprint: AssetBlueprint;
  layer: LayerDefinition;
  state: string;
  frame: number;
  seed: Seed;
  canvasFactory: CanvasFactory;
}>;

/**
 * Creates one drawing surface for a baked raster frame. The hand is scoped by
 * the caller; no process-global renderer switch is involved. Implementations
 * may return a Sketch subclass while preserving the public mark vocabulary.
 */
export type RasterHand = Readonly<{
  id: string;
  paperColor: RgbColor;
  createSketch: (request: RasterSketchRequest) => Sketch;
}>;

export type CanvasRasterHandOptions = Readonly<{
  id?: string;
  ink?: RgbColor;
  paper?: RgbColor;
}>;

function channel(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 255) {
    throw new RangeError(`${name} must be between 0 and 255`);
  }
  return value;
}

function color(value: RgbColor, name: string): RgbColor {
  return Object.freeze([
    channel(value[0], `${name}.red`),
    channel(value[1], `${name}.green`),
    channel(value[2], `${name}.blue`),
  ]);
}

/** Creates the zero-dependency Canvas 2D hand used by the default runtime. */
export function createCanvasRasterHand(
  options: CanvasRasterHandOptions = {},
): RasterHand {
  const id = options.id ?? 'canvas-2d';
  if (id.trim().length === 0) throw new RangeError('raster hand id must not be empty');
  const ink = color(options.ink ?? INK, 'ink');
  const paper = color(options.paper ?? PAPER_RGB, 'paper');
  const hasInkOverride = options.ink !== undefined;
  const hasPaperOverride = options.paper !== undefined;
  return Object.freeze({
    id,
    paperColor: paper,
    createSketch(request: RasterSketchRequest): Sketch {
      const sketch = new Sketch(
        request.layer.canvas.width,
        request.layer.canvas.height,
        request.seed,
        request.canvasFactory,
      );
      sketch.setAppearance(request.blueprint.appearance, request.layer.semanticPartId);
      sketch.setBaseInk(hasInkOverride ? ink : request.blueprint.appearance.artDirection.palette.ink);
      sketch.setPaperColor(
        hasPaperOverride ? paper : request.blueprint.appearance.artDirection.scene.paper,
      );
      return sketch;
    },
  });
}

export const CANVAS_RASTER_HAND = createCanvasRasterHand();
