import { applySolidRigPosePatch, type SolidRig } from '../../../../../src/index.js';

export function applySolidPaperCircuitRaceFlagMotion(
  rig: SolidRig,
  elapsedSeconds: number,
  intensity: number,
): void {
  const amount = Math.max(0, Math.min(1, intensity));
  applySolidRigPosePatch(rig, Object.freeze({
    nodes: Object.freeze(Array.from({ length: 3 }, (_, index) => Object.freeze({
      id: `cloth:${index}`,
      state: Object.freeze({
        rotation: Object.freeze([
          Math.sin(elapsedSeconds * 8.2 + index * 0.84) * 0.08 * amount,
          Math.sin(elapsedSeconds * 10.4 - index * 0.92) * (0.25 + index * 0.07) * amount,
          Math.sin(elapsedSeconds * 6.8 + index * 0.55) * 0.045 * amount,
        ] as const),
      }),
    }))),
  }));
}

