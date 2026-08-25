# Raster rendering and portability

## Decision

Raster assets keep authored drawing commands renderer-neutral and bake them at an explicit
runtime boundary. The default boundary uses Canvas 2D; consumers may select a scoped
`RasterHand`, reuse immutable baked frames through a scene-owned `RasterFrameCache`, or consume
`bakeRasterLayerFrame` from another renderer adapter. Worker hosts may reconstruct a blueprint from
a serialisable identity payload and run the same baker through `OffscreenCanvas`.

This is deliberately smaller than a renderer framework. Asset recipes still own identity and
semantic structure, `Sketch` owns the mark vocabulary, art direction supplies default ink and
paper, a raster hand owns the drawing surface and may explicitly override those defaults, and the
final renderer owns textures, transforms, batching, and disposal.

```text
Asset identity + raster blueprint
               |
               v
        RasterHand.createSketch     selected once per baked frame
               |
               v
       layer.draw({ Sketch, ... })   public authored mark vocabulary
               |
               v
       immutable DrawingCanvas
          |                 |
          v                 v
  RasterFrameCache     external adapter
          |            (Pixi, custom engine, export)
          v
  SpriteRig / Three.js textures
```

## Public contracts

### `RasterHand`

A raster hand receives the complete semantic bake request and creates one `Sketch`. Selection is
scoped to a cache, rig, audit, or direct bake call; there is no mutable global renderer setting.
The default `CANVAS_RASTER_HAND` preserves the existing Canvas 2D output.

`createCanvasRasterHand` also allows a consumer to override directed ink and paper colours without
changing asset recipes:

```ts
import {
  RasterFrameCache,
  SpriteRig,
  createCanvasRasterHand,
} from '@mithrilman/aind-drawn';

const hand = createCanvasRasterHand({
  id: 'night-print',
  ink: [227, 231, 238],
  paper: [24, 27, 32],
});
const frameCache = new RasterFrameCache({ rasterHand: hand });
const rig = new SpriteRig(blueprint, { frameCache });

// The rig owns its textures. The scene owns the reusable baked canvases.
rig.dispose();
frameCache.clear();
```

A custom hand may return a `Sketch` subclass to change mark implementation while retaining the
public asset drawing vocabulary. It must not reroll semantic decisions or reinterpret
`semanticPartId`. The hand object is borrowed by the cache and rig; a resource-owning custom
implementation remains responsible for its own lifecycle.

### `bakeRasterLayerFrame`

Renderer integrations can request the same deterministic layer canvas used by `SpriteRig` and
`auditRasterBoil`:

```ts
const layer = blueprint.layers[0];
const baked = bakeRasterLayerFrame(blueprint, layer, layer.initialState, 0, {
  rasterHand: hand,
});

rendererTextureSource.set(baked.canvas);
```

The function validates layer ownership, state, and frame index. It returns the drawing canvas and
context but creates no Three.js object. A custom hand must preserve the authored layer-canvas
dimensions. A renderer adapter must own any uploaded texture and its disposal.

### `RasterFrameCache`

The cache removes repeated procedural baking when many runtime instances share one immutable
blueprint. It keys entries by the exact blueprint and layer objects plus state and boil frame. It
does not key by `assetId`: distinct blueprint objects may intentionally expose the same semantic
asset through different raster policies.

Every `SpriteRig` still owns and disposes its own Three.js texture wrappers. Wrappers created from
the same cached immutable canvas share a `THREE.Source`; with equal sampler parameters, Three.js
therefore reuses one renderer upload and GPU allocation while retaining reference-counted disposal.
Clearing the cache releases retained canvas references without invalidating live rigs.
`getDiagnostics()` reports retained frame and pixel counts together with lifetime hits and misses
so a game can put a real budget around cache growth.

Use one cache per bounded scene, level, or asset pool and clear it at that owner's lifecycle
boundary. Do not create a process-global cache that quietly accumulates every generated seed ever
seen; that would be a memory leak wearing an optimisation badge.

### `RasterWorkerClient`

The worker protocol transports consumer-defined recipe data rather than blueprints with functions:

```ts
// Main thread
const worker = new Worker(new URL('./raster.worker.js', import.meta.url), { type: 'module' });
const client = new RasterWorkerClient<MySerializablePayload>(worker);
const frame = await client.bakeFrame({ payload, layerId: 'head', state: 'idle', frame: 0 });

// Worker module
installRasterWorkerHost<MySerializablePayload>(self, (payload) => {
  const identity = decodeMyIdentity(payload.identity);
  return createMyRasterBlueprint(identity, payload.options);
});
```

`client.dispose()` rejects outstanding requests but deliberately does not terminate the borrowed
worker; its owner controls worker pooling and lifecycle.

## Performance contract

The hot frame path does not call `RasterHand`: hands run only while a layer frame is baked.
`RasterFrameCache` lookup and shared-source resolution occur only during rig construction, and
animation still switches among already uploaded textures. The default runtime therefore adds no
per-mark polymorphism and no steady-state animation work.

`pnpm benchmark:raster-runtime` measures repeated construction of eight rigs from one character
blueprint with two boil frames. The benchmark executes the real deterministic path construction
against a no-op Canvas context so it isolates procedural generation, cache lookup, rig allocation,
and texture construction from browser rasterisation and GPU upload.

The development-machine run on 2026-08-25 after the appearance integration produced:

