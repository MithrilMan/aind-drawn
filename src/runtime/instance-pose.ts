import * as THREE from 'three';

import type { Pose2 } from '../contracts/raster-asset.js';
import type { Pose3 } from '../contracts/solid-asset.js';

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite`);
  }
  return value;
}

function updateWorldMatrix(object: THREE.Object3D): void {
  object.updateWorldMatrix(true, false);
}

export function readWorldPose2(object: THREE.Object3D): Pose2 {
  updateWorldMatrix(object);
  const position = new THREE.Vector3().setFromMatrixPosition(object.matrixWorld);
  const direction = new THREE.Vector3(1, 0, 0).transformDirection(object.matrixWorld);
  return Object.freeze({
    position: Object.freeze({ x: position.x, y: position.y }),
    rotation: Math.atan2(direction.y, direction.x),
  });
}

export function writeWorldPose2(object: THREE.Object3D, pose: Pose2): void {
  const worldPosition = new THREE.Vector3(
    requireFinite(pose.position.x, '2D position x'),
    requireFinite(pose.position.y, '2D position y'),
    0,
  );
  const worldRotation = requireFinite(pose.rotation, '2D rotation');
  const parent = object.parent;
  if (parent === null) {
    object.position.x = worldPosition.x;
    object.position.y = worldPosition.y;
    object.rotation.z = worldRotation;
    object.updateMatrixWorld(true);
    return;
  }

  updateWorldMatrix(parent);
  const inverseParent = parent.matrixWorld.clone().invert();
  worldPosition.applyMatrix4(inverseParent);
  const localDirection = new THREE.Vector3(
    Math.cos(worldRotation),
    Math.sin(worldRotation),
    0,
  ).transformDirection(inverseParent);
  object.position.x = worldPosition.x;
  object.position.y = worldPosition.y;
  object.rotation.z = Math.atan2(localDirection.y, localDirection.x);
  object.updateMatrixWorld(true);
}

export function readWorldPose3(object: THREE.Object3D): Pose3 {
  updateWorldMatrix(object);
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  object.matrixWorld.decompose(position, rotation, new THREE.Vector3());
  return Object.freeze({
    position: Object.freeze([position.x, position.y, position.z] as const),
    rotation: Object.freeze([rotation.x, rotation.y, rotation.z, rotation.w] as const),
  });
}

export function writeWorldPose3(object: THREE.Object3D, pose: Pose3): void {
  const worldPosition = new THREE.Vector3(
    requireFinite(pose.position[0], '3D position x'),
    requireFinite(pose.position[1], '3D position y'),
    requireFinite(pose.position[2], '3D position z'),
  );
  const worldRotation = new THREE.Quaternion(
    requireFinite(pose.rotation[0], '3D rotation x'),
    requireFinite(pose.rotation[1], '3D rotation y'),
    requireFinite(pose.rotation[2], '3D rotation z'),
    requireFinite(pose.rotation[3], '3D rotation w'),
  );
  if (worldRotation.lengthSq() === 0) {
    throw new RangeError('3D rotation must not be a zero quaternion');
  }
  worldRotation.normalize();

  updateWorldMatrix(object);
  const worldScale = new THREE.Vector3();
  object.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), worldScale);
  const desiredWorld = new THREE.Matrix4().compose(worldPosition, worldRotation, worldScale);
  const parent = object.parent;
  const desiredLocal = parent === null
    ? desiredWorld
    : new THREE.Matrix4().multiplyMatrices(
      parent.matrixWorld.clone().invert(),
      desiredWorld,
    );
  desiredLocal.decompose(object.position, object.quaternion, object.scale);
  object.updateMatrixWorld(true);
}
