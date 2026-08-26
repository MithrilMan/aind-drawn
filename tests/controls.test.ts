import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  controlAction,
  controlAxis,
  type StandardGamepadSample,
} from '@mithrilman/aind-game-runtime';

import {
  CONTROL_ACTION_IDS,
  toDriveInput,
  toExploreInput,
  type ControlSnapshot,
  type ExploreCameraInput,
} from '../experiments/doodle-racing/src/game/controls.js';
import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import {
  MENU_GAME_STATE,
  exploreGameState,
  pausedGameState,
  raceGameState,
  resolveGlobalControlCommand,
} from '../experiments/doodle-racing/src/game/game-state.js';
import {
  controlHint,
  standardGamepadControls,
} from '../experiments/doodle-racing/src/game/input-controller.js';
import { ControlAxisRepeater } from '../experiments/doodle-racing/src/game/control-focus-navigator.js';
import { controlHintModeFor } from '../experiments/doodle-racing/src/game/control-hint-presenter.js';
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
  it('turns digital or analogue menu axes into bounded repeat steps', () => {
    const digital = new ControlAxisRepeater();
    const analogue = new ControlAxisRepeater();
    expect(digital.update(1, 0.016)).toBe(1);
    expect(analogue.update(0.72, 0.016)).toBe(1);
    expect(digital.update(1, 0.3)).toBe(0);
    expect(analogue.update(0.72, 0.3)).toBe(0);
    expect(digital.update(1, 0.2)).toBe(1);
    expect(analogue.update(0.72, 0.2)).toBe(1);
    expect(digital.update(0, 0.016)).toBe(0);
    expect(digital.update(-1, 0.016)).toBe(-1);
    expect(analogue.update(0.3, 0.5)).toBe(0);
  });

  it('feeds standard gamepad menu input through abstract axes and actions', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[0] = { pressed: true, value: 1 };
    buttons[13] = { pressed: true, value: 1 };
    const controls = gamepadSnapshot(Object.freeze({
      axes: Object.freeze([0, 0, 0, 0]),
      buttons: Object.freeze(buttons),
    }));
    const repeater = new ControlAxisRepeater();

    expect(repeater.update(controls.axes.move.value, 0.016)).toBe(-1);
    expect(controls.actions.primary).toMatchObject({ active: true, pressed: true });
  });

  it('routes abstract global actions through explicit game state', () => {
    expect(resolveGlobalControlCommand(MENU_GAME_STATE, 'reroll')).toBe('reroll');
    expect(resolveGlobalControlCommand(MENU_GAME_STATE, 'back')).toBe('none');
    expect(resolveGlobalControlCommand(raceGameState('running'), 'pause')).toBe('pause');
    expect(resolveGlobalControlCommand(raceGameState('running'), 'back')).toBe('none');
    expect(resolveGlobalControlCommand(exploreGameState('on-foot'), 'reroll')).toBe('reroll');
    expect(resolveGlobalControlCommand(exploreGameState('driving', 'you'), 'reroll')).toBe('none');
    expect(resolveGlobalControlCommand(
      exploreGameState('vehicle-customizer', 'you'),
      'back',
    )).toBe('close-overlay');
    expect(resolveGlobalControlCommand(
      exploreGameState('vehicle-customizer', 'you'),
      'pause',
    )).toBe('pause');
    expect(resolveGlobalControlCommand(exploreGameState('entrance'), 'reroll')).toBe('none');
    expect(resolveGlobalControlCommand(exploreGameState('driving', 'you'), 'camera')).toBe('camera');
    expect(resolveGlobalControlCommand(pausedGameState('explore'), 'back')).toBe('resume');
    expect(resolveGlobalControlCommand(pausedGameState('race'), 'pause')).toBe('resume');
  });

  it('keeps physical gamepad buttons behind semantic actions and matching hints', () => {
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    buttons[1] = { pressed: true, value: 1 };
    const back = gamepadSnapshot(Object.freeze({
      axes: Object.freeze([0, 0, 0, 0]),
      buttons: Object.freeze(buttons),
    }));
    expect(back.actions.back).toMatchObject({ active: true, pressed: true });
    expect(back.actions.pause.active).toBe(false);
    const pauseButtons = Array.from({ length: 16 }, () => ({ pressed: false, value: 0 }));
    pauseButtons[9] = { pressed: true, value: 1 };
    const paused = gamepadSnapshot(Object.freeze({
      axes: Object.freeze([0, 0, 0, 0]),
      buttons: Object.freeze(pauseButtons),
    }));
    expect(paused.actions.pause).toMatchObject({ active: true, pressed: true });
    expect(paused.actions.back.active).toBe(false);
    expect(controlHint('back', 'gamepad')).toBe('B');
    expect(controlHint('pause', 'gamepad')).toBe('Menu');
    expect(controlHint('interact', 'keyboard')).toBe('E');
    expect(controlHintModeFor('gamepad')).toBe('gamepad');
    expect(controlHintModeFor('touch')).toBe('keyboard');
  });

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
