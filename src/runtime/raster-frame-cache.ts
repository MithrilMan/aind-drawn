import type { AssetBlueprint, LayerDefinition } from '../contracts/raster-asset.js';
import type { CanvasFactory } from '../core/canvas.js';
import { automaticCanvasFactory } from '../core/canvas.js';
import {
  bakeRasterLayerFrame,
  type BakedRasterFrame,
} from './raster-frame-baker.js';
import { CANVAS_RASTER_HAND, type RasterHand } from './raster-hand.js';

export type RasterFrameCacheOptions = Readonly<{
  canvasFactory?: CanvasFactory;
  rasterHand?: RasterHand;
}>;

export type RasterFrameCacheDiagnostics = Readonly<{
  handId: string;
  blueprints: number;
  frames: number;
  retainedPixels: number;
  hits: number;
  misses: number;
}>;

type LayerFrames = Map<string, BakedRasterFrame>;

function frameKey(state: string, frame: number): string {
  return `${state}\u0000${frame}`;
}

/**
 * Scene-scoped cache for immutable baked canvases. Textures remain owned by
 * each SpriteRig, so cache clearing cannot invalidate live GPU resources.
 */
export class RasterFrameCache {
  private readonly canvasFactory: CanvasFactory;
  private readonly rasterHand: RasterHand;
  private readonly entries = new Map<AssetBlueprint, Map<LayerDefinition, LayerFrames>>();
  private frameCount = 0;
  private retainedPixels = 0;
  private hits = 0;
  private misses = 0;

  public constructor(options: RasterFrameCacheOptions = {}) {
    this.canvasFactory = options.canvasFactory ?? automaticCanvasFactory;
    this.rasterHand = options.rasterHand ?? CANVAS_RASTER_HAND;
  }

  public getOrBake(
    blueprint: AssetBlueprint,
    layer: LayerDefinition,
    state: string,
    frame: number,
  ): BakedRasterFrame {
    let blueprintEntries = this.entries.get(blueprint);
    if (blueprintEntries === undefined) {
      blueprintEntries = new Map();
      this.entries.set(blueprint, blueprintEntries);
    }
    let layerEntries = blueprintEntries.get(layer);
    if (layerEntries === undefined) {
      layerEntries = new Map();
      blueprintEntries.set(layer, layerEntries);
    }
    const key = frameKey(state, frame);
    const cached = layerEntries.get(key);
    if (cached !== undefined) {
      this.hits += 1;
      return cached;
    }
    const baked = bakeRasterLayerFrame(blueprint, layer, state, frame, {
      canvasFactory: this.canvasFactory,
      rasterHand: this.rasterHand,
    });
    layerEntries.set(key, baked);
    this.frameCount += 1;
    this.retainedPixels += baked.canvas.width * baked.canvas.height;
    this.misses += 1;
    return baked;
  }

  public getDiagnostics(): RasterFrameCacheDiagnostics {
    return Object.freeze({
      handId: this.rasterHand.id,
      blueprints: this.entries.size,
      frames: this.frameCount,
      retainedPixels: this.retainedPixels,
      hits: this.hits,
      misses: this.misses,
    });
  }

  /** Releases retained canvases. Existing rig textures remain valid. */
  public clear(): void {
    this.entries.clear();
    this.frameCount = 0;
    this.retainedPixels = 0;
  }
}
