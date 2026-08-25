import type { DriveInput, ExploreInput } from './race-model.js';

export const CONTROL_AXIS_IDS = [
  'move',
  'turn',
  'throttle',
  'brake',
  'look-x',
  'look-y',
  'zoom',
] as const;

export const CONTROL_ACTION_IDS = [
  'primary',
  'sprint',
  'interact',
  'pause',
  'menu',
  'reset-camera',
  'reroll',
] as const;

export type ControlAxisId = typeof CONTROL_AXIS_IDS[number];
export type ControlActionId = typeof CONTROL_ACTION_IDS[number];
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

export type ControlSnapshot = Readonly<{
  axes: Readonly<Record<ControlAxisId, ControlAxisSample>>;
  actions: Readonly<Record<ControlActionId, ControlActionSample>>;
}>;

export type ExploreCameraInput = Readonly<{
  orbitX: ControlAxisSample;
  orbitY: ControlAxisSample;
  zoom: ControlAxisSample;
}>;

export function controlAxis(
  value: number,
  device: ControlDevice | null = null,
  kind: ControlSignalKind = 'digital',
  behavior: ControlAxisBehavior = 'continuous',
): ControlAxisSample {
  const bounded = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
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

export function toDriveInput(controls: ControlSnapshot): DriveInput {
  const steering = controls.axes.turn.value;
  const movement = controls.axes.move.value;
  const throttle = Math.max(0, controls.axes.throttle.value, movement);
  const brakePressure = Math.max(0, controls.axes.brake.value, -movement);
  return Object.freeze({
    accelerate: throttle > 0,
    brake: brakePressure > 0,
    left: steering > 0,
    right: steering < 0,
    handbrake: controls.actions.primary.active || controls.actions.sprint.active,
    steeringAxis: steering,
    throttle,
    brakePressure,
  });
}

export function toExploreInput(controls: ControlSnapshot): ExploreInput {
  const movement = controls.axes.move.value;
  const steering = controls.axes.turn.value;
  const throttle = Math.max(controls.axes.throttle.value, movement, 0);
  const brakePressure = Math.max(controls.axes.brake.value, -movement, 0);
  return Object.freeze({
    accelerate: movement > 0,
    brake: movement < 0,
    left: steering > 0,
    right: steering < 0,
    handbrake: controls.actions.primary.active,
    steeringAxis: steering,
    throttle,
    brakePressure,
    run: controls.actions.sprint.active,
    jump: controls.actions.primary.active,
    interact: controls.actions.interact.active,
  });
}

export function toExploreCameraInput(controls: ControlSnapshot): ExploreCameraInput {
  return Object.freeze({
    orbitX: controls.axes['look-x'],
    orbitY: controls.axes['look-y'],
    zoom: controls.axes.zoom,
  });
}
