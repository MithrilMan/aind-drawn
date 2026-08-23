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
import { surfaceFrame } from '../core/geometry3.js';
import { createSolidGeometry, type SolidGeometryFactoryOptions } from './solid-geometry.js';
import { resolveAssetInstanceId } from './instance-id.js';
import { readWorldPose3, writeWorldPose3 } from './instance-pose.js';
import {
  SolidMaterialProvider,
  type SolidMaterialProviderOptions,
} from './solid-materials.js';

type SolidPartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;
type NodeRestTransform = Readonly<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;
type PartRestTransform = NodeRestTransform & Readonly<{ visible: boolean }>;

export type SolidRigOptions = SolidMaterialProviderOptions
  & SolidGeometryFactoryOptions
  & Readonly<{ instanceId?: AssetInstanceId }>;

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
  private readonly materials = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly materialProvider: SolidMaterialProvider;
  private readonly interactionStates = new Map<string, string>();
  private playbackTime = 0;
  private disposed = false;

  public constructor(blueprint: SolidAssetBlueprint, options: SolidRigOptions = {}) {
    this.blueprint = validateSolidAssetBlueprint(blueprint);
    this.assetId = this.blueprint.assetId;
    this.instanceId = resolveAssetInstanceId(this.assetId, options.instanceId);
    this.materialProvider = new SolidMaterialProvider(options);
    this.root.name = `instance:${this.instanceId}`;
    this.root.userData.assetId = this.assetId;
    this.root.userData.instanceId = this.instanceId;
    try {
      for (const spec of this.blueprint.materials) {
        this.materials.set(spec.id, this.materialProvider.create(spec));
      }
      this.buildNodes(this.blueprint.nodes);
      for (const part of [...this.blueprint.parts].sort((left, right) => left.order - right.order)) {
        const parent = this.requireNode(part.node);
        const material = this.materials.get(part.materialId);
        if (material === undefined) throw new Error(`Unknown solid material: ${part.materialId}`);
        const mesh: SolidPartMesh = new THREE.Mesh(
          createSolidGeometry(part.geometry, options),
          material,
        );
        mesh.name = `part:${part.id}`;
        mesh.renderOrder = part.order;
        mesh.visible = part.visible ?? true;
        mesh.castShadow = part.castShadow;
        mesh.receiveShadow = part.receiveShadow;
        mesh.userData.partId = part.id;
        mesh.userData.assetId = this.assetId;
        mesh.userData.instanceId = this.instanceId;
        mesh.userData.materialId = part.materialId;
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
      this.applyNodeState(binding.nodeId, nodeState);
    }
    this.interactionStates.set(id, state);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.parts.values()) part.geometry.dispose();
    this.materialProvider.dispose();
    this.parts.clear();
    this.partRest.clear();
    this.nodes.clear();
    this.nodeRest.clear();
    this.materials.clear();
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
        if (state !== undefined) this.applyNodeState(binding.nodeId, state);
      }
    }
  }

  private applyNodeState(id: string, state: SolidNodeState): void {
    const node = this.requireNode(id);
    this.resetNodePose(id);
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
