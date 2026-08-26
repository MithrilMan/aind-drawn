import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import {
  ExploreEntranceDirector,
  sampleExploreEntrance,
  type ExploreEntrancePhase,
} from '../experiments/doodle-racing/src/game/explore-entrance.js';
import { GrandstandExplorer } from '../experiments/doodle-racing/src/game/grandstand-explorer.js';
import { RaceCameraController } from '../experiments/doodle-racing/src/game/race-camera.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';
import { SmokeBurst } from '../experiments/doodle-racing/src/game/smoke-burst.js';

describe('Explore entrance', () => {
  it('authors a reusable smoke spawn and approach path in the world layout', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const spawn = world.explorerSpawn;
    const destination = spawn.approach[spawn.approach.length - 1];
    if (destination === undefined) throw new Error('Expected an Explore destination');
    const toLocal = (x: number, z: number) => {
      const deltaX = x - world.grandstand.x;
      const deltaZ = z - world.grandstand.z;
      return Object.freeze({
        along: deltaX * Math.cos(world.grandstand.heading)
          + deltaZ * -Math.sin(world.grandstand.heading),
        away: deltaX * Math.sin(world.grandstand.heading)
          + deltaZ * Math.cos(world.grandstand.heading),
      });
    };
    const startLocal = toLocal(spawn.x, spawn.z);
    const destinationLocal = toLocal(destination.x, destination.z);

    expect(spawn).toMatchObject({
      id: 'explorer-spawn:grandstand',
      entrance: 'smoke',
    });
    expect(Object.isFrozen(spawn)).toBe(true);
    expect(Object.isFrozen(spawn.approach)).toBe(true);
    expect(spawn.approach).toHaveLength(2);
    expect(spawn.x).toBeGreaterThanOrEqual(course.bounds.minimumX + 1.6);
    expect(spawn.x).toBeLessThanOrEqual(course.bounds.maximumX - 1.6);
    expect(spawn.z).toBeGreaterThanOrEqual(course.bounds.minimumZ + 1.6);
    expect(spawn.z).toBeLessThanOrEqual(course.bounds.maximumZ - 1.6);
    expect(startLocal.away).toBeLessThan(destinationLocal.away - 1.4);
    expect(Math.hypot(
      spawn.x - world.grandstand.x,
      spawn.z - world.grandstand.z,
    )).toBeGreaterThan(Math.hypot(
      destination.x - world.grandstand.x,
      destination.z - world.grandstand.z,
    ));
  });

  it('directs smoke, a three-beat cough, discovery, two hops, a run, and a control handoff', () => {
    const spawn = createRaceWorldLayout(createCourseLayout()).explorerSpawn;
    const opening = sampleExploreEntrance(spawn, 0);
    const director = new ExploreEntranceDirector(spawn);
    const phases: ExploreEntrancePhase[] = [];
    let previousPhase: ExploreEntrancePhase | null = null;
    let observedHiddenActor = !opening.actorVisible;
    let observedVisibleActor = false;
    let observedCough = false;
    let minimumDiscoveryHeading = Number.POSITIVE_INFINITY;
    let maximumDiscoveryHeading = Number.NEGATIVE_INFINITY;
    let maximumHopHeight = spawn.y;
    let previousApproachProgress = 0;
    let finalFrame = opening;

    for (let index = 0; index < 240; index += 1) {
      const frame = director.update(0.05);
      finalFrame = frame;
      if (frame.phase !== previousPhase) {
        phases.push(frame.phase);
        previousPhase = frame.phase;
      }
      observedHiddenActor ||= !frame.actorVisible;
      observedVisibleActor ||= frame.actorVisible;
      if (frame.phase === 'coughing') {
        observedCough = true;
        expect(frame.pose).toBe('cough');
        expect(['scared', 'surprised']).toContain(frame.expression);
      }
      if (frame.phase === 'discovering') {
        minimumDiscoveryHeading = Math.min(minimumDiscoveryHeading, frame.heading);
        maximumDiscoveryHeading = Math.max(maximumDiscoveryHeading, frame.heading);
        expect(['scared', 'surprised', 'happy']).toContain(frame.expression);
      }
      if (frame.phase === 'celebrating') {
        maximumHopHeight = Math.max(maximumHopHeight, frame.y);
        expect(['airborne', 'play']).toContain(frame.pose);
        expect(frame.expression).toBe('happy');
      }
      if (frame.phase === 'approaching') {
        expect(frame.approachProgress).toBeGreaterThanOrEqual(previousApproachProgress);
        previousApproachProgress = frame.approachProgress;
        expect(frame.pose).toBe('run');
      }
      if (frame.controlsEnabled) break;
    }

    const destination = spawn.approach[spawn.approach.length - 1];
    if (destination === undefined) throw new Error('Expected an Explore destination');
    expect(phases).toEqual([
      'materializing',
      'coughing',
      'discovering',
      'celebrating',
      'approaching',
      'complete',
    ]);
    expect(observedHiddenActor).toBe(true);
    expect(observedVisibleActor).toBe(true);
    expect(observedCough).toBe(true);
    expect(sampleExploreEntrance(spawn, 1.25)).toMatchObject({
      phase: 'materializing',
      pose: 'idle',
    });
    expect(sampleExploreEntrance(spawn, 1.35)).toMatchObject({
      phase: 'coughing',
      pose: 'cough',
      actorVisible: true,
    });
    expect(sampleExploreEntrance(spawn, 2.45).phase).toBe('coughing');
    expect(sampleExploreEntrance(spawn, 5.7).phase).toBe('discovering');
    expect(sampleExploreEntrance(spawn, 6.05).phase).toBe('celebrating');
    expect(minimumDiscoveryHeading).toBeLessThan(spawn.heading - 0.6);
    expect(maximumDiscoveryHeading).toBeGreaterThan(spawn.heading + 0.55);
    expect(maximumHopHeight).toBeGreaterThan(spawn.y + 0.34);
    expect(finalFrame).toMatchObject({
      phase: 'complete',
      controlsEnabled: true,
      pose: 'idle',
      expression: 'happy',
    });
    expect(finalFrame.x).toBeCloseTo(destination.x, 6);
    expect(finalFrame.y).toBeCloseTo(destination.y, 6);
    expect(finalFrame.z).toBeCloseTo(destination.z, 6);
  });

  it('starts coughing while the entrance smoke is still active', () => {
    const spawn = createRaceWorldLayout(createCourseLayout()).explorerSpawn;
    const smoke = new SmokeBurst();
    smoke.trigger(spawn, 41_819);
    for (let index = 0; index < 27; index += 1) smoke.update(0.05);

    expect(smoke.isActive).toBe(true);
    expect(sampleExploreEntrance(spawn, 1.35)).toMatchObject({
      phase: 'coughing',
      pose: 'cough',
      actorVisible: true,
    });
    smoke.dispose();
  });

  it('uses public character motion throughout the entrance and hands off the camera without a cut', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const explorer = new GrandstandExplorer(world.grandstand, course, 41_820);
    const director = new ExploreEntranceDirector(world.explorerSpawn);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 220);
    const controller = new RaceCameraController(
      camera,
      course,
      world,
      () => Object.freeze({ width: 1440, height: 900 }),
    );
    const openingFrame = director.snapshot();
    let snapshot = explorer.updateCinematic(0, openingFrame);
    expect(snapshot.x).toBeCloseTo(openingFrame.x, 6);
    expect(snapshot.y).toBeCloseTo(openingFrame.y, 6);
    expect(snapshot.z).toBeCloseTo(openingFrame.z, 6);
    let frame = openingFrame;
    for (let index = 0; index < 240 && !frame.controlsEnabled; index += 1) {
      frame = director.update(0.05);
      snapshot = explorer.updateCinematic(0.05, frame);
      controller.updateExplorerEntrance(snapshot, frame);
    }

    expect(frame.controlsEnabled).toBe(true);
    expect(snapshot.pose).toBe('idle');
    expect(snapshot.expression).toBe('happy');
    const handoffPosition = camera.position.clone();
    const handoffQuaternion = camera.quaternion.clone();
    const handoffTop = camera.top;
    controller.updateExplorer(snapshot, 0.05);

    expect(camera.position.distanceTo(handoffPosition)).toBeLessThan(1e-4);
    expect(camera.quaternion.angleTo(handoffQuaternion)).toBeLessThan(1e-4);
    expect(camera.top).toBeCloseTo(handoffTop, 6);
    explorer.rig.root.updateWorldMatrix(true, true);
    explorer.rig.root.traverse((object) => {
      expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    });
    controller.dispose();
    explorer.dispose();
  });

  it('keeps the close entrance camera stable while the character looks around', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const explorer = new GrandstandExplorer(world.grandstand, course, 41_821);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 220);
    const controller = new RaceCameraController(
      camera,
      course,
      world,
      () => Object.freeze({ width: 1440, height: 900 }),
    );
    const base = explorer.snapshot();
    const frame = Object.freeze({
      phase: 'discovering' as const,
      phaseProgress: 0.2,
      progress: 0.5,
      approachProgress: 0,
      actorVisible: true,
      controlsEnabled: false,
      x: base.x,
      y: base.y,
      z: base.z,
      heading: base.heading - 0.8,
      pose: 'idle' as const,
      expression: 'surprised' as const,
    });

    controller.updateExplorerEntrance({ ...base, heading: frame.heading }, frame);
    const firstPosition = camera.position.clone();
    const firstQuaternion = camera.quaternion.clone();
    controller.updateExplorerEntrance(
      { ...base, heading: base.heading + 0.9 },
      { ...frame, phaseProgress: 0.8, heading: base.heading + 0.9 },
    );

    expect(camera.position.distanceTo(firstPosition)).toBeLessThan(1e-8);
    expect(camera.quaternion.angleTo(firstQuaternion)).toBeLessThan(1e-8);
    controller.dispose();
    explorer.dispose();
  });
});
