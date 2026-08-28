import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import {
  RaceCameraController,
  orthographicSceneDepthBackoff,
  groundedOrthographicVerticalOffset,
} from '../experiments/doodle-racing/src/game/race-camera.js';
import { RaceSimulation } from '../experiments/doodle-racing/src/game/race-model.js';
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

describe('Paper Circuit camera projection', () => {
  it('keeps the complete initial cinematic inside the positive depth frustum', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const simulation = new RaceSimulation(course, world);
    simulation.start({ laps: 3 });
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 400);
    const controller = new RaceCameraController(
      camera,
      course,
      world,
      () => Object.freeze({ width: 1912, height: 253 }),
    );
    const scenery = createRaceSceneryBlueprint(course, world);
    const minimum = new THREE.Vector3(...scenery.bounds.minimum);
    const maximum = new THREE.Vector3(...scenery.bounds.maximum);
    const sceneCorners: THREE.Vector3[] = [];
    for (const x of [minimum.x, maximum.x]) {
      for (const y of [minimum.y, maximum.y]) {
        for (const z of [minimum.z, maximum.z]) {
          sceneCorners.push(new THREE.Vector3(x, y, z));
        }
      }
    }

    for (const introProgress of [0, 0.12, 0.35, 0.58, 0.82, 0.99]) {
      controller.update(Object.freeze({
        ...simulation.snapshot(),
        introProgress,
      }), 0.05, introProgress * 6);
      camera.updateMatrixWorld(true);
      const cameraForward = camera.getWorldDirection(new THREE.Vector3());
      const sceneDepths = sceneCorners.map((point) => (
        cameraForward.dot(point.clone().sub(camera.position))
      ));

      expect(Math.min(...sceneDepths)).toBeGreaterThan(camera.near);
      expect(Math.max(...sceneDepths)).toBeLessThan(camera.far);
      expect(camera.near).toBe(0.01);
    }
    controller.dispose();
  });

  it('keeps the grandstand roof inside the depth frustum in a wide low-pitch view', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const stand = world.grandstand;
    const roofAway = (stand.rows - 1) * GRANDSTAND_ROW_SPACING * 0.5;
    const actorPosition = grandstandLocalPoint(stand, 0, roofAway);
    const support = grandstandSurfaceAt(stand, roofAway, 0);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
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

    const scenery = createRaceSceneryBlueprint(course, world);
    const roof = scenery.parts
      .find(({ id }) => id === 'grandstand:roof');
    if (roof?.geometry.type !== 'box') throw new Error('Grandstand roof must use box geometry');
    const roofObject = new THREE.Object3D();
    roofObject.position.set(...roof.placement.position);
    if (roof.placement.rotation !== undefined) {
      roofObject.rotation.set(...roof.placement.rotation);
    }
    roofObject.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const logicalView = controller.captureExplorerView();
    const logicalCameraPosition = new THREE.Vector3(...logicalView.position);
    const halfSize = new THREE.Vector3(...roof.geometry.size).multiplyScalar(0.5);
    const cameraForward = camera.getWorldDirection(new THREE.Vector3());
    const cameraUp = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    const viewSize = camera.top - camera.bottom;
    const legacyVerticalOffset = groundedOrthographicVerticalOffset({
      cameraY: logicalCameraPosition.y,
      cameraUpY: cameraUp.y,
      cameraForwardY: cameraForward.y,
      near: standardNear,
      viewSize,
      minimumWorldY: 0.04,
    });
    const roofCorners: THREE.Vector3[] = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        for (const z of [-1, 1]) {
          roofCorners.push(new THREE.Vector3(
            x * halfSize.x,
            y * halfSize.y,
            z * halfSize.z,
          ).applyMatrix4(roofObject.matrixWorld));
        }
      }
    }
    const sceneBounds = new THREE.Box3(
      new THREE.Vector3(...scenery.bounds.minimum),
      new THREE.Vector3(...scenery.bounds.maximum),
    );
    const sceneBoundsCorners: THREE.Vector3[] = [];
    for (const x of [sceneBounds.min.x, sceneBounds.max.x]) {
      for (const y of [sceneBounds.min.y, sceneBounds.max.y]) {
        for (const z of [sceneBounds.min.z, sceneBounds.max.z]) {
          sceneBoundsCorners.push(new THREE.Vector3(x, y, z));
        }
      }
    }
    const legacyRoofDepths = roofCorners.map((corner) => (
      cameraForward.dot(corner.clone().sub(logicalCameraPosition))
    ));
    const renderRoofDepths = roofCorners.map((corner) => (
      cameraForward.dot(corner.clone().sub(camera.position))
    ));
    const renderSceneDepths = sceneBoundsCorners.map((corner) => (
      cameraForward.dot(corner.clone().sub(camera.position))
    ));
    const renderOffset = logicalCameraPosition.clone().sub(camera.position);
    const logicalForward = new THREE.Vector3(...logicalView.target)
      .sub(logicalCameraPosition)
      .normalize();
    const logicalCamera = camera.clone();
    logicalCamera.position.copy(logicalCameraPosition);
    logicalCamera.updateMatrixWorld(true);

    expect(Math.min(...legacyRoofDepths)).toBeLessThan(standardNear);
    expect(Math.max(...legacyRoofDepths)).toBeGreaterThan(standardNear);
    expect(camera.near).toBe(standardNear);
    expect(camera.near).toBeGreaterThan(0);
    expect(Math.min(...renderRoofDepths)).toBeGreaterThan(camera.near);
    expect(Math.max(...renderRoofDepths)).toBeLessThan(camera.far);
    expect(Math.min(...renderSceneDepths)).toBeGreaterThan(camera.near);
    expect(Math.max(...renderSceneDepths)).toBeLessThan(camera.far);
    expect(renderOffset.clone().cross(cameraForward).length()).toBeLessThan(1e-8);
    expect(renderOffset.dot(cameraForward)).toBeGreaterThan(0);
    expect(camera.position.distanceTo(logicalCameraPosition)).toBeCloseTo(
      orthographicSceneDepthBackoff(course),
      8,
    );
    expect(logicalForward.angleTo(cameraForward)).toBeLessThan(1e-7);
    for (const corner of roofCorners) {
      const logicalProjection = corner.clone().project(logicalCamera);
      const renderProjection = corner.clone().project(camera);
      expect(renderProjection.x).toBeCloseTo(logicalProjection.x, 8);
      expect(renderProjection.y).toBeCloseTo(logicalProjection.y, 8);
    }
    expect((camera.top + camera.bottom) * 0.5).toBeCloseTo(legacyVerticalOffset, 8);

    controller.setExplorerActive(false);
    controller.updateMenu(snapshot, 0.05);
    expect(camera.near).toBe(standardNear);
    controller.dispose();
  });
});
