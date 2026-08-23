import * as THREE from 'three';

import type {
  AssetBlueprint,
  InteractionDefinition,
  LayerDefinition,
  Vector2,
} from '../contracts/raster-asset.js';
import { validateRasterAssetBlueprint } from '../contracts/blueprint-validation.js';
import type { CanvasFactory, DrawingCanvas } from '../core/canvas.js';
import { automaticCanvasFactory } from '../core/canvas.js';
import { combineSeed, hashString } from '../core/random.js';
import { Sketch } from '../core/sketch.js';

export type SpriteRigOptions = Readonly<{
  boilFrames?: number;
  canvasFactory?: CanvasFactory;
  textureAnisotropy?: number;
  drawRank?: number;
}>;

export type BonePose = Readonly<{
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}>;

type BoneRecord = Readonly<{
  group: THREE.Group;
  base: Vector2;
  parentBone: string | null;
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

function samePosition(left: Vector2, right: Vector2): boolean {
  const epsilon = 1e-7;
  return Math.abs(left.x - right.x) < epsilon && Math.abs(left.y - right.y) < epsilon;
}

/**
 * Bakes procedural canvas layers lazily and exposes a small, renderer-agnostic
 * bone API. The blueprint remains the source of truth; the rig only owns GPU
 * resources and transient animation state.
 */
export class SpriteRig {
  public readonly root = new THREE.Group();
  public readonly blueprint: AssetBlueprint;

  private readonly boilFrames: number;
  private readonly canvasFactory: CanvasFactory;
  private readonly textureAnisotropy: number;
  private readonly bones = new Map<string, BoneRecord>();
  private readonly layers = new Map<string, LayerRecord>();
  private readonly interactionStates = new Map<string, string>();
  private drawRank: number;
  private disposed = false;

  public constructor(blueprint: AssetBlueprint, options: SpriteRigOptions = {}) {
    this.blueprint = validateRasterAssetBlueprint(blueprint);
    this.boilFrames = Math.max(1, Math.floor(options.boilFrames ?? 3));
    this.canvasFactory = options.canvasFactory ?? automaticCanvasFactory;
    this.textureAnisotropy = Math.max(1, Math.floor(options.textureAnisotropy ?? 4));
    this.drawRank = Math.trunc(options.drawRank ?? 0);
    this.root.name = this.blueprint.assetId;
    try {
      this.buildBones(this.blueprint.layers);
      this.buildLayers(this.blueprint.layers);
      this.initializeInteractions(this.blueprint.interactions);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get boneIds(): readonly string[] {
    return [...this.bones.keys()];
  }

  public get layerIds(): readonly string[] {
    return [...this.layers.keys()];
  }

  public get interactionIds(): readonly string[] {
    return [...this.interactionStates.keys()];
  }

  public getBone(id: string): THREE.Group | null {
    return this.bones.get(id)?.group ?? null;
  }

  public setBonePose(id: string, pose: BonePose): void {
    const bone = this.requireBone(id);
    const record = this.bones.get(id);
    if (record === undefined) {
      throw new Error(`Unknown bone: ${id}`);
    }
    bone.position.set(
      record.base.x + (pose.x ?? 0),
      record.base.y + (pose.y ?? 0),
      bone.position.z,
    );
    bone.rotation.z = pose.rotation ?? 0;
    bone.scale.set(pose.scaleX ?? 1, pose.scaleY ?? 1, 1);
  }

  public resetPose(): void {
    for (const [id] of this.bones) {
      this.setBonePose(id, {});
    }
  }

  public setLayerState(layerId: string, state: string): void {
    const layer = this.requireLayer(layerId);
    if (!layer.definition.states.includes(state)) {
      throw new RangeError(`Layer ${layerId} does not define state ${state}`);
    }
    if (layer.current.state === state) {
      return;
    }
    this.ensureFrames(layer, state);
    layer.current.state = state;
    this.applyTexture(layer);
  }

  public getInteractionState(interactionId: string): string | null {
    return this.interactionStates.get(interactionId) ?? null;
  }

  public setInteractionState(interactionId: string, state: string): void {
    const interaction = this.requireInteraction(interactionId);
    if (!interaction.states.includes(state)) {
      throw new RangeError(`Interaction ${interactionId} does not define state ${state}`);
    }
    if (this.interactionStates.get(interactionId) === state) {
      return;
    }
    for (const binding of interaction.layerBindings) {
      const layerState = binding.stateByInteractionState[state];
      if (layerState === undefined) {
        throw new Error(`Interaction ${interactionId} has no ${state} binding for ${binding.layerId}`);
      }
      this.setLayerState(binding.layerId, layerState);
    }
    this.interactionStates.set(interactionId, state);
  }

  public setBoilFrame(layerId: string, frame: number): void {
    const layer = this.requireLayer(layerId);
    const nextFrame = normalizedFrame(frame, this.boilFrames);
    if (layer.current.frame === nextFrame) {
      return;
    }
    layer.current.frame = nextFrame;
    this.applyTexture(layer);
  }

  /**
   * Assigns the rig a contiguous render-order block. Higher ranks are drawn
   * later. This prevents transparent layers from different assets from
   * interleaving even when their local layer orders overlap.
   */
  public setDrawRank(rank: number): void {
    if (!Number.isFinite(rank)) {
      throw new RangeError('draw rank must be finite');
    }
    this.drawRank = Math.trunc(rank);
    for (const layer of this.layers.values()) {
      layer.mesh.renderOrder = this.renderOrder(layer.definition.order);
    }
  }

  public updateBoil(elapsedSeconds: number): void {
    for (const layer of this.layers.values()) {
      const frame = normalizedFrame(
        Math.floor(elapsedSeconds * layer.fps + layer.offset),
        this.boilFrames,
      );
      this.setBoilFrame(layer.definition.id, frame);
    }
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const layer of this.layers.values()) {
      layer.geometry.dispose();
      layer.material.dispose();
      for (const textures of layer.frames.values()) {
        for (const texture of textures) {
          texture.dispose();
        }
      }
    }
    this.layers.clear();
    this.bones.clear();
    this.interactionStates.clear();
    this.root.clear();
  }

  private initializeInteractions(definitions: readonly InteractionDefinition[]): void {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) {
        throw new Error(`Duplicate interaction id: ${definition.id}`);
      }
      ids.add(definition.id);
      if (!definition.states.includes(definition.initialState)) {
        throw new Error(`Interaction ${definition.id} has invalid initial state ${definition.initialState}`);
      }
      const sensor = this.blueprint.colliders.find(
        (collider) => collider.id === definition.sensorColliderId,
      );
      if (sensor?.kind !== 'sensor') {
        throw new Error(`Interaction ${definition.id} requires sensor ${definition.sensorColliderId}`);
      }
      if (this.blueprint.sockets[definition.activationSocketId] === undefined) {
        throw new Error(`Interaction ${definition.id} requires socket ${definition.activationSocketId}`);
      }
      for (const binding of definition.layerBindings) {
        const layer = this.requireLayer(binding.layerId);
        for (const state of definition.states) {
          const layerState = binding.stateByInteractionState[state];
          if (layerState === undefined || !layer.definition.states.includes(layerState)) {
            throw new Error(
              `Interaction ${definition.id} has invalid ${state} binding for ${binding.layerId}`,
            );
          }
        }
      }
      this.interactionStates.set(definition.id, definition.initialState);
      for (const binding of definition.layerBindings) {
        const layerState = binding.stateByInteractionState[definition.initialState];
        if (layerState !== undefined) {
          this.setLayerState(binding.layerId, layerState);
        }
      }
    }
  }

  private buildBones(definitions: readonly LayerDefinition[]): void {
    const pending = new Map<string, LayerDefinition>();
    for (const definition of definitions) {
      const existing = pending.get(definition.bone);
      if (existing !== undefined) {
        const sameParent = existing.parentBone === definition.parentBone;
        if (!samePosition(existing.position, definition.position) || !sameParent) {
          throw new Error(`Bone ${definition.bone} has conflicting layer anchors`);
        }
        continue;
      }
      pending.set(definition.bone, definition);
    }

    const attach = (id: string, ancestry: ReadonlySet<string>): BoneRecord => {
      const existing = this.bones.get(id);
      if (existing !== undefined) {
        return existing;
      }
      const definition = pending.get(id);
      if (definition === undefined) {
        throw new Error(`Missing definition for bone ${id}`);
      }
      if (ancestry.has(id)) {
        throw new Error(`Bone hierarchy contains a cycle at ${id}`);
      }
      const parentId = definition.parentBone ?? null;
      const group = new THREE.Group();
      group.name = `bone:${id}`;
      group.position.set(definition.position.x, definition.position.y, 0);
      const nextAncestry = new Set(ancestry);
      nextAncestry.add(id);
      if (parentId === null) {
        this.root.add(group);
      } else {
        attach(parentId, nextAncestry).group.add(group);
      }
      const record: BoneRecord = Object.freeze({
        group,
        base: Object.freeze({ ...definition.position }),
        parentBone: parentId,
      });
      this.bones.set(id, record);
      return record;
    };

    for (const id of pending.keys()) {
      attach(id, new Set());
    }
  }

  private buildLayers(definitions: readonly LayerDefinition[]): void {
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
      this.requireBone(definition.bone).add(mesh);

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
    if (layer.frames.has(state)) {
      return;
    }
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

  private requireBone(id: string): THREE.Group {
    const bone = this.bones.get(id)?.group;
    if (bone === undefined) {
      throw new Error(`Unknown bone: ${id}`);
    }
    return bone;
  }

  private requireLayer(id: string): LayerRecord {
    const layer = this.layers.get(id);
    if (layer === undefined) {
      throw new Error(`Unknown layer: ${id}`);
    }
    return layer;
  }

  private requireInteraction(id: string): InteractionDefinition {
    const interaction = this.blueprint.interactions.find((candidate) => candidate.id === id);
    if (interaction === undefined) {
      throw new Error(`Unknown interaction: ${id}`);
    }
    return interaction;
  }

  private renderOrder(localOrder: number): number {
    return this.drawRank * 1000 + localOrder;
  }
}

export function createSpriteRig(
  blueprint: AssetBlueprint,
  options: SpriteRigOptions = {},
): SpriteRig {
  return new SpriteRig(blueprint, options);
}
