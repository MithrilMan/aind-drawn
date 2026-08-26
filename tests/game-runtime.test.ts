import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  FixedStepClock,
  createArcadeVehicleState,
  createControlSchema,
  mapStandardGamepad,
  resolveObstacleCollisions,
  stepArcadeVehicle,
  type ArcadeVehicleState,
  type VehicleCollisionProfile,
} from '@mithrilman/aind-game-runtime';

function source(path: string): string {
  return readFileSync(new URL(`../packages/game-runtime/src/${path}`, import.meta.url), 'utf8');
}

describe('@mithrilman/aind-game-runtime', () => {
  it('validates and freezes application-owned control schemas', () => {
    const schema = createControlSchema(['move', 'look'] as const, ['jump'] as const);
    expect(schema).toEqual({ axisIds: ['move', 'look'], actionIds: ['jump'] });
    expect(Object.isFrozen(schema.axisIds)).toBe(true);
    expect(() => createControlSchema(['move', 'move'], ['jump'])).toThrow(/Duplicate axis/);
    expect(() => createControlSchema([''], ['jump'])).toThrow(/must not be empty/);
  });

  it('maps standard gamepads without embedding game-specific control IDs', () => {
    const schema = createControlSchema(['move', 'brake'] as const, ['jump'] as const);
    const buttons = Array.from({ length: 8 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = { pressed: true, value: 1 };
    buttons[6] = { pressed: false, value: 0.54 };
    const frame = mapStandardGamepad(schema, Object.freeze({
      axes: Object.freeze({
        move: Object.freeze({ axisIndex: 1, invertAxis: true }),
        brake: Object.freeze({ valueButton: 6, deadzone: 0.08 }),
      }),
      actions: Object.freeze({ jump: Object.freeze([0]) }),
    }), Object.freeze({
      axes: Object.freeze([0, -0.62]),
      buttons: Object.freeze(buttons),
    }));

    expect(frame.axes.move).toMatchObject({ device: 'gamepad', kind: 'analog' });
    expect(frame.axes.move.value).toBeGreaterThan(0.5);
    expect(frame.axes.brake.value).toBeGreaterThan(0.45);
    expect(frame.actions.jump).toBe(true);
  });

  it('advances deterministic fixed steps and drops bounded catch-up time explicitly', () => {
    const firstTimes: number[] = [];
    const first = new FixedStepClock({ stepSeconds: 1 / 120 });
    const firstAdvance = first.advance(1 / 30, (_delta, time) => firstTimes.push(time));

    const secondTimes: number[] = [];
    const second = new FixedStepClock({ stepSeconds: 1 / 120 });
    second.advance(1 / 60, (_delta, time) => secondTimes.push(time));
    const secondAdvance = second.advance(1 / 60, (_delta, time) => secondTimes.push(time));

    expect(firstTimes).toEqual(secondTimes);
    expect(firstAdvance).toMatchObject({ steps: 4, alpha: 0, droppedSeconds: 0 });
    expect(secondAdvance.simulationTime).toBeCloseTo(1 / 30, 12);

    const bounded = new FixedStepClock({
      stepSeconds: 0.01,
      maximumFrameSeconds: 0.05,
      maximumStepsPerFrame: 2,
    });
    const overloaded = bounded.advance(0.2, () => undefined);
    expect(overloaded.steps).toBe(2);
    expect(overloaded.alpha).toBeCloseTo(0, 12);
    expect(overloaded.droppedSeconds).toBeCloseTo(0.18, 12);
  });

  it('keeps arcade simulation repeatable and resolves swept structural collisions', () => {
    const run = (): ArcadeVehicleState => {
      let state = createArcadeVehicleState(0, 0, 0);
      for (let index = 0; index < 240; index += 1) {
        state = stepArcadeVehicle(state, Object.freeze({
          accelerate: true,
          brake: false,
          left: index > 80,
          right: false,
          handbrake: index > 130,
          steeringAxis: index > 80 ? 0.72 : 0,
          throttle: 0.9,
        }), 'road', 1 / 120);
      }
      return state;
    };
    expect(run()).toEqual(run());

    const profile: VehicleCollisionProfile = Object.freeze({
      halfLength: 1,
      halfWidth: 0.45,
      frontAxle: 0.65,
      rearAxle: -0.65,
      wheelRadius: 0.32,
      wheelHalfWidth: 0.12,
      groundClearance: 0.14,
    });
    const before = Object.freeze({
      ...createArcadeVehicleState(0, 0, 0),
      velocityX: 18,
    });
    const proposed = Object.freeze({ ...before, x: 3 });
    const collision = resolveObstacleCollisions(before, proposed, Object.freeze([Object.freeze({
      id: 'wall',
      startX: 2,
      startZ: -3,
      endX: 2,
      endZ: 3,
      radius: 0.2,
      height: 1,
    })]), profile);
    expect(collision.obstacleId).toBe('wall');
    expect(collision.severity).toBeGreaterThan(0);
    expect(collision.state.x).toBeLessThan(2);
  });

  it('keeps the core renderer, asset-library, and browser independent', () => {
    const coreFiles = [
      'scalar.ts',
      'controls.ts',
      'gamepad.ts',
      'fixed-step.ts',
      'arcade-vehicle.ts',
      'vehicle-collision.ts',
      'index.ts',
    ];
    for (const file of coreFiles) {
      const content = source(file);
      expect(content, file).not.toMatch(/from ['"]three['"]/);
      expect(content, file).not.toMatch(/aind-drawn|\.\.\/\.\.\/\.\.\/src/);
      expect(content, file).not.toMatch(/\b(?:window|document|navigator|HTMLElement|Gamepad)\b/);
    }
    expect(source('index.ts')).not.toMatch(/browser-input-controller/);
    expect(source('browser.ts')).toMatch(/browser-input-controller/);
  });
});
