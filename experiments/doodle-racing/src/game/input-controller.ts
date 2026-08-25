import {
  CONTROL_ACTION_IDS,
  CONTROL_AXIS_IDS,
  controlAction,
  controlAxis,
  type ControlActionId,
  type ControlAxisId,
  type ControlAxisSample,
  type ControlDevice,
  type ControlSnapshot,
} from './controls.js';

type DigitalControl = 'forward' | 'back' | 'left' | 'right' | ControlActionId;

const GAMEPAD_AXIS_DEADZONE = 0.14;
const GAMEPAD_TRIGGER_DEADZONE = 0.08;
const MOUSE_ROTATE_SENSITIVITY = 0.0055;
const MOUSE_PITCH_SENSITIVITY = 0.0032;
const TOUCH_ROTATE_SENSITIVITY = 0.011;
const TOUCH_PITCH_SENSITIVITY = 0.006;
const POINTER_ZOOM_SENSITIVITY = 0.018;
const WHEEL_ZOOM_SENSITIVITY = 0.006;

export type StandardGamepadSample = Readonly<{
  axes: readonly number[];
  buttons: readonly (Readonly<{ pressed: boolean; value: number }> | undefined)[];
}>;

export type StandardGamepadControls = Readonly<{
  axes: Readonly<Record<ControlAxisId, ControlAxisSample>>;
  actions: Readonly<Record<ControlActionId, boolean>>;
}>;

type PointerState = {
  x: number;
  y: number;
  device: Extract<ControlDevice, 'mouse' | 'touch'>;
};

const KEY_CONTROLS: Readonly<Record<string, readonly DigitalControl[]>> = Object.freeze({
  ArrowUp: ['forward'],
  w: ['forward'],
  W: ['forward'],
  ArrowDown: ['back'],
  s: ['back'],
  S: ['back'],
  ArrowLeft: ['left'],
  a: ['left'],
  A: ['left'],
  ArrowRight: ['right'],
  d: ['right'],
  D: ['right'],
  ' ': ['primary'],
  Shift: ['sprint'],
  e: ['interact'],
  E: ['interact'],
  p: ['pause'],
  P: ['pause'],
  Escape: ['menu'],
  m: ['menu'],
  M: ['menu'],
  r: ['reset-camera'],
  R: ['reset-camera'],
  n: ['reroll'],
  N: ['reroll'],
});

const TOUCH_CONTROLS = new Set<DigitalControl>([
  'forward',
  'back',
  'left',
  'right',
  'primary',
  'sprint',
  'interact',
]);

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement;
}

function buttonPressed(gamepad: StandardGamepadSample, index: number): boolean {
  const button = gamepad.buttons[index];
  return button?.pressed === true || (button?.value ?? 0) > 0.5;
}

function buttonValue(gamepad: StandardGamepadSample, index: number): number {
  return Math.max(0, Math.min(1, gamepad.buttons[index]?.value ?? 0));
}

export function applyGamepadDeadzone(value: number, deadzone = GAMEPAD_AXIS_DEADZONE): number {
  if (!Number.isFinite(value)) return 0;
  const boundedDeadzone = Math.max(0, Math.min(0.99, deadzone));
  const magnitude = Math.abs(value);
  if (magnitude <= boundedDeadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - boundedDeadzone) / (1 - boundedDeadzone));
}

function emptyGamepadControls(): StandardGamepadControls {
  return Object.freeze({
    axes: Object.freeze(Object.fromEntries(
      CONTROL_AXIS_IDS.map((axis) => [axis, controlAxis(0, null, 'analog')]),
    ) as Record<ControlAxisId, ControlAxisSample>),
    actions: Object.freeze(Object.fromEntries(
      CONTROL_ACTION_IDS.map((action) => [action, false]),
    ) as Record<ControlActionId, boolean>),
  });
}

