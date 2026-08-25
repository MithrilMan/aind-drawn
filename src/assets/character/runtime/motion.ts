import type { CharacterExpression } from '../identity/expression-profile.js';
import type { CharacterTearMotionId } from '../identity/tear-profile.js';

export const CHARACTER_POSES = [
  'idle',
  'walk',
  'run',
  'airborne',
  'sit',
  'sleep',
  'cough',
  'play',
  'dance',
] as const;

export type CharacterPose = typeof CHARACTER_POSES[number];
export type CharacterPoseWeights = Readonly<Record<CharacterPose, number>>;

export type CharacterGazeIntent = Readonly<{
  x: number;
  y: number;
  headFollow: number;
}>;

/** Partial command accepted by the immutable character motion state reducer. */
export type CharacterMotion = Readonly<{
  pose?: CharacterPose;
  speed?: number;
  facing?: -1 | 1;
  talking?: boolean;
  expression?: CharacterExpression;
  /** `null` clears a manual gaze and returns control to autonomous motion. */
  gaze?: CharacterGazeIntent | null;
}>;

export type CharacterMotionCommand = Readonly<{
  pose: CharacterPose;
  speed: number;
  facing: -1 | 1;
  talking: boolean;
  expression: CharacterExpression;
  gaze: CharacterGazeIntent | null;
}>;

export type CharacterMotionOptions = Readonly<{
  autoBlink?: boolean;
  autoGaze?: boolean;
}>;

export type CharacterPoseTransition = Readonly<{
  fromWeights: CharacterPoseWeights;
  target: CharacterPose;
  startedAt: number;
  duration: number;
}>;

/** Frozen and serialisable command state; sampling never mutates it. */
export type CharacterMotionState = Readonly<{
  command: CharacterMotionCommand;
  transition: CharacterPoseTransition;
  autoBlink: boolean;
  autoGaze: boolean;
}>;

export type CharacterMotionPartId =
  | 'torso'
  | 'head'
  | 'arm:left'
  | 'arm:right'
  | 'leg:left'
  | 'leg:right'
  | 'tail';

/**
 * Representation-neutral articulated intent. `swing` follows a limb's primary
 * joint axis; `roll` is visible planar lean; `foreground` asks a solid adapter
 * to articulate a crossing limb in front of its carrier volume.
 */
export type CharacterPartMotionSample = Readonly<{
  x: number;
  y: number;
  swing: number;
  roll: number;
  foreground: number;
  scaleX: number;
  scaleY: number;
}>;

export type CharacterFaceMotionSample = Readonly<{
  expression: CharacterExpression;
  mouth: CharacterExpression | 'open';
  /** Relative vertical scale for the selected mouth state. */
  mouthOpenness: number;
  eyeState: 'open' | 'closed' | 'left' | 'right';
  eyeScale: number;
  eyeOpenness: number;
  blink: number;
  gaze: CharacterGazeIntent;
  browLift: number;
  browInnerRaise: number;
}>;

export type CharacterFlowMotionSample = Readonly<{
  id: CharacterTearMotionId;
  active: boolean;
  progress: number;
  scaleX: number;
  scaleY: number;
}>;

export type CharacterMotionSample = Readonly<{
  time: number;
  command: CharacterMotionCommand;
  poseWeights: CharacterPoseWeights;
  parts: Readonly<Record<CharacterMotionPartId, CharacterPartMotionSample>>;
  face: CharacterFaceMotionSample;
  flows: Readonly<Record<CharacterTearMotionId, CharacterFlowMotionSample>>;
}>;
