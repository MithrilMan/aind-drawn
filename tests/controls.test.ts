import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  CONTROL_ACTION_IDS,
  controlAction,
  controlAxis,
  toDriveInput,
  toExploreInput,
  type ControlSnapshot,
  type ExploreCameraInput,
} from '../experiments/doodle-racing/src/game/controls.js';
import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import {
  standardGamepadControls,
  type StandardGamepadSample,
} from '../experiments/doodle-racing/src/game/input-controller.js';
import { RaceCameraController } from '../experiments/doodle-racing/src/game/race-camera.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';

function gamepadSnapshot(sample: StandardGamepadSample): ControlSnapshot {
  const mapped = standardGamepadControls(sample);
  return Object.freeze({
    axes: mapped.axes,
    actions: Object.freeze(Object.fromEntries(CONTROL_ACTION_IDS.map((action) => [
      action,
      controlAction(mapped.actions[action], mapped.actions[action], 'gamepad'),
    ])) as ControlSnapshot['actions']),
  });
}

describe('controller-agnostic gameplay controls', () => {
  it('preserves device and analog provenance before mapping by gameplay context', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = { pressed: true, value: 1 };
    buttons[2] = { pressed: true, value: 1 };
    buttons[10] = { pressed: true, value: 1 };
    const controls = gamepadSnapshot(Object.freeze({
      axes: Object.freeze([-0.52, -0.68, 0.44, -0.31]),
      buttons: Object.freeze(buttons),
    }));

    expect(controls.axes.move).toMatchObject({ device: 'gamepad', kind: 'analog' });
    expect(controls.axes.turn.value).toBeGreaterThan(0.4);
    expect(controls.axes['look-x']).toMatchObject({
      device: 'gamepad',
      kind: 'analog',
      behavior: 'continuous',
    });

    const race = toDriveInput(controls);
    const explore = toExploreInput(controls);
    expect(race).toMatchObject({ left: true, handbrake: true });
    expect(explore).toMatchObject({ left: true, jump: true, run: true, interact: true });
    expect(explore.throttle).toBeGreaterThan(0.6);
  });

  it('keeps pointer deltas and gamepad camera axes on distinct time semantics', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 220);
    const controller = new RaceCameraController(
      camera,
      course,
      world,
      () => Object.freeze({ width: 1280, height: 720 }),
    );
    const explorer = Object.freeze({
      species: 'human' as const,
      x: 0,
      y: 0,
      z: 0,
      heading: 0,
      speed: 0,
      along: 0,
      away: 0,
      row: -1,
      pose: 'idle' as const,
      expression: 'idle' as const,
      elapsed: 0,
    });
    controller.setExplorerActive(true);
    for (let index = 0; index < 30; index += 1) controller.updateExplorer(explorer, 0.05);
    const initial = camera.position.clone();

    const gamepadInput: ExploreCameraInput = Object.freeze({
      orbitX: controlAxis(0.8, 'gamepad', 'analog', 'continuous'),
      orbitY: controlAxis(0, 'gamepad', 'analog', 'continuous'),
      zoom: controlAxis(0, 'gamepad', 'analog', 'continuous'),
    });
    controller.applyExplorerInput(gamepadInput, 0.05);
    controller.updateExplorer(explorer, 0.05);
    expect(camera.position.distanceTo(initial)).toBeGreaterThan(0.03);

    const beforePointer = camera.position.clone();
    const pointerInput: ExploreCameraInput = Object.freeze({
      orbitX: controlAxis(0.4, 'mouse', 'analog', 'delta'),
      orbitY: controlAxis(-0.2, 'mouse', 'analog', 'delta'),
      zoom: controlAxis(-0.5, 'mouse', 'analog', 'delta'),
    });
    controller.applyExplorerInput(pointerInput, 0.001);
    controller.updateExplorer(explorer, 0.05);
    expect(camera.position.distanceTo(beforePointer)).toBeGreaterThan(0.1);
    controller.dispose();
  });
});
