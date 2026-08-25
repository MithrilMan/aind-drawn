import type { ExploreInput } from './race-model.js';

type InputAction = 'accelerate' | 'brake' | 'left' | 'right' | 'handbrake'
  | 'run' | 'jump' | 'interact';

const GAMEPAD_AXIS_DEADZONE = 0.14;
const GAMEPAD_TRIGGER_DEADZONE = 0.08;

export type StandardGamepadSample = Readonly<{
  axes: readonly number[];
  buttons: readonly (Readonly<{ pressed: boolean; value: number }> | undefined)[];
}>;

const KEY_ACTIONS: Readonly<Record<string, readonly InputAction[]>> = Object.freeze({
  ArrowUp: ['accelerate'],
  w: ['accelerate'],
  W: ['accelerate'],
  ArrowDown: ['brake'],
  s: ['brake'],
  S: ['brake'],
  ArrowLeft: ['left'],
  a: ['left'],
  A: ['left'],
  ArrowRight: ['right'],
  d: ['right'],
  D: ['right'],
  // Keep these as dual actions: vehicles retain their drift control while
  // the Explore actor gets the controls players expect from a character.
  ' ': ['handbrake', 'jump'],
  Shift: ['handbrake', 'run'],
  e: ['interact'],
  E: ['interact'],
});

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement;
}

export function applyGamepadDeadzone(value: number, deadzone = GAMEPAD_AXIS_DEADZONE): number {
  if (!Number.isFinite(value)) return 0;
  const boundedDeadzone = Math.max(0, Math.min(0.99, deadzone));
  const magnitude = Math.abs(value);
  if (magnitude <= boundedDeadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - boundedDeadzone) / (1 - boundedDeadzone));
}

function standardGamepad(): Gamepad | null {
  const gamepadNavigator = navigator as unknown as Readonly<{
    getGamepads?: () => readonly (Gamepad | null)[];
  }>;
  const gamepads = gamepadNavigator.getGamepads?.();
  if (gamepads === undefined) return null;
  return [...gamepads].find((gamepad) => gamepad?.connected && gamepad.mapping === 'standard') ?? null;
}

export function mergeStandardGamepadInput(
  digital: ExploreInput,
  gamepad: StandardGamepadSample,
): ExploreInput {
  const gamepadSteering = applyGamepadDeadzone(gamepad.axes[0] ?? 0);
  const gamepadThrottle = Math.max(0, applyGamepadDeadzone(
    gamepad.buttons[7]?.value ?? 0,
    GAMEPAD_TRIGGER_DEADZONE,
  ));
  const gamepadBrake = Math.max(0, applyGamepadDeadzone(
    gamepad.buttons[6]?.value ?? 0,
    GAMEPAD_TRIGGER_DEADZONE,
  ));
  const throttle = Math.max(digital.accelerate ? 1 : 0, gamepadThrottle);
  const brakePressure = Math.max(digital.brake ? 1 : 0, gamepadBrake);
  const digitalSteering = Number(digital.left) - Number(digital.right);
  const steering = digitalSteering === 0
    ? gamepadSteering === 0 ? 0 : -gamepadSteering
    : digitalSteering;

  return Object.freeze({
    ...digital,
    accelerate: throttle > 0,
    brake: brakePressure > 0,
    left: digital.left || steering > 0,
    right: digital.right || steering < 0,
    handbrake: digital.handbrake || gamepad.buttons[0]?.pressed === true,
    steeringAxis: Math.max(-1, Math.min(1, steering)),
    throttle,
    brakePressure,
  });
}

export class InputController {
  private readonly state: Record<InputAction, boolean> = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
    run: false,
    jump: false,
    interact: false,
  };
  private readonly touchButtons: readonly HTMLButtonElement[];

  public constructor(root: HTMLElement) {
    this.touchButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-drive]')];
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);
    for (const button of this.touchButtons) {
      button.addEventListener('pointerdown', this.handlePointerDown);
      button.addEventListener('pointerup', this.handlePointerUp);
      button.addEventListener('pointercancel', this.handlePointerUp);
      button.addEventListener('lostpointercapture', this.handlePointerUp);
    }
  }

  public snapshot(): ExploreInput {
    const gamepad = standardGamepad();
    if (gamepad === null) return Object.freeze({ ...this.state });
    return mergeStandardGamepadInput(this.state, gamepad);
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    for (const button of this.touchButtons) {
      button.removeEventListener('pointerdown', this.handlePointerDown);
      button.removeEventListener('pointerup', this.handlePointerUp);
      button.removeEventListener('pointercancel', this.handlePointerUp);
      button.removeEventListener('lostpointercapture', this.handlePointerUp);
    }
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const actions = KEY_ACTIONS[event.key];
    if (actions === undefined || isEditableTarget(event.target)) return;
    for (const action of actions) this.state[action] = true;
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const actions = KEY_ACTIONS[event.key];
    if (actions === undefined) return;
    for (const action of actions) this.state[action] = false;
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.drive as InputAction | undefined;
    if (action === undefined) return;
    this.state[action] = true;
    button.classList.add('pressed');
    button.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.drive as InputAction | undefined;
    if (action !== undefined) this.state[action] = false;
    button.classList.remove('pressed');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };

  private readonly releaseAll = (): void => {
    for (const action of Object.keys(this.state) as InputAction[]) this.state[action] = false;
    for (const button of this.touchButtons) button.classList.remove('pressed');
  };
}
