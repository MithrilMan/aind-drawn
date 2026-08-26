import * as THREE from 'three';

import type {
  AssetInstanceId,
  AssetInstanceState,
  SolidAssetInstance,
} from '../contracts/asset-instance.js';
import type {
  AffineTransform3,
  ColliderShape3,
  Pose3,
  SolidAssetBlueprint,
  SolidInteractionBinding,
  SolidNodeDefinition,
  SolidNodeState,
} from '../contracts/solid-asset.js';
import type { InteractionSpec } from '../contracts/asset-semantics.js';
import { validateSolidAssetBlueprint } from '../contracts/blueprint-validation.js';
import { resolveSemanticSurface } from '../appearance/art-direction.js';
import { surfaceFrame } from '../core/geometry3.js';
import { createSolidGeometry, type SolidGeometryFactoryOptions } from './solid-geometry.js';
import { resolveAssetInstanceId } from './instance-id.js';
import { readWorldPose3, writeWorldPose3 } from './instance-pose.js';
import {
  SolidSurfaceResourceCache,
  type SolidSurfaceLease,
  type SolidSurfaceResourceCacheOptions,
} from './solid-surfaces.js';

type SolidPartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
type NodeRestTransform = Readonly<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;
type PartRestTransform = NodeRestTransform & Readonly<{ visible: boolean }>;

export type SolidRigOptions = SolidGeometryFactoryOptions & Readonly<{
  instanceId?: AssetInstanceId;
  surfaceCache?: SolidSurfaceResourceCache;
  environmentMap?: SolidSurfaceResourceCacheOptions['environmentMap'];
}>;

/**
 * Three.js adapter for data-only solid blueprints. Asset code never imports
 * Three.js; this runtime owns all scene objects and GPU resources.
 */
export class SolidRig implements SolidAssetInstance {
  public readonly dimension = '3d' as const;
  public readonly root = new THREE.Group();
  public readonly blueprint: SolidAssetBlueprint;
  public readonly instanceId: AssetInstanceId;
  public readonly assetId: string;

  private readonly nodes = new Map<string, THREE.Group>();
  private readonly nodeRest = new Map<string, NodeRestTransform>();
  private readonly parts = new Map<string, SolidPartMesh>();
  private readonly partRest = new Map<string, PartRestTransform>();
  private readonly surfaceLeases = new Map<string, SolidSurfaceLease>();
  private readonly surfaceCache: SolidSurfaceResourceCache;
  private readonly ownsSurfaceCache: boolean;
  private readonly interactionStates = new Map<string, string>();
  private readonly containmentStates = new Map<string, boolean>();
  private playbackTime = 0;
  private disposed = false;

