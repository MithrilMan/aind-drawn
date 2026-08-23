import type { SolidRig } from '../../../runtime/solid-rig.js';
import { vehicleRollingPartOf } from '../solid/capabilities.js';
import type { VehicleMotionSample } from './motion.js';

/** Applies shared vehicle kinematics from authored node rest transforms. */
export function applySolidVehicleMotion(
  rig: SolidRig,
  sample: VehicleMotionSample,
): void {
  if (rig.blueprint.family !== 'vehicle') {
    throw new TypeError('Solid vehicle motion requires a vehicle rig');
  }
  const chassis = rig.getNode('chassis');
  if (chassis !== null) {
    rig.resetNodePose('chassis');
    chassis.position.y += sample.chassisBounce;
  }
  const wheelNodes = new Set<string>();
  for (const part of rig.blueprint.parts) {
    const binding = vehicleRollingPartOf(part);
    if (binding === undefined || wheelNodes.has(part.node)) continue;
    wheelNodes.add(part.node);
    const node = rig.getNode(part.node);
    if (node === null) continue;
    rig.resetNodePose(part.node);
    if (binding.steering) node.rotateY(sample.steeringAngle);
    node.rotateZ(sample.wheelRotation);
  }
  rig.setPlaybackTime(sample.time);
}
