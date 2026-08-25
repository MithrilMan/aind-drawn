import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  CANVAS_RASTER_HAND,
  RasterFrameCache,
  Sketch,
  SpriteRig,
  auditRasterBoil,
  bakeRasterLayerFrame,
  createCanvasRasterHand,
  createUniformAssetAppearance,
  type AssetBlueprint,
  type CanvasFactory,
  type LayerDefinition,
  type RasterHand,
} from '../src/index.js';

const inertCanvasFactory: CanvasFactory = (width, height) => ({
  canvas: { width, height } as HTMLCanvasElement,
  context: {
    getImageData: () => ({ data: new Uint8ClampedArray(width * height * 4) }) as ImageData,
  } as unknown as CanvasRenderingContext2D,
});

function blueprint(
  draw: LayerDefinition['draw'],
  seed = 1042,
): AssetBlueprint {
  const layer: LayerDefinition = Object.freeze({
    id: 'art',
    semanticPartId: 'art',
    bone: 'root',
    order: 0,
    depth: 0,
    canvas: Object.freeze({ width: 32, height: 24 }),
    world: Object.freeze({ width: 1, height: 0.75 }),
    pivot: [0.5, 0.5] as const,
    states: Object.freeze(['idle']),
    draw,
  });
  return Object.freeze({
    blueprintVersion: 1,
    family: 'raster-portability-test',
    representation: 'raster',
    assetId: `raster-portability-test:${seed}`,
    seed,
    medium: 'graphite',
    appearance: createUniformAssetAppearance('authored', ['art']),
    manifest: Object.freeze({
      family: 'raster-portability-test',
      parts: Object.freeze([Object.freeze({ id: 'art', spatial: 'surface' as const })]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 0.75 }),
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

function onlyLayer(source: AssetBlueprint): LayerDefinition {
  const layer = source.layers[0];
  if (layer === undefined) throw new Error('Test blueprint has no layer');
  return layer;
}

function textureOf(rig: SpriteRig): THREE.Texture | undefined {
  let texture: THREE.Texture | undefined;
  rig.root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.material instanceof THREE.MeshBasicMaterial) {
      texture = object.material.map ?? undefined;
    }
  });
  return texture;
}

function textureImage(rig: SpriteRig): unknown {
  return textureOf(rig)?.image;
}

describe('raster runtime portability', () => {
  it('scopes base ink and paper to one Canvas raster hand', () => {
    let resetInk = '';
    let paper = '';
    const source = blueprint(({ sketch }) => {
      sketch.setInk([200, 10, 10]);
      sketch.setInk(null);
      resetInk = sketch.inkAlpha(0.5);
      paper = sketch.paperAlpha(0.25);
    });
    const hand = createCanvasRasterHand({
      id: 'sepia-test',
      ink: [48, 37, 29],
      paper: [236, 224, 198],
    });

    bakeRasterLayerFrame(source, onlyLayer(source), 'idle', 0, {
      canvasFactory: inertCanvasFactory,
      rasterHand: hand,
    });

    expect(resetInk).toBe('rgba(48,37,29,0.5)');
    expect(paper).toBe('rgba(236,224,198,0.25)');
    expect(hand.paperColor).toEqual([236, 224, 198]);
  });

  it('passes semantic frame context to a scoped alternative hand', () => {
    const seen: string[] = [];
    const hand: RasterHand = Object.freeze({
      id: 'delegating-test',
      paperColor: CANVAS_RASTER_HAND.paperColor,
      createSketch(request) {
        seen.push([
          request.blueprint.family,
          request.layer.semanticPartId,
          request.state,
          request.frame,
          request.seed,
        ].join(':'));
        return CANVAS_RASTER_HAND.createSketch(request);
      },
    });
    const source = blueprint(() => undefined);

    bakeRasterLayerFrame(source, onlyLayer(source), 'idle', 2, {
      canvasFactory: inertCanvasFactory,
      rasterHand: hand,
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatch(/^raster-portability-test:art:idle:2:\d+$/);
  });

  it('rejects a hand surface that does not match the authored layer canvas', () => {
    const hand: RasterHand = Object.freeze({
      id: 'wrong-size-test',
      paperColor: CANVAS_RASTER_HAND.paperColor,
      createSketch(request) {
        return new Sketch(
          request.layer.canvas.width + 1,
          request.layer.canvas.height,
          request.seed,
          request.canvasFactory,
        );
      },
    });
    const source = blueprint(() => undefined);

    expect(() => bakeRasterLayerFrame(source, onlyLayer(source), 'idle', 0, {
      canvasFactory: inertCanvasFactory,
      rasterHand: hand,
    })).toThrow(/must create a 32x24 surface/);
  });

  it('uses the selected hand in the shared visual-audit bake path', () => {
    let calls = 0;
    const hand: RasterHand = Object.freeze({
      id: 'audit-test',
      paperColor: Object.freeze([210, 220, 230] as const),
      createSketch(request) {
        calls += 1;
        const sketch = CANVAS_RASTER_HAND.createSketch(request);
        sketch.setPaperColor([210, 220, 230]);
        return sketch;
      },
    });
    const report = auditRasterBoil(blueprint(() => undefined), {
      frameCount: 3,
      canvasFactory: inertCanvasFactory,
      rasterHand: hand,
    });

    expect(report.passed).toBe(true);
    expect(report.handId).toBe('audit-test');
    expect(report.paperColor).toEqual([210, 220, 230]);
    expect(calls).toBe(3);
  });

  it('reuses immutable baked canvases across rigs sharing one blueprint', () => {
    let draws = 0;
    const source = blueprint(() => { draws += 1; });
    const cache = new RasterFrameCache({ canvasFactory: inertCanvasFactory });
    const first = new SpriteRig(source, { boilFrames: 2, frameCache: cache });
    const second = new SpriteRig(source, { boilFrames: 2, frameCache: cache });

    expect(draws).toBe(2);
    expect(cache.getDiagnostics()).toEqual({
      handId: 'canvas-2d',
      blueprints: 1,
      frames: 2,
      retainedPixels: 32 * 24 * 2,
      hits: 2,
      misses: 2,
    });
    expect(textureImage(first)).toBe(textureImage(second));
    expect(textureOf(first)?.source).toBe(textureOf(second)?.source);
    expect(textureOf(first)?.source.version).toBe(1);

    const liveImage = textureImage(first);
    const secondTexture = textureOf(second);
    cache.clear();
    expect(textureImage(first)).toBe(liveImage);
    expect(cache.getDiagnostics()).toMatchObject({ blueprints: 0, frames: 0, retainedPixels: 0 });

    first.dispose();
    expect(secondTexture?.source.data).toBe(liveImage);
    second.dispose();
  });

  it('keeps cache renderer configuration in one ownership boundary', () => {
    const source = blueprint(() => undefined);
    const cache = new RasterFrameCache({ canvasFactory: inertCanvasFactory });
    expect(() => new SpriteRig(source, {
      boilFrames: 1,
      frameCache: cache,
      canvasFactory: inertCanvasFactory,
    })).toThrow(/frameCache owns canvasFactory and rasterHand/);
  });

  it('does not alias distinct blueprint objects that happen to share an asset id', () => {
    let draws = 0;
    const draw = (): void => { draws += 1; };
    const firstBlueprint = blueprint(draw, 701);
    const secondBlueprint = blueprint(draw, 701);
    const cache = new RasterFrameCache({ canvasFactory: inertCanvasFactory });
    const first = new SpriteRig(firstBlueprint, { boilFrames: 1, frameCache: cache });
    const second = new SpriteRig(secondBlueprint, { boilFrames: 1, frameCache: cache });

    expect(draws).toBe(2);
    expect(cache.getDiagnostics()).toMatchObject({ blueprints: 2, frames: 2, hits: 0, misses: 2 });

    first.dispose();
    second.dispose();
    cache.clear();
  });
});