| Scenario | Mean time | Relative to independent baking |
| --- | ---: | ---: |
| Eight independent rigs | 23.28 ms | 1.00x |
| Eight rigs, cold scene cache | 5.30 ms | 0.23x |
| Eight rigs, warm scene cache | 3.60 ms | 0.15x |

The warm cache was 6.46 times faster in this CPU-only benchmark. These figures are a
regression baseline, not a frame-rate promise: real Canvas and GPU costs depend on browser,
resolution, device, renderer upload policy, and asset complexity. In a game, measure at least:

- bake latency and frame-cache hit ratio;
- retained cache pixels and texture memory;
- texture upload time, shared-source reuse, and first-use stalls;
- steady-state draw calls, batching, and frame time;
- worker startup, recipe reconstruction, queue latency, and transfer cost.

## Art-direction boundary

`MediumId` remains the pigment-deposition technique shared by raster and Doodle 3D. It must not
become a container for composition, collage structure, surreal substitutions, or scene dressing.

Stable art-direction decisions live in immutable `ArtDirectionRecipe` data and address semantic
parts through explicit family-owned `ArtRole` bindings. The shipped `authored`, `storybook`, and
`cut-paper` directions work across character, building, vehicle, and tree assets and compile into
raster, smooth-solid, and Doodle output. Raster boil may vary pressure, pickup, and local wobble,
but it cannot change silhouette, topology, decoration ownership, or composition between frames.

Paper, backdrop, ground, and lighting are exposed as scene direction. A consumer may use them as a
coherent default while retaining ownership of layout and environment. See
[`art-direction-and-surfaces.md`](art-direction-and-surfaces.md) for the complete orthogonal model.

## Backend roadmap

### 1. Worker-backed OffscreenCanvas baking

`RasterWorkerClient` and `installRasterWorkerHost` implement the experiment. The host receives a
consumer-defined serialisable payload, reconstructs the blueprint locally, and supports two jobs:
transfer one baked `OffscreenCanvas`, or execute a complete boil audit. Draw callbacks never cross
structured clone. Projection Studio uses the worker for its six-medium audit and falls back to the
synchronous public path when the browser lacks Worker or OffscreenCanvas support.

The boundary is intentionally generic: the library does not impose a closed family payload union.
It also remains opt-in. A game should benchmark worker startup, queue latency, reconstruction,
transfer, and texture upload before routing every bake through it; small scenes and tests retain the
synchronous Canvas hand.

### 2. PixiJS v8 adapter

PixiJS is the preferred first non-Three 2D renderer spike. Its texture sources accept Canvas and
OffscreenCanvas inputs, while its renderer can target WebGL or WebGPU
([textures](https://pixijs.com/8.x/guides/components/textures),
[architecture](https://pixijs.com/8.x/guides/concepts/architecture)). Raster bones map naturally to
containers and baked frames to sprites. The adapter should consume `bakeRasterLayerFrame`, preserve
core sockets/colliders, batch sprites, and own all Pixi texture/source lifecycle.

Do not make Pixi a package dependency until the adapter proves a game workload. Phaser is not the
first target: it is a complete game framework, and changing a CanvasTexture under WebGL requires a
refresh/re-upload that its own documentation recommends minimising
([Phaser CanvasTexture](https://docs.phaser.io/api-documentation/class/textures-canvastexture)).

### 3. Three.js WebGPU spike

`WebGPURenderer` is not a switch to flip on the current Doodle 3D compositor. Three.js documents a
WebGL 2 fallback, but custom `ShaderMaterial`, `RawShaderMaterial`, `onBeforeCompile`, and the old
`EffectComposer` pipeline are not supported; shaders and post-processing must move to TSL and the
new node pipeline ([renderer guidance](https://threejs.org/manual/en/webgpurenderer),
[post-processing](https://threejs.org/manual/en/webgpu-postprocessing)).

Run this spike only after GPU telemetry identifies a useful bottleneck. Treat it as a compositor
rewrite with visual parity tests, not as dependency housekeeping.

### 4. CanvasKit hand, only for a demonstrated visual need

CanvasKit exposes Skia through WebAssembly and can provide a different raster backend
([CanvasKit](https://docs.skia.org/docs/user/modules/canvaskit/)). It also brings a WASM payload,
its own surface model, and explicit deletion requirements for WASM-backed objects. It is a valid
future experiment if Skia text/path fidelity or backend consistency becomes valuable. Its surface
does not satisfy the current Canvas 2D `Sketch` contract natively, so the spike must either prove a
bounded intermediate-composite hand or justify a separate surface adapter. It is not the default
hand merely because abstract portability sounds sophisticated.

### Draw-on reveal

Progressive semantic-stroke reveal is shipped in the inked-solid runtime. Stroke geometry stores
normalized progress once; blueprints compile deterministic stagger windows; a registration advances
one shader uniform through `setStrokeReveal`. No geometry is rebuilt per frame. Reveal remains
projection policy and never enters generic asset identity.

## Required verification

For a new hand or renderer adapter:

1. run determinism and public API verification with `pnpm verify`;
2. run `auditRasterBoil` with the selected hand, not only the default;
3. inspect the deterministic multi-medium contact sheet through the public pipeline;
4. benchmark cold and warm construction, memory, upload, and steady-state frame time;
5. verify that cache or renderer disposal cannot invalidate another live owner;
6. test at least one articulated asset with states, sockets, colliders, and mirrored facing.
