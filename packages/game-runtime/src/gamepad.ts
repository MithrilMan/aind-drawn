import {
  controlAxis,
  type ControlAxisSample,
  type ControlSchema,
} from './controls.js';
import { clamp } from './scalar.js';

export type StandardGamepadSample = Readonly<{
  axes: readonly number[];
  buttons: readonly (Readonly<{ pressed: boolean; value: number }> | undefined)[];
}>;

export type StandardGamepadAxisBinding = Readonly<{
  axisIndex?: number;
  invertAxis?: boolean;
  positiveButton?: number;
  negativeButton?: number;
  valueButton?: number;
  deadzone?: number;
}>;

export type StandardGamepadBindings<
  TAxis extends string,
  TAction extends string,
> = Readonly<{
  axes: Readonly<Partial<Record<TAxis, StandardGamepadAxisBinding>>>;
  actions: Readonly<Partial<Record<TAction, readonly number[]>>>;
}>;

export type StandardGamepadFrame<
  TAxis extends string,
  TAction extends string,
> = Readonly<{
  axes: Readonly<Record<TAxis, ControlAxisSample>>;
  actions: Readonly<Record<TAction, boolean>>;
}>;

function buttonPressed(gamepad: StandardGamepadSample, index: number): boolean {
  const button = gamepad.buttons[index];
  return button?.pressed === true || (button?.value ?? 0) > 0.5;
}

function buttonValue(gamepad: StandardGamepadSample, index: number): number {
  return clamp(gamepad.buttons[index]?.value ?? 0, 0, 1);
}

export function applyGamepadDeadzone(value: number, deadzone = 0.14): number {
  if (!Number.isFinite(value)) return 0;
  const boundedDeadzone = clamp(deadzone, 0, 0.99);
  const magnitude = Math.abs(value);
  if (magnitude <= boundedDeadzone) return 0;
  return Math.sign(value) * Math.min(1, (magnitude - boundedDeadzone) / (1 - boundedDeadzone));
}

function axisValue(
  gamepad: StandardGamepadSample,
  binding: StandardGamepadAxisBinding,
): Readonly<{ value: number; digital: boolean }> {
  const positive = binding.positiveButton === undefined
    ? 0
    : Number(buttonPressed(gamepad, binding.positiveButton));
  const negative = binding.negativeButton === undefined
    ? 0
    : Number(buttonPressed(gamepad, binding.negativeButton));
  const digital = positive - negative;
  if (digital !== 0) return Object.freeze({ value: digital, digital: true });
  if (binding.valueButton !== undefined) {
    return Object.freeze({
      value: applyGamepadDeadzone(buttonValue(gamepad, binding.valueButton), binding.deadzone),
      digital: false,
    });
  }
  const source = binding.axisIndex === undefined ? 0 : gamepad.axes[binding.axisIndex] ?? 0;
  const directed = binding.invertAxis === true ? -source : source;
  return Object.freeze({
    value: applyGamepadDeadzone(directed, binding.deadzone),
    digital: false,
  });
}

export function mapStandardGamepad<TAxis extends string, TAction extends string>(
  schema: ControlSchema<TAxis, TAction>,
  bindings: StandardGamepadBindings<TAxis, TAction>,
  gamepad: StandardGamepadSample,
): StandardGamepadFrame<TAxis, TAction> {
  const axes = Object.fromEntries(schema.axisIds.map((id) => {
    const binding = bindings.axes[id];
    if (binding === undefined) return [id, controlAxis(0, null, 'analog')] as const;
    const mapped = axisValue(gamepad, binding);
    return [id, controlAxis(mapped.value, 'gamepad', mapped.digital ? 'digital' : 'analog')] as const;
  })) as Record<TAxis, ReturnType<typeof controlAxis>>;
  const actions = Object.fromEntries(schema.actionIds.map((id) => [
    id,
    bindings.actions[id]?.some((button) => buttonPressed(gamepad, button)) ?? false,
  ])) as Record<TAction, boolean>;
  return Object.freeze({ axes: Object.freeze(axes), actions: Object.freeze(actions) });
}
