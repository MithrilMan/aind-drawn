import * as THREE from 'three';

import type {
  AssetInstanceId,
  AssetInstanceState,
  RasterAssetInstance,
} from '../contracts/asset-instance.js';
import type {
  AffineTransform2,
  AssetBlueprint,
  ColliderShape2,
  Pose2,
  RasterInteractionBinding,
} from '../contracts/raster-asset.js';
import { validateRasterAssetBlueprint } from '../contracts/blueprint-validation.js';
import type { CanvasFactory } from '../core/canvas.js';
import { automaticCanvasFactory } from '../core/canvas.js';
import { InteractionStateController } from './interaction-state-controller.js';
import { resolveAssetInstanceId } from './instance-id.js';
import { readWorldPose2, writeWorldPose2 } from './instance-pose.js';
import { RasterSkeleton, type BonePose } from './raster-skeleton.js';
import type { RasterFrameCache } from './raster-frame-cache.js';
import { CANVAS_RASTER_HAND, type RasterHand } from './raster-hand.js';
import { SpriteLayerRenderer } from './sprite-layer-renderer.js';

export type { BonePose } from './raster-skeleton.js';

export type SpriteRigOptions = Readonly<{
  boilFrames?: number;
  canvasFactory?: CanvasFactory;
  rasterHand?: RasterHand;
  frameCache?: RasterFrameCache;
  textureAnisotropy?: number;
  drawRank?: number;
  instanceId?: AssetInstanceId;
}>;

type SpriteRuntimeParts = Readonly<{
  skeleton: RasterSkeleton;
  layers: SpriteLayerRenderer;
  interactions: InteractionStateController;
}>;

function requireInteractionBinding(
  blueprint: AssetBlueprint,
  interactionId: string,
): RasterInteractionBinding {
  const binding = blueprint.interactionBindings.find(
    (candidate) => candidate.interactionId === interactionId,
  );
  if (binding === undefined) {
    throw new Error(`Unknown raster interaction binding: ${interactionId}`);
  }
  return binding;
}

function applyInteractionState(
  blueprint: AssetBlueprint,
  layers: SpriteLayerRenderer,
  interactionId: string,
  state: string,
): void {
  const projection = requireInteractionBinding(blueprint, interactionId);
  for (const binding of projection.layers) {
    const layerState = binding.stateByInteractionState[state];
    if (layerState === undefined) {
      throw new Error(
        `Interaction ${interactionId} has no ${state} binding for ${binding.layerId}`,
      );
    }
    layers.setState(binding.layerId, layerState);
  }
}

function createRuntimeParts(
  root: THREE.Group,
  blueprint: AssetBlueprint,
  instanceId: AssetInstanceId,
  options: SpriteRigOptions,
): SpriteRuntimeParts {
  if (options.frameCache !== undefined
      && (options.canvasFactory !== undefined || options.rasterHand !== undefined)) {
    throw new Error('frameCache owns canvasFactory and rasterHand; configure them on the cache');
  }
  const skeleton = new RasterSkeleton(root, blueprint.bones);
  let layers: SpriteLayerRenderer | undefined;
  try {
    layers = new SpriteLayerRenderer(blueprint, skeleton, {
      boilFrames: options.boilFrames ?? 3,
      canvasFactory: options.canvasFactory ?? automaticCanvasFactory,
      rasterHand: options.rasterHand ?? CANVAS_RASTER_HAND,
      ...(options.frameCache === undefined ? {} : { frameCache: options.frameCache }),
      textureAnisotropy: options.textureAnisotropy ?? 4,
      drawRank: options.drawRank ?? 0,
      instanceId,
    });
    const layerRenderer = layers;
    const interactions = new InteractionStateController(
      blueprint.manifest.interactions,
      (interactionId, state) => {
        applyInteractionState(blueprint, layerRenderer, interactionId, state);
      },
    );
    return Object.freeze({ skeleton, layers, interactions });
  } catch (error) {
    layers?.dispose();
    skeleton.dispose();
    throw error;
  }
}

/**
 * Renderer adapter for an immutable raster blueprint. Focused collaborators
 * own skeleton topology, layer resources, and interaction state; the rig keeps
 * only the public instance boundary and spatial queries.
 */
export class SpriteRig implements RasterAssetInstance {
  public readonly dimension = '2d' as const;
  public readonly root = new THREE.Group();
  public readonly blueprint: AssetBlueprint;
  public readonly instanceId: AssetInstanceId;
  public readonly assetId: string;