export function standardGamepadControls(gamepad: StandardGamepadSample): StandardGamepadControls {
  const dpadMove = Number(buttonPressed(gamepad, 12)) - Number(buttonPressed(gamepad, 13));
  const dpadTurn = Number(buttonPressed(gamepad, 14)) - Number(buttonPressed(gamepad, 15));
  const mappedMove = applyGamepadDeadzone(gamepad.axes[1] ?? 0);
  const mappedTurn = applyGamepadDeadzone(gamepad.axes[0] ?? 0);
  const stickMove = mappedMove === 0 ? 0 : -mappedMove;
  const stickTurn = mappedTurn === 0 ? 0 : -mappedTurn;
  const move = dpadMove === 0 ? stickMove : dpadMove;
  const turn = dpadTurn === 0 ? stickTurn : dpadTurn;
  const zoom = Number(buttonPressed(gamepad, 4)) - Number(buttonPressed(gamepad, 5));

  return Object.freeze({
    axes: Object.freeze({
      move: controlAxis(move, 'gamepad', dpadMove === 0 ? 'analog' : 'digital'),
      turn: controlAxis(turn, 'gamepad', dpadTurn === 0 ? 'analog' : 'digital'),
      throttle: controlAxis(
        applyGamepadDeadzone(buttonValue(gamepad, 7), GAMEPAD_TRIGGER_DEADZONE),
        'gamepad',
        'analog',
      ),
      brake: controlAxis(
        applyGamepadDeadzone(buttonValue(gamepad, 6), GAMEPAD_TRIGGER_DEADZONE),
        'gamepad',
        'analog',
      ),
      'look-x': controlAxis(
        applyGamepadDeadzone(gamepad.axes[2] ?? 0),
        'gamepad',
        'analog',
      ),
      'look-y': controlAxis(
        applyGamepadDeadzone(gamepad.axes[3] ?? 0),
        'gamepad',
        'analog',
      ),
      zoom: controlAxis(zoom, 'gamepad', 'digital'),
    }),
    actions: Object.freeze({
      primary: buttonPressed(gamepad, 0),
      sprint: buttonPressed(gamepad, 10),
      interact: buttonPressed(gamepad, 2),
      pause: buttonPressed(gamepad, 9),
      menu: buttonPressed(gamepad, 1) || buttonPressed(gamepad, 8),
      'reset-camera': buttonPressed(gamepad, 11),
      reroll: buttonPressed(gamepad, 3),
    }),
  });
}

function standardGamepad(): Gamepad | null {
  const gamepadNavigator = navigator as unknown as Readonly<{
    getGamepads?: () => readonly (Gamepad | null)[];
  }>;
  const gamepads = gamepadNavigator.getGamepads?.();
  if (gamepads === undefined) return null;
  return [...gamepads].find((gamepad) => gamepad?.connected && gamepad.mapping === 'standard') ?? null;
}

function digitalAxis(
  positive: DigitalControl,
  negative: DigitalControl,
  keyboard: ReadonlySet<DigitalControl>,
  touch: ReadonlySet<DigitalControl>,
): ControlAxisSample | null {
  const keyboardValue = Number(keyboard.has(positive)) - Number(keyboard.has(negative));
  if (keyboardValue !== 0) return controlAxis(keyboardValue, 'keyboard');
  const touchValue = Number(touch.has(positive)) - Number(touch.has(negative));
  if (touchValue !== 0) return controlAxis(touchValue, 'touch');
  return null;
}

export class InputController {
  private readonly held: Readonly<Record<'keyboard' | 'touch', Set<DigitalControl>>> = Object.freeze({
    keyboard: new Set<DigitalControl>(),
    touch: new Set<DigitalControl>(),
  });
  private readonly touchButtons: readonly HTMLButtonElement[];
  private readonly pointers = new Map<number, PointerState>();
  private primaryPointerId: number | null = null;
  private pinchDistance = 0;
  private readonly pointerAxes: Record<'look-x' | 'look-y' | 'zoom', ControlAxisSample> = {
    'look-x': controlAxis(0, null, 'analog', 'delta'),
    'look-y': controlAxis(0, null, 'analog', 'delta'),
    zoom: controlAxis(0, null, 'analog', 'delta'),
  };
  private readonly previousActions = Object.fromEntries(
    CONTROL_ACTION_IDS.map((action) => [action, false]),
  ) as Record<ControlActionId, boolean>;

