import {
  createControlSchema,
  type ControlAxisSample,
  type ControlSnapshot as RuntimeControlSnapshot,
} from '@mithrilman/aind-game-runtime';

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
export type ControlSnapshot = RuntimeControlSnapshot<ControlAxisId, ControlActionId>;

export const PAPER_CIRCUIT_CONTROL_SCHEMA = createControlSchema(
  CONTROL_AXIS_IDS,
  CONTROL_ACTION_IDS,
);

export type ExploreCameraInput = Readonly<{
  orbitX: ControlAxisSample;
  orbitY: ControlAxisSample;
  zoom: ControlAxisSample;
}>;

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