  private readonly skeleton: RasterSkeleton;
  private readonly layers: SpriteLayerRenderer;
  private readonly interactions: InteractionStateController;
  private playbackTime = 0;
  private disposed = false;

  public constructor(blueprint: AssetBlueprint, options: SpriteRigOptions = {}) {
    this.blueprint = validateRasterAssetBlueprint(blueprint);
    this.assetId = this.blueprint.assetId;
    this.instanceId = resolveAssetInstanceId(this.assetId, options.instanceId);
    this.root.name = `instance:${this.instanceId}`;
    this.root.userData.assetId = this.assetId;
    this.root.userData.instanceId = this.instanceId;
    const runtime = createRuntimeParts(this.root, this.blueprint, this.instanceId, options);
    this.skeleton = runtime.skeleton;
    this.layers = runtime.layers;
    this.interactions = runtime.interactions;
    try {
      this.setPlaybackTime(0);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get boneIds(): readonly string[] {
    return this.skeleton.ids;
  }

  public get layerIds(): readonly string[] {
    return this.layers.ids;
  }

  public get interactionIds(): readonly string[] {
    return this.interactions.ids;
  }

  public getInstanceState(): AssetInstanceState<Pose2> {
    return Object.freeze({
      id: this.instanceId,
      assetId: this.assetId,
      transform: readWorldPose2(this.root),
      interactionStates: this.interactions.snapshot(),
      playbackTime: this.playbackTime,
    });
  }

  public setWorldPose(pose: Pose2): void {
    writeWorldPose2(this.root, pose);
  }

  public setPlaybackTime(time: number): void {
    if (!Number.isFinite(time)) throw new RangeError('playback time must be finite');
    this.playbackTime = time;
    this.layers.setPlaybackTime(time);
  }

  public getBone(id: string): THREE.Group | null {
    return this.skeleton.get(id);
  }

  public getSocketWorldPose(id: string): Pose2 | null {
    const socket = this.blueprint.sockets.find((candidate) => candidate.id === id);
    if (socket === undefined) return null;
    const bone = this.skeleton.require(socket.bone);
    bone.updateWorldMatrix(true, false);
    const position = new THREE.Vector3(
      socket.localPose.position.x,
      socket.localPose.position.y,
      0,
    ).applyMatrix4(bone.matrixWorld);
    const direction = new THREE.Vector3(
      Math.cos(socket.localPose.rotation),
      Math.sin(socket.localPose.rotation),
      0,
    ).transformDirection(bone.matrixWorld);
    return Object.freeze({
      position: Object.freeze({ x: position.x, y: position.y }),
      rotation: Math.atan2(direction.y, direction.x),
    });
  }

  public getColliderWorldShape(id: string): ColliderShape2 | null {
    const definition = this.blueprint.colliders.find((candidate) => candidate.id === id);
    if (definition === undefined) return null;
    const bone = this.skeleton.require(definition.bone);
    bone.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(
        definition.localPose.position.x,
        definition.localPose.position.y,
        0,
      ),
      new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        definition.localPose.rotation,
      ),
      new THREE.Vector3(1, 1, 1),
    );
    const elements = new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, local).elements;
    const worldTransform: AffineTransform2 = Object.freeze([
      elements[0], elements[1], 0,
      elements[4], elements[5], 0,
      elements[12], elements[13], 1,
    ]);
    return Object.freeze({ definition, worldTransform });
  }

  public setBonePose(id: string, pose: BonePose): void {
    this.skeleton.setPose(id, pose);
  }

  public resetPose(): void {
    this.skeleton.reset();
  }

  public setLayerState(layerId: string, state: string): void {
    this.layers.setState(layerId, state);
  }

  public getInteractionState(interactionId: string): string | null {
    return this.interactions.get(interactionId);
  }

  public setInteractionState(interactionId: string, state: string): void {
    this.interactions.set(interactionId, state);
  }

  public setBoilFrame(layerId: string, frame: number): void {
    this.layers.setBoilFrame(layerId, frame);
  }

  /** Assigns the rig a contiguous global render-order block. */
  public setDrawRank(rank: number): void {
    this.layers.setDrawRank(rank);
  }

  public updateBoil(elapsedSeconds: number): void {
    this.setPlaybackTime(elapsedSeconds);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.layers.dispose();
    this.interactions.dispose();
    this.skeleton.dispose();
  }
}

export function createSpriteRig(
  blueprint: AssetBlueprint,
  options: SpriteRigOptions = {},
): SpriteRig {
  return new SpriteRig(blueprint, options);
}
