import * as THREE from 'three';

import {
  vehicleRollingLayerOf,
  type VehicleRollingLayerCapability,
} from '../raster/capabilities.js';
import {
  vehicleRollingPartOf,
  type VehicleRollingPartCapability,
} from '../solid/capabilities.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';
import type { SpriteRig } from '../../../runtime/sprite-rig.js';

export const VEHICLE_MOTIONS = ['parked', 'drive', 'reverse', 'showcase'] as const;
export type VehicleMotionPreset = typeof VEHICLE_MOTIONS[number];
export const VEHICLE_STEERING_DIRECTIONS = ['left', 'straight', 'right'] as const;
export type VehicleSteeringDirection = typeof VEHICLE_STEERING_DIRECTIONS[number];

/** Positive yaw turns the +X vehicle-forward vector toward vehicle-left (-Z). */
export function vehicleSteeringInput(
  direction: VehicleSteeringDirection,
  amount = 0.72,
): number {
  const magnitude = clamp(Math.abs(amount), 0, 1);
  return direction === 'left' ? magnitude : direction === 'right' ? -magnitude : 0;
}

export type VehicleMotion = Readonly<{
  /** Cumulative signed world travel; wheel rotation is derived, never integrated. */
  travelDistance: number;
  speed?: number;
  /** Steering input in -1..1; positive turns toward vehicle-left (-Z). */
  steering?: number;
  /** Suspension character in the normalized range 0..1. */
  suspension?: number;
}>;

type SolidWheel = Readonly<{
  node: THREE.Group;
  rest: THREE.Quaternion;
  motion: VehicleRollingPartCapability;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/**
 * Shared kinematic runtime for raster and solid vehicle projections.
 * It consumes authored rolling metadata, resets rest transforms on every frame,
 * and derives all wheel angles from signed travel to prevent accumulated drift.
 */
export class VehicleAnimator {
  private readonly raster: SpriteRig | null;
  private readonly solid: SolidRig | null;
  private readonly rasterWheels: readonly Readonly<{
    id: string;
    animation: VehicleRollingLayerCapability;
  }>[];
  private readonly solidWheels: readonly SolidWheel[];
  private readonly chassis: THREE.Group | null;
  private readonly chassisRestY: number;
  private elapsedSeconds = 0;

  public constructor(rig: SpriteRig | SolidRig) {
    if (rig.blueprint.representation === 'solid') {
      this.raster = null;
      this.solid = rig as SolidRig;
      const wheels: SolidWheel[] = [];
      for (const part of this.solid.blueprint.parts) {
        const motion = vehicleRollingPartOf(part);
        if (motion === undefined) continue;
        const node = this.solid.getNode(part.node);
        if (node === null || wheels.some((candidate) => candidate.node === node)) continue;
        wheels.push(Object.freeze({
          node,
          rest: node.quaternion.clone(),
          motion,
        }));
      }
      this.solidWheels = Object.freeze(wheels);
      this.rasterWheels = Object.freeze([]);
      this.chassis = this.solid.getNode('chassis');
      this.chassisRestY = this.chassis?.position.y ?? 0;
    } else {
      this.raster = rig as SpriteRig;
      this.solid = null;
      this.rasterWheels = Object.freeze(this.raster.blueprint.layers.flatMap((layer) => {
        const animation = vehicleRollingLayerOf(layer);
        return animation === undefined
          ? []
          : [Object.freeze({ id: layer.bone, animation })];
      }));
      this.solidWheels = Object.freeze([]);
      this.chassis = null;
      this.chassisRestY = 0;
    }
  }

  public update(deltaSeconds: number, motion: VehicleMotion): void {
    if (!Number.isFinite(motion.travelDistance)) {
      throw new RangeError('Vehicle travel distance must be finite');
    }
    this.elapsedSeconds += Math.max(0, deltaSeconds);
    const steering = clamp(motion.steering ?? 0, -1, 1) * 0.48;
    const suspension = clamp(motion.suspension ?? 0.35, 0, 1);
    const speed = Math.abs(motion.speed ?? 0);
    const bounce = Math.sin(this.elapsedSeconds * (2.2 + speed * 3.4))
      * suspension * (0.012 + Math.min(1.5, speed) * 0.026);

    if (this.raster !== null) {
      this.raster.resetPose();
      for (const { id, animation } of this.rasterWheels) {
        this.raster.setBonePose(id, {
          rotation: -motion.travelDistance / animation.radius,
          scaleX: animation.steering ? 1 - Math.abs(steering) * 0.08 : 1,
        });
      }
      for (const id of this.raster.boneIds) {
        if (this.rasterWheels.some((wheel) => wheel.id === id)) continue;
        this.raster.setBonePose(id, { y: bounce });
      }
      this.raster.updateBoil(this.elapsedSeconds);
      return;
    }

    if (this.chassis !== null) this.chassis.position.y = this.chassisRestY + bounce;
    for (const { node, rest, motion: wheel } of this.solidWheels) {
      node.quaternion.copy(rest);
      if (wheel.steering) {
        node.quaternion.multiply(
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), steering),
        );
      }
      node.quaternion.multiply(
        new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 0, 1),
          -motion.travelDistance / wheel.radius,
        ),
      );
    }
  }
}
