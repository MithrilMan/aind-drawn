import { describe, expect, it } from 'vitest';

import {
  auditRasterBoil,
  createUniformAssetAppearance,
  type AssetBlueprint,
  type CanvasFactory,
  type DrawingContext,
  type LayerDefinition,
} from '../src/index.js';

type PixelSurface = Readonly<{
  pixels: Uint8ClampedArray;
  context: DrawingContext;
}>;

function pixelCanvasFactory(): CanvasFactory {
  return (width, height) => {
    const pixels = new Uint8ClampedArray(width * height * 4);
    const paint = (x: number, y: number, rectangleWidth: number, rectangleHeight: number): void => {
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(width, Math.ceil(x + rectangleWidth));
      const bottom = Math.min(height, Math.ceil(y + rectangleHeight));
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const offset = (row * width + column) * 4;
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
          pixels[offset + 3] = 255;
        }
      }
    };
    const erase = (x: number, y: number, rectangleWidth: number, rectangleHeight: number): void => {
      const left = Math.max(0, Math.floor(x));
      const top = Math.max(0, Math.floor(y));
      const right = Math.min(width, Math.ceil(x + rectangleWidth));
      const bottom = Math.min(height, Math.ceil(y + rectangleHeight));
      for (let row = top; row < bottom; row += 1) {
        for (let column = left; column < right; column += 1) {
          const offset = (row * width + column) * 4;
          pixels.fill(0, offset, offset + 4);
        }
      }
    };
    const surface: PixelSurface = {
      pixels,
      context: {
        fillStyle: '#000000',
        fillRect: paint,
        clearRect: erase,
        getImageData: () => ({ data: pixels }) as ImageData,
      } as unknown as DrawingContext,
    };
    return {
      canvas: { width, height } as HTMLCanvasElement,
      context: surface.context,
    };
  };
}

function blueprint(draw: LayerDefinition['draw'], states: readonly string[] = ['idle']): AssetBlueprint {
  const layer: LayerDefinition = Object.freeze({
    id: 'art',
    semanticPartId: 'art',
    bone: 'root',
    order: 0,
    depth: 0,
    canvas: Object.freeze({ width: 64, height: 64 }),
    world: Object.freeze({ width: 1, height: 1 }),
    pivot: [0.5, 0.5] as const,
    states,
    draw,
  });
  return Object.freeze({
    blueprintVersion: 1,
    family: 'audit-test',
    representation: 'raster',
    assetId: 'audit-test:1',
    seed: 1042,
    medium: 'graphite',
    appearance: createUniformAssetAppearance('authored', ['art']),
    manifest: Object.freeze({
      family: 'audit-test',
      parts: Object.freeze([Object.freeze({ id: 'art', spatial: 'surface' as const })]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
    bones: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({
        position: Object.freeze({ x: 0, y: 0 }),
        rotation: 0,
      }),
    })]),
    layers: Object.freeze([layer]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

describe('raster boil visual audit', () => {
  it('suppresses tiny redraw noise after structural downsampling', () => {
    const report = auditRasterBoil(blueprint(({ sketch, frame }) => {
      sketch.context.fillRect(8, 8, 32, 32);
      sketch.context.fillRect(50 + frame, 50, 1, 1);
    }), { canvasFactory: pixelCanvasFactory() });

    expect(report.passed).toBe(true);
    expect(report.unstableLayerStates).toBe(0);
    expect(report.maximumDifference).toBeLessThan(0.01);
    expect(report.layers[0]?.comparisons).toHaveLength(3);
  });

  it('reports a structural shape that appears in one boil frame', () => {
    const report = auditRasterBoil(blueprint(({ sketch, frame }) => {
      sketch.context.fillRect(4, 4, 16, 16);
      if (frame === 1) sketch.context.fillRect(32, 32, 24, 24);
    }), { canvasFactory: pixelCanvasFactory() });

    expect(report.passed).toBe(false);
    expect(report.unstableLayerStates).toBe(1);
    expect(report.maximumDifference).toBeGreaterThan(report.structuralThreshold);
    expect(report.layers[0]?.structurallyStable).toBe(false);
  });

  it('audits every declared state by default and can focus on initial states', () => {
    const source = blueprint(({ sketch, state, frame }) => {
      sketch.context.fillRect(4, 4, 16, 16);
      if (state === 'open' && frame === 2) sketch.context.fillRect(32, 32, 24, 24);
    }, Object.freeze(['idle', 'open']));

    const complete = auditRasterBoil(source, { canvasFactory: pixelCanvasFactory() });
    const initial = auditRasterBoil(source, {
      canvasFactory: pixelCanvasFactory(),
      states: 'initial',
    });

    expect(complete.layers.map(({ state }) => state)).toEqual(['idle', 'open']);
    expect(complete.passed).toBe(false);
    expect(initial.layers.map(({ state }) => state)).toEqual(['idle']);
    expect(initial.passed).toBe(true);
  });

  it('returns the same immutable report for the same blueprint and options', () => {
    const source = blueprint(({ sketch }) => {
      const offset = sketch.integer(0, 2);
      sketch.context.fillRect(8 + offset, 8, 30, 30);
    });
    const options = { canvasFactory: pixelCanvasFactory(), frameCount: 4 } as const;

    const first = auditRasterBoil(source, options);
    const second = auditRasterBoil(source, options);

    expect(first).toEqual(second);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.layers)).toBe(true);
    expect(Object.isFrozen(first.layers[0]?.comparisons)).toBe(true);
  });

  it('rejects meaningless audit resolutions and thresholds', () => {
    const source = blueprint(() => undefined);
    expect(() => auditRasterBoil(source, {
      canvasFactory: pixelCanvasFactory(),
      frameCount: 1,
    })).toThrow(/frameCount/);
    expect(() => auditRasterBoil(source, {
      canvasFactory: pixelCanvasFactory(),
      gridSize: 1,
    })).toThrow(/gridSize/);
    expect(() => auditRasterBoil(source, {
      canvasFactory: pixelCanvasFactory(),
      structuralThreshold: 1.1,
    })).toThrow(/structuralThreshold/);
  });
});
