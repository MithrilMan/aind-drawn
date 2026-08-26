import type {
  ArcadeVehicleState,
  VehicleCollisionProfile,
} from '@mithrilman/aind-game-runtime';
import { nearestCoursePoint, type CourseLayout } from './course.js';

type VehiclePose = Pick<ArcadeVehicleState, 'x' | 'z' | 'heading'>;

const CONTACT_EPSILON = 1e-6;

/**
 * Reports whether any portion of any tyre footprint overlaps the authored road.
 * Wheel centres come from the same collision profile used by the visible vehicle;
 * the oriented rectangular support accounts for both tyre radius and width.
 */
export function vehicleWheelsTouchRoute(
  course: CourseLayout,
  vehicle: VehiclePose,
  profile: VehicleCollisionProfile,
): boolean {
  const forwardX = Math.cos(vehicle.heading);
  const forwardZ = -Math.sin(vehicle.heading);
  const sideX = Math.sin(vehicle.heading);
  const sideZ = Math.cos(vehicle.heading);
  for (const axleOffset of [profile.rearAxle, profile.frontAxle]) {
    for (const sideSign of [-1, 1]) {
      const x = vehicle.x
        + forwardX * axleOffset
        + sideX * sideSign * profile.halfWidth;
      const z = vehicle.z
        + forwardZ * axleOffset
        + sideZ * sideSign * profile.halfWidth;
      const projection = nearestCoursePoint(course, x, z);
      const normalAlongWheel = Math.abs(
        forwardX * projection.normalX + forwardZ * projection.normalZ,
      );
      const normalAcrossWheel = Math.abs(
        sideX * projection.normalX + sideZ * projection.normalZ,
      );
      const tyreReach = normalAlongWheel * profile.wheelRadius
        + normalAcrossWheel * profile.wheelHalfWidth;
      if (
        projection.distanceFromCentre
        <= course.trackWidth * 0.5 + tyreReach + CONTACT_EPSILON
      ) {
        return true;
      }
    }
  }
  return false;
}
