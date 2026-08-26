import type { SolidNodeState } from '../contracts/solid-asset.js';
import type { SolidRig } from './solid-rig.js';
import type { BonePose, SpriteRig } from './sprite-rig.js';

export type RasterRigPosePatch = Readonly<{
  bones: readonly Readonly<{ id: string; pose: BonePose }>[];
}>;

export type SolidRigPosePatch = Readonly<{
  nodes: readonly Readonly<{ id: string; state: SolidNodeState }>[];
}>;

export function applyRasterRigPosePatch(rig: SpriteRig, patch: RasterRigPosePatch): void {
  for (const entry of patch.bones) rig.setBonePose(entry.id, entry.pose);
}

export function applySolidRigPosePatch(rig: SolidRig, patch: SolidRigPosePatch): void {
  for (const entry of patch.nodes) rig.setNodeState(entry.id, entry.state);
}

export function applySolidRigPoseDelta(rig: SolidRig, patch: SolidRigPosePatch): void {
  for (const entry of patch.nodes) rig.applyNodeStateDelta(entry.id, entry.state);
}
