import { clamp } from '../core/geometry.js';
import { Random, combineSeed } from '../core/random.js';
import type { BonePose, SpriteRig } from './sprite-rig.js';

export const CHARACTER_POSES = [
  'idle',
  'walk',
  'run',
  'airborne',
  'sit',
  'sleep',
  'play',
] as const;

export type CharacterPose = typeof CHARACTER_POSES[number];
export type Locomotion = 'idle' | 'walk' | 'run' | 'airborne';

export type CharacterMotion = Readonly<{
  /** Preferred high-level animation state. */
  pose?: CharacterPose;
  /** Backwards-compatible locomotion input for game loops. */
  locomotion?: Locomotion;
  speed?: number;
  facing?: -1 | 1;
  talking?: boolean;
}>;

type MutablePose = {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
};

type AutonomicProfile = Readonly<{
  sway: number;
  breath: number;
  blink: number;
  gaze: number;
  arms: number;
  tail: number;
}>;

const TRANSITION_SECONDS = 0.38;

const AUTONOMIC_BY_POSE: Readonly<Record<CharacterPose, AutonomicProfile>> = {
  idle: { sway: 1, breath: 1, blink: 1, gaze: 1, arms: 1, tail: 1 },
  walk: { sway: 0, breath: 0.5, blink: 1, gaze: 0.5, arms: 0, tail: 1.4 },
  run: { sway: 0, breath: 0.45, blink: 1, gaze: 0.15, arms: 0, tail: 2 },
  airborne: { sway: 0, breath: 0.4, blink: 1, gaze: 0.3, arms: 0, tail: 1.4 },
  sit: { sway: 0.6, breath: 1, blink: 1, gaze: 0.8, arms: 0.4, tail: 0.6 },
  sleep: { sway: 0, breath: 2.2, blink: 0, gaze: 0, arms: 0, tail: 0 },
  play: { sway: 0.3, breath: 0.5, blink: 1, gaze: 0.5, arms: 0, tail: 1.3 },
};

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function emptyPose(): MutablePose {
  return { x: 0, y: 0, rotation: 0, scaleX: 0, scaleY: 0 };
}

/**
 * Layered character motion controller inspired by KinderGrimm's animator.
 * Autonomic life always runs underneath smoothly blended authored poses.
 */
export class CharacterAnimator {
  private readonly rig: SpriteRig;
  private readonly expressionRandom: Random;
  private readonly poseWeights: Record<CharacterPose, number> = {
    idle: 1,
    walk: 0,
    run: 0,
    airborne: 0,
    sit: 0,
    sleep: 0,
    play: 0,
  };
  private elapsed = 0;
  private gaitPhase = 0;
  private targetPose: CharacterPose = 'idle';
  private nextBlink: number;
  private blinkUntil = -1;
  private nextGaze: number;
  private gazeUntil = -1;
  private gazeTarget = 0;
  private gazePosition = 0;
  private gazeVelocity = 0;

  public constructor(rig: SpriteRig) {
    this.rig = rig;
    this.expressionRandom = new Random(combineSeed(rig.blueprint.seed, 'character:animation'));
    this.nextBlink = this.expressionRandom.float(1.6, 4.4);
    this.nextGaze = this.expressionRandom.float(2.4, 6.2);
  }

  public update(deltaSeconds: number, motion: CharacterMotion = {}): void {
    const delta = clamp(deltaSeconds, 0, 0.1);
    const speed = clamp(motion.speed ?? 0, 0, 1);
    this.elapsed += delta;
    this.targetPose = motion.pose ?? motion.locomotion ?? 'idle';
    this.updatePoseWeights(delta);
    const weights = this.normalizedWeights();
    const gaitFrequency = weights.walk * 1.6 + weights.run * 2.7;
    this.gaitPhase += delta * gaitFrequency * (0.35 + speed * 0.65) * Math.PI * 2;

    const profile = this.blendedAutonomicProfile(weights);
    const poses = new Map<string, MutablePose>();
    this.applyAuthoredPoses(poses, weights, speed);
    this.applyAutonomicLife(poses, profile, delta);
    this.applyPoses(poses);
    this.rig.root.scale.x = motion.facing ?? 1;
    this.applyFace(profile, motion.talking === true, weights.sleep);
    this.rig.updateBoil(this.elapsed);
  }

