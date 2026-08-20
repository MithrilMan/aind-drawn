import * as THREE from 'three';

import type { SolidPartDefinition } from '../assets/solid-types.js';
import type { CharacterExpression } from '../assets/character-identity/mouth-profile.js';
import { clamp } from '../core/geometry.js';
import { Random, combineSeed } from '../core/random.js';
import type { SolidRig } from './solid-rig.js';

export type SolidFaceExpression = CharacterExpression;

export type SolidFaceAnimatorOptions = Readonly<{
  autoBlink?: boolean;
  autoGaze?: boolean;
}>;

type RestTransform = Readonly<{
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
}>;

type ExpressionPose = Readonly<{
  eyeScale?: number;
  eyeScaleY?: number;
  browLift?: number;
  browRoll?: number;
}>;

const EXPRESSIONS: Readonly<Record<SolidFaceExpression, ExpressionPose>> = {
  idle: {},
  happy: { eyeScaleY: 0.78, browLift: 0.1 },
  angry: { eyeScaleY: 0.88, browLift: -0.16, browRoll: -0.48 },
  sad: { eyeScaleY: 0.94, browLift: 0.08, browRoll: 0.42 },
  surprised: { eyeScale: 1.13, browLift: 0.24 },
  scared: { eyeScale: 1.16, browLift: 0.3, browRoll: 0.24 },
  crying: { eyeScaleY: 0.48, browLift: 0.12, browRoll: 0.5 },
  sleeping: { eyeScaleY: 0.06, browLift: 0.06, browRoll: 0.28 },
};

function criticallyDamped(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  deltaSeconds: number,
): readonly [value: number, velocity: number] {
  const displacement = value - target;
  const decay = Math.exp(-omega * deltaSeconds);
  const blend = velocity + omega * displacement;
  return [
    target + (displacement + blend * deltaSeconds) * decay,
    (velocity - omega * blend * deltaSeconds) * decay,
  ];
}

/**
 * Mesh-transform face animation: no geometry rebuild and no skeleton required.
 * Every frame is derived from the immutable rest pose, preventing drift.
 */
export class SolidFaceAnimator {
  private readonly rig: SolidRig;
  private readonly autoBlink: boolean;
  private readonly autoGaze: boolean;
  private readonly random: Random;
  private readonly rest = new Map<string, RestTransform>();
  private readonly definitions = new Map<string, SolidPartDefinition>();
  private readonly head: THREE.Group;
  private readonly headRest: THREE.Vector3;
  private readonly faceUnit: number;
  private elapsed = 0;
  private nextBlink: number;
  private blinkProgress = -1;
  private nextGaze: number;
  private gazeUntil = 0;
  private gazeTargetX = 0;
  private gazeTargetY = 0;
  private gazeX = 0;
  private gazeY = 0;
  private gazeVelocityX = 0;
  private gazeVelocityY = 0;
  private headX = 0;
  private headY = 0;
  private headVelocityX = 0;
  private headVelocityY = 0;
  private headFollow = 0;
  private expression: SolidFaceExpression = 'idle';

  public constructor(rig: SolidRig, options: SolidFaceAnimatorOptions = {}) {
    this.rig = rig;
    this.autoBlink = options.autoBlink ?? true;
    this.autoGaze = options.autoGaze ?? true;
    this.random = new Random(combineSeed(rig.blueprint.seed, 'solid-face:animation'));
    const head = rig.getNode('head');
    if (head === null) throw new Error('Solid face animator requires a head node');
    this.head = head;
    this.headRest = head.position.clone();
    const headPart = rig.blueprint.parts.find((part) => part.id === 'head');
    this.faceUnit = headPart?.geometry.type === 'superellipsoid'
      ? headPart.geometry.radii[1]
      : (rig.blueprint.bounds.maximum[1] - rig.blueprint.bounds.minimum[1]) * 0.5;
    this.nextBlink = 1 + this.random.float(0, 2.8);
    this.nextGaze = 0.8 + this.random.float(0, 3.2);
    for (const definition of rig.blueprint.parts) {
      const mesh = rig.getPart(definition.id);
      if (mesh === null) throw new Error(`Solid rig is missing part ${definition.id}`);
      this.definitions.set(definition.id, definition);
      this.rest.set(definition.id, Object.freeze({
        position: mesh.position.clone(),
        quaternion: mesh.quaternion.clone(),
        scale: mesh.scale.clone(),
      }));
    }
  }

  public get currentExpression(): SolidFaceExpression {
    return this.expression;
  }

  public setExpression(expression: SolidFaceExpression): void {
    this.expression = expression;
    if (this.blinkProgress < 0) this.blinkProgress = 0;
  }

  public setGaze(x: number, y: number, headFollow = 0.45): void {
    this.gazeTargetX = clamp(x, -1, 1);
    this.gazeTargetY = clamp(y, -1, 1);
    this.headFollow = clamp(headFollow, 0, 1);
    this.gazeUntil = Number.POSITIVE_INFINITY;
  }

  public clearGaze(): void {
    this.gazeTargetX = 0;
    this.gazeTargetY = 0;
    this.headFollow = 0;
    this.gazeUntil = this.elapsed;
    this.nextGaze = this.elapsed + 1.2 + this.random.float(0, 3);
  }

