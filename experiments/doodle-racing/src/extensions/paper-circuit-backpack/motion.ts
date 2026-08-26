import {
  applySolidRigPosePatch,
  type SolidRig,
} from '../../../../../src/index.js';

export function paperCircuitBackpackOpenAmount(helmetCarryAmount: number): number {
  const extraction = Math.max(0, Math.min(1, helmetCarryAmount / 0.38));
  return Math.sin(extraction * Math.PI);
}

export function applySolidPaperCircuitBackpackMotion(
  rig: SolidRig,
  openAmount: number,
): void {
  const amount = Math.max(0, Math.min(1, openAmount));
  applySolidRigPosePatch(rig, Object.freeze({
    nodes: Object.freeze([Object.freeze({
      id: 'flap',
      state: Object.freeze({
        rotation: Object.freeze([-1.18 * amount, 0, 0] as const),
      }),
    })]),
  }));
}
