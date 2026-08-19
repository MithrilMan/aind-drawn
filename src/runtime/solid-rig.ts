import * as THREE from 'three';

import type { SolidAssetBlueprint, SolidNodeDefinition } from '../assets/solid-types.js';
import { surfaceFrame } from '../core/geometry3.js';
import { createSolidGeometry } from './solid-geometry.js';
import { createSolidMaterial, type SolidMaterialFactoryOptions } from './solid-materials.js';

type SolidPartMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshPhysicalMaterial>;

export type SolidRigOptions = SolidMaterialFactoryOptions;

/**
 * Three.js adapter for data-only solid blueprints. Asset code never imports
 * Three.js; this runtime owns all scene objects and GPU resources.
 */
export class SolidRig {
  public readonly root = new THREE.Group();
  public readonly blueprint: SolidAssetBlueprint;

  private readonly nodes = new Map<string, THREE.Group>();
  private readonly parts = new Map<string, SolidPartMesh>();
  private readonly materials = new Map<string, THREE.MeshPhysicalMaterial>();
  private disposed = false;

  public constructor(blueprint: SolidAssetBlueprint, options: SolidRigOptions = {}) {
    this.blueprint = blueprint;
    this.root.name = blueprint.id;
    for (const spec of blueprint.materials) {
      if (this.materials.has(spec.id)) throw new Error(`Duplicate solid material id: ${spec.id}`);
      this.materials.set(spec.id, createSolidMaterial(spec, options));
    }
    this.buildNodes(blueprint.nodes);
    for (const part of [...blueprint.parts].sort((left, right) => left.order - right.order)) {
      if (this.parts.has(part.id)) throw new Error(`Duplicate solid part id: ${part.id}`);
      const parent = this.requireNode(part.node);
      const material = this.materials.get(part.materialId);
      if (material === undefined) throw new Error(`Unknown solid material: ${part.materialId}`);
      const mesh: SolidPartMesh = new THREE.Mesh(createSolidGeometry(part.geometry), material);
      mesh.name = `part:${part.id}`;
      mesh.renderOrder = part.order;
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = part.receiveShadow;
      mesh.userData.partId = part.id;
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
      parent.add(mesh);
      this.parts.set(part.id, mesh);
    }
  }

  public get nodeIds(): readonly string[] {
    return [...this.nodes.keys()];
  }

  public get partIds(): readonly string[] {
    return [...this.parts.keys()];
  }

  public getNode(id: string): THREE.Group | null {
    return this.nodes.get(id) ?? null;
  }

  public getPart(id: string): SolidPartMesh | null {
    return this.parts.get(id) ?? null;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const part of this.parts.values()) part.geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.parts.clear();
    this.nodes.clear();
    this.materials.clear();
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
      node.position.set(...definition.position);
      if (definition.parentNode === undefined) {
        this.root.add(node);
      } else {
        const next = new Set(ancestry);
        next.add(id);
        attach(definition.parentNode, next).add(node);
      }
      this.nodes.set(id, node);
      return node;
    };

    for (const id of pending.keys()) attach(id, new Set());
  }

  private requireNode(id: string): THREE.Group {
    const node = this.nodes.get(id);
    if (node === undefined) throw new Error(`Unknown solid node: ${id}`);
    return node;
  }
}

export function createSolidRig(
  blueprint: SolidAssetBlueprint,
  options: SolidRigOptions = {},
): SolidRig {
  return new SolidRig(blueprint, options);
}
