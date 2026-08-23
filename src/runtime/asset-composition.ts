import type {
  AnyAssetInstance,
  AssetInstanceState,
} from '../contracts/asset-instance.js';
import type { Pose2 } from '../contracts/raster-asset.js';
import type { Pose3 } from '../contracts/solid-asset.js';

export type AssetInstanceOwnership = 'owned' | 'borrowed';

export type AssetCompositionInsertOptions = Readonly<{
  ownership: AssetInstanceOwnership;
}>;

export type AssetAttachment = Readonly<{
  childId: string;
  parentId: string;
  socketId: string;
}>;

export type AssetCompositionSnapshot = readonly (
  AssetInstanceState<Pose2> | AssetInstanceState<Pose3>
)[];

type CompositionEntry = Readonly<{
  instance: AnyAssetInstance;
  ownership: AssetInstanceOwnership;
  insertionIndex: number;
}>;

export type AssetCompositionVisitor = (
  instance: AnyAssetInstance,
  state: AssetInstanceState<Pose2> | AssetInstanceState<Pose3>,
) => void;

/**
 * Optional renderer-neutral coordinator for a small set of asset instances.
 * It owns ordering and attachment policy, not simulation or persistence.
 */
export class AssetComposition {
  private readonly entries = new Map<string, CompositionEntry>();
  private readonly attachments = new Map<string, AssetAttachment>();
  private rasterOrder: string[] = [];
  private nextInsertionIndex = 0;
  private disposed = false;

  public get instanceIds(): readonly string[] {
    return this.inInsertionOrder().map(({ instance }) => instance.instanceId);
  }

  public insert(
    instance: AnyAssetInstance,
    options: AssetCompositionInsertOptions,
  ): void {
    this.requireActive();
    if (this.entries.has(instance.instanceId)) {
      throw new Error(`Asset instance already exists: ${instance.instanceId}`);
    }
    this.entries.set(instance.instanceId, Object.freeze({
      instance,
      ownership: options.ownership,
      insertionIndex: this.nextInsertionIndex,
    }));
    this.nextInsertionIndex += 1;
    if (instance.dimension === '2d') this.rasterOrder.push(instance.instanceId);
    this.applyRasterDrawOrder(this.rasterOrder);
  }

  public get(instanceId: string): AnyAssetInstance | null {
    return this.entries.get(instanceId)?.instance ?? null;
  }

  public remove(instanceId: string): AnyAssetInstance | null {
    this.requireActive();
    const entry = this.entries.get(instanceId);
    if (entry === undefined) return null;
    this.entries.delete(instanceId);
    this.attachments.delete(instanceId);
    for (const [childId, attachment] of this.attachments) {
      if (attachment.parentId === instanceId) this.attachments.delete(childId);
    }
    this.rasterOrder = this.rasterOrder.filter((id) => id !== instanceId);
    if (entry.ownership === 'owned') entry.instance.dispose();
    this.applyRasterDrawOrder(this.rasterOrder);
    return entry.instance;
  }

  public setWorldPose(instanceId: string, pose: Pose2 | Pose3): void {
    const instance = this.requireInstance(instanceId);
    if (instance.dimension === '2d') {
      if (!isPose2(pose)) throw new TypeError(`Instance ${instanceId} requires a 2D pose`);
      instance.setWorldPose(pose);
      return;
    }
    if (isPose2(pose)) throw new TypeError(`Instance ${instanceId} requires a 3D pose`);
    instance.setWorldPose(pose);
  }

  public setPlaybackTime(instanceId: string, time: number): void {
    this.requireInstance(instanceId).setPlaybackTime(time);
  }

  public setInteractionState(instanceId: string, interactionId: string, state: string): void {
    this.requireInstance(instanceId).setInteractionState(interactionId, state);
  }

  public setRasterDrawOrder(backToFrontInstanceIds: readonly string[]): void {
    this.requireActive();
    const currentIds = this.rasterOrder;
    if (new Set(backToFrontInstanceIds).size !== backToFrontInstanceIds.length) {
      throw new Error('Raster draw order contains duplicate instance IDs');
    }
    if (
      backToFrontInstanceIds.length !== currentIds.length
      || backToFrontInstanceIds.some((id) => !currentIds.includes(id))
    ) {
      throw new Error('Raster draw order must contain every raster instance exactly once');
    }
    this.rasterOrder = [...backToFrontInstanceIds];
    this.applyRasterDrawOrder(this.rasterOrder);
  }

