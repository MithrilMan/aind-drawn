import { CHARACTER_EXPRESSIONS } from '../identity/expression-profile.js';
import {
  CHARACTER_POSES,
  type CharacterGazeIntent,
  type CharacterMotion,
  type CharacterMotionCommand,
  type CharacterMotionOptions,
  type CharacterMotionState,
  type CharacterPose,
  type CharacterPoseWeights,
} from './motion.js';

const TRANSITION_SECONDS = 0.38;
const CHARACTER_WINKS: readonly unknown[] = Object.freeze([null, 'left', 'right']);

function finiteTime(time: number): void {
  if (!(time >= 0) || !Number.isFinite(time)) {
    throw new RangeError('Character motion time must be a non-negative finite number');
  }
}

function oneHot(pose: CharacterPose): CharacterPoseWeights {
  return Object.freeze(Object.fromEntries(
    CHARACTER_POSES.map((candidate) => [candidate, candidate === pose ? 1 : 0]),
  ) as Record<CharacterPose, number>);
}

function freezeGaze(gaze: CharacterGazeIntent | null): CharacterGazeIntent | null {
  if (gaze === null) return null;
  if (![gaze.x, gaze.y, gaze.headFollow].every(Number.isFinite)) {
    throw new RangeError('Character gaze values must be finite');
  }
  if (Math.abs(gaze.x) > 1 || Math.abs(gaze.y) > 1 || gaze.headFollow < 0 || gaze.headFollow > 1) {
    throw new RangeError('Character gaze must stay within its normalized range');
  }
  return Object.freeze({ x: gaze.x, y: gaze.y, headFollow: gaze.headFollow });
}

function validateCommand(command: CharacterMotionCommand): void {
  if (!CHARACTER_POSES.includes(command.pose)) throw new RangeError(`Unknown character pose: ${command.pose}`);
  if (!(command.speed >= 0 && command.speed <= 1) || !Number.isFinite(command.speed)) {
    throw new RangeError('Character speed must be between zero and one');
  }
  if (!CHARACTER_EXPRESSIONS.includes(command.expression)) {
    throw new RangeError(`Unknown character expression: ${command.expression}`);
  }
  if (!CHARACTER_WINKS.includes(command.wink)) {
    throw new RangeError(`Unknown character wink: ${String(command.wink)}`);
  }
}

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

export function sampleCharacterPoseWeights(
  state: CharacterMotionState,
  time: number,
): CharacterPoseWeights {
  finiteTime(time);
  const elapsed = Math.max(0, time - state.transition.startedAt);
  const progress = state.transition.duration === 0
    ? 1
    : Math.min(1, elapsed / state.transition.duration);
  const amount = smoothStep(progress);
  const weights = {} as Record<CharacterPose, number>;
  let total = 0;
  for (const pose of CHARACTER_POSES) {
    const target = pose === state.transition.target ? 1 : 0;
    const weight = state.transition.fromWeights[pose]
      + (target - state.transition.fromWeights[pose]) * amount;
    weights[pose] = weight;
    total += weight;
  }
  if (total <= 1e-9) return oneHot('idle');
  for (const pose of CHARACTER_POSES) weights[pose] /= total;
  return Object.freeze(weights);
}

export function createCharacterMotionState(
  options: CharacterMotionOptions = {},
): CharacterMotionState {
  const command: CharacterMotionCommand = Object.freeze({
    pose: 'idle',
    speed: 0,
    facing: 1,
    talking: false,
    expression: 'idle',
    gaze: null,
    wink: null,
  });
  return Object.freeze({
    command,
    transition: Object.freeze({
      fromWeights: oneHot('idle'),
      target: 'idle',
      startedAt: 0,
      duration: TRANSITION_SECONDS,
    }),
    autoBlink: options.autoBlink ?? true,
    autoGaze: options.autoGaze ?? true,
  });
}

/** Applies an idempotent command and anchors a new pose blend at absolute time. */
export function setCharacterMotion(
  state: CharacterMotionState,
  motion: CharacterMotion,
  time: number,
): CharacterMotionState {
  finiteTime(time);
  const command: CharacterMotionCommand = Object.freeze({
    pose: motion.pose ?? state.command.pose,
    speed: motion.speed ?? state.command.speed,
    facing: motion.facing ?? state.command.facing,
    talking: motion.talking ?? state.command.talking,
    expression: motion.expression ?? state.command.expression,
    gaze: motion.gaze === undefined ? state.command.gaze : freezeGaze(motion.gaze),
    wink: motion.wink === undefined ? state.command.wink : motion.wink,
  });
  validateCommand(command);
  const unchanged = command.pose === state.command.pose
    && command.speed === state.command.speed
    && command.facing === state.command.facing
    && command.talking === state.command.talking
    && command.expression === state.command.expression
    && command.gaze?.x === state.command.gaze?.x
    && command.gaze?.y === state.command.gaze?.y
    && command.gaze?.headFollow === state.command.gaze?.headFollow
    && (command.gaze === null) === (state.command.gaze === null)
    && command.wink === state.command.wink;
  if (unchanged) return state;
  const transition = command.pose === state.command.pose
    ? state.transition
    : Object.freeze({
      fromWeights: sampleCharacterPoseWeights(state, time),
      target: command.pose,
      startedAt: time,
      duration: TRANSITION_SECONDS,
    });
  return Object.freeze({
    command,
    transition,
    autoBlink: state.autoBlink,
    autoGaze: state.autoGaze,
  });
}
