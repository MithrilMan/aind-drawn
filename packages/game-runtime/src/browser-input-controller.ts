import {
  controlAction,
  controlAxis,
  type ControlActionSample,
  type ControlAxisSample,
  type ControlDevice,
  type ControlDeviceFrame,
  type ControlSchema,
  type ControlSnapshot,
} from './controls.js';
import type { StandardGamepadSample } from './gamepad.js';

export type DigitalAxisBinding<TAxis extends string> = Readonly<{
  axis: TAxis;
  value: number;
}>;

export type DigitalControlBinding<
  TAxis extends string,
  TAction extends string,
> = Readonly<{
  id: string;
  axes?: readonly DigitalAxisBinding<TAxis>[];
  actions?: readonly TAction[];
}>;

export type PointerAxisBinding<TAxis extends string> = Readonly<{
  axis: TAxis;
  mouseSensitivity: number;
  touchSensitivity: number;
}>;

export type PointerZoomBinding<TAxis extends string> = Readonly<{
  axis: TAxis;
  pinchSensitivity: number;
  wheelSensitivity: number;
}>;

export type PointerControlBindings<TAxis extends string> = Readonly<{
  horizontal?: PointerAxisBinding<TAxis>;
  vertical?: PointerAxisBinding<TAxis>;
  zoom?: PointerZoomBinding<TAxis>;
  activeClassName?: string;
}>;

export type BrowserInputControllerOptions<
  TAxis extends string,
  TAction extends string,
> = Readonly<{
  root: HTMLElement;
  pointerSurface: HTMLElement;
  schema: ControlSchema<TAxis, TAction>;
  digitalControls: readonly DigitalControlBinding<TAxis, TAction>[];
  keyCodeBindings: Readonly<Record<string, readonly string[]>>;
  touchControlIds: readonly string[];
  touchSelector?: string;
  pointer?: PointerControlBindings<TAxis>;
  mapGamepad?: (sample: StandardGamepadSample) => ControlDeviceFrame<TAxis, TAction>;
}>;

type PointerState = {
  x: number;
  y: number;
  device: Extract<ControlDevice, 'mouse' | 'touch'>;
};

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement
    || (target instanceof HTMLElement && target.isContentEditable);
}

function standardGamepad(): StandardGamepadSample | null {
  const gamepadNavigator = navigator as unknown as Readonly<{
    getGamepads?: () => readonly (Gamepad | null)[];
  }>;
  const gamepads = gamepadNavigator.getGamepads?.();
  if (gamepads === undefined) return null;
  return [...gamepads].find((gamepad) => gamepad?.connected && gamepad.mapping === 'standard')
    ?? null;
}

function assertFiniteSensitivity(name: string, value: number): void {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
}

/** Browser event adapter for renderer-neutral control schemas. */
export class BrowserInputController<
  TAxis extends string,
  TAction extends string,
