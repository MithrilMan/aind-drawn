import type { AssetBlueprint } from '../contracts/raster-asset.js';
import type { CanvasFactory, DrawingContext } from '../core/canvas.js';
import { automaticCanvasFactory } from '../core/canvas.js';
import { PAPER_RGB } from '../core/sketch.js';
import { bakeRasterLayerFrame } from '../runtime/raster-frame-baker.js';

const DEFAULT_FRAME_COUNT = 3;
const DEFAULT_GRID_SIZE = 16;
const DEFAULT_STRUCTURAL_THRESHOLD = 0.08;

export type RasterBoilAuditOptions = Readonly<{
  frameCount?: number;
  gridSize?: number;
  structuralThreshold?: number;
  states?: 'all' | 'initial';
  canvasFactory?: CanvasFactory;
}>;

export type RasterBoilFrameComparison = Readonly<{
  firstFrame: number;
  secondFrame: number;
  difference: number;
}>;

export type RasterLayerBoilAudit = Readonly<{
  layerId: string;
  semanticPartId: string;
  state: string;
  gridWidth: number;
  gridHeight: number;
  maximumDifference: number;
  meanDifference: number;
  structurallyStable: boolean;
  comparisons: readonly RasterBoilFrameComparison[];
}>;

export type RasterBoilAuditReport = Readonly<{
  assetId: string;
  family: string;
  seed: number;
  medium: AssetBlueprint['medium'];
  frameCount: number;
  gridSize: number;
  structuralThreshold: number;
  passed: boolean;
  maximumDifference: number;
  unstableLayerStates: number;
  layers: readonly RasterLayerBoilAudit[];
}>;

type PixelGrid = Readonly<{
  width: number;
  height: number;
  values: readonly number[];
}>;

