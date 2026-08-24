import { describe, expect, it } from 'vitest';
import * as THREE from 'three';

import {
  createVehicleIdentity,
  validateSolidAssetBlueprint,
  type InkedSolidSceneRegistration,
  type InkedSolidSceneRegistrationOptions,
} from '../src/index.js';
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
import { DoodleAssetRegistry } from '../experiments/doodle-racing/src/game/doodle-asset-registry.js';
import {
  DriftEffects,
  type VehicleEffectSource,
} from '../experiments/doodle-racing/src/game/drift-effects.js';
import { ExploreDriveController } from '../experiments/doodle-racing/src/game/explore-drive.js';
import { GrandstandExplorer } from '../experiments/doodle-racing/src/game/grandstand-explorer.js';
import { MenuPreviewBackdrop } from '../experiments/doodle-racing/src/game/menu-preview-backdrop.js';
import {
  createVehicleCollisionProfile,
  resolveObstacleCollisions,
} from '../experiments/doodle-racing/src/game/obstacle-collision.js';
import {
  RaceCameraController,
  exploreDrivingViewSize,
  groundedOrthographicVerticalOffset,
} from '../experiments/doodle-racing/src/game/race-camera.js';
import {
  engineParametersFor,
  selectEngineLoopWindow,
} from '../experiments/doodle-racing/src/game/race-engine-audio.js';
import {
  DEFAULT_RACE_LAPS,
  RACE_LAP_OPTIONS,
  RaceSimulation,
  type DriveInput,
  type RacerSnapshot,
} from '../experiments/doodle-racing/src/game/race-model.js';
import { createRaceSceneryBlueprint } from '../experiments/doodle-racing/src/game/race-scenery-blueprint.js';
import {
  createRaceWorldLayout,
  grandstandStepSpan,
  grandstandStepTop,
  grandstandSurfaceAt,
  type SegmentObstacle,
} from '../experiments/doodle-racing/src/game/race-world.js';
import {
  DEFAULT_VEHICLE_SEEDS,
  VehicleField,
} from '../experiments/doodle-racing/src/game/vehicle-field.js';
import { SmokeBurst } from '../experiments/doodle-racing/src/game/smoke-burst.js';
import { SoundController } from '../experiments/doodle-racing/src/game/sound-controller.js';
import {
  groundCollidersFor,
  resolveGroundMotion,
  type GroundCollider,
} from '../experiments/doodle-racing/src/game/solid-ground-collision.js';

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

class FakeAudio {
  public preload = '';
  public volume = 0;
  public loop = false;
  public currentTime = 0;
  public loadCount = 0;
  public playCount = 0;
  public pauseCount = 0;

  public constructor(public readonly source: string) {}

  public load(): void {
    this.loadCount += 1;
  }

  public play(): Promise<void> {
    this.playCount += 1;
    return Promise.resolve();
  }