> {
  private readonly root: HTMLElement;
  private readonly pointerSurface: HTMLElement;
  private readonly schema: ControlSchema<TAxis, TAction>;
  private readonly controls = new Map<string, DigitalControlBinding<TAxis, TAction>>();
  private readonly keyCodeBindings: Readonly<Record<string, readonly string[]>>;
  private readonly touchControlIds: ReadonlySet<string>;
  private readonly pointer: PointerControlBindings<TAxis>;
  private readonly mapGamepad: BrowserInputControllerOptions<TAxis, TAction>['mapGamepad'];
  private readonly held = Object.freeze({
    keyboard: new Set<string>(),
    touch: new Set<string>(),
  });
  private readonly heldKeyCodes = new Set<string>();
  private readonly touchControls: readonly HTMLElement[];
  private readonly pointers = new Map<number, PointerState>();
  private readonly pointerAxes = new Map<TAxis, ControlAxisSample>();
  private readonly previousActions: Record<TAction, boolean>;
  private primaryPointerId: number | null = null;
  private pinchDistance = 0;

  public constructor(options: BrowserInputControllerOptions<TAxis, TAction>) {
    this.root = options.root;
    this.pointerSurface = options.pointerSurface;
    this.schema = options.schema;
    this.keyCodeBindings = options.keyCodeBindings;
    this.touchControlIds = new Set(options.touchControlIds);
    this.pointer = options.pointer ?? Object.freeze({});
    this.mapGamepad = options.mapGamepad;
    this.previousActions = Object.fromEntries(
      this.schema.actionIds.map((action) => [action, false]),
    ) as Record<TAction, boolean>;

    this.validateAndIndexControls(options.digitalControls);
    this.validateBindings();
    this.touchControls = [...this.root.querySelectorAll<HTMLElement>(
      options.touchSelector ?? '[data-control]',
    )];

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    this.pointerSurface.addEventListener('pointerdown', this.handlePointerDown);
    this.pointerSurface.addEventListener('pointermove', this.handlePointerMove);
    this.pointerSurface.addEventListener('pointerup', this.handlePointerUp);
    this.pointerSurface.addEventListener('pointercancel', this.handlePointerUp);
    this.pointerSurface.addEventListener('lostpointercapture', this.handlePointerUp);
    this.pointerSurface.addEventListener('wheel', this.handleWheel, { passive: false });
    for (const control of this.touchControls) {
      control.addEventListener('pointerdown', this.handleTouchControlDown);
      control.addEventListener('pointerup', this.handleTouchControlUp);
      control.addEventListener('pointercancel', this.handleTouchControlUp);
      control.addEventListener('lostpointercapture', this.handleTouchControlUp);
    }
  }

  public snapshot(): ControlSnapshot<TAxis, TAction> {
    const gamepad = standardGamepad();
    const gamepadFrame = gamepad === null || this.mapGamepad === undefined
      ? null
      : this.mapGamepad(gamepad);
    const axes = Object.fromEntries(this.schema.axisIds.map((axis) => [
      axis,
      this.axisSample(axis, gamepadFrame),
    ])) as Record<TAxis, ControlAxisSample>;
    const actions = Object.fromEntries(this.schema.actionIds.map((action) => {
      const keyboardActive = this.deviceActionActive(action, this.held.keyboard);
      const touchActive = this.deviceActionActive(action, this.held.touch);
      const gamepadActive = gamepadFrame?.actions[action] === true;
      const active = keyboardActive || touchActive || gamepadActive;
      const device: ControlDevice | null = keyboardActive
        ? 'keyboard'
        : touchActive ? 'touch'
          : gamepadActive ? 'gamepad' : null;
      const sample = controlAction(active, active && !this.previousActions[action], device);
      this.previousActions[action] = active;
      return [action, sample];
    })) as Record<TAction, ControlActionSample>;

    this.pointerAxes.clear();
    return Object.freeze({ axes: Object.freeze(axes), actions: Object.freeze(actions) });
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    this.pointerSurface.removeEventListener('pointerdown', this.handlePointerDown);
    this.pointerSurface.removeEventListener('pointermove', this.handlePointerMove);
    this.pointerSurface.removeEventListener('pointerup', this.handlePointerUp);
    this.pointerSurface.removeEventListener('pointercancel', this.handlePointerUp);
    this.pointerSurface.removeEventListener('lostpointercapture', this.handlePointerUp);
    this.pointerSurface.removeEventListener('wheel', this.handleWheel);
    for (const control of this.touchControls) {
      control.removeEventListener('pointerdown', this.handleTouchControlDown);
      control.removeEventListener('pointerup', this.handleTouchControlUp);
      control.removeEventListener('pointercancel', this.handleTouchControlUp);
      control.removeEventListener('lostpointercapture', this.handleTouchControlUp);
    }
    this.releaseAll();
  }

  private validateAndIndexControls(
    controls: readonly DigitalControlBinding<TAxis, TAction>[],
  ): void {
    const axes = new Set<string>(this.schema.axisIds);
    const actions = new Set<string>(this.schema.actionIds);
    for (const control of controls) {
      if (control.id.trim().length === 0) throw new RangeError('Digital control ID must not be empty');
      if (this.controls.has(control.id)) {
        throw new RangeError(`Duplicate digital control ID: ${control.id}`);
      }
      for (const binding of control.axes ?? []) {
        if (!axes.has(binding.axis)) throw new RangeError(`Unknown control axis: ${binding.axis}`);
        if (!Number.isFinite(binding.value)) {
          throw new RangeError(`Digital control axis value must be finite: ${control.id}`);
        }
      }
      for (const action of control.actions ?? []) {
        if (!actions.has(action)) throw new RangeError(`Unknown control action: ${action}`);
      }
      this.controls.set(control.id, Object.freeze(control));
    }
  }

  private validateBindings(): void {
    for (const [code, controls] of Object.entries(this.keyCodeBindings)) {
      for (const control of controls) {
        if (!this.controls.has(control)) {
          throw new RangeError(`Unknown control for key code ${code}: ${control}`);
        }
      }
    }
    for (const control of this.touchControlIds) {
      if (!this.controls.has(control)) throw new RangeError(`Unknown touch control: ${control}`);
    }
    const axes = new Set<string>(this.schema.axisIds);
    for (const binding of [this.pointer.horizontal, this.pointer.vertical]) {
      if (binding === undefined) continue;
      if (!axes.has(binding.axis)) throw new RangeError(`Unknown pointer axis: ${binding.axis}`);
      assertFiniteSensitivity('Pointer mouse sensitivity', binding.mouseSensitivity);
      assertFiniteSensitivity('Pointer touch sensitivity', binding.touchSensitivity);
    }
    if (this.pointer.zoom !== undefined) {
      if (!axes.has(this.pointer.zoom.axis)) {
        throw new RangeError(`Unknown pointer zoom axis: ${this.pointer.zoom.axis}`);
      }
      assertFiniteSensitivity('Pointer pinch sensitivity', this.pointer.zoom.pinchSensitivity);
      assertFiniteSensitivity('Pointer wheel sensitivity', this.pointer.zoom.wheelSensitivity);
    }
  }

  private axisSample(
    axis: TAxis,
    gamepad: ControlDeviceFrame<TAxis, TAction> | null,
  ): ControlAxisSample {
    const keyboard = this.digitalAxis(axis, this.held.keyboard, 'keyboard');
    if (keyboard !== null) return keyboard;
    const touch = this.digitalAxis(axis, this.held.touch, 'touch');
    if (touch !== null) return touch;
    const pointer = this.pointerAxes.get(axis);
    if (pointer !== undefined && pointer.value !== 0) return pointer;
    return gamepad?.axes[axis] ?? controlAxis(0, null, 'analog');
  }

  private digitalAxis(
    axis: TAxis,
    held: ReadonlySet<string>,
    device: Extract<ControlDevice, 'keyboard' | 'touch'>,
  ): ControlAxisSample | null {
    let value = 0;
    for (const id of held) {
      const control = this.controls.get(id);
      for (const binding of control?.axes ?? []) {
        if (binding.axis === axis) value += binding.value;
      }
    }
    return value === 0 ? null : controlAxis(value, device);
  }

  private deviceActionActive(action: TAction, held: ReadonlySet<string>): boolean {
    for (const id of held) {
      if (this.controls.get(id)?.actions?.includes(action) === true) return true;
    }
    return false;
  }

  private setPointerAxis(
    axis: TAxis,
    value: number,
    device: Extract<ControlDevice, 'mouse' | 'touch'>,
  ): void {
    const current = this.pointerAxes.get(axis)?.value ?? 0;
    this.pointerAxes.set(axis, controlAxis(current + value, device, 'analog', 'delta'));
  }

  private pointerDistance(): number {
    const pointers = [...this.pointers.values()];
    if (pointers.length < 2) return 0;
    const first = pointers[0] as PointerState;
    const second = pointers[1] as PointerState;
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    const controls = this.keyCodeBindings[event.code];
    if (controls === undefined || isEditableTarget(event.target)) return;
    this.heldKeyCodes.add(event.code);
    this.refreshKeyboardControls();
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const controls = this.keyCodeBindings[event.code];
    if (controls === undefined) return;
    this.heldKeyCodes.delete(event.code);
    this.refreshKeyboardControls();
    event.preventDefault();
  };

  private refreshKeyboardControls(): void {
    this.held.keyboard.clear();
    for (const code of this.heldKeyCodes) {
      for (const control of this.keyCodeBindings[code] ?? []) this.held.keyboard.add(control);
    }
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.hidden) this.releaseAll();
  };

  private readonly handleTouchControlDown = (event: PointerEvent): void => {
    const controlElement = event.currentTarget as HTMLElement;
    const controlId = controlElement.dataset.control;
    if (controlId === undefined || !this.touchControlIds.has(controlId)) return;
    this.held.touch.add(controlId);
    controlElement.classList.add('pressed');
    controlElement.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handleTouchControlUp = (event: PointerEvent): void => {
    const controlElement = event.currentTarget as HTMLElement;
    const controlId = controlElement.dataset.control;
    if (controlId !== undefined) this.held.touch.delete(controlId);
    controlElement.classList.remove('pressed');
    if (controlElement.hasPointerCapture(event.pointerId)) {
      controlElement.releasePointerCapture(event.pointerId);
    }
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const device = event.pointerType === 'mouse' ? 'mouse' : 'touch';
    this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, device });
    this.primaryPointerId ??= event.pointerId;
    this.pinchDistance = this.pointerDistance();
    if (this.pointer.activeClassName !== undefined) {
      this.pointerSurface.classList.add(this.pointer.activeClassName);
    }
    this.pointerSurface.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId);
    if (state === undefined) return;
    const deltaX = event.clientX - state.x;
    const deltaY = event.clientY - state.y;
    state.x = event.clientX;
    state.y = event.clientY;

    if (this.pointers.size === 1 && event.pointerId === this.primaryPointerId) {
      const horizontal = this.pointer.horizontal;
      if (horizontal !== undefined) {
        this.setPointerAxis(
          horizontal.axis,
          deltaX * (state.device === 'mouse'
            ? horizontal.mouseSensitivity
            : horizontal.touchSensitivity),
          state.device,
        );
      }
      const vertical = this.pointer.vertical;
      if (vertical !== undefined) {
        this.setPointerAxis(
          vertical.axis,
          deltaY * (state.device === 'mouse'
            ? vertical.mouseSensitivity
            : vertical.touchSensitivity),
          state.device,
        );
      }
    } else if (this.pointers.size >= 2 && this.pointer.zoom !== undefined) {
      const distance = this.pointerDistance();
      if (this.pinchDistance > 0) {
        this.setPointerAxis(
          this.pointer.zoom.axis,
          (this.pinchDistance - distance) * this.pointer.zoom.pinchSensitivity,
          'touch',
        );
      }
      this.pinchDistance = distance;
    }
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.primaryPointerId === event.pointerId) {
      this.primaryPointerId = this.pointers.keys().next().value ?? null;
    }
    this.pinchDistance = this.pointerDistance();
    if (this.pointers.size === 0) {
      this.primaryPointerId = null;
      if (this.pointer.activeClassName !== undefined) {
        this.pointerSurface.classList.remove(this.pointer.activeClassName);
      }
    }
    if (this.pointerSurface.hasPointerCapture(event.pointerId)) {
      this.pointerSurface.releasePointerCapture(event.pointerId);
    }
    event.preventDefault();
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    if (this.pointer.zoom === undefined) return;
    this.setPointerAxis(
      this.pointer.zoom.axis,
      event.deltaY * this.pointer.zoom.wheelSensitivity,
      'mouse',
    );
    event.preventDefault();
  };

  private readonly releaseAll = (): void => {
    this.heldKeyCodes.clear();
    this.held.keyboard.clear();
    this.held.touch.clear();
    this.pointers.clear();
    this.pointerAxes.clear();
    this.primaryPointerId = null;
    this.pinchDistance = 0;
    if (this.pointer.activeClassName !== undefined) {
      this.pointerSurface.classList.remove(this.pointer.activeClassName);
    }
    for (const action of this.schema.actionIds) this.previousActions[action] = false;
    for (const control of this.touchControls) control.classList.remove('pressed');
  };
}
