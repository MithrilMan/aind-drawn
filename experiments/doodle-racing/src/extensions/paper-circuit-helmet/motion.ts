import {
  applyRasterRigPosePatch,
  applySolidRigPosePatch,
  applySolidRigPoseDelta,
  assetExtensionScope,
  smoothStep,
  type SolidRig,
  type SpriteRig,
} from '../../../../../src/index.js';
import type { PaperCircuitPersonIdentity } from '../../game/paper-circuit-person.js';
import type {
  PaperCircuitHelmetIdentity,
  PaperCircuitHelmetItemIdentity,
} from './identity.js';

export type PaperCircuitVisorPosition = 'down' | 'up';

export type PaperCircuitVisorMotionState = Readonly<{
  from: number;
  target: number;
  startedAt: number;
}>;

function targetAmount(position: PaperCircuitVisorPosition): number {
  return position === 'up' ? 1 : 0;
}

export function createPaperCircuitVisorMotionState(
  initial: PaperCircuitVisorPosition = 'down',
): PaperCircuitVisorMotionState {
  const amount = targetAmount(initial);
  return Object.freeze({ from: amount, target: amount, startedAt: 0 });
}

export function samplePaperCircuitVisorMotion(
  state: PaperCircuitVisorMotionState,
  helmet: PaperCircuitHelmetIdentity,
  time: number,
): number {
  if (!Number.isFinite(time)) throw new RangeError('Visor motion time must be finite');
  const elapsed = Math.max(0, time - state.startedAt);
  const amount = smoothStep(elapsed / helmet.data.transitionSeconds);
  return state.from + (state.target - state.from) * amount;
}

export function samplePaperCircuitVisorReachMotion(
  state: PaperCircuitVisorMotionState,
  helmet: PaperCircuitHelmetIdentity,
  time: number,
): number {
  if (state.from === state.target) return 0;
  const progress = Math.max(0, Math.min(
    1,
    (time - state.startedAt) / helmet.data.transitionSeconds,
  ));
  const reach = smoothStep(progress / 0.28);
  const release = smoothStep((1 - progress) / 0.28);
  return reach * release;
}

export function setPaperCircuitVisorPosition(
  state: PaperCircuitVisorMotionState,
  helmet: PaperCircuitHelmetIdentity,
  position: PaperCircuitVisorPosition,
  time: number,
): PaperCircuitVisorMotionState {
  const target = targetAmount(position);
  if (state.target === target) return state;
  return Object.freeze({
    from: samplePaperCircuitVisorMotion(state, helmet, time),
    target,
    startedAt: time,
  });
}

export function applySolidPaperCircuitVisorMotion(
  rig: SolidRig,
  helmet: PaperCircuitHelmetIdentity,
  amount: number,
): void {
  const visorId = assetExtensionScope(helmet).id('visor');
  applySolidRigPosePatch(rig, Object.freeze({
    nodes: Object.freeze([Object.freeze({
      id: visorId,
      state: Object.freeze({
        rotation: Object.freeze([-helmet.data.item.visor.openAngle * amount, 0, 0] as const),
      }),
    })]),
  }));
}

export function applySolidPaperCircuitHelmetItemVisorMotion(
  rig: SolidRig,
  item: PaperCircuitHelmetItemIdentity,
  amount: number,
): void {
  applySolidRigPosePatch(rig, Object.freeze({
    nodes: Object.freeze([Object.freeze({
      id: 'visor',
      state: Object.freeze({
        rotation: Object.freeze([-item.visor.openAngle * amount, 0, 0] as const),
      }),
    })]),
  }));
}

export function applySolidPaperCircuitVisorReachMotion(
  rig: SolidRig,
  amount: number,
): void {
  applySolidRigPoseDelta(rig, Object.freeze({
    nodes: Object.freeze([Object.freeze({
      id: 'arm:right',
      state: Object.freeze({
        rotation: Object.freeze([
          -0.55 * amount,
          0.12 * amount,
          -2.82 * amount,
        ] as const),
      }),
    })]),
  }));
}

export function applyRasterPaperCircuitVisorMotion(
  rig: SpriteRig,
  person: PaperCircuitPersonIdentity,
  helmet: PaperCircuitHelmetIdentity,
  amount: number,
): void {
  const visorId = assetExtensionScope(helmet).id('visor');
  applyRasterRigPosePatch(rig, Object.freeze({
    bones: Object.freeze([Object.freeze({
      id: visorId,
      pose: Object.freeze({
        x: 0,
        y: person.head.height * 0.28 * amount,
        rotation: 0,
        scaleX: 1,
        scaleY: 1 - amount * 0.52,
      }),
    })]),
  }));
}
