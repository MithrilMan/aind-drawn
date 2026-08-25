import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  RasterWorkerClient,
  createUniformAssetAppearance,
  installRasterWorkerHost,
  type AssetBlueprint,
  type DrawingContext,
  type RasterWorkerEndpoint,
  type RasterWorkerHost,
} from '../src/index.js';

type Payload = Readonly<{ seed: number }>;

class TestOffscreenCanvas {
  public readonly width: number;
  public readonly height: number;
  private readonly context: DrawingContext;

  public constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.context = {
      getImageData: () => ({
        data: new Uint8ClampedArray(width * height * 4),
      }) as ImageData,
    } as unknown as DrawingContext;
  }

  public getContext(): DrawingContext {
    return this.context;
  }
}

function blueprint(seed: number): AssetBlueprint {
  return Object.freeze({
    blueprintVersion: 1,
    family: 'worker-test',
    representation: 'raster',
    assetId: `worker-test:${seed}`,
    seed,
    medium: 'graphite',
    appearance: createUniformAssetAppearance('storybook', ['art']),
    manifest: Object.freeze({
      family: 'worker-test',
      parts: Object.freeze([Object.freeze({ id: 'art', spatial: 'surface' as const })]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
    bones: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({ position: Object.freeze({ x: 0, y: 0 }), rotation: 0 }),
    })]),
    layers: Object.freeze([Object.freeze({
      id: 'art',
      semanticPartId: 'art',
      bone: 'root',
      order: 0,
      depth: 0,
      canvas: Object.freeze({ width: 8, height: 6 }),
      world: Object.freeze({ width: 1, height: 0.75 }),
      pivot: [0.5, 0.5] as const,
      states: Object.freeze(['idle']),
      draw: (): void => undefined,
    })]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

function linkedEndpoints(): Readonly<{
  endpoint: RasterWorkerEndpoint;
  host: RasterWorkerHost;
}> {
  const endpointListeners = new Set<(event: MessageEvent<unknown>) => void>();
  const hostListeners = new Set<(event: MessageEvent<unknown>) => void>();
  return Object.freeze({
    endpoint: Object.freeze({
      postMessage(message: unknown) {
        queueMicrotask(() => {
          for (const listener of hostListeners) listener({ data: message } as MessageEvent);
        });
      },
      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        endpointListeners.add(listener);
      },
      removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        endpointListeners.delete(listener);
      },
    }),
    host: Object.freeze({
      postMessage(message: unknown) {
        queueMicrotask(() => {
          for (const listener of endpointListeners) listener({ data: message } as MessageEvent);
        });
      },
      addEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        hostListeners.add(listener);
      },
      removeEventListener(_type: 'message', listener: (event: MessageEvent<unknown>) => void) {
        hostListeners.delete(listener);
      },
    }),
  });
}

let previousOffscreenCanvas: typeof OffscreenCanvas | undefined;

beforeEach(() => {
  previousOffscreenCanvas = globalThis.OffscreenCanvas;
  Object.defineProperty(globalThis, 'OffscreenCanvas', {
    configurable: true,
    value: TestOffscreenCanvas,
  });
});

afterEach(() => {
  if (previousOffscreenCanvas === undefined) {
    Reflect.deleteProperty(globalThis, 'OffscreenCanvas');
  } else {
    Object.defineProperty(globalThis, 'OffscreenCanvas', {
      configurable: true,
      value: previousOffscreenCanvas,
    });
  }
});

describe('raster worker protocol', () => {
  it('reconstructs blueprints in the worker and returns transferable bake and audit results', async () => {
    const link = linkedEndpoints();
    const removeHost = installRasterWorkerHost<Payload>(
      link.host,
      ({ seed }) => blueprint(seed),
    );
    const client = new RasterWorkerClient<Payload>(link.endpoint);

    const baked = await client.bakeFrame({
      payload: { seed: 42 },
      layerId: 'art',
      state: 'idle',
      frame: 1,
    });
    expect(baked.canvas).toBeInstanceOf(TestOffscreenCanvas);
    expect([baked.canvas.width, baked.canvas.height]).toEqual([8, 6]);
    expect(baked.paperColor).toEqual([247, 238, 218]);
    expect(baked.durationMilliseconds).toBeGreaterThanOrEqual(0);

    const audit = await client.auditBoil({
      payload: { seed: 42 },
      options: { frameCount: 2, states: 'initial' },
    });
    expect(audit.report).toMatchObject({
      assetId: 'worker-test:42',
      passed: true,
      frameCount: 2,
      paperColor: [247, 238, 218],
    });
    expect(audit.durationMilliseconds).toBeGreaterThanOrEqual(0);

    client.dispose();
    removeHost();
  });
});