  public constructor(blueprint: SolidAssetBlueprint, options: SolidRigOptions = {}) {
    this.blueprint = validateSolidAssetBlueprint(blueprint);
    this.assetId = this.blueprint.assetId;
    this.instanceId = resolveAssetInstanceId(this.assetId, options.instanceId);
    if (options.surfaceCache !== undefined && options.environmentMap !== undefined) {
      throw new Error('SolidRig environmentMap belongs to its scene-scoped surfaceCache');
    }
    this.ownsSurfaceCache = options.surfaceCache === undefined;
    this.surfaceCache = options.surfaceCache
      ?? new SolidSurfaceResourceCache({
        ...(options.environmentMap === undefined ? {} : { environmentMap: options.environmentMap }),
      });
    this.root.name = `instance:${this.instanceId}`;
    this.root.userData.assetId = this.assetId;
    this.root.userData.instanceId = this.instanceId;
    this.root.userData.appearanceFingerprint = this.blueprint.appearance.appearanceFingerprint;
    try {
      const surfaces = new Map(this.blueprint.surfaces.map((surface) => [surface.id, surface]));
      this.buildNodes(this.blueprint.nodes);
      for (const part of [...this.blueprint.parts].sort((left, right) => left.order - right.order)) {
        const parent = this.requireNode(part.node);
        const surface = surfaces.get(part.surfaceId);
        if (surface === undefined) throw new Error(`Unknown solid surface: ${part.surfaceId}`);
        const leaseKey = `${part.surfaceId}:${part.semanticPartId}`;
        let lease = this.surfaceLeases.get(leaseKey);
        if (lease === undefined) {
          lease = this.surfaceCache.acquire(resolveSemanticSurface(
            surface,
            this.blueprint.appearance,
            part.semanticPartId,
          ));
          this.surfaceLeases.set(leaseKey, lease);
        }
        const mesh: SolidPartMesh = new THREE.Mesh(
          createSolidGeometry(part.geometry, options),
          lease.material,
        );
        mesh.name = `part:${part.id}`;
        mesh.renderOrder = part.order;
        mesh.visible = part.visible ?? true;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = part.receiveShadow;
        mesh.userData.partId = part.id;
        mesh.userData.assetId = this.assetId;
        mesh.userData.instanceId = this.instanceId;
        mesh.userData.surfaceId = part.surfaceId;
        mesh.position.set(...part.placement.position);
        if (part.placement.surface !== undefined) {
          const frame = surfaceFrame(part.placement.surface.normal, part.placement.surface.roll);
          const matrix = new THREE.Matrix4().makeBasis(
            new THREE.Vector3(...frame.right),
            new THREE.Vector3(...frame.up),
            new THREE.Vector3(...frame.normal),
          );
          mesh.quaternion.setFromRotationMatrix(matrix);
        }
        if (part.placement.rotation !== undefined) {
          const localRotation = new THREE.Quaternion().setFromEuler(
            new THREE.Euler(...part.placement.rotation, 'XYZ'),
          );
          mesh.quaternion.multiply(localRotation);
        }
        parent.add(mesh);
        this.parts.set(part.id, mesh);
        this.partRest.set(part.id, Object.freeze({
          position: mesh.position.clone(),
          quaternion: mesh.quaternion.clone(),
          scale: mesh.scale.clone(),
          visible: mesh.visible,
        }));
      }
      this.initializeInteractions(
        this.blueprint.manifest.interactions,
        this.blueprint.interactionBindings,
      );
      for (const containment of this.blueprint.containments ?? []) {
        this.containmentStates.set(containment.id, false);
        this.applyContainmentState(containment.id, false);
      }
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get nodeIds(): readonly string[] {
    return [...this.nodes.keys()];
  }

  public get partIds(): readonly string[] {
    return [...this.parts.keys()];
  }

  public get interactionIds(): readonly string[] {
    return [...this.interactionStates.keys()];
  }

  public get containmentIds(): readonly string[] {
    return [...this.containmentStates.keys()];
  }

  public getInstanceState(): AssetInstanceState<Pose3> {
    return Object.freeze({
      id: this.instanceId,
      assetId: this.assetId,
      transform: readWorldPose3(this.root),
      interactionStates: Object.freeze(Object.fromEntries(this.interactionStates)),
      playbackTime: this.playbackTime,
    });
  }

  public setWorldPose(pose: Pose3): void {
    writeWorldPose3(this.root, pose);
  }

  public setPlaybackTime(time: number): void {
    if (!Number.isFinite(time)) throw new RangeError('playback time must be finite');
    this.playbackTime = time;
  }

  public getNode(id: string): THREE.Group | null {
    return this.nodes.get(id) ?? null;
  }

  public getPart(id: string): SolidPartMesh | null {
    return this.parts.get(id) ?? null;
  }

  public setPartVisible(id: string, visible: boolean): void {
    const part = this.parts.get(id);
    if (part === undefined) throw new Error(`Unknown solid part: ${id}`);
    part.visible = visible;
  }

  /** Selects the original or precompiled contained geometry without changing identity. */
  public setContainmentState(id: string, active: boolean): void {
    if (!this.containmentStates.has(id)) throw new Error(`Unknown solid containment: ${id}`);
    if (this.containmentStates.get(id) === active) return;
    this.applyContainmentState(id, active);
    this.containmentStates.set(id, active);
  }

  /** Restores one authored node without disturbing unrelated interactions. */
  public resetNodePose(id: string): void {
    const node = this.requireNode(id);
    const rest = this.nodeRest.get(id);
    if (rest === undefined) throw new Error(`Solid node ${id} has no rest transform`);
    node.position.copy(rest.position);
    node.quaternion.copy(rest.quaternion);
    node.scale.copy(rest.scale);
  }

  /** Restores one authored part transform and its initial visibility. */
  public resetPartPose(id: string): void {
    const part = this.parts.get(id);
    const rest = this.partRest.get(id);
    if (part === undefined || rest === undefined) throw new Error(`Unknown solid part: ${id}`);
    part.position.copy(rest.position);
    part.quaternion.copy(rest.quaternion);
    part.scale.copy(rest.scale);
    part.visible = rest.visible;
  }

  private applyContainmentState(id: string, active: boolean): void {
    const containment = this.blueprint.containments?.find((candidate) => candidate.id === id);
    if (containment === undefined) throw new Error(`Unknown solid containment: ${id}`);
    for (const variant of containment.variants) {
      const source = this.parts.get(variant.sourcePartId);
      const contained = variant.containedPartId === undefined
        ? undefined
        : this.parts.get(variant.containedPartId);
      const sourceRest = this.partRest.get(variant.sourcePartId);
      if (
        source === undefined
        || (variant.containedPartId !== undefined && contained === undefined)
        || sourceRest === undefined
      ) {
        throw new Error(`Solid containment ${id} references missing runtime geometry`);
      }
      source.visible = active ? false : sourceRest.visible;
      if (contained !== undefined) contained.visible = active;
    }
  }

  public getSocketWorldPose(id: string): Pose3 | null {
    const socket = this.blueprint.sockets.find((candidate) => candidate.id === id);
    if (socket === undefined) return null;
    const node = this.requireNode(socket.node);
    node.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...socket.localPose.position),
      new THREE.Quaternion(...socket.localPose.rotation),
      new THREE.Vector3(1, 1, 1),
    );
    const world = new THREE.Matrix4().multiplyMatrices(node.matrixWorld, local);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    world.decompose(position, rotation, new THREE.Vector3());
    return Object.freeze({
      position: Object.freeze([position.x, position.y, position.z] as const),
      rotation: Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const),
    });
  }

  public getColliderWorldShape(id: string): ColliderShape3 | null {
    const definition = this.blueprint.colliders.find((candidate) => candidate.id === id);
    if (definition === undefined) return null;
    const node = this.requireNode(definition.node);
    node.updateWorldMatrix(true, false);
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(...definition.localPose.position),
      new THREE.Quaternion(...definition.localPose.rotation),
      new THREE.Vector3(1, 1, 1),
    );
    const elements = new THREE.Matrix4().multiplyMatrices(node.matrixWorld, local).elements;
    const worldTransform: AffineTransform3 = Object.freeze([...elements]);
    return Object.freeze({ definition, worldTransform });
  }

  public getInteractionState(id: string): string | null {
    return this.interactionStates.get(id) ?? null;
  }

  public setInteractionState(id: string, state: string): void {
    const interaction = this.requireInteraction(id);
    const projection = this.requireInteractionBinding(id);
    if (!interaction.states.includes(state)) {
      throw new RangeError(`Solid interaction ${id} does not define state ${state}`);
    }
    if (this.interactionStates.get(id) === state) return;
    for (const binding of projection.nodes) {
      const nodeState = binding.stateByInteractionState[state];
      if (nodeState === undefined) {
        throw new Error(`Solid interaction ${id} has no ${state} transform for ${binding.nodeId}`);
      }
      this.setNodeState(binding.nodeId, nodeState);
    }
    this.interactionStates.set(id, state);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.parts.values()) part.geometry.dispose();
    for (const lease of this.surfaceLeases.values()) lease.release();
    this.surfaceLeases.clear();
    if (this.ownsSurfaceCache) this.surfaceCache.dispose();
    this.parts.clear();
    this.partRest.clear();
    this.nodes.clear();
    this.nodeRest.clear();
    this.interactionStates.clear();
    this.root.clear();
  }

  private buildNodes(definitions: readonly SolidNodeDefinition[]): void {
    const pending = new Map(definitions.map((definition) => [definition.id, definition]));
    if (pending.size !== definitions.length) throw new Error('Solid blueprint contains duplicate node ids');

    const attach = (id: string, ancestry: ReadonlySet<string>): THREE.Group => {
      const existing = this.nodes.get(id);
      if (existing !== undefined) return existing;
      const definition = pending.get(id);
      if (definition === undefined) throw new Error(`Unknown solid node: ${id}`);
      if (ancestry.has(id)) throw new Error(`Solid node hierarchy contains a cycle at ${id}`);
      const node = new THREE.Group();
      node.name = `node:${id}`;
      node.position.set(...definition.restPose.position);
      node.quaternion.set(...definition.restPose.rotation);
      if (definition.restScale !== undefined) node.scale.set(...definition.restScale);
      if (definition.parentNode === undefined) {
        this.root.add(node);
      } else {
        const next = new Set(ancestry);
        next.add(id);
        attach(definition.parentNode, next).add(node);
      }
      this.nodes.set(id, node);
      this.nodeRest.set(id, Object.freeze({
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      }));
      return node;
    };

    for (const id of pending.keys()) attach(id, new Set());
  }

  private requireNode(id: string): THREE.Group {
    const node = this.nodes.get(id);
    if (node === undefined) throw new Error(`Unknown solid node: ${id}`);
    return node;
  }

  private initializeInteractions(
    definitions: readonly InteractionSpec[],
    bindings: readonly SolidInteractionBinding[],
  ): void {
    const ids = new Set<string>();
    for (const definition of definitions) {
      if (ids.has(definition.id)) throw new Error(`Duplicate solid interaction id: ${definition.id}`);
      ids.add(definition.id);
      if (!definition.states.includes(definition.initialState)) {
        throw new Error(`Solid interaction ${definition.id} has an invalid initial state`);
      }
      const sensor = this.blueprint.colliders.find(
        (collider) => collider.id === definition.sensorId,
      );
      if (sensor?.kind !== 'sensor') {
        throw new Error(`Solid interaction ${definition.id} requires sensor ${definition.sensorId}`);
      }
      if (!this.blueprint.sockets.some(({ id }) => id === definition.activationSocketId)) {
        throw new Error(
          `Solid interaction ${definition.id} requires socket ${definition.activationSocketId}`,
        );
      }
      const projection = bindings.find((candidate) => candidate.interactionId === definition.id);
      if (projection === undefined) {
        throw new Error(`Solid interaction ${definition.id} requires a solid binding`);
      }
      for (const binding of projection.nodes) {
        this.requireNode(binding.nodeId);
        for (const state of definition.states) {
          if (binding.stateByInteractionState[state] === undefined) {
            throw new Error(
              `Solid interaction ${definition.id} has no ${state} transform for ${binding.nodeId}`,
            );
          }
        }
      }
      this.interactionStates.set(definition.id, definition.initialState);
      for (const binding of projection.nodes) {
        const state = binding.stateByInteractionState[definition.initialState];
        if (state !== undefined) this.setNodeState(binding.nodeId, state);
      }
    }
  }

  /** Applies a rest-relative, idempotent node state without exposing renderer internals. */
  public setNodeState(id: string, state: SolidNodeState): void {
    this.resetNodePose(id);
    this.applyNodeStateDelta(id, state);
  }

  /** Layers a local transform delta over the node's current sampled pose. */
  public applyNodeStateDelta(id: string, state: SolidNodeState): void {
    const node = this.requireNode(id);
    if (state.translation !== undefined) node.position.add(new THREE.Vector3(...state.translation));
    if (state.rotation !== undefined) {
      node.quaternion.multiply(
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...state.rotation, 'XYZ')),
      );
    }
    if (state.scale !== undefined) {
      node.scale.multiply(new THREE.Vector3(...state.scale));
    }
  }

  private requireInteraction(id: string): InteractionSpec {
    const interaction = this.blueprint.manifest.interactions.find((candidate) => candidate.id === id);
    if (interaction === undefined) throw new Error(`Unknown solid interaction: ${id}`);
    return interaction;
  }

  private requireInteractionBinding(id: string): SolidInteractionBinding {
    const binding = this.blueprint.interactionBindings.find(
      (candidate) => candidate.interactionId === id,
    );
    if (binding === undefined) throw new Error(`Unknown solid interaction binding: ${id}`);
    return binding;
  }
}

export function createSolidRig(
  blueprint: SolidAssetBlueprint,
  options: SolidRigOptions = {},
): SolidRig {
  return new SolidRig(blueprint, options);
}