  private updatePoseWeights(delta: number): void {
    const amount = delta / TRANSITION_SECONDS;
    for (const pose of CHARACTER_POSES) {
      const target = pose === this.targetPose ? 1 : 0;
      const current = this.poseWeights[pose];
      this.poseWeights[pose] = target > current
        ? Math.min(target, current + amount)
        : Math.max(target, current - amount);
    }
  }

  private normalizedWeights(): Readonly<Record<CharacterPose, number>> {
    let total = 0;
    const eased = {} as Record<CharacterPose, number>;
    for (const pose of CHARACTER_POSES) {
      const value = smoothStep(this.poseWeights[pose]);
      eased[pose] = value;
      total += value;
    }
    if (total <= 1e-6) return { ...eased, idle: 1 };
    for (const pose of CHARACTER_POSES) eased[pose] /= total;
    return eased;
  }

  private blendedAutonomicProfile(
    weights: Readonly<Record<CharacterPose, number>>,
  ): AutonomicProfile {
    const result = { sway: 0, breath: 0, blink: 0, gaze: 0, arms: 0, tail: 0 };
    for (const pose of CHARACTER_POSES) {
      const weight = weights[pose];
      const source = AUTONOMIC_BY_POSE[pose];
      result.sway += source.sway * weight;
      result.breath += source.breath * weight;
      result.blink += source.blink * weight;
      result.gaze += source.gaze * weight;
      result.arms += source.arms * weight;
      result.tail += source.tail * weight;
    }
    return result;
  }

  private applyAuthoredPoses(
    poses: Map<string, MutablePose>,
    weights: Readonly<Record<CharacterPose, number>>,
    speed: number,
  ): void {
    this.applyGait(poses, weights.walk, speed, false);
    this.applyGait(poses, weights.run, speed, true);
    this.applyAirborne(poses, weights.airborne);
    this.applySit(poses, weights.sit);
    this.applySleep(poses, weights.sleep);
    this.applyPlay(poses, weights.play);
  }

  private applyGait(
    poses: Map<string, MutablePose>,
    weight: number,
    speed: number,
    running: boolean,
  ): void {
    if (weight <= 0.001) return;
    const amplitude = running ? 1.7 : 1;
    const swing = Math.sin(this.gaitPhase);
    const bounce = Math.abs(swing) * (running ? 0.06 : 0.03) * amplitude;
    const legRotation = swing * (running ? 0.5 : 0.28) * (0.4 + speed * 0.6);
    const armRotation = swing * (running ? 0.6 : 0.3) * (0.4 + speed * 0.6);
    this.addPose(poses, 'leg:left', { y: Math.max(0, swing) * 0.08, rotation: legRotation }, weight);
    this.addPose(poses, 'leg:right', { y: Math.max(0, -swing) * 0.08, rotation: -legRotation }, weight);
    this.addPose(poses, 'arm:left', { rotation: -armRotation }, weight);
    this.addPose(poses, 'arm:right', { rotation: armRotation }, weight);
    this.addPose(poses, 'torso', { y: bounce, rotation: -swing * (running ? 0.03 : 0.018) }, weight);
    this.addPose(poses, 'head', {
      y: bounce * 1.25 + Math.sin(this.gaitPhase * 2 - 0.9) * 0.015 * amplitude,
      rotation: swing * 0.035,
    }, weight);
    this.addPose(poses, 'tail', { rotation: -swing * 0.24 }, weight);
  }

