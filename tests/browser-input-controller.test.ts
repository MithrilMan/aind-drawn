import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createControlSchema } from '@mithrilman/aind-game-runtime';
import {
  BrowserInputController,
  type BrowserInputControllerOptions,
} from '@mithrilman/aind-game-runtime/browser';

class FakeClassList {
  private readonly values = new Set<string>();

  public add(value: string): void {
    this.values.add(value);
  }

  public remove(value: string): void {
    this.values.delete(value);
  }
}

class FakeElement extends EventTarget {
  public readonly classList = new FakeClassList();
  public readonly dataset: Record<string, string> = {};
  public readonly isContentEditable = false;
  private readonly capturedPointers = new Set<number>();

  public querySelectorAll(): readonly FakeElement[] {
    return [];
  }

  public setPointerCapture(pointerId: number): void {
    this.capturedPointers.add(pointerId);
  }

  public releasePointerCapture(pointerId: number): void {
    this.capturedPointers.delete(pointerId);
  }

  public hasPointerCapture(pointerId: number): boolean {
    return this.capturedPointers.has(pointerId);
  }
}

class FakeDocument extends EventTarget {
  public hidden = false;
}

type TestAxis = 'move';
type TestAction = 'sprint';

function keyboardEvent(type: 'keydown' | 'keyup', code: string, key: string): KeyboardEvent {
  const event = new Event(type, { cancelable: true });
  Object.defineProperties(event, {
    code: { value: code },
    key: { value: key },
  });
  return event as KeyboardEvent;
}

describe('BrowserInputController keyboard state', () => {
  let fakeWindow: EventTarget;
  let fakeDocument: FakeDocument;
  let controller: BrowserInputController<TestAxis, TestAction>;

  beforeEach(() => {
    fakeWindow = new EventTarget();
    fakeDocument = new FakeDocument();
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('document', fakeDocument);
    vi.stubGlobal('HTMLElement', FakeElement);
    vi.stubGlobal('HTMLInputElement', class extends FakeElement {});
    vi.stubGlobal('HTMLSelectElement', class extends FakeElement {});
    vi.stubGlobal('HTMLTextAreaElement', class extends FakeElement {});
    vi.stubGlobal('HTMLButtonElement', class extends FakeElement {});

    const options: BrowserInputControllerOptions<TestAxis, TestAction> = {
      root: new FakeElement() as unknown as HTMLElement,
      pointerSurface: new FakeElement() as unknown as HTMLElement,
      schema: createControlSchema(['move'], ['sprint']),
      digitalControls: Object.freeze([
        Object.freeze({
          id: 'forward',
          axes: Object.freeze([Object.freeze({ axis: 'move' as const, value: 1 })]),
        }),
        Object.freeze({ id: 'sprint', actions: Object.freeze(['sprint' as const]) }),
      ]),
      keyCodeBindings: Object.freeze({
        KeyW: Object.freeze(['forward']),
        ShiftLeft: Object.freeze(['sprint']),
      }),
      touchControlIds: Object.freeze([]),
    };
    controller = new BrowserInputController(options);
  });

  afterEach(() => {
    controller.dispose();
    vi.unstubAllGlobals();
  });

  it('does not retain a movement key when Shift changes event.key casing', () => {
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', 'w'));
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'ShiftLeft', 'Shift'));
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', 'W'));

    expect(controller.snapshot()).toMatchObject({
      axes: { move: { value: 1 } },
      actions: { sprint: { active: true } },
    });

    fakeWindow.dispatchEvent(keyboardEvent('keyup', 'KeyW', 'W'));
    expect(controller.snapshot()).toMatchObject({
      axes: { move: { value: 0 } },
      actions: { sprint: { active: true } },
    });
  });

  it('releases every held control when the page becomes hidden', () => {
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'KeyW', 'w'));
    fakeWindow.dispatchEvent(keyboardEvent('keydown', 'ShiftLeft', 'Shift'));
    fakeDocument.hidden = true;
    fakeDocument.dispatchEvent(new Event('visibilitychange'));

    expect(controller.snapshot()).toMatchObject({
      axes: { move: { value: 0 } },
      actions: { sprint: { active: false } },
    });
  });
});
