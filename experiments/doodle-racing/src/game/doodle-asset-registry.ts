import {
  createInkedSolidBlueprint,
  type ArtDirectionId,
  type InkedSolidScenePass,
  type InkedSolidSceneRegistration,
  type InkedSolidStrokeDefinition,
  type MediumId,
  type SolidAssetBlueprint,
  type SolidRig,
} from '../../../../src/index.js';

export type DoodleSceneAsset = Readonly<{
  solid: SolidAssetBlueprint;
  rig: SolidRig;
  strokes?: readonly InkedSolidStrokeDefinition[];
}>;

export type DoodleAssetSyncStats = Readonly<{
  added: number;
  kept: number;
  removed: number;
}>;

type RegisteredDoodleAsset = Readonly<{
  asset: DoodleSceneAsset;
  registration: InkedSolidSceneRegistration;
}>;

type RegistrationPass = Pick<InkedSolidScenePass, 'register'>;

function isSameAsset(left: DoodleSceneAsset, right: DoodleSceneAsset): boolean {
  return left.solid === right.solid
    && left.rig === right.rig
    && left.strokes === right.strokes;
}

/** Keeps the shared compositor alive while scene instances change incrementally. */
export class DoodleAssetRegistry {
  private readonly registered = new Map<string, RegisteredDoodleAsset>();

  public sync(
    pass: RegistrationPass,
    assets: readonly DoodleSceneAsset[],
    medium: MediumId,
    artDirection: ArtDirectionId | null = null,
    viewMarks = true,
  ): DoodleAssetSyncStats {
    const next = new Map<string, DoodleSceneAsset>();
    for (const asset of assets) {
      const instanceId = asset.rig.instanceId;
      if (next.has(instanceId)) {
        throw new Error(`Duplicate Doodle scene asset instance: ${instanceId}`);
      }
      next.set(instanceId, asset);
    }

    let removed = 0;
    for (const [instanceId, current] of this.registered) {
      const candidate = next.get(instanceId);
      if (candidate !== undefined && isSameAsset(current.asset, candidate)) continue;
      current.registration.dispose();
      this.registered.delete(instanceId);
      removed += 1;
    }

    let added = 0;
    let kept = 0;
    for (const asset of assets) {
      const instanceId = asset.rig.instanceId;
      if (this.registered.has(instanceId)) {
        kept += 1;
        continue;
      }
      const registration = pass.register({
        instanceId,
        blueprint: createInkedSolidBlueprint(asset.solid, {
          medium,
          ...(artDirection === null ? {} : { artDirection }),
          ...(!viewMarks ? { viewMarks: false as const } : {}),
          ...(asset.strokes === undefined ? {} : { strokes: asset.strokes }),
        }),
        rig: asset.rig,
      });
      this.registered.set(instanceId, Object.freeze({ asset, registration }));
      added += 1;
    }
    return Object.freeze({ added, kept, removed });
  }

  public dispose(): void {
    for (const { registration } of this.registered.values()) registration.dispose();
    this.registered.clear();
  }
}
