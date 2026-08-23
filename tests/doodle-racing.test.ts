import { describe, expect, it } from 'vitest';

import { validateSolidAssetBlueprint } from '../src/index.js';
import { createCourseBlueprint } from '../experiments/doodle-racing/src/game/course-blueprint.js';
import {
  createCourseLayout,
  nearestCoursePoint,
  sampleCourseAt,
} from '../experiments/doodle-racing/src/game/course.js';
import { RaceSimulation, type DriveInput } from '../experiments/doodle-racing/src/game/race-model.js';

const IDLE: DriveInput = Object.freeze({
  accelerate: false,
  brake: false,
  left: false,
  right: false,
});

const ACCELERATE_LEFT: DriveInput = Object.freeze({
  accelerate: true,
  brake: false,
  left: true,
  right: false,
});

describe('Paper Circuit experiment', () => {
  it('authors a valid closed course through the public solid contract', () => {
    const layout = createCourseLayout();
    const blueprint = createCourseBlueprint(layout);

    expect(layout.samples).toHaveLength(192);
    expect(layout.totalLength).toBeGreaterThan(90);
    expect(validateSolidAssetBlueprint(blueprint)).toBe(blueprint);
    expect(blueprint.parts.filter(({ semanticPartId }) => semanticPartId === 'finish')).toHaveLength(8);

    const start = sampleCourseAt(layout, 0);
    const wrapped = sampleCourseAt(layout, 1);
    expect(wrapped.x).toBeCloseTo(start.x, 6);
    expect(wrapped.z).toBeCloseTo(start.z, 6);
    expect(nearestCoursePoint(layout, start.x, start.z).distanceFromCentre).toBeCloseTo(0, 6);
  });

  it('keeps race simulation deterministic and independent from rendering', () => {
    const layout = createCourseLayout();
    const first = new RaceSimulation(layout);
    const second = new RaceSimulation(layout);

    for (let index = 0; index < 70; index += 1) {
      first.update(0.05, IDLE);
      second.update(0.05, IDLE);
    }
    const start = first.snapshot().racers.find(({ isPlayer }) => isPlayer);
    for (let index = 0; index < 120; index += 1) {
      first.update(0.05, ACCELERATE_LEFT);
      second.update(0.05, ACCELERATE_LEFT);
    }
    const snapshot = first.snapshot();
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);

    expect(snapshot).toEqual(second.snapshot());
    expect(snapshot.phase).toBe('running');
    expect(snapshot.racers).toHaveLength(4);
    expect(snapshot.playerPosition).toBeGreaterThanOrEqual(1);
    expect(snapshot.playerPosition).toBeLessThanOrEqual(4);
    expect(player?.travelDistance).toBeGreaterThan(start?.travelDistance ?? 0);
    expect(snapshot.racers.every(({ x, z, heading }) => (
      [x, z, heading].every(Number.isFinite)
    ))).toBe(true);
  });

  it('pauses without consuming countdown or race time', () => {
    const simulation = new RaceSimulation(createCourseLayout());
    simulation.update(0.4, IDLE);
    const beforePause = simulation.snapshot();
    simulation.togglePause();
    const paused = simulation.update(0.05, ACCELERATE_LEFT);

    expect(paused.phase).toBe('paused');
    expect(paused.countdown).toBe(beforePause.countdown);
    expect(paused.elapsed).toBe(beforePause.elapsed);
    expect(simulation.togglePause()).toBe('countdown');
  });
});