  public attach(childId: string, parentId: string, socketId: string): void {
    this.requireActive();
    if (childId === parentId) throw new Error('An asset instance cannot attach to itself');
    const child = this.requireInstance(childId);
    const parent = this.requireInstance(parentId);
    if (child.dimension !== parent.dimension) {
      throw new Error(`Cannot attach ${child.dimension} instance ${childId} to ${parent.dimension} instance ${parentId}`);
    }
    if (parent.getSocketWorldPose(socketId) === null) {
      throw new Error(`Asset instance ${parentId} has no socket ${socketId}`);
    }
    const previous = this.attachments.get(childId);
    this.attachments.set(childId, Object.freeze({ childId, parentId, socketId }));
    if (this.hasAttachmentCycle(childId)) {
      if (previous === undefined) this.attachments.delete(childId);
      else this.attachments.set(childId, previous);
      throw new Error(`Asset attachment would create a cycle at ${childId}`);
    }
    this.synchronizeAttachment(this.attachments.get(childId));
  }

  public detach(childId: string): AssetAttachment | null {
    this.requireActive();
    const attachment = this.attachments.get(childId);
    if (attachment === undefined) return null;
    this.attachments.delete(childId);
    return attachment;
  }

  public getAttachment(childId: string): AssetAttachment | null {
    return this.attachments.get(childId) ?? null;
  }

  /**
   * Visits parents before attached children, synchronizing each child before
   * its callback. With no callback it only refreshes attachment transforms.
   */
  public update(visitor?: AssetCompositionVisitor): void {
    this.requireActive();
    for (const entry of this.inDependencyOrder()) {
      this.synchronizeAttachment(this.attachments.get(entry.instance.instanceId));
      visitor?.(entry.instance, entry.instance.getInstanceState());
    }
  }

  public snapshot(): AssetCompositionSnapshot {
    this.requireActive();
    return Object.freeze(
      this.inDependencyOrder().map(({ instance }) => instance.getInstanceState()),
    );
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { instance, ownership } of this.entries.values()) {
      if (ownership === 'owned') instance.dispose();
    }
    this.attachments.clear();
    this.entries.clear();
    this.rasterOrder = [];
  }

  private requireActive(): void {
    if (this.disposed) throw new Error('Asset composition has been disposed');
  }

  private requireInstance(instanceId: string): AnyAssetInstance {
    this.requireActive();
    const instance = this.get(instanceId);
    if (instance === null) throw new Error(`Unknown asset instance: ${instanceId}`);
    return instance;
  }

  private applyRasterDrawOrder(instanceIds: readonly string[]): void {
    instanceIds.forEach((instanceId, rank) => {
      const instance = this.entries.get(instanceId)?.instance;
      if (instance?.dimension !== '2d') {
        throw new Error(`Asset instance is not raster: ${instanceId}`);
      }
      instance.setDrawRank(rank);
    });
  }

  private inInsertionOrder(): CompositionEntry[] {
    return [...this.entries.values()].sort(
      (left, right) => left.insertionIndex - right.insertionIndex,
    );
  }

  private inDependencyOrder(): CompositionEntry[] {
    const ordered: CompositionEntry[] = [];
    const visited = new Set<string>();
    const visit = (instanceId: string): void => {
      if (visited.has(instanceId)) return;
      const attachment = this.attachments.get(instanceId);
      if (attachment !== undefined) visit(attachment.parentId);
      const entry = this.entries.get(instanceId);
      if (entry !== undefined) ordered.push(entry);
      visited.add(instanceId);
    };
    for (const { instance } of this.inInsertionOrder()) visit(instance.instanceId);
    return ordered;
  }

  private hasAttachmentCycle(startId: string): boolean {
    const visited = new Set<string>();
    let currentId: string | undefined = startId;
    while (currentId !== undefined) {
      if (visited.has(currentId)) return true;
      visited.add(currentId);
      currentId = this.attachments.get(currentId)?.parentId;
    }
    return false;
  }

  private synchronizeAttachment(attachment: AssetAttachment | undefined): void {
    if (attachment === undefined) return;
    const child = this.requireInstance(attachment.childId);
    const parent = this.requireInstance(attachment.parentId);
    if (parent.dimension === '2d' && child.dimension === '2d') {
      const pose = parent.getSocketWorldPose(attachment.socketId);
      if (pose === null) throw new Error(`Asset instance ${attachment.parentId} lost socket ${attachment.socketId}`);
      child.setWorldPose(pose);
      return;
    }
    if (parent.dimension === '3d' && child.dimension === '3d') {
      const pose = parent.getSocketWorldPose(attachment.socketId);
      if (pose === null) throw new Error(`Asset instance ${attachment.parentId} lost socket ${attachment.socketId}`);
      child.setWorldPose(pose);
      return;
    }
    throw new Error(`Attached instances ${attachment.parentId} and ${attachment.childId} use different dimensions`);
  }
}

function isPose2(pose: Pose2 | Pose3): pose is Pose2 {
  return !Array.isArray(pose.position);
}

export function createAssetComposition(): AssetComposition {
  return new AssetComposition();
}
