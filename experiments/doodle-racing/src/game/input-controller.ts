import {
  mapStandardGamepad,
  type StandardGamepadBindings,
  type StandardGamepadFrame,
  type StandardGamepadSample,
} from '@mithrilman/aind-game-runtime';
import {
  BrowserInputController,
  type DigitalControlBinding,
} from '@mithrilman/aind-game-runtime/browser';

import {
  CONTROL_ACTION_IDS,
  PAPER_CIRCUIT_CONTROL_SCHEMA,
  type ControlActionId,
  type ControlAxisId,
} from './controls.js';

type DigitalControlId = 'forward' | 'back' | 'left' | 'right' | ControlActionId;

export type StandardGamepadControls = StandardGamepadFrame<ControlAxisId, ControlActionId>;

const GAMEPAD_BINDINGS: StandardGamepadBindings<ControlAxisId, ControlActionId> = Object.freeze({
  axes: Object.freeze({
    move: Object.freeze({ axisIndex: 1, invertAxis: true, positiveButton: 12, negativeButton: 13 }),
    turn: Object.freeze({ axisIndex: 0, invertAxis: true, positiveButton: 14, negativeButton: 15 }),
    throttle: Object.freeze({ valueButton: 7, deadzone: 0.08 }),
    brake: Object.freeze({ valueButton: 6, deadzone: 0.08 }),
    'look-x': Object.freeze({ axisIndex: 2 }),
    'look-y': Object.freeze({ axisIndex: 3 }),
    zoom: Object.freeze({ positiveButton: 4, negativeButton: 5 }),
  }),
  actions: Object.freeze({
    primary: Object.freeze([0]),
    sprint: Object.freeze([10]),
    interact: Object.freeze([2]),
    pause: Object.freeze([9]),
    menu: Object.freeze([1, 8]),
    'reset-camera': Object.freeze([11]),
    reroll: Object.freeze([3]),
  }),
});

const DIGITAL_CONTROLS: readonly DigitalControlBinding<ControlAxisId, ControlActionId>[] = Object.freeze([
  Object.freeze({ id: 'forward', axes: Object.freeze([
    Object.freeze({ axis: 'move', value: 1 }),
    Object.freeze({ axis: 'throttle', value: 1 }),
  ]) }),
  Object.freeze({ id: 'back', axes: Object.freeze([
    Object.freeze({ axis: 'move', value: -1 }),
    Object.freeze({ axis: 'brake', value: 1 }),
  ]) }),
  Object.freeze({ id: 'left', axes: Object.freeze([
    Object.freeze({ axis: 'turn', value: 1 }),
  ]) }),
  Object.freeze({ id: 'right', axes: Object.freeze([
    Object.freeze({ axis: 'turn', value: -1 }),
  ]) }),
  ...CONTROL_ACTION_IDS.map((action) => Object.freeze({
    id: action,
    actions: Object.freeze([action]),
  })),
]);

function keys(...controls: DigitalControlId[]): readonly DigitalControlId[] {
  return Object.freeze(controls);
}

const KEY_CODE_BINDINGS: Readonly<Record<string, readonly DigitalControlId[]>> = Object.freeze({
  ArrowUp: keys('forward'),
  KeyW: keys('forward'),
  ArrowDown: keys('back'),
  KeyS: keys('back'),
  ArrowLeft: keys('left'),
  KeyA: keys('left'),
  ArrowRight: keys('right'),
  KeyD: keys('right'),
  Space: keys('primary'),
  ShiftLeft: keys('sprint'),
  ShiftRight: keys('sprint'),
  KeyE: keys('interact'),
  KeyP: keys('pause'),
  Escape: keys('menu'),
  KeyM: keys('menu'),
  KeyR: keys('reset-camera'),
  KeyN: keys('reroll'),
});

const TOUCH_CONTROL_IDS: readonly DigitalControlId[] = Object.freeze([
  'forward',
  'back',
  'left',
  'right',
  'primary',
  'sprint',
  'interact',
]);

export function standardGamepadControls(gamepad: StandardGamepadSample): StandardGamepadControls {
  return mapStandardGamepad(PAPER_CIRCUIT_CONTROL_SCHEMA, GAMEPAD_BINDINGS, gamepad);
}

/** Paper Circuit bindings over the reusable browser input adapter. */
export class InputController extends BrowserInputController<ControlAxisId, ControlActionId> {
  public constructor(root: HTMLElement, cameraSurface: HTMLCanvasElement) {
    super({
      root,
      pointerSurface: cameraSurface,
      schema: PAPER_CIRCUIT_CONTROL_SCHEMA,
      digitalControls: DIGITAL_CONTROLS,
      keyCodeBindings: KEY_CODE_BINDINGS,
      touchControlIds: TOUCH_CONTROL_IDS,
      mapGamepad: standardGamepadControls,
      pointer: Object.freeze({
        horizontal: Object.freeze({
          axis: 'look-x',
          mouseSensitivity: 0.0055,
          touchSensitivity: 0.011,
        }),
        vertical: Object.freeze({
          axis: 'look-y',
          mouseSensitivity: 0.0032,
          touchSensitivity: 0.006,
        }),
        zoom: Object.freeze({
          axis: 'zoom',
          pinchSensitivity: 0.018,
          wheelSensitivity: 0.006,
        }),
        activeClassName: 'is-explore-camera-dragging',
      }),
    });
  }
}
