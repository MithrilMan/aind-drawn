import * as THREE from 'three';

import type { SolidRig } from '../../../../src/index.js';

type GroundColliderHeader = Readonly<{
  id: string;
  instanceId: string;
  minimumY: number;
  maximumY: number;
}>;

export type CircleGroundCollider = GroundColliderHeader & Readonly<{
  shape: 'circle';
  x: number;
  z: number;
  radius: number;
}>;

export type SegmentGroundCollider = GroundColliderHeader & Readonly<{
  shape: 'segment';
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  radius: number;
}>;

export type BoxGroundCollider = GroundColliderHeader & Readonly<{
  shape: 'box';
  x: number;
  z: number;
  axisXx: number;
  axisXz: number;
  axisZx: number;
  axisZz: number;
  halfX: number;
  halfZ: number;
}>;

export type GroundCollider = CircleGroundCollider | SegmentGroundCollider | BoxGroundCollider;

export type GroundMotion = Readonly<{ x: number; z: number }>;

type GroundContact = Readonly<{
  normalX: number;
  normalZ: number;
  penetration: number;
}>;

const matrix = new THREE.Matrix4();
const centre = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const axis = new THREE.Vector3();

function verticalExtent(
  elements: readonly number[],
  halfX: number,
  halfY: number,
  halfZ: number,
): number {
  return Math.abs(elements[1] ?? 0) * halfX
    + Math.abs(elements[5] ?? 0) * halfY
    + Math.abs(elements[9] ?? 0) * halfZ;
}

function boxGroundCollider(
  instanceId: string,
  id: string,
  elements: readonly number[],
  size: readonly [number, number, number],
): BoxGroundCollider {
  const axisXLength = Math.max(1e-6, Math.hypot(elements[0] ?? 0, elements[2] ?? 0));
  const axisZLength = Math.max(1e-6, Math.hypot(elements[8] ?? 0, elements[10] ?? 0));
  const extentY = verticalExtent(elements, size[0] * 0.5, size[1] * 0.5, size[2] * 0.5);
  return Object.freeze({
    id,
    instanceId,
    shape: 'box',
    x: elements[12] ?? 0,
    z: elements[14] ?? 0,
    axisXx: (elements[0] ?? 0) / axisXLength,
    axisXz: (elements[2] ?? 0) / axisXLength,
    axisZx: (elements[8] ?? 0) / axisZLength,
    axisZz: (elements[10] ?? 0) / axisZLength,
    halfX: size[0] * axisXLength * 0.5,
    halfZ: size[2] * axisZLength * 0.5,
    minimumY: (elements[13] ?? 0) - extentY,
    maximumY: (elements[13] ?? 0) + extentY,
  });
}

/** Projects authored solid colliders onto the ground plane without reading render meshes. */
export function groundCollidersFor(
  rigs: readonly SolidRig[],
  kind: 'solid' | 'sensor' = 'solid',
): readonly GroundCollider[] {
  const colliders: GroundCollider[] = [];
  for (const rig of rigs) {
    rig.root.updateWorldMatrix(true, true);
    for (const definition of rig.blueprint.colliders) {
      if (definition.kind !== kind) continue;
      const shape = rig.getColliderWorldShape(definition.id);
      if (shape === null) continue;
      const elements = shape.worldTransform;
      matrix.fromArray([...elements]);
      matrix.decompose(centre, rotation, scale);
      if (definition.shape === 'box') {
        colliders.push(boxGroundCollider(
          rig.instanceId,
          definition.id,
          elements,
          definition.size,
        ));
        continue;
      }
      if (definition.shape === 'sphere') {
        const radius = definition.radius * Math.max(Math.abs(scale.x), Math.abs(scale.z));
        colliders.push(Object.freeze({
          id: definition.id,
          instanceId: rig.instanceId,
          shape: 'circle' as const,
          x: centre.x,
          z: centre.z,
          radius,
          minimumY: centre.y - definition.radius * Math.abs(scale.y),
          maximumY: centre.y + definition.radius * Math.abs(scale.y),
        }));
        continue;
      }

      const localAxis = definition.axis === 'x'
        ? axis.set(1, 0, 0)
        : definition.axis === 'y' ? axis.set(0, 1, 0) : axis.set(0, 0, 1);
      localAxis.applyQuaternion(rotation);
      const axisScale = definition.axis === 'x'
        ? Math.abs(scale.x)
        : definition.axis === 'y' ? Math.abs(scale.y) : Math.abs(scale.z);
      const radius = definition.radius * Math.max(
        Math.abs(scale.x),
        Math.abs(scale.y),
        Math.abs(scale.z),
      );
      const halfLength = definition.length * axisScale * 0.5;
      const startX = centre.x - localAxis.x * halfLength;
      const startZ = centre.z - localAxis.z * halfLength;
      const endX = centre.x + localAxis.x * halfLength;
      const endZ = centre.z + localAxis.z * halfLength;
      const minimumY = centre.y - Math.abs(localAxis.y) * halfLength - radius;
      const maximumY = centre.y + Math.abs(localAxis.y) * halfLength + radius;
      if (Math.hypot(endX - startX, endZ - startZ) < 1e-5) {
        colliders.push(Object.freeze({
          id: definition.id,
          instanceId: rig.instanceId,
          shape: 'circle' as const,
          x: centre.x,
          z: centre.z,
          radius,
          minimumY,
          maximumY,
        }));
      } else {
        colliders.push(Object.freeze({
          id: definition.id,
          instanceId: rig.instanceId,
          shape: 'segment' as const,
          startX,
          startZ,
          endX,
          endZ,
          radius,
          minimumY,
          maximumY,
        }));
      }
    }
  }
  return Object.freeze(colliders);
}