function integerOption(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function unitOption(name: string, value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${name} must be between 0 and 1`);
  }
  return value;
}

function downsample(
  context: DrawingContext,
  width: number,
  height: number,
  maximumGridSize: number,
): PixelGrid {
  const gridWidth = Math.min(maximumGridSize, width);
  const gridHeight = Math.min(maximumGridSize, height);
  const cellCount = gridWidth * gridHeight;
  const sums = new Float64Array(cellCount * 4);
  const counts = new Uint32Array(cellCount);
  const pixels = context.getImageData(0, 0, width, height).data;

  for (let y = 0; y < height; y += 1) {
    const cellY = Math.min(gridHeight - 1, Math.floor(y * gridHeight / height));
    for (let x = 0; x < width; x += 1) {
      const cellX = Math.min(gridWidth - 1, Math.floor(x * gridWidth / width));
      const cell = cellY * gridWidth + cellX;
      const source = (y * width + x) * 4;
      const target = cell * 4;
      const alpha = (pixels[source + 3] ?? 0) / 255;
      sums[target] = (sums[target] ?? 0)
        + ((pixels[source] ?? 0) / 255) * alpha
        + (PAPER_RGB[0] / 255) * (1 - alpha);
      sums[target + 1] = (sums[target + 1] ?? 0)
        + ((pixels[source + 1] ?? 0) / 255) * alpha
        + (PAPER_RGB[1] / 255) * (1 - alpha);
      sums[target + 2] = (sums[target + 2] ?? 0)
        + ((pixels[source + 2] ?? 0) / 255) * alpha
        + (PAPER_RGB[2] / 255) * (1 - alpha);
      sums[target + 3] = (sums[target + 3] ?? 0) + alpha;
      counts[cell] = (counts[cell] ?? 0) + 1;
    }
  }

  const values = new Array<number>(sums.length);
  for (let cell = 0; cell < cellCount; cell += 1) {
    const count = Math.max(1, counts[cell] ?? 0);
    const offset = cell * 4;
    for (let channel = 0; channel < 4; channel += 1) {
      values[offset + channel] = (sums[offset + channel] ?? 0) / count;
    }
  }
  return Object.freeze({ width: gridWidth, height: gridHeight, values: Object.freeze(values) });
}

function difference(first: PixelGrid, second: PixelGrid): number {
  if (first.width !== second.width || first.height !== second.height) {
    throw new Error('Cannot compare raster audit grids with different dimensions');
  }
  let total = 0;
  for (let index = 0; index < first.values.length; index += 1) {
    total += Math.abs((first.values[index] ?? 0) - (second.values[index] ?? 0));
  }
  return total / Math.max(1, first.values.length);
}

function auditLayerState(
  blueprint: AssetBlueprint,
  layer: AssetBlueprint['layers'][number],
  state: string,
  frameCount: number,
  gridSize: number,
  structuralThreshold: number,
  canvasFactory: CanvasFactory,
): RasterLayerBoilAudit {
  const grids: PixelGrid[] = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const baked = bakeRasterLayerFrame(blueprint.seed, layer, state, frame, canvasFactory);
    grids.push(downsample(baked.context, baked.canvas.width, baked.canvas.height, gridSize));
  }

  const comparisons: RasterBoilFrameComparison[] = [];
  for (let firstFrame = 0; firstFrame < grids.length - 1; firstFrame += 1) {
    for (let secondFrame = firstFrame + 1; secondFrame < grids.length; secondFrame += 1) {
      comparisons.push(Object.freeze({
        firstFrame,
        secondFrame,
        difference: difference(grids[firstFrame] as PixelGrid, grids[secondFrame] as PixelGrid),
      }));
    }
  }
  const maximumDifference = comparisons.reduce(
    (maximum, comparison) => Math.max(maximum, comparison.difference),
    0,
  );
  const meanDifference = comparisons.reduce(
    (sum, comparison) => sum + comparison.difference,
    0,
  ) / Math.max(1, comparisons.length);
  const firstGrid = grids[0] as PixelGrid;
  return Object.freeze({
    layerId: layer.id,
    semanticPartId: layer.semanticPartId,
    state,
    gridWidth: firstGrid.width,
    gridHeight: firstGrid.height,
    maximumDifference,
    meanDifference,
    structurallyStable: maximumDifference <= structuralThreshold,
    comparisons: Object.freeze(comparisons),
  });
}

/**
 * Measures coarse visual drift between redraw frames of every raster layer.
 * Downsampling suppresses paper grain and mark pickup while retaining changes
 * large enough to alter silhouette, mass, or composition.
 */
export function auditRasterBoil(
  blueprint: AssetBlueprint,
  options: RasterBoilAuditOptions = {},
): RasterBoilAuditReport {
  const frameCount = integerOption('frameCount', options.frameCount ?? DEFAULT_FRAME_COUNT, 2, 16);
  const gridSize = integerOption('gridSize', options.gridSize ?? DEFAULT_GRID_SIZE, 2, 64);
  const structuralThreshold = unitOption(
    'structuralThreshold',
    options.structuralThreshold ?? DEFAULT_STRUCTURAL_THRESHOLD,
  );
  const canvasFactory = options.canvasFactory ?? automaticCanvasFactory;
  const layers: RasterLayerBoilAudit[] = [];

  for (const layer of blueprint.layers) {
    const states = options.states === 'initial'
      ? layer.states.slice(0, 1)
      : layer.states;
    for (const state of states) {
      layers.push(auditLayerState(
        blueprint,
        layer,
        state,
        frameCount,
        gridSize,
        structuralThreshold,
        canvasFactory,
      ));
    }
  }

  const maximumDifference = layers.reduce(
    (maximum, layer) => Math.max(maximum, layer.maximumDifference),
    0,
  );
  const unstableLayerStates = layers.filter(({ structurallyStable }) => !structurallyStable).length;
  return Object.freeze({
    assetId: blueprint.assetId,
    family: blueprint.family,
    seed: blueprint.seed,
    medium: blueprint.medium,
    frameCount,
    gridSize,
    structuralThreshold,
    passed: unstableLayerStates === 0,
    maximumDifference,
    unstableLayerStates,
    layers: Object.freeze(layers),
  });
}