  private applyAirborne(poses: Map<string, MutablePose>, weight: number): void {
    if (weight <= 0.001) return;
    const drift = Math.sin(this.elapsed * 3.4) * 0.04;
    this.addPose(poses, 'leg:left', { rotation: 0.24 + drift }, weight);
    this.addPose(poses, 'leg:right', { rotation: -0.16 - drift }, weight);
    this.addPose(poses, 'arm:left', { rotation: -0.52 + drift }, weight);
    this.addPose(poses, 'arm:right', { rotation: 0.52 - drift }, weight);
    this.addPose(poses, 'head', { y: 0.04, rotation: drift * 0.3 }, weight);
    this.addPose(poses, 'tail', { rotation: 0.28 + drift * 1.7 }, weight);
  }

  private applySit(poses: Map<string, MutablePose>, weight: number): void {
    if (weight <= 0.001) return;
    this.addPose(poses, 'torso', { y: -0.18, scaleX: 1.04, scaleY: 0.95 }, weight);
    this.addPose(poses, 'leg:left', { y: 0.08, rotation: -1.05 }, weight);
    this.addPose(poses, 'leg:right', { y: 0.08, rotation: 1.05 }, weight);
    this.addPose(poses, 'arm:left', { rotation: -0.18 }, weight);
    this.addPose(poses, 'arm:right', { rotation: 0.18 }, weight);
    this.addPose(poses, 'head', { y: -0.04, rotation: 0.04 }, weight);
  }

  private applySleep(poses: Map<string, MutablePose>, weight: number): void {
    if (weight <= 0.001) return;
    const rock = Math.sin(this.elapsed * 0.8) * 0.012;
    this.applySit(poses, weight);
    this.addPose(poses, 'torso', { y: -0.05, scaleX: 1.03, scaleY: 0.97 }, weight);
    this.addPose(poses, 'head', { x: 0.04, y: -0.13, rotation: 0.14 + rock }, weight);
    this.addPose(poses, 'tail', { rotation: -0.2 }, weight);
  }

  private applyPlay(poses: Map<string, MutablePose>, weight: number): void {
    if (weight <= 0.001) return;
    const time = this.elapsed * 6.2;
    const hop = Math.abs(Math.sin(time));
    this.addPose(poses, 'torso', {
      x: Math.sin(time * 0.5) * 0.025,
      y: hop * 0.1,
      rotation: Math.sin(time * 0.5) * 0.06,
    }, weight);
    this.addPose(poses, 'head', {
      y: Math.sin(time + 2.1) * 0.035 + hop * 0.08,
      rotation: Math.sin(time * 0.33) * 0.1,
    }, weight);
    this.addPose(poses, 'arm:left', { rotation: 0.55 + Math.sin(time) * 0.5 }, weight);
    this.addPose(poses, 'arm:right', { rotation: -0.55 - Math.sin(time + 2.3) * 0.5 }, weight);
    this.addPose(poses, 'leg:left', { y: Math.max(0, Math.sin(time)) * 0.08, rotation: Math.sin(time) * 0.18 }, weight);
    this.addPose(poses, 'leg:right', { y: Math.max(0, -Math.sin(time)) * 0.08, rotation: -Math.sin(time) * 0.18 }, weight);
  }

