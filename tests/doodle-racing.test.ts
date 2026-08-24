import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import { validateSolidAssetBlueprint } from '../src/index.js';
import { createCourseBlueprint } from '../experiments/doodle-racing/src/game/course-blueprint.js';
import {
  createArcadeVehicleState,
  stepArcadeVehicle,
  vehicleSpeed,
} from '../experiments/doodle-racing/src/game/arcade-vehicle-physics.js';
import {
  createCourseLayout,
  nearestCoursePoint,
  sampleCourseAt,
} from '../experiments/doodle-racing/src/game/course.js';
import { CrowdField } from '../experiments/doodle-racing/src/game/crowd-field.js';
import { RaceCameraController } from '../experiments/doodle-racing/src/game/race-camera.js';
import { RaceSimulation, type DriveInput } from '../experiments/doodle-racing/src/game/race-model.js';
import { createRaceSceneryBlueprint } from '../experiments/doodle-racing/src/game/race-scenery-blueprint.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';

const IDLE: DriveInput = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
});

const ACCELERATE_LEFT: DriveInput = Object.freeze({
  accelerate: true,
  brake: false,
  left: true,
  right: false,
  handbrake: false,
});

const ACCELERATE_STRAIGHT: DriveInput = Object.freeze({
  accelerate: true,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
});

const DRIFT_LEFT: DriveInput = Object.freeze({
  accelerate: true,
  brake: false,
  left: true,
  right: false,
  handbrake: true,
});