function closestOnSegment(
  x: number,
  z: number,
  collider: SegmentGroundCollider,
): Readonly<{ x: number; z: number }> {
  const deltaX = collider.endX - collider.startX;
  const deltaZ = collider.endZ - collider.startZ;
  const lengthSquared = deltaX * deltaX + deltaZ * deltaZ;
  const amount = THREE.MathUtils.clamp(
    ((x - collider.startX) * deltaX + (z - collider.startZ) * deltaZ)
      / Math.max(1e-9, lengthSquared),
    0,
    1,
  );
  return Object.freeze({
    x: collider.startX + deltaX * amount,
    z: collider.startZ + deltaZ * amount,
  });
}

function circleContact(
  x: number,
  z: number,
  radius: number,
  centreX: number,
  centreZ: number,
  colliderRadius: number,
): GroundContact | null {
  const deltaX = x - centreX;
  const deltaZ = z - centreZ;
  const distance = Math.hypot(deltaX, deltaZ);
  const minimum = radius + colliderRadius;
  if (distance >= minimum) return null;
  if (distance < 1e-7) {
    return Object.freeze({ normalX: 1, normalZ: 0, penetration: minimum });
  }
  return Object.freeze({
    normalX: deltaX / distance,
    normalZ: deltaZ / distance,
    penetration: minimum - distance,
  });
}

function boxContact(
  x: number,
  z: number,
  radius: number,
  collider: BoxGroundCollider,
): GroundContact | null {
  const deltaX = x - collider.x;
  const deltaZ = z - collider.z;
  const localX = deltaX * collider.axisXx + deltaZ * collider.axisXz;
  const localZ = deltaX * collider.axisZx + deltaZ * collider.axisZz;
  const closestX = THREE.MathUtils.clamp(localX, -collider.halfX, collider.halfX);
  const closestZ = THREE.MathUtils.clamp(localZ, -collider.halfZ, collider.halfZ);
  const offsetX = localX - closestX;
  const offsetZ = localZ - closestZ;
  const distance = Math.hypot(offsetX, offsetZ);
  if (distance >= radius) return null;
  if (distance > 1e-7) {
    const normalLocalX = offsetX / distance;
    const normalLocalZ = offsetZ / distance;
    return Object.freeze({
      normalX: normalLocalX * collider.axisXx + normalLocalZ * collider.axisZx,
      normalZ: normalLocalX * collider.axisXz + normalLocalZ * collider.axisZz,
      penetration: radius - distance,
    });
  }

  const clearanceX = collider.halfX - Math.abs(localX);
  const clearanceZ = collider.halfZ - Math.abs(localZ);
  if (clearanceX < clearanceZ) {
    const sign = localX < 0 ? -1 : 1;
    return Object.freeze({
      normalX: collider.axisXx * sign,
      normalZ: collider.axisXz * sign,
      penetration: radius + clearanceX,
    });
  }
  const sign = localZ < 0 ? -1 : 1;
  return Object.freeze({
    normalX: collider.axisZx * sign,
    normalZ: collider.axisZz * sign,
    penetration: radius + clearanceZ,
  });
}

function contactFor(
  x: number,
  z: number,
  radius: number,
  collider: GroundCollider,
): GroundContact | null {
  if (collider.shape === 'circle') {
    return circleContact(x, z, radius, collider.x, collider.z, collider.radius);
  }
  if (collider.shape === 'segment') {
    const closest = closestOnSegment(x, z, collider);
    return circleContact(x, z, radius, closest.x, closest.z, collider.radius);
  }
  return boxContact(x, z, radius, collider);
}

function overlapsVertically(
  bottom: number,
  height: number,
  collider: GroundCollider,
): boolean {
  const top = bottom + height;
  return bottom < collider.maximumY - 0.015 && top > collider.minimumY + 0.015;
}

/** Sweeps a circular actor through authored ground footprints and slides it out of contacts. */
export function resolveGroundMotion(
  start: GroundMotion,
  desired: GroundMotion,
  radius: number,
  bottom: number,
  height: number,
  colliders: readonly GroundCollider[],
): GroundMotion {
  const deltaX = desired.x - start.x;
  const deltaZ = desired.z - start.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(deltaX, deltaZ) / Math.max(0.08, radius * 0.45)));
  let x = start.x;
  let z = start.z;
  for (let step = 0; step < steps; step += 1) {
    x += deltaX / steps;
    z += deltaZ / steps;
    for (let iteration = 0; iteration < 3; iteration += 1) {
      let resolved = false;
      for (const collider of colliders) {
        if (!overlapsVertically(bottom, height, collider)) continue;
        const contact = contactFor(x, z, radius, collider);
        if (contact === null) continue;
        x += contact.normalX * (contact.penetration + 0.002);
        z += contact.normalZ * (contact.penetration + 0.002);
        resolved = true;
      }
      if (!resolved) break;
    }
  }
  return Object.freeze({ x, z });
}

export function distanceToGroundCollider(
  x: number,
  z: number,
  collider: GroundCollider,
): number {
  if (collider.shape === 'circle') {
    return Math.max(0, Math.hypot(x - collider.x, z - collider.z) - collider.radius);
  }
  if (collider.shape === 'segment') {
    const closest = closestOnSegment(x, z, collider);
    return Math.max(0, Math.hypot(x - closest.x, z - closest.z) - collider.radius);
  }
  const deltaX = x - collider.x;
  const deltaZ = z - collider.z;
  const localX = deltaX * collider.axisXx + deltaZ * collider.axisXz;
  const localZ = deltaX * collider.axisZx + deltaZ * collider.axisZz;
  return Math.hypot(
    Math.max(0, Math.abs(localX) - collider.halfX),
    Math.max(0, Math.abs(localZ) - collider.halfZ),
  );
}
