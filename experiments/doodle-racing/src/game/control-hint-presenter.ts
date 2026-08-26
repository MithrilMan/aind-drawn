import type { ControlDevice } from '@mithrilman/aind-game-runtime';

import {
  CONTROL_HINT_IDS,
  controlHint,
  type ControlHintId,
  type ControlHintMode,
} from './input-controller.js';

function isControlHintId(value: string | undefined): value is ControlHintId {
  return value !== undefined && CONTROL_HINT_IDS.includes(value as ControlHintId);
}

export function controlHintModeFor(device: ControlDevice): ControlHintMode {
  return device === 'gamepad' ? 'gamepad' : 'keyboard';
}

/** Renders binding-adjacent prompts for the latest input device without affecting gameplay. */
export class ControlHintPresenter {
  private readonly elements: readonly HTMLElement[];
  private mode: ControlHintMode | null = null;

  public constructor(private readonly root: HTMLElement) {
    this.elements = [...root.querySelectorAll<HTMLElement>('[data-control-hint]')];
  }

  public update(device: ControlDevice): void {
    const nextMode = controlHintModeFor(device);
    if (nextMode === this.mode) return;
    this.mode = nextMode;
    this.root.dataset.inputDevice = nextMode;
    for (const element of this.elements) {
      const id = element.dataset.controlHint;
      if (isControlHintId(id)) element.textContent = controlHint(id, nextMode);
    }
  }
}
