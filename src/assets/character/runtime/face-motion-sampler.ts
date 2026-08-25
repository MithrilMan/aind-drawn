import { Random, combineSeed } from '../../../core/random.js';
import {
  createCharacterExpressionProfile,
  type CharacterExpression,
} from '../identity/expression-profile.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';
import type {
  CharacterFaceMotionSample,
  CharacterGazeIntent,
  CharacterMotionState,
} from './motion.js';

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function sampleBlink(seed: number, time: number, enabled: boolean, amplitude: number): number {
  if (!enabled || amplitude <= 0.25) return 1;
  const slotSeconds = 4;
  const slot = Math.floor(time / slotSeconds);
  const random = new Random(combineSeed(seed, `character:motion:blink:${slot}`));
  const start = slot * slotSeconds + random.float(0.7, 2.9);
  const duration = random.float(0.1, 0.16);
  if (time < start || time > start + duration) return 1;
  return 1 - Math.sin((time - start) / duration * Math.PI);
}

function sampleAutonomousGaze(seed: number, time: number): CharacterGazeIntent {
  const slotSeconds = 6;
  const slot = Math.floor(time / slotSeconds);
  const random = new Random(combineSeed(seed, `character:motion:gaze:${slot}`));
  const start = slot * slotSeconds + random.float(0.8, 2.1);
  const duration = random.float(0.7, 1.5);
  const local = time - start;
  if (local < 0 || local > duration) return Object.freeze({ x: 0, y: 0, headFollow: 0 });
  const edge = Math.min(1, local / 0.18, (duration - local) / 0.24);
  const amount = smoothStep(Math.max(0, edge));
  const horizontal = random.float(-1, 1);
  const x = Math.abs(horizontal) < 0.24 ? Math.sign(horizontal || 1) * 0.55 : horizontal;
  return Object.freeze({
    x: x * amount,
    y: random.float(-0.75, 0.75) * amount,
    headFollow: (random.chance(0.45) ? 1 : 0) * amount,
  });
}

function sampleGaze(
  state: CharacterMotionState,
  time: number,
  amplitude: number,
  seed: number,
): CharacterGazeIntent {
  const gaze = state.command.gaze ?? (
    state.autoGaze && amplitude > 0.2
      ? sampleAutonomousGaze(seed, time)
      : Object.freeze({ x: 0, y: 0, headFollow: 0 })
  );
  return Object.freeze({
    x: gaze.x * amplitude,
    y: gaze.y * amplitude,
    headFollow: gaze.headFollow,
  });
}

export function sampleCharacterFaceMotion(
  identity: CharacterIdentityRecipe,
  state: CharacterMotionState,
  time: number,
  expression: CharacterExpression,
  autonomic: Readonly<{ blink: number; gaze: number }>,
  coughImpulse = 0,
): CharacterFaceMotionSample {
  const gaze = sampleGaze(state, time, autonomic.gaze, identity.seed);
  const profile = createCharacterExpressionProfile(expression);
  const autonomousBlink = expression === 'sleeping'
    ? 0
    : sampleBlink(identity.seed, time, state.autoBlink, autonomic.blink);
  const blink = coughImpulse > 0.08 ? 0 : autonomousBlink;
  const eyeState = expression === 'sleeping' || blink < 0.35
    ? 'closed'
    : gaze.x < -0.25 ? 'left' : gaze.x > 0.25 ? 'right' : 'open';
  const mouth = expression === 'sleeping'
    ? 'sleeping'
    : coughImpulse > 0.08 || (state.command.talking && Math.sin(time * 13) > 0.15)
      ? 'open'
      : expression;
  return Object.freeze({
    expression,
    mouth,
    mouthOpenness: coughImpulse > 0.08 ? 0.68 : 1,
    eyeState,
    eyeScale: profile.eyes.scale,
    eyeOpenness: profile.eyes.openness,
    blink,
    gaze,
    browLift: profile.brows.lift,
    browInnerRaise: profile.brows.innerRaise,
  });
}
