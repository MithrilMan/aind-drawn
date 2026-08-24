import type { ExploreInput } from './race-model.js';

type InputAction = keyof ExploreInput;

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
    return Object.freeze({ ...this.state });
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