  public update(deltaSeconds: number): void {
    if (!(deltaSeconds >= 0) || !Number.isFinite(deltaSeconds)) {
      throw new RangeError('deltaSeconds must be a non-negative finite number');
    }
    this.elapsed += deltaSeconds;
    this.updateBlink(deltaSeconds);
    this.updateGaze(deltaSeconds);
    this.writePose();
  }

  private updateBlink(deltaSeconds: number): void {
    if (!this.autoBlink && this.blinkProgress < 0) return;
    if (this.blinkProgress < 0 && this.elapsed >= this.nextBlink) this.blinkProgress = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += deltaSeconds / 0.14;
      if (this.blinkProgress >= 1) {
        this.blinkProgress = -1;
        this.nextBlink = this.elapsed + 1.2 + this.random.float(0, 3.2);
      }
    }
  }

  private updateGaze(deltaSeconds: number): void {
    if (this.autoGaze && this.elapsed >= this.nextGaze && this.gazeUntil <= this.elapsed) {
      const horizontal = this.random.float(-1, 1);
      const vertical = this.random.float(-0.75, 0.75);
      this.gazeTargetX = Math.abs(horizontal) < 0.24 ? Math.sign(horizontal || 1) * 0.55 : horizontal;
      this.gazeTargetY = vertical;
      this.headFollow = this.random.chance(0.45) ? 1 : 0;
      this.gazeUntil = this.elapsed + this.random.float(0.45, 1.6);
      this.nextGaze = this.gazeUntil + this.random.float(1.2, 4);
    } else if (Number.isFinite(this.gazeUntil) && this.elapsed >= this.gazeUntil) {
      this.gazeTargetX = 0;
      this.gazeTargetY = 0;
      this.headFollow = 0;
    }
    [this.gazeX, this.gazeVelocityX] = criticallyDamped(
      this.gazeX, this.gazeVelocityX, this.gazeTargetX, 24, deltaSeconds,
    );
    [this.gazeY, this.gazeVelocityY] = criticallyDamped(
      this.gazeY, this.gazeVelocityY, this.gazeTargetY, 24, deltaSeconds,
    );
    [this.headX, this.headVelocityX] = criticallyDamped(
      this.headX, this.headVelocityX, this.gazeTargetX * this.headFollow, 6, deltaSeconds,
    );
    [this.headY, this.headVelocityY] = criticallyDamped(
      this.headY, this.headVelocityY, this.gazeTargetY * this.headFollow, 6, deltaSeconds,
    );
  }

  private writePose(): void {
    const expression = EXPRESSIONS[this.expression];
    const blinkWave = this.blinkProgress < 0 ? 1 : 1 - Math.sin(this.blinkProgress * Math.PI);
    const unit = this.faceUnit;
    for (const [id, definition] of this.definitions) {
      const mesh = this.rig.getPart(id);
      const rest = this.rest.get(id);
      if (mesh === null || rest === undefined) continue;
      mesh.position.copy(rest.position);
      mesh.quaternion.copy(rest.quaternion);
      mesh.scale.copy(rest.scale);
      const motion = definition.motion;
      if (motion.role === 'eye') {
        if (motion.gazeTravel !== undefined) {
          mesh.translateX(this.gazeX * motion.gazeTravel[0] * blinkWave);
          mesh.translateY(this.gazeY * motion.gazeTravel[1] * blinkWave);
        }
        const blinkScale = motion.blink === undefined
          ? 1
          : Math.max(motion.blink.minimumScaleY, blinkWave);
        const eyeScale = expression.eyeScale ?? 1;
        mesh.scale.set(
          rest.scale.x * eyeScale,
          rest.scale.y * eyeScale * (expression.eyeScaleY ?? 1) * blinkScale,
          rest.scale.z,
        );
      } else if (motion.role === 'brow') {
        mesh.translateX(this.gazeX * unit * 0.04);
        mesh.translateY(this.gazeY * unit * 0.035 + (expression.browLift ?? 0) * unit);
        mesh.rotateZ((expression.browRoll ?? 0) * (motion.side ?? 1));
      } else if (motion.role === 'mouth') {
        mesh.translateX(this.headX * unit * 0.04);
        mesh.translateY(this.headY * unit * 0.025);
        mesh.visible = motion.expression === undefined || motion.expression === this.expression;
      } else if (motion.role === 'tear') {
        mesh.visible = this.expression === 'crying';
        if (mesh.visible) {
          const phaseOffset = (motion.side ?? 1) < 0 ? 0 : 0.46;
          const fall = (this.elapsed * 0.82 + phaseOffset) % 1;
          mesh.translateY(-(motion.travel ?? unit * 0.12) * fall);
          const pulse = 0.88 + Math.sin(fall * Math.PI) * 0.24;
          mesh.scale.set(rest.scale.x * pulse, rest.scale.y * (0.82 + fall * 0.34), rest.scale.z);
        }
      }
    }
    this.head.position.copy(this.headRest);
    this.head.position.x += this.headX * unit * 0.08;
    this.head.position.y += this.headY * unit * 0.055;
    this.head.rotation.set(-this.headY * 0.16, this.headX * 0.26, -this.headX * 0.05);
    if (this.expression === 'crying') {
      const sob = Math.sin(this.elapsed * 5.2);
      const catchBreath = Math.max(0, Math.sin(this.elapsed * 2.6));
      this.head.position.y -= Math.abs(sob) * unit * 0.026;
      this.head.rotation.x += catchBreath * 0.035;
      this.head.rotation.z += sob * unit * 0.018;
    }
  }
}
