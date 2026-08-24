import type { DriveInput } from './race-model.js';

type DriveAction = keyof DriveInput;

const KEY_ACTIONS: Readonly<Record<string, DriveAction>> = Object.freeze({
  ArrowUp: 'accelerate',
  w: 'accelerate',
  W: 'accelerate',
  ArrowDown: 'brake',
  s: 'brake',
  S: 'brake',
  ArrowLeft: 'left',
  a: 'left',
  A: 'left',
  ArrowRight: 'right',
  d: 'right',
  D: 'right',
  ' ': 'handbrake',
  Shift: 'handbrake',
});

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLButtonElement;
}

export class InputController {
  private readonly state: Record<DriveAction, boolean> = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    handbrake: false,
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

  public snapshot(): DriveInput {
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
    const action = KEY_ACTIONS[event.key];
    if (action === undefined || isEditableTarget(event.target)) return;
    this.state[action] = true;
    event.preventDefault();
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    const action = KEY_ACTIONS[event.key];
    if (action === undefined) return;
    this.state[action] = false;
    event.preventDefault();
  };

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.drive as DriveAction | undefined;
    if (action === undefined) return;
    this.state[action] = true;
    button.classList.add('pressed');
    button.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    const button = event.currentTarget as HTMLButtonElement;
    const action = button.dataset.drive as DriveAction | undefined;
    if (action !== undefined) this.state[action] = false;
    button.classList.remove('pressed');
    if (button.hasPointerCapture(event.pointerId)) button.releasePointerCapture(event.pointerId);
  };

  private readonly releaseAll = (): void => {
    for (const action of Object.keys(this.state) as DriveAction[]) this.state[action] = false;
    for (const button of this.touchButtons) button.classList.remove('pressed');
  };
}
