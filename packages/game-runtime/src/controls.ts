import { clamp } from './scalar.js';

export type ControlDevice = 'keyboard' | 'mouse' | 'gamepad' | 'touch';
export type ControlSignalKind = 'digital' | 'analog';
export type ControlAxisBehavior = 'continuous' | 'delta';

export type ControlAxisSample = Readonly<{
  value: number;
  device: ControlDevice | null;
  kind: ControlSignalKind;
  behavior: ControlAxisBehavior;
}>;

export type ControlActionSample = Readonly<{
  active: boolean;
  pressed: boolean;
  device: ControlDevice | null;
}>;

export type ControlSchema<TAxis extends string, TAction extends string> = Readonly<{
  axisIds: readonly TAxis[];
  actionIds: readonly TAction[];
}>;

export type ControlSnapshot<TAxis extends string, TAction extends string> = Readonly<{
  axes: Readonly<Record<TAxis, ControlAxisSample>>;
  actions: Readonly<Record<TAction, ControlActionSample>>;
}>;

export type ControlDeviceFrame<TAxis extends string, TAction extends string> = Readonly<{
  axes: Readonly<Partial<Record<TAxis, ControlAxisSample>>>;
  actions: Readonly<Partial<Record<TAction, boolean>>>;
}>;

function validatedIds<TId extends string>(kind: string, ids: readonly TId[]): readonly TId[] {
  const seen = new Set<string>();
  return Object.freeze(ids.map((id) => {
    if (id.trim().length === 0) throw new RangeError(`${kind} control ID must not be empty`);
    if (seen.has(id)) throw new RangeError(`Duplicate ${kind} control ID: ${id}`);
    seen.add(id);
    return id;
  }));
}

export function createControlSchema<TAxis extends string, TAction extends string>(
  axisIds: readonly TAxis[],
  actionIds: readonly TAction[],
): ControlSchema<TAxis, TAction> {
  return Object.freeze({
    axisIds: validatedIds('axis', axisIds),
    actionIds: validatedIds('action', actionIds),
  });
}

export function controlAxis(
  value: number,
  device: ControlDevice | null = null,
  kind: ControlSignalKind = 'digital',
  behavior: ControlAxisBehavior = 'continuous',
): ControlAxisSample {
  const bounded = Number.isFinite(value) ? clamp(value, -1, 1) : 0;
  return Object.freeze({
    value: bounded,
    device: bounded === 0 ? null : device,
    kind,
    behavior,
  });
}

export function controlAction(
  active: boolean,
  pressed = false,
  device: ControlDevice | null = null,
): ControlActionSample {
  return Object.freeze({
    active,
    pressed: active && pressed,
    device: active ? device : null,
  });
}

export function emptyControlDeviceFrame<
  TAxis extends string,
  TAction extends string,
>(): ControlDeviceFrame<TAxis, TAction> {
  return Object.freeze({ axes: Object.freeze({}), actions: Object.freeze({}) });
}