  public pause(): void {
    this.pauseCount += 1;
  }
}

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

  it('opens in the race menu and accepts the supported lap counts', () => {
    const layout = createCourseLayout();
    const simulation = new RaceSimulation(layout, createRaceWorldLayout(layout));

    expect(simulation.snapshot().phase).toBe('menu');
    expect(simulation.snapshot().totalLaps).toBe(DEFAULT_RACE_LAPS);
    for (const laps of RACE_LAP_OPTIONS) {
      simulation.start({ laps });
      expect(simulation.snapshot().phase).toBe('intro');
      expect(simulation.snapshot().totalLaps).toBe(laps);
    }
  });

  it('keeps race simulation deterministic and independent from rendering', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const first = new RaceSimulation(layout, world);
    const second = new RaceSimulation(layout, world);
    first.start({ laps: 3 });
    second.start({ laps: 3 });

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
    simulation.start({ laps: 3 });
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
    simulation.start({ laps: 3 });

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
    simulation.start({ laps: 3 });
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
    expect(camera.top).toBeGreaterThan(3.2);

    controller.update(Object.freeze({
      ...base,
      phase: 'finished' as const,
      introProgress: 1,
      finishCinematicProgress: 0.24,
    }), 0.05, 30);
    const finishClose = camera.position.clone();
    const closeQuaternion = camera.quaternion.clone();
    expect(camera.top).toBeGreaterThan(3.2);
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

  it('keeps the Explore camera orbit independent from the character heading', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const explorer = new GrandstandExplorer(world.grandstand, 91_204);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 220);
    const controller = new RaceCameraController(
      camera,
      layout,
      world,
      () => Object.freeze({ width: 1440, height: 900 }),
    );
    const snapshot = explorer.snapshot();

    for (let index = 0; index < 80; index += 1) {
      controller.updateExplorer(snapshot, 0.05);
    }
    const settled = camera.position.clone();
    const turned = Object.freeze({
      ...snapshot,
      heading: snapshot.heading + Math.PI * 0.5,
    });
    for (let index = 0; index < 80; index += 1) {
      controller.updateExplorer(turned, 0.05);
    }

    expect(camera.position.distanceTo(settled)).toBeLessThan(0.02);
    expect(camera.top).toBeGreaterThan(3.2);
    explorer.dispose();
    controller.dispose();
  });

  it('keeps the ground inside a very low Explore camera projection', () => {
    const pitch = 0.06;
    const distance = 12.4;
    const near = 0.01;
    const viewSize = distance * 1.26;
    const cameraY = 1.02 + Math.sin(pitch) * distance;
    const cameraUpY = Math.cos(pitch);
    const cameraForwardY = -Math.sin(pitch);
    const minimumWorldY = 0.04;
    const offset = groundedOrthographicVerticalOffset({
      cameraY,
      cameraUpY,
      cameraForwardY,
      near,
      viewSize,
      minimumWorldY,
    });
    const shiftedBottom = -viewSize * 0.5 + offset;
    const bottomNearWorldY = cameraY
      + cameraForwardY * near
      + cameraUpY * shiftedBottom;

    expect(offset).toBeGreaterThan(6);
    expect(bottomNearWorldY).toBeCloseTo(minimumWorldY, 8);
  });

  it('zooms the Explore camera farther out as driving speed increases', () => {
    const walking = exploreDrivingViewSize(7.4, null);
    const parked = exploreDrivingViewSize(7.4, 0);
    const cruising = exploreDrivingViewSize(7.4, 12);
    const flatOut = exploreDrivingViewSize(7.4, 24);

    expect(parked).toBeGreaterThan(walking);
    expect(cruising).toBeGreaterThan(parked);
    expect(flatOut).toBeGreaterThan(cruising);
    expect(exploreDrivingViewSize(7.4, 240)).toBe(flatOut);
  });

  it('steers opponents through the shared bounded vehicle dynamics', () => {
    const layout = createCourseLayout();
    const simulation = new RaceSimulation(layout, createRaceWorldLayout(layout));
    simulation.start({ laps: 3 });
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
      [
        ...world.barriers,
        ...world.tyreStacks,
        ...world.cones,
        { id: 'grandstand:post:left' },
        { id: 'grandstand:post:right' },
      ].map(({ id }) => id).sort(),
    );
    for (const obstacle of world.obstacles) {
      if (obstacle.kind === 'tree') continue;
      expect(scenery.parts.some(({ id }) => id === obstacle.id || id.startsWith(`${obstacle.id}:`)))
        .toBe(true);
    }
    for (const barrier of world.barriers) {
      const part = scenery.parts.find(({ id }) => id === barrier.id);
      const collider = scenery.colliders.find(({ id }) => id === barrier.id);
      expect(part?.geometry.type).toBe('box');
      expect(part?.geometry.type === 'box' ? part.geometry.size[1] : null)
        .toBeCloseTo(barrier.height, 8);
      expect(collider?.shape).toBe('box');
      expect(collider?.shape === 'box' ? collider.size[1] : null)
        .toBeCloseTo(barrier.height, 8);
    }
    expect(scenery.colliders.filter(({ id }) => id.startsWith('cone:'))).toHaveLength(5);
    expect(scenery.colliders.filter(({ id }) => id.startsWith('grandstand:post:')))
      .toHaveLength(2);
  });

  it('authors grandstand rows without coplanar overlapping end faces', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const scenery = createRaceSceneryBlueprint(layout, world);
    const steps = scenery.parts.filter(({ id }) => id.startsWith('grandstand:step:'));

    expect(steps).toHaveLength(world.grandstand.rows);
    for (let row = 0; row < steps.length; row += 1) {
      const step = steps[row];
      const span = grandstandStepSpan(row, world.grandstand.rows);
      if (step?.geometry.type !== 'box') throw new Error('Grandstand step must use box geometry');
      const position = step.placement.position;
      const deltaX = position[0] - world.grandstand.x;
      const deltaZ = position[2] - world.grandstand.z;
      const centreAway = deltaX * Math.sin(world.grandstand.heading)
        + deltaZ * Math.cos(world.grandstand.heading);
      expect(step.geometry.size[2]).toBeCloseTo(span.depth, 8);
      expect(centreAway).toBeCloseTo(span.centreAway, 8);
      if (row === 0) continue;
      const previous = grandstandStepSpan(row - 1, world.grandstand.rows);
      expect(previous.maximumAway).toBeCloseTo(span.minimumAway, 8);
    }
  });

  it('keeps every seeded crowd animation valid across repeated cue changes', () => {
    const layout = createCourseLayout();
    const crowd = new CrowdField(createRaceWorldLayout(layout));
    expect(crowd.doodleAssets()).toHaveLength(20);
    expect(() => {
      for (const time of [0, 0.8, 1.9, 3.4, 6.2, 12.8]) crowd.update(time);
      crowd.setCelebrating(true, 13.4);
      crowd.update(13.55);
      crowd.setCelebrating(false, 15.2);
      crowd.update(15.35);
    }).not.toThrow();
    for (const { rig } of crowd.doodleAssets()) {
      rig.root.updateWorldMatrix(true, true);
      rig.root.traverse((object) => {
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
    crowd.dispose();
  });

  it('opens the menu character preview with the shared dance pose', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const explorer = new GrandstandExplorer(world.grandstand, layout, 18_402);
    explorer.setPreviewMode(true);

    expect(explorer.updatePreview(0.05).pose).toBe('dance');
    explorer.dispose();
  });

  it('keeps sound cues lazy and loops the drift effect only while drifting', () => {
    const clips: FakeAudio[] = [];
    const sound = new SoundController((source) => {
      const clip = new FakeAudio(source);
      clips.push(clip);
      return clip as unknown as HTMLAudioElement;
    });

    expect(clips).toHaveLength(7);
    expect(clips.find((clip) => clip.source.startsWith('data:audio/wav;base64,')))
      .toBeDefined();
    sound.unlock();
    expect(clips.filter((clip) => clip.loadCount > 0)).toHaveLength(4);
    sound.play('menu-click');
    expect(clips.find((clip) => clip.source.includes('menu-click'))?.playCount).toBe(1);

    sound.syncDrift(true);
    const drift = clips.find((clip) => clip.source.includes('drift-skid'));
    expect(drift?.loop).toBe(true);
    expect(drift?.playCount).toBe(1);
    sound.syncDrift(false);
    expect(drift?.loop).toBe(false);
    expect(drift?.pauseCount).toBeGreaterThan(0);

    sound.syncOffRoad(true);
    const offRoad = clips.find((clip) => clip.source.includes('offroad-loop'));
    expect(offRoad?.loop).toBe(true);
    expect(offRoad?.playCount).toBe(1);
    sound.syncOffRoad(false);
    expect(offRoad?.loop).toBe(false);

    sound.syncCurbImpact(0.82);
    const curb = clips.find((clip) => clip.source.startsWith('data:audio/wav;base64,'));
    expect(curb?.playCount).toBe(1);
    sound.syncCurbImpact(0.64);
    expect(curb?.playCount).toBe(1);
    sound.syncCurbImpact(0);
    sound.syncCurbImpact(0.5);
    expect(curb?.playCount).toBe(2);

    sound.setEnabled(false);
    sound.play('race-go');
    expect(clips.find((clip) => clip.source.includes('race-go'))?.playCount).toBe(0);
    sound.dispose();
  });

  it('leaves bounded skid decals and emits smoke, dust, and impact sparks', () => {
    const layout = createCourseLayout();
    const effects = new DriftEffects(layout);
    const sourceAt = (
      progress: number,
      options: Readonly<{
        drifting?: boolean;
        offRoad?: boolean;
        impact?: number;
      }> = {},
    ): VehicleEffectSource => {
      const sample = sampleCourseAt(layout, progress);
      const surfaceOffset = options.offRoad === true ? layout.trackWidth * 0.5 + 2 : 0;
      const x = sample.x + sample.normalX * surfaceOffset;
      const z = sample.z + sample.normalZ * surfaceOffset;
      const rearX = x - sample.tangentX * 0.72;
      const rearZ = z - sample.tangentZ * 0.72;
      return Object.freeze({
        id: 'you',
        x,
        z,
        speed: 18,
        drifting: options.drifting ?? false,
        slipAngle: options.drifting === true ? 0.32 : 0,
        impact: options.impact ?? 0,
        rearLeft: Object.freeze({
          x: rearX + sample.normalX * 0.42,
          z: rearZ + sample.normalZ * 0.42,
        }),
        rearRight: Object.freeze({
          x: rearX - sample.normalX * 0.42,
          z: rearZ - sample.normalZ * 0.42,
        }),
      });
    };

    effects.update([sourceAt(0.2, { drifting: true })], 0.05, true);
    effects.update([sourceAt(0.201, { drifting: true })], 0.05, true);
    expect(effects.diagnostics().skidSegments).toBe(2);
    expect(effects.diagnostics().smokePuffs).toBeGreaterThan(0);

    effects.update([sourceAt(0.24, { offRoad: true })], 0.05, true);
    expect(effects.diagnostics().dustPuffs).toBeGreaterThan(0);

    effects.update([sourceAt(0.3, { impact: 0.8 })], 0.05, true);
    expect(effects.diagnostics().sparks).toBe(7);
    expect(effects.diagnostics().skidSegments).toBeLessThanOrEqual(
      effects.diagnostics().skidCapacity,
    );

    effects.reset();
    expect(effects.diagnostics()).toEqual({
      skidSegments: 0,
      skidCapacity: 512,
      smokePuffs: 0,
      dustPuffs: 0,
      sparks: 0,
    });
    effects.dispose();
  });

  it('extracts a steady engine loop after the starter transient', () => {
    const sampleRate = 1_000;
    const channel = new Float32Array(2_400);
    for (let index = 0; index < channel.length; index += 1) {
      const amplitude = index < 280 ? 0.9 : index < 1_500 ? 0.42 : 0.04;
      channel[index] = Math.sin(index * 0.18) * amplitude;
    }

    const window = selectEngineLoopWindow([channel], sampleRate);
    expect(window.lengthSamples).toBe(720);
    expect(window.startSample).toBeGreaterThanOrEqual(240);
    expect(window.startSample).toBeLessThan(800);
  });

  it('raises engine pitch and brightness under throttle and drops them under braking', () => {
    const racer: RacerSnapshot = Object.freeze({
      id: 'you',
      name: 'You',
      isPlayer: true,
      x: 0,
      z: 0,
      heading: 0,
      speed: 14,
      steering: 0,
      travelDistance: 0,
      lap: 0,
      progress: 0,
      raceScore: 0,
      slipAngle: 0,
      drifting: false,
      impact: 0,
      curbImpact: 0,
      curbPenalty: 0,
      elevation: 0,
      pitch: 0,
    });
    const throttle = engineParametersFor(racer, { ...IDLE, accelerate: true }, 0, 0);
    const braking = engineParametersFor(racer, { ...IDLE, brake: true }, 0, 0);

    expect(throttle.playbackRate).toBeGreaterThan(braking.playbackRate);
    expect(throttle.gain).toBeGreaterThan(braking.gain);
    expect(throttle.filterFrequency).toBeGreaterThan(braking.filterFrequency);
  });

  it('keeps grandstand exploration deterministic across walking, steps, and emotes', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const first = new GrandstandExplorer(world.grandstand, 12_345);
    const second = new GrandstandExplorer(world.grandstand, 12_345);
    const turnRight: DriveInput = Object.freeze({
      accelerate: false,
      brake: false,
      left: false,
      right: true,
      handbrake: false,
    });

    for (let index = 0; index < 4; index += 1) {
      first.update(0.05, turnRight);
      second.update(0.05, turnRight);
    }
    for (let index = 0; index < 20; index += 1) {
      first.update(0.05, ACCELERATE_STRAIGHT);
      second.update(0.05, ACCELERATE_STRAIGHT);
    }
    const walked = first.snapshot();
    expect(walked).toEqual(second.snapshot());
    expect(walked.pose).toBe('walk');
    expect(walked.row).toBeGreaterThan(0);
    expect(walked.y).toBeGreaterThan(0.55);

    const emote = first.update(0.05, DRIFT_LEFT);
    expect(emote.pose).toBe('play');
    expect(emote.expression).toBe('happy');
    expect([emote.x, emote.y, emote.z].every(Number.isFinite)).toBe(true);
    first.rig.root.updateWorldMatrix(true, true);
    first.rig.root.traverse((object) => {
      expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    });
    first.dispose();
    second.dispose();
  });

  it('moves Explore forward along the character front and turns left intuitively', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const explorer = new GrandstandExplorer(world.grandstand, 7_321);
    const initial = explorer.snapshot();
    const moved = explorer.update(0.05, ACCELERATE_STRAIGHT);

    expect(moved.away).toBeGreaterThan(initial.away);
    expect(moved.along).toBeCloseTo(initial.along, 6);

    explorer.reset();
    const resetHeading = explorer.snapshot().heading;
    const turnedLeft = explorer.update(0.05, Object.freeze({
      ...IDLE,
      left: true,
    }));
    expect(turnedLeft.heading).toBeGreaterThan(resetHeading);
    explorer.dispose();
  });

  it('grounds grandstand people on the authored step surfaces', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    for (const spectator of world.grandstand.spectators) {
      expect(spectator.y).toBeCloseTo(grandstandStepTop(spectator.row), 6);
    }

    const explorer = new GrandstandExplorer(world.grandstand, 8_412);
    for (let index = 0; index < 80; index += 1) {
      const snapshot = explorer.update(0.05, ACCELERATE_STRAIGHT);
      const surface = grandstandSurfaceAt(world.grandstand, snapshot.away);
      expect(snapshot.y).toBeGreaterThanOrEqual(surface.height - 1e-6);
    }
    let settled = explorer.snapshot();
    for (let index = 0; index < 80; index += 1) {
      settled = explorer.update(0.05, IDLE);
    }
    expect(settled.y).toBeCloseTo(
      grandstandSurfaceAt(world.grandstand, settled.away).height,
      6,
    );
    explorer.dispose();
  });

  it('supports Explore running and jumping while opening the whole course bounds', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const explorer = new GrandstandExplorer(world.grandstand, layout, 22_704);
    const runningInput = Object.freeze({ ...IDLE, accelerate: true, run: true });
    const running = explorer.update(0.05, runningInput);
    expect(running.pose).toBe('run');
    expect(running.speed).toBeGreaterThan(0.9);

    explorer.reset();
    const beforeJump = explorer.snapshot();
    const jumped = explorer.update(0.05, Object.freeze({ ...IDLE, jump: true }));
    expect(jumped.y).toBeGreaterThan(beforeJump.y);
    expect(jumped.pose).toBe('airborne');

    explorer.reset();
    let walkedAcrossMap = explorer.snapshot();
    for (let index = 0; index < 240; index += 1) {
      walkedAcrossMap = explorer.update(0.05, runningInput);
    }
    expect(walkedAcrossMap.away).toBeGreaterThan(4);
    expect(walkedAcrossMap.x).toBeGreaterThanOrEqual(layout.bounds.minimumX);
    expect(walkedAcrossMap.x).toBeLessThanOrEqual(layout.bounds.maximumX);
    expect(walkedAcrossMap.z).toBeGreaterThanOrEqual(layout.bounds.minimumZ);
    expect(walkedAcrossMap.z).toBeLessThanOrEqual(layout.bounds.maximumZ);
    explorer.dispose();
  });

  it('sweeps Explore movement against authored solid footprints', () => {
    const collider: GroundCollider = Object.freeze({
      id: 'test:tree',
      instanceId: 'test:tree:1',
      shape: 'circle',
      x: 0,
      z: 1,
      radius: 0.5,
      minimumY: 0,
      maximumY: 2,
    });
    const blocked = resolveGroundMotion(
      Object.freeze({ x: 0, z: 0 }),
      Object.freeze({ x: 0, z: 2 }),
      0.3,
      0,
      1.2,
      [collider],
    );
    const airborne = resolveGroundMotion(
      Object.freeze({ x: 0, z: 0 }),
      Object.freeze({ x: 0, z: 2 }),
      0.3,
      2.1,
      1.2,
      [collider],
    );

    expect(blocked.z).toBeLessThan(0.25);
    expect(airborne.z).toBeCloseTo(2, 8);
  });

  it('uses authored vehicle door sensors to enter, drive, and exit in Explore', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const drive = new ExploreDriveController(layout, world);
    const field = new VehicleField();
    field.update(drive.frame().racers, 0);
    const entryPosition = field.entryPosition('you', 'left');
    if (entryPosition === null) throw new Error('Vehicle entry socket was not resolved');
    const entry = field.nearestEntry(entryPosition.x, entryPosition.z);
    expect(entry).toMatchObject({ vehicleId: 'you', side: 'left' });
    expect(field.nearestInteraction(entryPosition.x, entryPosition.z)).toMatchObject({
      kind: 'door',
      vehicleId: 'you',
      side: 'left',
    });
    expect(groundCollidersFor(field.collisionRigs()).some(({ id }) => id === 'vehicle:body'))
      .toBe(true);

    const entered = drive.update(0.05, Object.freeze({ ...IDLE, interact: true }), entry);
    expect(entered.activeVehicleId).toBe('you');
    expect(entered.activeSide).toBe('left');
    expect(entered.entered).toMatchObject({ vehicleId: 'you' });
    const held = drive.update(0.05, Object.freeze({ ...IDLE, interact: true }), null);
    expect(held.activeVehicleId).toBe('you');
    drive.update(0.05, Object.freeze({ ...IDLE, interact: false }), null);
    const exited = drive.update(0.05, Object.freeze({ ...IDLE, interact: true }), null);
    expect(exited.activeVehicleId).toBeNull();
    expect(exited.exited).toMatchObject({ vehicleId: 'you', side: 'left' });
    field.dispose();
  });

  it('rerolls a vehicle deterministically while preserving its world pose', () => {
    const seed = 73_421;
    const field = new VehicleField(Object.freeze({ ...DEFAULT_VEHICLE_SEEDS, you: seed }));
    const layout = createCourseLayout();
    const drive = new ExploreDriveController(layout, createRaceWorldLayout(layout));
    expect(field.selection('you').archetype).toBe(createVehicleIdentity(seed).archetype);
    field.update(drive.frame().racers, 0.4);
    const previous = field.doodleAssets().find(({ rig }) => rig.instanceId.endsWith(':you'));
    if (previous === undefined) throw new Error('Player vehicle was not registered');
    const previousTransform = previous.rig.getInstanceState().transform;

    const nextSeed = seed + 1;
    const replacement = field.replaceVehicle('you', nextSeed);
    const next = field.doodleAssets().find(({ rig }) => rig.instanceId.endsWith(':you'));
    if (next === undefined) throw new Error('Replacement vehicle was not registered');
    const expected = createVehicleIdentity(nextSeed);

    expect(next.rig).not.toBe(previous.rig);
    expect(next.rig.getInstanceState().transform).toEqual(previousTransform);
    expect(replacement.previousRig).toBe(previous.rig);
    expect(replacement.selection).toMatchObject({
      vehicleId: 'you',
      name: 'You',
      archetype: expected.archetype,
      doors: expected.doors.count,
      wheelStyle: expected.wheels.style,
    });
    replacement.previousRig.dispose();
    field.dispose();
  });

  it('resolves the authored hood service socket and focused interaction preview', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const drive = new ExploreDriveController(layout, world);
    const field = new VehicleField();
    field.update(drive.frame().racers, 0);
    const player = field.doodleAssets().find(({ rig }) => rig.instanceId.endsWith(':you'));
    const hoodService = player?.rig.getSocketWorldPose('hood:service');
    if (player === undefined || hoodService === null || hoodService === undefined) {
      throw new Error('Authored player hood service socket was not registered');
    }
    const interaction = field.nearestInteraction(
      hoodService.position[0],
      hoodService.position[2],
    );

    expect(interaction).toMatchObject({ kind: 'hood', vehicleId: 'you' });
    expect(interaction?.preview.interactionId).toBe('hood');
    expect(interaction?.preview.partIds).toEqual(['hood']);
    const leftDoor = field.interactionPreview('you', 'door:left');
    expect(leftDoor.partIds.length).toBeGreaterThan(1);
    expect(leftDoor.partIds.every((partId) => (
      player.solid.parts.find(({ id }) => id === partId)?.node === 'door:left'
    ))).toBe(true);
    const configurator = field.configuratorPreview('you');
    expect(configurator.key).not.toBe(interaction?.preview.key);
    expect(configurator.interactionId).toBe('hood');
    expect(configurator.partIds).toEqual(player.solid.parts.map(({ id }) => id));
    field.dispose();
  });

  it('keeps the character reroll smoke burst local and short-lived', () => {
    const burst = new SmokeBurst();
    burst.trigger(Object.freeze({ x: 4, y: 0.6, z: -3 }), 91_733);
    expect(burst.rig.root.visible).toBe(true);
    expect(burst.rig.getPart('puff:0')).not.toBeNull();
    burst.update(0.2);
    expect(burst.rig.root.visible).toBe(true);
    const puff = burst.rig.getPart('puff:0');
    expect(puff).not.toBeNull();
    const earlyY = puff?.position.y ?? 0;
    for (let index = 0; index < 20; index += 1) burst.update(0.05);
    const peakScale = puff?.scale.x ?? 0;
    for (let index = 0; index < 12; index += 1) burst.update(0.05);
    expect(puff?.position.y ?? 0).toBeGreaterThan(earlyY);
    expect(puff?.scale.x ?? 0).toBeLessThan(peakScale);
    for (let index = 0; index < 20; index += 1) burst.update(0.05);
    expect(burst.rig.root.visible).toBe(false);
    burst.dispose();
  });

  it('replaces only the rerolled Doodle asset while preserving shared registrations', () => {
    const layout = createCourseLayout();
    const world = createRaceWorldLayout(layout);
    const firstExplorer = new GrandstandExplorer(world.grandstand, layout, 91_733);
    const nextExplorer = new GrandstandExplorer(world.grandstand, layout, 91_734);
    const smoke = new SmokeBurst();
    const registered: string[] = [];
    const disposed: string[] = [];
    const pass = Object.freeze({
      register(options: InkedSolidSceneRegistrationOptions): InkedSolidSceneRegistration {
        registered.push(options.instanceId);
        return Object.freeze({
          instanceId: options.instanceId,
          dispose: () => { disposed.push(options.instanceId); },
        });
      },
    });
    const registry = new DoodleAssetRegistry();

    expect(registry.sync(pass, [firstExplorer.doodleAsset(), smoke.doodleAsset()], 'oil'))
      .toEqual({ added: 2, kept: 0, removed: 0 });
    expect(registry.sync(pass, [nextExplorer.doodleAsset(), smoke.doodleAsset()], 'oil'))
      .toEqual({ added: 1, kept: 1, removed: 1 });
    expect(registered).toEqual([
      'paper-circuit:explorer',
      'paper-circuit:explore-smoke',
      'paper-circuit:explorer',
    ]);
    expect(disposed).toEqual(['paper-circuit:explorer']);

    registry.dispose();
    expect(disposed).toEqual([
      'paper-circuit:explorer',
      'paper-circuit:explore-smoke',
      'paper-circuit:explorer',
    ]);
    firstExplorer.dispose();
    nextExplorer.dispose();
    smoke.dispose();
  });

  it('uses a valid dedicated solid backdrop for the menu preview viewport', () => {
    const backdrop = new MenuPreviewBackdrop();
    expect(validateSolidAssetBlueprint(backdrop.solid)).toBe(backdrop.solid);
    expect(backdrop.solid.parts.map(({ id }) => id)).toEqual([
      'field',
      'spotlight',
      'stripe',
    ]);
    backdrop.dispose();
  });

  it('sweeps the authored vehicle footprint so a tall barrier cannot enter the chassis', () => {
    const identity = createVehicleIdentity(4_115, {
      archetype: 'coupe',
      roofRack: false,
      spoiler: false,
    });
    const profile = createVehicleCollisionProfile(identity);
    const barrier: SegmentObstacle = Object.freeze({
      id: 'test:barrier:tall',
      kind: 'barrier',
      startX: 0,
      startZ: -5,
      endX: 0,
      endZ: 5,
      radius: 0.28,
      height: profile.wheelRadius * 1.25,
    });
    const before = Object.freeze({
      ...createArcadeVehicleState(-5, 0, 0),
      velocityX: 24,
    });
    const proposed = Object.freeze({
      ...before,
      x: 2,
    });

    const collision = resolveObstacleCollisions(before, proposed, [barrier], profile);

    expect(collision.obstacleId).toBe(barrier.id);
    expect(collision.severity).toBeCloseTo(24, 6);
    expect(collision.state.x + profile.halfLength).toBeLessThan(-barrier.radius);
    expect(collision.state.elevation).toBe(0);
  });

  it('climbs a low barrier only with enough normal impact speed', () => {
    const identity = createVehicleIdentity(4_115, {
      archetype: 'coupe',
      roofRack: false,
      spoiler: false,
    });
    const profile = createVehicleCollisionProfile(identity);
    const curb: SegmentObstacle = Object.freeze({
      id: 'test:barrier:curb',
      kind: 'barrier',
      startX: 0,
      startZ: -5,
      endX: 0,
      endZ: 5,
      radius: 0.12,
      height: profile.wheelRadius * 0.55,
    });
    const fastBefore = Object.freeze({
      ...createArcadeVehicleState(-4, 0, 0),
      velocityX: 12,
    });
    const fastProposed = Object.freeze({ ...fastBefore, x: 0.4 });
    const slowBefore = Object.freeze({
      ...createArcadeVehicleState(-4, 0, 0),
      velocityX: 0.5,
    });
    const slowProposed = Object.freeze({ ...slowBefore, x: 0.4 });

    const climbed = resolveObstacleCollisions(fastBefore, fastProposed, [curb], profile);
    const blocked = resolveObstacleCollisions(slowBefore, slowProposed, [curb], profile);
    const supportedAgain = resolveObstacleCollisions(
      climbed.state,
      Object.freeze({ ...climbed.state, x: climbed.state.x + 0.08 }),
      [curb],
      profile,
    );
    const penalizedStep = stepArcadeVehicle(
      climbed.state,
      ACCELERATE_STRAIGHT,
      'road',
      0.05,
    );
    const cleanStep = stepArcadeVehicle(
      Object.freeze({ ...climbed.state, curbPenalty: 0 }),
      ACCELERATE_STRAIGHT,
      'road',
      0.05,
    );

    expect(climbed.obstacleId).toBe(curb.id);
    expect(climbed.severity).toBeCloseTo(12, 6);
    expect(climbed.state.x).toBeLessThan(fastProposed.x - 1);
    expect(climbed.state.x).toBeGreaterThan(fastBefore.x);
    expect(climbed.state.elevation).toBeGreaterThan(0);
    expect(Math.abs(climbed.state.pitch)).toBeGreaterThan(0);
    expect(vehicleSpeed(climbed.state)).toBeLessThan(5);
    expect(climbed.state.curbImpact).toBeGreaterThanOrEqual(0.42);
    expect(climbed.state.curbPenalty).toBe(1);
    expect(climbed.state.impact).toBe(climbed.state.curbImpact);
    expect(supportedAgain.obstacleId).toBeNull();
    expect(supportedAgain.state.curbImpact).toBe(climbed.state.curbImpact);
    expect(vehicleSpeed(penalizedStep)).toBeLessThan(vehicleSpeed(cleanStep));
    expect(blocked.obstacleId).toBe(curb.id);
    expect(blocked.state.x + profile.halfLength).toBeLessThan(-curb.radius);

    const effects = new DriftEffects(createCourseLayout());
    effects.update([Object.freeze({
      id: 'you',
      x: climbed.state.x,
      z: climbed.state.z,
      speed: vehicleSpeed(climbed.state),
      drifting: false,
      slipAngle: climbed.state.slipAngle,
      impact: climbed.state.impact,
      rearLeft: Object.freeze({ x: climbed.state.x - 0.5, z: climbed.state.z - 0.4 }),
      rearRight: Object.freeze({ x: climbed.state.x - 0.5, z: climbed.state.z + 0.4 }),
    })], 0.05, true);
    expect(effects.diagnostics().sparks).toBe(7);
    effects.dispose();
  });

  it('renders obstacle support as vehicle elevation and terrain pitch', () => {
    const field = new VehicleField();
    const racer: RacerSnapshot = Object.freeze({
      id: 'you',
      name: 'You',
      isPlayer: true,
      x: 3,
      z: -2,
      heading: 0,
      speed: 8,
      steering: 0,
      travelDistance: 4,
      lap: 0,
      progress: 0.2,
      raceScore: 0.2,
      slipAngle: 0,
      drifting: false,
      impact: 0,
      curbImpact: 0,
      curbPenalty: 0,
      elevation: 0.26,
      pitch: 0.11,
    });

    field.update([racer], 0.5);
    const vehicle = field.doodleAssets().find(({ rig }) => rig.instanceId.endsWith(':you'));
    if (vehicle === undefined) throw new Error('Player vehicle was not registered');
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicle.rig.root.quaternion);

    expect(vehicle.rig.root.position.y).toBeCloseTo(0.41, 6);
    expect(forward.y).toBeGreaterThan(0.1);
    field.dispose();
  });

  it('keeps a drifting vehicle upright while changing heading', () => {
    const field = new VehicleField();
    const racer: RacerSnapshot = Object.freeze({
      id: 'you',
      name: 'You',
      isPlayer: true,
      x: 12,
      z: -8,
      heading: Math.PI * 0.5,
      speed: 22,
      steering: 1,
      travelDistance: 18,
      lap: 0,
      progress: 0.4,
      raceScore: 0.4,
      slipAngle: 0.75,
      drifting: true,
      impact: 0,
      curbImpact: 0,
      curbPenalty: 0,
      elevation: 0,
      pitch: 0,
    });

    const effectSources = field.update([racer], 1.2);
    const vehicle = field.doodleAssets().find(({ rig }) => rig.instanceId.endsWith(':you'));
    if (vehicle === undefined) throw new Error('Player vehicle was not registered');

    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(vehicle.rig.root.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(vehicle.rig.root.quaternion);
    const chassis = vehicle.rig.getNode('chassis');
    if (chassis === null) throw new Error('Vehicle chassis was not registered');
    expect(forward.y).toBeCloseTo(0, 6);
    expect(forward.z).toBeCloseTo(-1, 6);
    expect(up.y).toBeGreaterThan(0.98);
    expect(chassis.rotation.x).toBeCloseTo(0.135, 6);
    expect(chassis.rotation.z).toBeCloseTo(0, 6);
    expect(vehicle.rig.root.position.y).toBeCloseTo(0.15, 6);
    const effectSource = effectSources[0];
    if (effectSource === undefined) throw new Error('Vehicle effect source was not produced');
    expect(Math.hypot(
      effectSource.rearLeft.x - effectSource.rearRight.x,
      effectSource.rearLeft.z - effectSource.rearRight.z,
    )).toBeGreaterThan(0.5);
    field.dispose();
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