  public constructor(
    root: HTMLElement,
    private readonly cameraSurface: HTMLCanvasElement,
  ) {
    this.touchButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-control]')];
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);
    cameraSurface.addEventListener('pointerdown', this.handleCameraPointerDown);
    cameraSurface.addEventListener('pointermove', this.handleCameraPointerMove);
    cameraSurface.addEventListener('pointerup', this.handleCameraPointerUp);
    cameraSurface.addEventListener('pointercancel', this.handleCameraPointerUp);
    cameraSurface.addEventListener('lostpointercapture', this.handleCameraPointerUp);
    cameraSurface.addEventListener('wheel', this.handleCameraWheel, { passive: false });
    for (const button of this.touchButtons) {
      button.addEventListener('pointerdown', this.handleButtonPointerDown);
      button.addEventListener('pointerup', this.handleButtonPointerUp);
      button.addEventListener('pointercancel', this.handleButtonPointerUp);
      button.addEventListener('lostpointercapture', this.handleButtonPointerUp);
    }
  }

  public snapshot(): ControlSnapshot {
    const gamepad = standardGamepad();
    const gamepadInput = gamepad === null
      ? emptyGamepadControls()
      : standardGamepadControls(gamepad);
    const move = digitalAxis('forward', 'back', this.held.keyboard, this.held.touch)
      ?? gamepadInput.axes.move;
    const turn = digitalAxis('left', 'right', this.held.keyboard, this.held.touch)
      ?? gamepadInput.axes.turn;
    const throttle = this.digitalSingleAxis('forward') ?? gamepadInput.axes.throttle;
    const brake = this.digitalSingleAxis('back') ?? gamepadInput.axes.brake;
    const lookX = this.pointerAxes['look-x'].value === 0
      ? gamepadInput.axes['look-x']
      : this.pointerAxes['look-x'];
    const lookY = this.pointerAxes['look-y'].value === 0
      ? gamepadInput.axes['look-y']
      : this.pointerAxes['look-y'];
    const zoom = this.pointerAxes.zoom.value === 0
      ? gamepadInput.axes.zoom
      : this.pointerAxes.zoom;
    const actions = Object.fromEntries(CONTROL_ACTION_IDS.map((action) => {
      const keyboardActive = this.held.keyboard.has(action);
      const touchActive = this.held.touch.has(action);
      const active = keyboardActive || touchActive || gamepadInput.actions[action];
      const device: ControlDevice | null = keyboardActive
        ? 'keyboard'
        : touchActive ? 'touch'
          : gamepadInput.actions[action] ? 'gamepad' : null;
      const sample = controlAction(active, active && !this.previousActions[action], device);
      this.previousActions[action] = active;
      return [action, sample];
    })) as ControlSnapshot['actions'];

    const snapshot: ControlSnapshot = Object.freeze({
      axes: Object.freeze({ move, turn, throttle, brake, 'look-x': lookX, 'look-y': lookY, zoom }),
      actions: Object.freeze(actions),
    });
    this.clearPointerAxes();
    return snapshot;
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    this.cameraSurface.removeEventListener('pointerdown', this.handleCameraPointerDown);
    this.cameraSurface.removeEventListener('pointermove', this.handleCameraPointerMove);
    this.cameraSurface.removeEventListener('pointerup', this.handleCameraPointerUp);
    this.cameraSurface.removeEventListener('pointercancel', this.handleCameraPointerUp);
    this.cameraSurface.removeEventListener('lostpointercapture', this.handleCameraPointerUp);
    this.cameraSurface.removeEventListener('wheel', this.handleCameraWheel);
    for (const button of this.touchButtons) {
      button.removeEventListener('pointerdown', this.handleButtonPointerDown);
      button.removeEventListener('pointerup', this.handleButtonPointerUp);
      button.removeEventListener('pointercancel', this.handleButtonPointerUp);
      button.removeEventListener('lostpointercapture', this.handleButtonPointerUp);
    }
  }

  private digitalSingleAxis(control: DigitalControl): ControlAxisSample | null {
    if (this.held.keyboard.has(control)) return controlAxis(1, 'keyboard');
    if (this.held.touch.has(control)) return controlAxis(1, 'touch');
    return null;
  }

  private setPointerAxis(
    axis: 'look-x' | 'look-y' | 'zoom',
    value: number,
    device: Extract<ControlDevice, 'mouse' | 'touch'>,
  ): void {
    this.pointerAxes[axis] = controlAxis(
      this.pointerAxes[axis].value + value,
      device,
      'analog',
      'delta',
    );
  }

  private clearPointerAxes(): void {
    this.pointerAxes['look-x'] = controlAxis(0, null, 'analog', 'delta');
    this.pointerAxes['look-y'] = controlAxis(0, null, 'analog', 'delta');
    this.pointerAxes.zoom = controlAxis(0, null, 'analog', 'delta');
  }

  private pointerDistance(): number {
    const pointers = [...this.pointers.values()];
    if (pointers.length < 2) return 0;
    const first = pointers[0] as PointerState;
    const second = pointers[1] as PointerState;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const controls = KEY_CONTROLS[event.key];
    if (controls === undefined || isEditableTarget(event.target)) return;
    for (const control of controls) this.held.keyboard.add(control);
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const controls = KEY_CONTROLS[event.key];
    if (controls === undefined) return;
    for (const control of controls) this.held.keyboard.delete(control);
    event.preventDefault();
  };

  private readonly handleButtonPointerDown = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const control = button.dataset.control as DigitalControl | undefined;
    if (control === undefined || !TOUCH_CONTROLS.has(control)) return;
    this.held.touch.add(control);
    button.classList.add('pressed');
    button.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handleButtonPointerUp = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const control = button.dataset.control as DigitalControl | undefined;
    if (control !== undefined) this.held.touch.delete(control);
    button.classList.remove('pressed');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };

  private readonly handleCameraPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const device = event.pointerType === 'mouse' ? 'mouse' : 'touch';
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, device });
    this.primaryPointerId ??= event.pointerId;
    this.pinchDistance = this.pointerDistance();
    this.cameraSurface.classList.add('is-explore-camera-dragging');
    this.cameraSurface.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handleCameraPointerMove = (event: PointerEvent): void => {
    const pointer = this.pointers.get(event.pointerId);
    if (pointer === undefined) return;
    const deltaX = event.clientX - pointer.x;
    const deltaY = event.clientY - pointer.y;
    pointer.x = event.clientX;
    pointer.y = event.clientY;

    if (this.pointers.size === 1 && event.pointerId === this.primaryPointerId) {
      const rotateSensitivity = pointer.device === 'mouse'
        ? MOUSE_ROTATE_SENSITIVITY
        : TOUCH_ROTATE_SENSITIVITY;
      const pitchSensitivity = pointer.device === 'mouse'
        ? MOUSE_PITCH_SENSITIVITY
        : TOUCH_PITCH_SENSITIVITY;
      this.setPointerAxis('look-x', deltaX * rotateSensitivity, pointer.device);
      this.setPointerAxis('look-y', deltaY * pitchSensitivity, pointer.device);
    } else if (this.pointers.size >= 2) {
      const distance = this.pointerDistance();
      if (this.pinchDistance > 0) {
        this.setPointerAxis(
          'zoom',
          (this.pinchDistance - distance) * POINTER_ZOOM_SENSITIVITY,
          'touch',
        );
      }
      this.pinchDistance = distance;
    }
    event.preventDefault();
  };

  private readonly handleCameraPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.primaryPointerId === event.pointerId) {
      this.primaryPointerId = this.pointers.keys().next().value ?? null;
    }
    this.pinchDistance = this.pointerDistance();
    if (this.pointers.size === 0) {
      this.primaryPointerId = null;
      this.cameraSurface.classList.remove('is-explore-camera-dragging');
    }
    if (this.cameraSurface.hasPointerCapture(event.pointerId)) {
      this.cameraSurface.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  private readonly handleCameraWheel = (event: WheelEvent): void => {
    this.setPointerAxis('zoom', event.deltaY * WHEEL_ZOOM_SENSITIVITY, 'mouse');
    event.preventDefault();
  };

  private readonly releaseAll = (): void => {
    this.held.keyboard.clear();
    this.held.touch.clear();
    this.pointers.clear();
    this.primaryPointerId = null;
    this.pinchDistance = 0;
    this.cameraSurface.classList.remove('is-explore-camera-dragging');
    this.clearPointerAxes();
    for (const action of CONTROL_ACTION_IDS) this.previousActions[action] = false;
    for (const button of this.touchButtons) button.classList.remove('pressed');
  };
}
