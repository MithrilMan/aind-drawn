import { CHARACTER_POSES, type CharacterPose } from './character-motion.js';

export type CharacterPoseWeights = Readonly<Record<CharacterPose, number>>;

const TRANSITION_SECONDS = 0.38;

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

/** Shared temporal projection of one authored pose into blend weights. */
export class CharacterPoseBlend {
  private readonly weights: Record<CharacterPose, number> = {
    idle: 1,
    walk: 0,
    run: 0,
    airborne: 0,
    sit: 0,
    sleep: 0,
    play: 0,
  };

  public update(targetPose: CharacterPose, deltaSeconds: number): CharacterPoseWeights {
    const amount = deltaSeconds / TRANSITION_SECONDS;
    let total = 0;
    const eased = {} as Record<CharacterPose, number>;
    for (const pose of CHARACTER_POSES) {
      const target = pose === targetPose ? 1 : 0;
      const current = this.weights[pose];
      this.weights[pose] = target > current
        ? Math.min(target, current + amount)
        : Math.max(target, current - amount);
      eased[pose] = smoothStep(this.weights[pose]);
      total += eased[pose];
    }
    if (total <= 1e-6) return Object.freeze({ ...eased, idle: 1 });
    for (const pose of CHARACTER_POSES) eased[pose] /= total;
    return Object.freeze(eased);
  }
}
