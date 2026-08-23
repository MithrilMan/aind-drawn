import type { SpriteRig } from '../../../runtime/sprite-rig.js';
import { vehicleRollingLayerOf } from '../raster/capabilities.js';
import type { VehicleMotionSample } from './motion.js';

/** Applies shared vehicle kinematics to a planar articulated rig. */
export function applyRasterVehicleMotion(
  rig: SpriteRig,
  sample: VehicleMotionSample,
): void {
  if (rig.blueprint.family !== 'vehicle') {
    throw new TypeError('Raster vehicle motion requires a vehicle rig');
  }
  rig.resetPose();
  const wheelBones = new Set<string>();
  for (const layer of rig.blueprint.layers) {
    const binding = vehicleRollingLayerOf(layer);
    if (binding === undefined) continue;
    wheelBones.add(layer.bone);
    rig.setBonePose(layer.bone, {
      rotation: sample.wheelRotation,
      scaleX: binding.steering ? sample.steeringScale : 1,
    });
  }
  for (const id of rig.boneIds) {
    if (!wheelBones.has(id)) rig.setBonePose(id, { y: sample.chassisBounce });
  }
  rig.setPlaybackTime(sample.time);
}
