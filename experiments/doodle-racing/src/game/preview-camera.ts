import * as THREE from 'three';

import type { Point3, Quaternion } from '../../../../src/index.js';

const cameraOffset = new THREE.Vector3();
const assetRotation = new THREE.Quaternion();

/** Converts the gameplay camera's forward vector into an asset-local camera offset direction. */
export function localPreviewCameraOffsetDirection(
  cameraWorldForward: Point3,
  assetWorldRotation: Quaternion,
): Point3 {
  cameraOffset.set(...cameraWorldForward).multiplyScalar(-1);
  assetRotation.set(...assetWorldRotation).invert();
  cameraOffset.applyQuaternion(assetRotation).normalize();
  return Object.freeze([
    cameraOffset.x,
    cameraOffset.y,
    cameraOffset.z,
  ] as const);
}
