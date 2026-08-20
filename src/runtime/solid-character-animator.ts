import * as THREE from 'three';

import { clamp } from '../core/geometry.js';
import type { CharacterMotion, CharacterPose } from './character-animator.js';
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
  private elapsed = 0;
  private gaitPhase = 0;

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
    return this.face.currentExpression;
  }

  public setExpression(expression: SolidFaceExpression): void {
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
    const pose = motion.pose ?? motion.locomotion ?? 'idle';
    this.elapsed += delta;
    this.face.update(delta);
    this.resetBodyNodes();
    this.applyAutonomicMotion();
    this.applyPose(pose, speed, delta);
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

  private applyAutonomicMotion(): void {
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
    this.rotateNode('arm:left', 0, 0, Math.sin(this.elapsed * 0.8 + 1.7) * 0.025);
    this.rotateNode('arm:right', 0, 0, -Math.sin(this.elapsed * 0.8) * 0.025);
    this.rotateNode('tail', 0, 0, Math.sin(this.elapsed * 2.1) * 0.1);
  }

  private applyPose(pose: CharacterPose, speed: number, delta: number): void {
    if (pose === 'walk' || pose === 'run') {
      const running = pose === 'run';
      const frequency = running ? 2.7 : 1.6;
      this.gaitPhase += delta * frequency * (0.35 + speed * 0.65) * Math.PI * 2;
      const swing = Math.sin(this.gaitPhase);
      const legAmount = swing * (running ? 0.58 : 0.34) * (0.45 + speed * 0.55);
      const armAmount = swing * (running ? 0.68 : 0.38) * (0.45 + speed * 0.55);
      this.rotateNode('leg:left', legAmount, 0, legAmount * 0.12);
      this.rotateNode('leg:right', -legAmount, 0, -legAmount * 0.12);
      this.rotateNode('arm:left', -armAmount, 0, -armAmount * 0.08);
      this.rotateNode('arm:right', armAmount, 0, armAmount * 0.08);
      this.rotateNode('tail', 0, 0, -swing * (running ? 0.28 : 0.18));
      const bounce = Math.abs(swing) * (running ? 0.045 : 0.024);
      const torso = this.rig.getNode('torso');
      if (torso !== null) torso.position.y += bounce;
      const head = this.rig.getNode('head');
      if (head !== null) head.position.y += bounce * 1.2;
      return;
    }
    if (pose === 'airborne') {
      this.rotateNode('leg:left', 0.22, 0, 0.15);
      this.rotateNode('leg:right', -0.18, 0, -0.12);
      this.rotateNode('arm:left', -0.4, 0, -0.28);
      this.rotateNode('arm:right', 0.4, 0, 0.28);
      this.rotateNode('tail', 0, 0, 0.24);
      return;
    }
    if (pose === 'sit' || pose === 'sleep') {
      const torso = this.rig.getNode('torso');
      if (torso !== null) torso.position.y -= pose === 'sleep' ? 0.16 : 0.11;
      this.rotateNode('leg:left', 0, 0, -0.9);
      this.rotateNode('leg:right', 0, 0, 0.9);
      this.rotateNode('tail', 0, 0, -0.2);
      const head = this.rig.getNode('head');
      if (head !== null && pose === 'sleep') head.rotation.z += 0.14;
      return;
    }
    if (pose === 'play') {
      const wave = Math.sin(this.elapsed * 6.2);
      this.rotateNode('arm:left', 0, 0, 0.55 + wave * 0.42);
      this.rotateNode('arm:right', 0, 0, -0.55 - wave * 0.42);
    }
  }

  private rotateNode(id: string, x: number, y: number, z: number): void {
    const node = this.rig.getNode(id);
    if (node === null) return;
    node.rotateX(x);
    node.rotateY(y);
    node.rotateZ(z);
  }
}