describe('Paper Circuit experiment', () => {
  it('authors a valid closed course through the public solid contract', () => {
    const layout = createCourseLayout();
    const blueprint = createCourseBlueprint(layout);

    expect(layout.samples).toHaveLength(256);
    expect(layout.totalLength).toBeGreaterThan(260);
    expect(layout.trackWidth).toBeGreaterThanOrEqual(9);
    expect(layout.minimumTurnRadius).toBeGreaterThan(layout.trackWidth * 0.5 + 0.6);
    expect(validateSolidAssetBlueprint(blueprint)).toBe(blueprint);
    expect(blueprint.parts.filter(({ semanticPartId }) => semanticPartId === 'finish')).toHaveLength(8);
    const road = blueprint.parts.find(({ id }) => id === 'road');
    expect(road?.geometry.type).toBe('mesh');
    if (road?.geometry.type !== 'mesh') throw new Error('Road must use mesh geometry');
    const [firstIndex, secondIndex, thirdIndex] = road.geometry.faces[0] ?? [];
    const firstVertex = road.geometry.vertices[firstIndex ?? -1];
    const secondVertex = road.geometry.vertices[secondIndex ?? -1];
    const thirdVertex = road.geometry.vertices[thirdIndex ?? -1];
    if (firstVertex === undefined || secondVertex === undefined || thirdVertex === undefined) {
      throw new Error('Road face must reference three valid vertices');
    }
    const edgeAx = secondVertex[0] - firstVertex[0];
    const edgeAz = secondVertex[2] - firstVertex[2];
    const edgeBx = thirdVertex[0] - firstVertex[0];
    const edgeBz = thirdVertex[2] - firstVertex[2];
    expect(edgeAz * edgeBx - edgeAx * edgeBz).toBeGreaterThan(0);

    const start = sampleCourseAt(layout, 0);
    const wrapped = sampleCourseAt(layout, 1);
    expect(wrapped.x).toBeCloseTo(start.x, 6);
    expect(wrapped.z).toBeCloseTo(start.z, 6);
    expect(nearestCoursePoint(layout, start.x, start.z).distanceFromCentre).toBeCloseTo(0, 6);
  });

  it('keeps race simulation deterministic and independent from rendering', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const first = new RaceSimulation(layout, world);
    const second = new RaceSimulation(layout, world);

    for (let index = 0; index < 70; index += 1) {
      first.update(0.05, IDLE);
      second.update(0.05, IDLE);
    }
    const start = first.snapshot().racers.find(({ isPlayer }) => isPlayer);
    let maximumTravel = 0;
    for (let index = 0; index < 120; index += 1) {
      const current = first.update(0.05, ACCELERATE_LEFT);
      second.update(0.05, ACCELERATE_LEFT);
      maximumTravel = Math.max(
        maximumTravel,
        current.racers.find(({ isPlayer }) => isPlayer)?.travelDistance ?? 0,
      );
    }
    const snapshot = first.snapshot();
    expect(snapshot).toEqual(second.snapshot());
    expect(snapshot.phase).toBe('running');
    expect(snapshot.racers).toHaveLength(4);
    expect(snapshot.playerPosition).toBeGreaterThanOrEqual(1);
    expect(snapshot.playerPosition).toBeLessThanOrEqual(4);
    expect(maximumTravel).toBeGreaterThan(start?.travelDistance ?? 0);
    expect(snapshot.racers.every(({ x, z, heading }) => (
      [x, z, heading].every(Number.isFinite)
    ))).toBe(true);
  });

  it('pauses without consuming countdown or race time', () => {
    const layout = createCourseLayout();
    const simulation = new RaceSimulation(layout, createRaceWorldLayout(layout));
    simulation.update(0.4, IDLE);
    const beforePause = simulation.snapshot();
    simulation.togglePause();
    const paused = simulation.update(0.05, ACCELERATE_LEFT);

    expect(paused.phase).toBe('paused');
    expect(paused.countdown).toBe(beforePause.countdown);
    expect(paused.elapsed).toBe(beforePause.elapsed);
    expect(simulation.togglePause()).toBe('intro');
  });

  it('runs a deterministic grandstand intro before the starting countdown', () => {
    const layout = createCourseLayout();
    const simulation = new RaceSimulation(layout, createRaceWorldLayout(layout));

    expect(simulation.snapshot().phase).toBe('intro');
    for (let index = 0; index < 80; index += 1) simulation.update(0.05, IDLE);
    const duringIntro = simulation.snapshot();
    expect(duringIntro.phase).toBe('intro');
    expect(duringIntro.introProgress).toBeGreaterThan(0.6);
    for (let index = 0; index < 45; index += 1) simulation.update(0.05, IDLE);
    expect(simulation.snapshot().phase).toBe('countdown');
  });

  it('gives intro and finish their own moving close-range crowd shots', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const simulation = new RaceSimulation(layout, world);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);
    const controller = new RaceCameraController(
      camera,
      layout,
      world,
      () => Object.freeze({ width: 1440, height: 900 }),
    );
    const base = simulation.snapshot();

    controller.update(Object.freeze({ ...base, introProgress: 0.12 }), 0.05, 0.72);
    const introStart = camera.position.clone();
    controller.update(Object.freeze({ ...base, introProgress: 0.58 }), 0.05, 3.48);
    const introMiddle = camera.position.clone();
    expect(introMiddle.distanceTo(introStart)).toBeGreaterThan(4);
    expect(camera.top).toBeLessThan(3);

    controller.update(Object.freeze({
      ...base,
      phase: 'finished' as const,
      introProgress: 1,
      finishCinematicProgress: 0.24,
    }), 0.05, 30);
    const finishClose = camera.position.clone();
    const closeQuaternion = camera.quaternion.clone();
    expect(camera.top).toBeLessThan(3);
    controller.update(Object.freeze({
      ...base,
      phase: 'finished' as const,
      introProgress: 1,
      finishCinematicProgress: 0.92,
    }), 0.05, 36);
    expect(camera.position.distanceTo(finishClose)).toBeGreaterThan(6);
    expect(camera.quaternion.angleTo(closeQuaternion)).toBeGreaterThan(0.04);
    expect(camera.top).toBeGreaterThan(5.5);
  });

  it('steers opponents through the shared bounded vehicle dynamics', () => {
    const layout = createCourseLayout();
    const simulation = new RaceSimulation(layout, createRaceWorldLayout(layout));
    let previous = simulation.snapshot();
    let maximumHeadingStep = 0;
    let maximumOpponentTravel = 0;
    for (let index = 0; index < 720; index += 1) {
      const current = simulation.update(0.05, IDLE);
      for (const racer of current.racers.filter(({ isPlayer }) => !isPlayer)) {
        const before = previous.racers.find(({ id }) => id === racer.id);
        if (before !== undefined) {
          const headingStep = Math.abs(
            Math.atan2(Math.sin(racer.heading - before.heading), Math.cos(racer.heading - before.heading)),
          );
          maximumHeadingStep = Math.max(maximumHeadingStep, headingStep);
        }
        maximumOpponentTravel = Math.max(maximumOpponentTravel, racer.travelDistance);
      }
      previous = current;
    }
    expect(maximumOpponentTravel).toBeGreaterThan(300);
    expect(maximumHeadingStep).toBeLessThan(0.12);
    expect(previous.racers.filter(({ isPlayer }) => !isPlayer).every((racer) => (
      nearestCoursePoint(layout, racer.x, racer.z).distanceFromCentre < layout.trackWidth
    ))).toBe(true);
  });

  it('derives every gameplay obstacle from visible scenery geometry', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const scenery = createRaceSceneryBlueprint(layout, world);

    expect(validateSolidAssetBlueprint(scenery)).toBe(scenery);
    expect(world.barriers.length).toBeGreaterThan(20);
    expect(world.trees).toHaveLength(16);
    expect(world.grandstand.spectators).toHaveLength(20);
    expect(scenery.colliders.map(({ id }) => id).sort()).toEqual(
      [...world.barriers, ...world.tyreStacks].map(({ id }) => id).sort(),
    );
    for (const obstacle of world.obstacles) {
      if (obstacle.kind === 'tree') continue;
      expect(scenery.parts.some(({ id }) => id === obstacle.id || id.startsWith(`${obstacle.id}:`)))
        .toBe(true);
    }
  });

  it('keeps every seeded crowd animation valid across repeated cue changes', () => {
    const layout = createCourseLayout();
    const crowd = new CrowdField(createRaceWorldLayout(layout));
    expect(crowd.doodleAssets()).toHaveLength(20);
    expect(() => {
      for (const time of [0, 0.8, 1.9, 3.4, 6.2, 12.8]) crowd.update(time);
    }).not.toThrow();
    for (const { rig } of crowd.doodleAssets()) {
      rig.root.updateWorldMatrix(true, true);
      rig.root.traverse((object) => {
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
    crowd.dispose();
  });

  it('builds speed quickly and sustains an exaggerated handbrake drift', () => {
    let vehicle = createArcadeVehicleState(0, 0, 0);
    for (let index = 0; index < 80; index += 1) {
      vehicle = stepArcadeVehicle(vehicle, ACCELERATE_STRAIGHT, 'road', 0.05);
    }
    expect(vehicleSpeed(vehicle)).toBeGreaterThan(16);

    let maximumNormalSlip = 0;
    for (let index = 0; index < 24; index += 1) {
      vehicle = stepArcadeVehicle(vehicle, ACCELERATE_LEFT, 'road', 0.05);
      maximumNormalSlip = Math.max(maximumNormalSlip, Math.abs(vehicle.slipAngle));
      expect(vehicle.drifting).toBe(false);
    }
    expect(maximumNormalSlip).toBeLessThan(0.1);

    let observedDrift = false;
    for (let index = 0; index < 35; index += 1) {
      vehicle = stepArcadeVehicle(vehicle, DRIFT_LEFT, 'road', 0.05);
      observedDrift ||= vehicle.drifting;
    }
    expect(observedDrift).toBe(true);
    expect(Math.abs(vehicle.slipAngle)).toBeGreaterThan(0.1);
  });
});
