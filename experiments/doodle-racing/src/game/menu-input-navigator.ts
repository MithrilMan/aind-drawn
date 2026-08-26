import type { ControlSnapshot } from './controls.js';

const AXIS_THRESHOLD = 0.55;
const REPEAT_DELAY_SECONDS = 0.38;
const REPEAT_INTERVAL_SECONDS = 0.11;

type AxisDirection = -1 | 0 | 1;

function axisDirection(value: number): AxisDirection {
  if (value >= AXIS_THRESHOLD) return 1;
  if (value <= -AXIS_THRESHOLD) return -1;
  return 0;
}

/** Turns a digital or analogue axis into deterministic menu steps. */
export class MenuAxisRepeater {
  private direction: AxisDirection = 0;
  private heldSeconds = 0;
  private repeatSeconds = 0;

  public update(value: number, deltaSeconds: number): AxisDirection {
    const next = axisDirection(value);
    if (next === 0) {
      this.reset();
      return 0;
    }
    if (next !== this.direction) {
      this.direction = next;
      this.heldSeconds = 0;
      this.repeatSeconds = 0;
      return next;
    }

    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.heldSeconds += delta;
    if (this.heldSeconds < REPEAT_DELAY_SECONDS) return 0;
    this.repeatSeconds += delta;
    if (this.repeatSeconds < REPEAT_INTERVAL_SECONDS) return 0;
    this.repeatSeconds %= REPEAT_INTERVAL_SECONDS;
    return next;
  }

  public reset(): void {
    this.direction = 0;
    this.heldSeconds = 0;
    this.repeatSeconds = 0;
  }
}

function isAvailable(element: HTMLElement): boolean {
  if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement) {
    return !element.disabled;
  }
  return true;
}

/** Product-owned focus policy over the controller-agnostic control snapshot. */
export class MenuInputNavigator {
  private readonly vertical = new MenuAxisRepeater();
  private readonly horizontal = new MenuAxisRepeater();
  private focusedTarget: HTMLElement | null = null;

  public constructor(
    private readonly root: HTMLElement,
    private readonly defaultTarget: HTMLElement,
  ) {}

  public update(controls: ControlSnapshot, deltaSeconds: number): void {
    this.syncFocusedTarget();
    const verticalDominant = Math.abs(controls.axes.move.value) >= Math.abs(
      controls.axes.turn.value,
    );
    const vertical = this.vertical.update(
      verticalDominant ? controls.axes.move.value : 0,
      deltaSeconds,
    );
    const horizontal = this.horizontal.update(
      verticalDominant ? 0 : controls.axes.turn.value,
      deltaSeconds,
    );
    if (vertical !== 0) {
      this.moveFocus(vertical === 1 ? -1 : 1);
    } else if (horizontal !== 0) {
      this.moveHorizontal(horizontal === 1 ? -1 : 1);
    }
    if (controls.actions.primary.pressed) this.activateCurrent();
  }

  public focusDefault(): void {
    this.reset();
    this.focus(this.defaultTarget);
  }

  public reset(): void {
    this.vertical.reset();
    this.horizontal.reset();
    this.focusedTarget?.removeAttribute('data-menu-focus');
    this.focusedTarget = null;
  }

  private targets(): readonly HTMLElement[] {
    return [...this.root.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input[type="radio"]:checked:not([disabled])',
    )].filter(isAvailable);
  }

  private currentTarget(targets: readonly HTMLElement[]): HTMLElement {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && targets.includes(focused)) return focused;
    return targets.includes(this.defaultTarget) ? this.defaultTarget : (targets[0] ?? this.root);
  }

  private moveFocus(direction: -1 | 1): void {
    const targets = this.targets();
    if (targets.length === 0) return;
    const current = this.currentTarget(targets);
    const index = Math.max(0, targets.indexOf(current));
    const next = targets[(index + direction + targets.length) % targets.length];
    if (next !== undefined) this.focus(next);
  }

  private moveHorizontal(direction: -1 | 1): void {
    const targets = this.targets();
    const current = this.currentTarget(targets);
    if (!(current instanceof HTMLInputElement) || current.type !== 'radio') {
      this.moveFocus(direction);
      return;
    }
    const group = [...this.root.querySelectorAll<HTMLInputElement>(
      'input[type="radio"]:not([disabled])',
    )].filter(({ name }) => name === current.name);
    const index = group.indexOf(current);
    if (index < 0 || group.length === 0) return;
    const next = group[(index + direction + group.length) % group.length];
    next?.click();
    if (next !== undefined) this.focus(next);
  }

  private activateCurrent(): void {
    const targets = this.targets();
    const current = this.currentTarget(targets);
    if (current instanceof HTMLButtonElement || current instanceof HTMLInputElement) {
      current.click();
    }
  }

  private syncFocusedTarget(): void {
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement) || !this.root.contains(focused)) return;
    const isButton = focused instanceof HTMLButtonElement && !focused.disabled;
    const isCheckedRadio = focused instanceof HTMLInputElement
      && focused.type === 'radio'
      && focused.checked
      && !focused.disabled;
    if (!isButton && !isCheckedRadio) return;
    this.markFocused(focused);
  }

  private focus(target: HTMLElement): void {
    target.focus({ preventScroll: true });
    this.markFocused(target);
  }

  private markFocused(target: HTMLElement): void {
    if (target === this.focusedTarget) return;
    this.focusedTarget?.removeAttribute('data-menu-focus');
    target.setAttribute('data-menu-focus', 'true');
    this.focusedTarget = target;
  }
}
