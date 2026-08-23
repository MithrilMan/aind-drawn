import * as THREE from 'three';

import type { Pose2, RasterBoneDefinition } from '../contracts/raster-asset.js';

export type BonePose = Readonly<{
  x?: number;
  y?: number;
  rotation?: number;
  scaleX?: number;
  scaleY?: number;
}>;

type BoneRecord = Readonly<{
  group: THREE.Group;
  base: Pose2;
}>;

/** Owns the renderer-side bone hierarchy and its mutable local pose. */
export class RasterSkeleton {
  private readonly root: THREE.Group;
  private readonly bones = new Map<string, BoneRecord>();

  public constructor(root: THREE.Group, definitions: readonly RasterBoneDefinition[]) {
    this.root = root;
    try {
      this.build(definitions);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get ids(): readonly string[] {
    return [...this.bones.keys()];
  }

  public get(id: string): THREE.Group | null {
    return this.bones.get(id)?.group ?? null;
  }

  public require(id: string): THREE.Group {
    const bone = this.get(id);
    if (bone === null) throw new Error(`Unknown bone: ${id}`);
    return bone;
  }

  public setPose(id: string, pose: BonePose): void {
    const record = this.bones.get(id);
    if (record === undefined) throw new Error(`Unknown bone: ${id}`);
    const { group, base } = record;
    group.position.set(
      base.position.x + (pose.x ?? 0),
      base.position.y + (pose.y ?? 0),
      group.position.z,
    );
    group.rotation.z = base.rotation + (pose.rotation ?? 0);
    group.scale.set(pose.scaleX ?? 1, pose.scaleY ?? 1, 1);
  }

  public reset(): void {
    for (const id of this.bones.keys()) this.setPose(id, {});
  }

  public dispose(): void {
    this.bones.clear();
    this.root.clear();
  }

  private build(definitions: readonly RasterBoneDefinition[]): void {
    const pending = new Map<string, RasterBoneDefinition>();
    for (const definition of definitions) {
      if (pending.has(definition.id)) throw new Error(`Duplicate bone id: ${definition.id}`);
      pending.set(definition.id, definition);
    }

    const attach = (id: string, ancestry: ReadonlySet<string>): BoneRecord => {
      const existing = this.bones.get(id);
      if (existing !== undefined) return existing;
      const definition = pending.get(id);
      if (definition === undefined) throw new Error(`Missing definition for bone ${id}`);
      if (ancestry.has(id)) throw new Error(`Bone hierarchy contains a cycle at ${id}`);

      const group = new THREE.Group();
      group.name = `bone:${id}`;
      group.position.set(
        definition.restPose.position.x,
        definition.restPose.position.y,
        0,
      );
      group.rotation.z = definition.restPose.rotation;
      const parentId = definition.parentBone;
      if (parentId === undefined) {
        this.root.add(group);
      } else {
        const nextAncestry = new Set(ancestry);
        nextAncestry.add(id);
        attach(parentId, nextAncestry).group.add(group);
      }
      const record = Object.freeze({ group, base: definition.restPose });
      this.bones.set(id, record);
      return record;
    };

    for (const id of pending.keys()) attach(id, new Set());
  }
}
