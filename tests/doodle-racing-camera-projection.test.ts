import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import {
  RaceCameraController,
  groundedOrthographicVerticalOffset,
} from '../experiments/doodle-racing/src/game/race-camera.js';
import { createRaceSceneryBlueprint } from '../experiments/doodle-racing/src/game/race-scenery-blueprint.js';
import {
  GRANDSTAND_ROW_SPACING,
  createRaceWorldLayout,
  grandstandLocalPoint,
  grandstandSurfaceAt,
} from '../experiments/doodle-racing/src/game/race-world.js';

const IDLE_AXIS = Object.freeze({
  value: 0,
  device: null,
  kind: 'analog' as const,
  behavior: 'delta' as const,
});

describe('Paper Circuit Explore camera projection', () => {
  it('keeps the grandstand roof inside the depth frustum in a wide low-pitch view', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const stand = world.grandstand;
    const roofAway = (stand.rows - 1) * GRANDSTAND_ROW_SPACING * 0.5;
    const actorPosition = grandstandLocalPoint(stand, 0, roofAway);
    const support = grandstandSurfaceAt(stand, roofAway, 0);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);
    const standardNear = camera.near;
    const controller = new RaceCameraController(
      camera,
      course,
      world,
      () => Object.freeze({ width: 1912, height: 390 }),
    );
    const cameraAlongStand = stand.heading + Math.PI * 0.5;
    const snapshot = Object.freeze({
      species: 'human' as const,
      x: actorPosition.x,
      y: support.height,
      z: actorPosition.z,
      heading: cameraAlongStand - Math.PI + 0.42,
      speed: 0,
      along: 0,
      away: roofAway,
      row: support.row,
      pose: 'idle' as const,
      expression: 'idle' as const,
      elapsed: 0,
    });

    controller.setExplorerActive(true);
    controller.updateExplorer(snapshot, 0.05);
    controller.applyExplorerInput(Object.freeze({
      orbitX: IDLE_AXIS,
      orbitY: Object.freeze({ ...IDLE_AXIS, value: -10 }),
      zoom: IDLE_AXIS,
    }), 0.05);
    for (let frame = 0; frame < 80; frame += 1) {
      controller.updateExplorer(snapshot, 0.05);
    }

    const roof = createRaceSceneryBlueprint(course, world).parts
      .find(({ id }) => id === 'grandstand:roof');
    if (roof?.geometry.type !== 'box') throw new Error('Grandstand roof must use box geometry');
    const roofObject = new THREE.Object3D();
    roofObject.position.set(...roof.placement.position);
    if (roof.placement.rotation !== undefined) {
      roofObject.rotation.set(...roof.placement.rotation);
    }
    roofObject.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const halfSize = new THREE.Vector3(...roof.geometry.size).multiplyScalar(0.5);
    const cameraForward = camera.getWorldDirection(new THREE.Vector3());
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const viewSize = camera.top - camera.bottom;
    const legacyVerticalOffset = groundedOrthographicVerticalOffset({
      cameraY: camera.position.y,
      cameraUpY: cameraUp.y,
      cameraForwardY: cameraForward.y,
      near: standardNear,
      viewSize,
      minimumWorldY: 0.04,
    });
    const roofDepths: number[] = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          const corner = new THREE.Vector3(
            x * halfSize.x,
            y * halfSize.y,
            z * halfSize.z,
          ).applyMatrix4(roofObject.matrixWorld);
          roofDepths.push(cameraForward.dot(corner.sub(camera.position)));
        }
      }
    }

    expect(Math.min(...roofDepths)).toBeLessThan(standardNear);
    expect(Math.max(...roofDepths)).toBeGreaterThan(standardNear);
    expect(Math.min(...roofDepths)).toBeGreaterThan(camera.near);
    expect(Math.max(...roofDepths)).toBeLessThan(camera.far);
    expect((camera.top + camera.bottom) * 0.5).toBeCloseTo(legacyVerticalOffset, 8);

    controller.setExplorerActive(false);
    controller.updateMenu(snapshot, 0.05);
    expect(camera.near).toBe(standardNear);
    controller.dispose();
  });
});