  private applyAutonomicLife(
    poses: Map<string, MutablePose>,
    profile: AutonomicProfile,
    delta: number,
  ): void {
    const breathTempo = 1.15 / (1 + Math.max(0, profile.breath - 1) * 0.55);
    const breath = Math.sin(this.elapsed * breathTempo);
    const swayX = Math.sin(this.elapsed * 0.55) * 0.012 * profile.sway;
    const swayY = Math.cos(this.elapsed * 0.37) * 0.007 * profile.sway;
    this.updateGaze(profile.gaze, delta);
    this.addPose(poses, 'torso', {
      x: swayX * 0.25,
      y: breath * 0.016 * profile.breath,
      scaleX: 1 - breath * 0.009 * profile.breath,
      scaleY: 1 + breath * 0.022 * profile.breath,
    }, 1);
    this.addPose(poses, 'head', {
      x: swayX + this.gazePosition * 0.025,
      y: swayY + breath * 0.011 * profile.breath,
      rotation: Math.sin(this.elapsed * 0.6) * 0.017 * profile.sway - this.gazePosition * 0.075,
      scaleX: 1 + breath * 0.004 * profile.breath,
      scaleY: 1 + breath * 0.004 * profile.breath,
    }, 1);
    this.addPose(poses, 'arm:left', { rotation: Math.sin(this.elapsed * 0.8 + 1.7) * 0.04 * profile.arms }, 1);
    this.addPose(poses, 'arm:right', { rotation: -Math.sin(this.elapsed * 0.8) * 0.04 * profile.arms }, 1);
    this.addPose(poses, 'tail', {
      rotation: Math.sin(this.elapsed * 2.6) * 0.13 * profile.tail
        + Math.sin(this.elapsed * 0.47) * 0.07 * profile.tail,
    }, 1);
  }

  private updateGaze(amplitude: number, delta: number): void {
    if (amplitude > 0.2 && this.elapsed >= this.nextGaze && this.gazeTarget === 0) {
      this.gazeTarget = this.expressionRandom.chance(0.5) ? -1 : 1;
      this.gazeUntil = this.elapsed + this.expressionRandom.float(0.45, 1.25);
    }
    if (amplitude <= 0.2 || (this.gazeTarget !== 0 && this.elapsed >= this.gazeUntil)) {
      this.gazeTarget = 0;
      this.nextGaze = this.elapsed + this.expressionRandom.float(2.1, 5.8);
    }
    const target = this.gazeTarget * amplitude;
    const spring = 105;
    const damping = Math.pow(0.0016, delta);
    this.gazeVelocity = (this.gazeVelocity + (target - this.gazePosition) * spring * delta) * damping;
    this.gazePosition += this.gazeVelocity * delta;
  }

  private applyFace(profile: AutonomicProfile, talking: boolean, sleepWeight: number): void {
    if (profile.blink > 0.25 && this.elapsed >= this.nextBlink) {
      this.blinkUntil = this.elapsed + this.expressionRandom.float(0.08, 0.16);
      this.nextBlink = this.blinkUntil + this.expressionRandom.float(1.8, 5.4);
    }
    const sleeping = sleepWeight > 0.55;
    const eyeState = sleeping || this.elapsed < this.blinkUntil
      ? 'closed'
      : this.gazePosition < -0.25
        ? 'left'
        : this.gazePosition > 0.25 ? 'right' : 'open';
    this.stateIfPresent('eye:left', eyeState);
    this.stateIfPresent('eye:right', eyeState);
    this.stateIfPresent('mouth', talking && Math.sin(this.elapsed * 13) > 0.15 ? 'open' : 'idle');
  }

  private addPose(
    poses: Map<string, MutablePose>,
    id: string,
    pose: BonePose,
    weight: number,
  ): void {
    if (weight <= 0 || this.rig.getBone(id) === null) return;
    const target = poses.get(id) ?? emptyPose();
    target.x += (pose.x ?? 0) * weight;
    target.y += (pose.y ?? 0) * weight;
    target.rotation += (pose.rotation ?? 0) * weight;
    target.scaleX += ((pose.scaleX ?? 1) - 1) * weight;
    target.scaleY += ((pose.scaleY ?? 1) - 1) * weight;
    poses.set(id, target);
  }

  private applyPoses(poses: ReadonlyMap<string, MutablePose>): void {
    this.rig.resetPose();
    for (const [id, pose] of poses) {
      this.rig.setBonePose(id, {
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation,
        scaleX: 1 + pose.scaleX,
        scaleY: 1 + pose.scaleY,
      });
    }
  }

  private stateIfPresent(id: string, state: string): void {
    if (this.rig.layerIds.includes(id)) this.rig.setLayerState(id, state);
  }
}
