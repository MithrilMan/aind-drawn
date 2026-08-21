import * as THREE from 'three';

import { clamp } from '../core/geometry.js';
import { CharacterPoseBlend, type CharacterPoseWeights } from './character-pose-blend.js';
import type { CharacterMotion } from './character-motion.js';
import {
  SolidFaceAnimator,
  type SolidFaceAnimatorOptions,
  type SolidFaceExpression,
} from './solid-face-animator.js';
import type { SolidRig } from './solid-rig.js';

type RestNode = Readonly<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;

export type SolidCharacterAnimatorOptions = SolidFaceAnimatorOptions;

/**
 * Transform-only controller for a multipart solid character. Facial motion is
 * delegated to SolidFaceAnimator; body nodes are reset to their immutable rest
 * transforms before locomotion and autonomic motion are applied.
 */
export class SolidCharacterAnimator {
  private readonly rig: SolidRig;
  private readonly face: SolidFaceAnimator;
  private readonly rest = new Map<string, RestNode>();
  private readonly poseBlend = new CharacterPoseBlend();
  private elapsed = 0;
  private gaitPhase = 0;
  private requestedExpression: SolidFaceExpression = 'idle';

  public constructor(rig: SolidRig, options: SolidCharacterAnimatorOptions = {}) {
    if (rig.blueprint.kind !== 'solid-character') {
      throw new Error('Solid character animator requires a solid-character blueprint');
    }
    this.rig = rig;
    this.face = new SolidFaceAnimator(rig, options);
    for (const id of ['torso', 'arm:left', 'arm:right', 'leg:left', 'leg:right', 'tail']) {
      const node = rig.getNode(id);
      if (node === null) continue;
      this.rest.set(id, Object.freeze({
        position: node.position.clone(),
        quaternion: node.quaternion.clone(),
        scale: node.scale.clone(),
      }));
    }
  }

  public get currentExpression(): SolidFaceExpression {
    return this.requestedExpression;
  }

  public setExpression(expression: SolidFaceExpression): void {
    this.requestedExpression = expression;
    this.face.setExpression(expression);
  }

  public setGaze(x: number, y: number, headFollow = 0.45): void {
    this.face.setGaze(x, y, headFollow);
  }

  public clearGaze(): void {
    this.face.clearGaze();
  }

  public update(deltaSeconds: number, motion: CharacterMotion = {}): void {
    if (!(deltaSeconds >= 0) || !Number.isFinite(deltaSeconds)) {
      throw new RangeError('deltaSeconds must be a non-negative finite number');
    }
    const delta = clamp(deltaSeconds, 0, 0.1);
    const speed = clamp(motion.speed ?? 0, 0, 1);
    const pose = motion.pose ?? 'idle';
    const weights = this.poseBlend.update(pose, delta);
    const faceExpression = weights.sleep > 0.55 ? 'sleeping' : this.requestedExpression;
    this.elapsed += delta;
    if (this.face.currentExpression !== faceExpression) {
      this.face.setExpression(faceExpression);
    }
    this.face.update(delta);
    this.resetBodyNodes();
    this.applyAutonomicMotion(faceExpression, weights);
    this.applyPoses(weights, speed, delta);
    this.rig.root.scale.x = motion.facing ?? 1;
  }

  private resetBodyNodes(): void {
    for (const [id, rest] of this.rest) {
      const node = this.rig.getNode(id);
      if (node === null) continue;
      node.position.copy(rest.position);
      node.quaternion.copy(rest.quaternion);
      node.scale.copy(rest.scale);
    }
  }

  private applyAutonomicMotion(
    expression: SolidFaceExpression,
    weights: CharacterPoseWeights,
  ): void {
    const breath = Math.sin(this.elapsed * 1.15);
    const sway = Math.sin(this.elapsed * 0.58);
    const torso = this.rig.getNode('torso');
    if (torso !== null) {
      torso.position.x += sway * 0.006;
      torso.position.y += breath * 0.008;
      torso.scale.x *= 1 - breath * 0.008;
      torso.scale.y *= 1 + breath * 0.018;
    }
    const head = this.rig.getNode('head');
    if (head !== null) {
      head.position.y += breath * 0.006;
      head.rotation.z += sway * 0.012;
    }
    const freeArmWeight = weights.idle + weights.sit * 0.4;
    this.rotateNode(
      'arm:left', 0, 0,
      Math.sin(this.elapsed * 0.8 + 1.7) * 0.025 * freeArmWeight,
    );
    this.rotateNode(
      'arm:right', 0, 0,
      -Math.sin(this.elapsed * 0.8) * 0.025 * freeArmWeight,
    );
    this.rotateNode('tail', 0, 0, Math.sin(this.elapsed * 2.1) * 0.1);
    if (expression === 'crying') {
      const sob = Math.sin(this.elapsed * 5.2);
      const heave = Math.max(0, Math.sin(this.elapsed * 2.6));
      if (torso !== null) {
        torso.position.y -= Math.abs(sob) * 0.014;
        torso.scale.y *= 1 + heave * 0.024;
      }
      // The raster gesture draws crossed arms in front of the torso. Swing the
      // solid limbs forward before rotating them inward so they do not tunnel
      // through the body volume.
      this.rotateNode('arm:left', -0.72, 0, 0.16 + heave * 0.12);
      this.rotateNode('arm:right', -0.72, 0, -0.16 - heave * 0.12);
    }
  }

