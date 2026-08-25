import { bench, describe } from 'vitest';

import {
  RasterFrameCache,
  SpriteRig,
  createCharacterIdentity,
  createRasterCharacterBlueprint,
  type CanvasFactory,
  type DrawingContext,
} from '../src/index.js';

const noOperation = (): void => undefined;
const gradient = Object.freeze({ addColorStop: noOperation });

const canvasFactory: CanvasFactory = (width, height) => {
  const context = new Proxy({} as DrawingContext, {
    get(target, property) {
      if (property === 'createLinearGradient' || property === 'createRadialGradient') {
        return () => gradient;
      }
      const current = Reflect.get(target, property) as unknown;
      return current ?? noOperation;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value);
    },
  });
  return {
    canvas: { width, height } as HTMLCanvasElement,
    context,
  };
};

const blueprint = createRasterCharacterBlueprint(createCharacterIdentity(8101));
const INSTANCE_COUNT = 8;
const BOIL_FRAMES = 2;

function constructRigs(frameCache?: RasterFrameCache): SpriteRig[] {
  return Array.from({ length: INSTANCE_COUNT }, (_, index) => new SpriteRig(blueprint, {
    instanceId: `raster-benchmark:${index}`,
    boilFrames: BOIL_FRAMES,
    ...(frameCache === undefined ? { canvasFactory } : { frameCache }),
  }));
}

function disposeRigs(rigs: readonly SpriteRig[]): void {
  for (const rig of rigs) rig.dispose();
}

describe('repeated raster rig construction', () => {
  bench('bakes every instance independently', () => {
    disposeRigs(constructRigs());
  });

  bench('shares immutable baked frames through a scene cache', () => {
    const cache = new RasterFrameCache({ canvasFactory });
    disposeRigs(constructRigs(cache));
    cache.clear();
  });

  const warmCache = new RasterFrameCache({ canvasFactory });
  disposeRigs(constructRigs(warmCache));
  bench('spawns from a warm scene cache', () => {
    disposeRigs(constructRigs(warmCache));
  });
});
