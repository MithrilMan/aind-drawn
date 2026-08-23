import * as THREE from 'three';

import type { AssetBlueprint, LayerDefinition } from '../contracts/raster-asset.js';
import type { CanvasFactory, DrawingCanvas } from '../core/canvas.js';
import { combineSeed, hashString } from '../core/random.js';
import { Sketch } from '../core/sketch.js';
import type { AssetInstanceId } from '../contracts/asset-instance.js';
import type { RasterSkeleton } from './raster-skeleton.js';

export type SpriteLayerRendererOptions = Readonly<{
  boilFrames: number;
  canvasFactory: CanvasFactory;
  textureAnisotropy: number;
  drawRank: number;
  instanceId: AssetInstanceId;
}>;

type LayerRecord = Readonly<{
  definition: LayerDefinition;
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  geometry: THREE.PlaneGeometry;
  frames: Map<string, THREE.CanvasTexture[]>;
  canvases: Map<string, DrawingCanvas[]>;
  fps: number;
  offset: number;
  current: { state: string; frame: number };
}>;

function normalizedFrame(frame: number, count: number): number {
  return ((Math.floor(frame) % count) + count) % count;
}

function createTexture(canvas: DrawingCanvas, anisotropy: number): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas as HTMLCanvasElement);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/** Owns raster layer meshes, baked frames, visual state, ordering, and disposal. */
export class SpriteLayerRenderer {
  private readonly blueprint: AssetBlueprint;
  private readonly skeleton: RasterSkeleton;
  private readonly boilFrames: number;
  private readonly canvasFactory: CanvasFactory;
  private readonly textureAnisotropy: number;
  private readonly instanceId: AssetInstanceId;
  private readonly layers = new Map<string, LayerRecord>();
  private drawRank: number;

  public constructor(
    blueprint: AssetBlueprint,
    skeleton: RasterSkeleton,
    options: SpriteLayerRendererOptions,
  ) {
    this.blueprint = blueprint;
    this.skeleton = skeleton;
    this.boilFrames = Math.max(1, Math.floor(options.boilFrames));
    this.canvasFactory = options.canvasFactory;
    this.textureAnisotropy = Math.max(1, Math.floor(options.textureAnisotropy));
    this.drawRank = Math.trunc(options.drawRank);
    this.instanceId = options.instanceId;
    try {
      this.build(blueprint.layers);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get ids(): readonly string[] {
    return [...this.layers.keys()];
  }

  public has(id: string): boolean {
    return this.layers.has(id);
  }

  public setState(layerId: string, state: string): void {
    const layer = this.require(layerId);
    if (!layer.definition.states.includes(state)) {
      throw new RangeError(`Layer ${layerId} does not define state ${state}`);
    }
    if (layer.current.state === state) return;
    this.ensureFrames(layer, state);
    layer.current.state = state;
    this.applyTexture(layer);
  }

  public setBoilFrame(layerId: string, frame: number): void {
    const layer = this.require(layerId);
    const nextFrame = normalizedFrame(frame, this.boilFrames);
    if (layer.current.frame === nextFrame) return;
    layer.current.frame = nextFrame;
    this.applyTexture(layer);
  }

  public setPlaybackTime(time: number): void {
    for (const layer of this.layers.values()) {
      const frame = normalizedFrame(
        Math.floor(time * layer.fps + layer.offset),
        this.boilFrames,
      );
      this.setBoilFrame(layer.definition.id, frame);
    }
  }

  public setDrawRank(rank: number): void {
    if (!Number.isFinite(rank)) throw new RangeError('draw rank must be finite');
    this.drawRank = Math.trunc(rank);
    for (const layer of this.layers.values()) {
      layer.mesh.renderOrder = this.renderOrder(layer.definition.order);
    }
  }

  public dispose(): void {
    for (const layer of this.layers.values()) {
      layer.geometry.dispose();
      layer.material.dispose();
      for (const textures of layer.frames.values()) {
        for (const texture of textures) texture.dispose();
      }
    }
    this.layers.clear();
  }

  private build(definitions: readonly LayerDefinition[]): void {
    const sorted = [...definitions].sort((left, right) => left.order - right.order);
    for (const definition of sorted) {
      if (this.layers.has(definition.id)) {
        throw new Error(`Duplicate layer id: ${definition.id}`);
      }
      const geometry = new THREE.PlaneGeometry(definition.world.width, definition.world.height);
      geometry.translate(
        (0.5 - definition.pivot[0]) * definition.world.width,
        (0.5 - definition.pivot[1]) * definition.world.height,
        0,
      );
      const material = new THREE.MeshBasicMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `layer:${definition.id}`;
      mesh.renderOrder = this.renderOrder(definition.order);
      mesh.position.z = definition.order * 0.001 + definition.depth * 0.0001;
      mesh.userData.layerId = definition.id;
      mesh.userData.assetId = this.blueprint.assetId;
      mesh.userData.instanceId = this.instanceId;
      this.skeleton.require(definition.bone).add(mesh);

      const hash = hashString(`${this.blueprint.seed}:${definition.id}`);
      const record: LayerRecord = {
        definition,
        mesh,
        material,
        geometry,
        frames: new Map(),
        canvases: new Map(),
        fps: 0.85 + (hash % 100) / 130,
        offset: (hash >>> 8) % 10,
        current: { state: definition.states[0] ?? 'idle', frame: 0 },
      };
      this.layers.set(definition.id, record);
      this.ensureFrames(record, record.current.state);
      this.applyTexture(record);
    }
  }

  private ensureFrames(layer: LayerRecord, state: string): void {
    if (layer.frames.has(state)) return;
    const textures: THREE.CanvasTexture[] = [];
    const canvases: DrawingCanvas[] = [];
    layer.canvases.set(state, canvases);
    layer.frames.set(state, textures);
    try {
      for (let frame = 0; frame < this.boilFrames; frame += 1) {
        const seed = combineSeed(
          this.blueprint.seed,
          `asset:boil:${layer.definition.id}:${state}:${frame}`,
        );
        const sketch = new Sketch(
          layer.definition.canvas.width,
          layer.definition.canvas.height,
          seed,
          this.canvasFactory,
        );
        layer.definition.draw({ sketch, state, frame });
        canvases.push(sketch.canvas);
        textures.push(createTexture(sketch.canvas, this.textureAnisotropy));
      }
    } catch (error) {
      for (const texture of textures) texture.dispose();
      layer.canvases.delete(state);
      layer.frames.delete(state);
      throw error;
    }
  }

  private applyTexture(layer: LayerRecord): void {
    this.ensureFrames(layer, layer.current.state);
    const textures = layer.frames.get(layer.current.state);
    const texture = textures?.[layer.current.frame];
    if (texture === undefined) {
      throw new Error(`Missing texture for ${layer.definition.id}:${layer.current.state}`);
    }
    layer.material.map = texture;
    layer.material.needsUpdate = true;
  }

  private require(id: string): LayerRecord {
    const layer = this.layers.get(id);
    if (layer === undefined) throw new Error(`Unknown layer: ${id}`);
    return layer;
  }

  private renderOrder(localOrder: number): number {
    return this.drawRank * 1000 + localOrder;
  }
}