  private applyPoses(weights: CharacterPoseWeights, speed: number, delta: number): void {
    const gaitFrequency = weights.walk * 1.6 + weights.run * 2.7;
    this.gaitPhase += delta * gaitFrequency * (0.35 + speed * 0.65) * Math.PI * 2;
    this.applyGait(weights.walk, speed, false);
    this.applyGait(weights.run, speed, true);
    this.applyAirborne(weights.airborne);
    this.applySit(weights.sit);
    this.applySleep(weights.sleep);
    this.applyPlay(weights.play);
  }

  private applyGait(weight: number, speed: number, running: boolean): void {
    if (weight <= 0.001) return;
    const swing = Math.sin(this.gaitPhase);
    const legAmount = swing * (running ? 0.58 : 0.34) * (0.45 + speed * 0.55) * weight;
    const armAmount = swing * (running ? 0.68 : 0.38) * (0.45 + speed * 0.55) * weight;
    this.rotateNode('leg:left', legAmount, 0, legAmount * 0.12);
    this.rotateNode('leg:right', -legAmount, 0, -legAmount * 0.12);
    this.rotateNode('arm:left', -armAmount, 0, -armAmount * 0.08);
    this.rotateNode('arm:right', armAmount, 0, armAmount * 0.08);
    this.rotateNode('tail', 0, 0, -swing * (running ? 0.28 : 0.18) * weight);
    const bounce = Math.abs(swing) * (running ? 0.045 : 0.024) * weight;
    const torso = this.rig.getNode('torso');
    if (torso !== null) torso.position.y += bounce;
    const head = this.rig.getNode('head');
    if (head !== null) head.position.y += bounce * 1.2;
  }

  private applyAirborne(weight: number): void {
    if (weight <= 0.001) return;
    this.rotateNode('leg:left', 0.22 * weight, 0, 0.15 * weight);
    this.rotateNode('leg:right', -0.18 * weight, 0, -0.12 * weight);
    this.rotateNode('arm:left', -0.4 * weight, 0, -0.28 * weight);
    this.rotateNode('arm:right', 0.4 * weight, 0, 0.28 * weight);
    this.rotateNode('tail', 0, 0, 0.24 * weight);
  }

  private applySit(weight: number): void {
    if (weight <= 0.001) return;
    const torso = this.rig.getNode('torso');
    if (torso !== null) torso.position.y -= 0.11 * weight;
    this.rotateNode('leg:left', 0, 0, -0.9 * weight);
    this.rotateNode('leg:right', 0, 0, 0.9 * weight);
    this.rotateNode('arm:left', 0, 0, -0.18 * weight);
    this.rotateNode('arm:right', 0, 0, 0.18 * weight);
    this.rotateNode('tail', 0, 0, -0.2 * weight);
  }

  private applySleep(weight: number): void {
    if (weight <= 0.001) return;
    this.applySit(weight);
    const torso = this.rig.getNode('torso');
    if (torso !== null) torso.position.y -= 0.05 * weight;
    const head = this.rig.getNode('head');
    if (head !== null) {
      head.position.x += 0.04 * weight;
      head.position.y -= 0.13 * weight;
      head.rotation.z += (0.14 + Math.sin(this.elapsed * 0.8) * 0.012) * weight;
    }
  }

  private applyPlay(weight: number): void {
    if (weight <= 0.001) return;
    const wave = Math.sin(this.elapsed * 6.2);
    const hop = Math.abs(wave);
    const torso = this.rig.getNode('torso');
    if (torso !== null) torso.position.y += hop * 0.1 * weight;
    // Bring the waving arms towards the camera before crossing the torso
    // silhouette, mirroring the raster layer order without body penetration.
    this.rotateNode('arm:left', -0.52 * weight, 0, (0.55 + wave * 0.42) * weight);
    this.rotateNode('arm:right', -0.52 * weight, 0, (-0.55 - wave * 0.42) * weight);
  }

  private rotateNode(id: string, x: number, y: number, z: number): void {
    const node = this.rig.getNode(id);
    if (node === null) return;
    node.rotateX(x);
    node.rotateY(y);
    node.rotateZ(z);
  }
}
