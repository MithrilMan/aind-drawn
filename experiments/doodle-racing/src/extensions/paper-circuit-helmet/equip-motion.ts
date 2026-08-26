import * as THREE from 'three';

import {
  applySolidRigPosePatch,
  smoothStep,
  type Pose3,
  type SolidRig,
} from '../../../../../src/index.js';
import type { PaperCircuitHelmetItemIdentity } from './identity.js';

export const PAPER_CIRCUIT_HELMET_HOLD_DURATION = 0.78;
export const PAPER_CIRCUIT_HELMET_EQUIP_DURATION = 0.58;

export function samplePaperCircuitHelmetEquipMotion(time: number): number {
  if (!Number.isFinite(time)) throw new RangeError('Helmet equip time must be finite');
  return smoothStep(
    Math.max(0, time - PAPER_CIRCUIT_HELMET_HOLD_DURATION)
      / PAPER_CIRCUIT_HELMET_EQUIP_DURATION,
  );
}

export function interpolatePaperCircuitHelmetEquipPose(
  hand: Pose3,
  head: Pose3,
  amount: number,
  arcHeight = 0,
): Pose3 {
  const progress = Math.max(0, Math.min(1, amount));
  const position = new THREE.Vector3(...hand.position).lerp(
    new THREE.Vector3(...head.position),
    progress,
  );
  position.y += Math.sin(Math.PI * progress) * arcHeight;
  const rotation = new THREE.Quaternion(...hand.rotation).slerp(
    new THREE.Quaternion(...head.rotation),
    progress,
  ).normalize();
  return Object.freeze({
    position: Object.freeze([position.x, position.y, position.z] as const),
    rotation: Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const),
  });
}

const HELMET_HAND_CARRY_PROGRESS = 0.38;

export function interpolatePaperCircuitHelmetCarryPose(
  back: Pose3,
  hand: Pose3,
  head: Pose3,
  amount: number,
  arcHeight = 0,
): Pose3 {
  const progress = Math.max(0, Math.min(1, amount));
  if (progress <= HELMET_HAND_CARRY_PROGRESS) {
    return interpolatePaperCircuitHelmetEquipPose(
      back,
      hand,
      smoothStep(progress / HELMET_HAND_CARRY_PROGRESS),
      arcHeight * 0.42,
    );
  }
  return interpolatePaperCircuitHelmetEquipPose(
    hand,
    head,
    smoothStep(
      (progress - HELMET_HAND_CARRY_PROGRESS) / (1 - HELMET_HAND_CARRY_PROGRESS),
    ),
    arcHeight,
  );
}

export function paperCircuitHelmetGripAmountForCarry(amount: number): number {
  const progress = Math.max(0, Math.min(1, amount));
  if (progress <= HELMET_HAND_CARRY_PROGRESS) {
    return 1 - smoothStep(progress / HELMET_HAND_CARRY_PROGRESS);
  }
  return smoothStep(
    (progress - HELMET_HAND_CARRY_PROGRESS) / (1 - HELMET_HAND_CARRY_PROGRESS),
  );
}

/** Game-only grip pose. At one the standalone item matches its worn projection. */
export function applySolidPaperCircuitHelmetGripMotion(
  rig: SolidRig,
  item: PaperCircuitHelmetItemIdentity,
  amount: number,
): void {
  const remaining = 1 - Math.max(0, Math.min(1, amount));
  applySolidRigPosePatch(rig, Object.freeze({
    nodes: Object.freeze([Object.freeze({
      id: 'helmet',
      state: Object.freeze({
        translation: Object.freeze([
          0,
          -item.shell.radii[1] * 0.72 * remaining,
          item.shell.radii[2] * 0.12 * remaining,
        ] as const),
        rotation: Object.freeze([
          -0.12 * remaining,
          0.22 * remaining,
          -0.62 * remaining,
        ] as const),
      }),
    })]),
  }));
}
