import type { CharacterExpression } from '../identity/expression-profile.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';
import {
  CHARACTER_POSES,
  type CharacterMotionPartId,
  type CharacterMotionSample,
  type CharacterMotionState,
  type CharacterPartMotionSample,
  type CharacterPose,
  type CharacterPoseWeights,
} from './motion.js';
import { sampleCharacterFaceMotion } from './face-motion-sampler.js';
import { sampleCharacterFlows } from './flow-motion-sampler.js';
import { sampleCharacterPoseWeights } from './motion-state.js';

type MutablePart = {
  x: number;
  y: number;
  swing: number;
  roll: number;
  foreground: number;
  scaleX: number;
  scaleY: number;
};

type PartDelta = Partial<CharacterPartMotionSample>;

type AutonomicProfile = Readonly<{
  sway: number;
  breath: number;
  blink: number;
  gaze: number;
  arms: number;
  tail: number;
}>;

const PART_IDS: readonly CharacterMotionPartId[] = [
  'torso', 'head', 'arm:left', 'arm:right', 'leg:left', 'leg:right', 'tail',
];

const AUTONOMIC_BY_POSE: Readonly<Record<CharacterPose, AutonomicProfile>> = {
  idle: { sway: 1, breath: 1, blink: 1, gaze: 1, arms: 1, tail: 1 },
  walk: { sway: 0, breath: 0.5, blink: 1, gaze: 0.5, arms: 0, tail: 1.4 },
  run: { sway: 0, breath: 0.45, blink: 1, gaze: 0.15, arms: 0, tail: 2 },
  airborne: { sway: 0, breath: 0.4, blink: 1, gaze: 0.3, arms: 0, tail: 1.4 },
  sit: { sway: 0.6, breath: 1, blink: 1, gaze: 0.8, arms: 0.4, tail: 0.6 },
  sleep: { sway: 0, breath: 2.2, blink: 0, gaze: 0, arms: 0, tail: 0 },
  play: { sway: 0.3, breath: 0.5, blink: 1, gaze: 0.5, arms: 0, tail: 1.3 },
  dance: { sway: 0.2, breath: 0.7, blink: 1, gaze: 0.35, arms: 0.15, tail: 2.1 },
};

function validateTime(time: number): void {
  if (!(time >= 0) || !Number.isFinite(time)) {
    throw new RangeError('Character sample time must be a non-negative finite number');
  }
}

function emptyPart(): MutablePart {
  return { x: 0, y: 0, swing: 0, roll: 0, foreground: 0, scaleX: 0, scaleY: 0 };
}

function createParts(): Record<CharacterMotionPartId, MutablePart> {
  return Object.fromEntries(PART_IDS.map((id) => [id, emptyPart()])) as Record<
    CharacterMotionPartId,
    MutablePart
  >;
}

function addPart(
  parts: Record<CharacterMotionPartId, MutablePart>,
  id: CharacterMotionPartId,
  delta: PartDelta,
  weight = 1,
): void {
  if (weight <= 0) return;
  const part = parts[id];
  part.x += (delta.x ?? 0) * weight;
  part.y += (delta.y ?? 0) * weight;
  part.swing += (delta.swing ?? 0) * weight;
  part.roll += (delta.roll ?? 0) * weight;
  part.foreground += (delta.foreground ?? 0) * weight;
  part.scaleX += ((delta.scaleX ?? 1) - 1) * weight;
  part.scaleY += ((delta.scaleY ?? 1) - 1) * weight;
}

function applyGait(
  parts: Record<CharacterMotionPartId, MutablePart>,
  weight: number,
  speed: number,
  time: number,
  running: boolean,
): void {
  if (weight <= 0.001) return;
  const frequency = running ? 2.7 : 1.6;
  const phase = time * frequency * Math.PI * 2;
  const swing = Math.sin(phase);
  const amplitude = running ? 1.7 : 1;
  const bounce = Math.abs(swing) * (running ? 0.06 : 0.03) * amplitude;
  const effort = 0.4 + speed * 0.6;
  const legSwing = swing * (running ? 0.5 : 0.28) * effort;
  const armSwing = swing * (running ? 0.6 : 0.3) * effort;
  addPart(parts, 'leg:left', { y: Math.max(0, swing) * 0.08, swing: legSwing }, weight);
  addPart(parts, 'leg:right', { y: Math.max(0, -swing) * 0.08, swing: -legSwing }, weight);
  addPart(parts, 'arm:left', { swing: -armSwing }, weight);
  addPart(parts, 'arm:right', { swing: armSwing }, weight);
  addPart(parts, 'torso', { y: bounce, roll: -swing * (running ? 0.03 : 0.018) }, weight);
  addPart(parts, 'head', {
    y: bounce * 1.25 + Math.sin(phase * 2 - 0.9) * 0.015 * amplitude,
    roll: swing * 0.035,
  }, weight);
  addPart(parts, 'tail', { roll: -swing * 0.24 }, weight);
}

function applyAirborne(
  parts: Record<CharacterMotionPartId, MutablePart>,
  weight: number,
  time: number,
): void {
  if (weight <= 0.001) return;
  const drift = Math.sin(time * 3.4) * 0.04;
  addPart(parts, 'leg:left', { swing: 0.24 + drift }, weight);
  addPart(parts, 'leg:right', { swing: -0.16 - drift }, weight);
  addPart(parts, 'arm:left', { swing: -0.52 + drift }, weight);
  addPart(parts, 'arm:right', { swing: 0.52 - drift }, weight);
  addPart(parts, 'head', { y: 0.04, roll: drift * 0.3 }, weight);
  addPart(parts, 'tail', { roll: 0.28 + drift * 1.7 }, weight);
}

function applySit(parts: Record<CharacterMotionPartId, MutablePart>, weight: number): void {
  if (weight <= 0.001) return;
  addPart(parts, 'torso', { y: -0.18, scaleX: 1.04, scaleY: 0.95 }, weight);
  addPart(parts, 'leg:left', { y: 0.08, roll: -1.05 }, weight);
  addPart(parts, 'leg:right', { y: 0.08, roll: 1.05 }, weight);
  addPart(parts, 'arm:left', { roll: -0.18 }, weight);
  addPart(parts, 'arm:right', { roll: 0.18 }, weight);
  addPart(parts, 'head', { y: -0.04, roll: 0.04 }, weight);
  addPart(parts, 'tail', { roll: -0.2 }, weight);
}

function applySleep(
  parts: Record<CharacterMotionPartId, MutablePart>,
  weight: number,
  time: number,
): void {
  if (weight <= 0.001) return;
  applySit(parts, weight);
  addPart(parts, 'torso', { y: -0.05, scaleX: 1.03, scaleY: 0.97 }, weight);
  addPart(parts, 'head', {
    x: 0.04,
    y: -0.13,
    roll: 0.14 + Math.sin(time * 0.8) * 0.012,
  }, weight);
}

function applyPlay(
  parts: Record<CharacterMotionPartId, MutablePart>,
  weight: number,
  time: number,
): void {
  if (weight <= 0.001) return;
  const phase = time * 6.2;
  const wave = Math.sin(phase);
  const hop = Math.abs(wave);
  addPart(parts, 'torso', {
    x: Math.sin(phase * 0.5) * 0.025,
    y: hop * 0.1,
    roll: Math.sin(phase * 0.5) * 0.06,
  }, weight);
  addPart(parts, 'head', {
    y: Math.sin(phase + 2.1) * 0.035 + hop * 0.08,
    roll: Math.sin(phase * 0.33) * 0.1,
  }, weight);
  addPart(parts, 'arm:left', {
    roll: 0.55 + wave * 0.5,
    foreground: 0.52,
  }, weight);
  addPart(parts, 'arm:right', {
    roll: -0.55 - Math.sin(phase + 2.3) * 0.5,
    foreground: 0.52,
  }, weight);
  addPart(parts, 'leg:left', { y: Math.max(0, wave) * 0.08, roll: wave * 0.18 }, weight);
  addPart(parts, 'leg:right', { y: Math.max(0, -wave) * 0.08, roll: -wave * 0.18 }, weight);
}

/** A deliberately overcommitted disco loop: one hand up, one knee up, dignity down. */
type MacarenaArmTarget = Readonly<{
  leftRoll: number;
  rightRoll: number;
  leftSwing: number;
  rightSwing: number;
  leftForeground: number;
  rightForeground: number;
}>;

const MACARENA_COUNTS_PER_SECOND = 4.4;
const MACARENA_STEPS: readonly MacarenaArmTarget[] = Object.freeze([
  Object.freeze({ leftRoll: -0.26, rightRoll: 1.2, leftSwing: 0, rightSwing: -0.08, leftForeground: 0.42, rightForeground: 0.55 }),
  Object.freeze({ leftRoll: -1.2, rightRoll: 1.2, leftSwing: 0.08, rightSwing: -0.08, leftForeground: 0.55, rightForeground: 0.55 }),
  Object.freeze({ leftRoll: -1.2, rightRoll: 1.65, leftSwing: 0.08, rightSwing: -0.18, leftForeground: 0.55, rightForeground: 0.68 }),
  Object.freeze({ leftRoll: -1.65, rightRoll: 1.65, leftSwing: 0.18, rightSwing: -0.18, leftForeground: 0.68, rightForeground: 0.68 }),
  Object.freeze({ leftRoll: -1.65, rightRoll: -1.05, leftSwing: 0.18, rightSwing: 0.22, leftForeground: 0.68, rightForeground: 0.72 }),
  Object.freeze({ leftRoll: 1.05, rightRoll: -1.05, leftSwing: -0.22, rightSwing: 0.22, leftForeground: 0.72, rightForeground: 0.72 }),
  Object.freeze({ leftRoll: 1.05, rightRoll: 1.8, leftSwing: -0.22, rightSwing: -0.28, leftForeground: 0.72, rightForeground: 0.8 }),
  Object.freeze({ leftRoll: -1.8, rightRoll: 1.8, leftSwing: 0.28, rightSwing: -0.28, leftForeground: 0.8, rightForeground: 0.8 }),
  Object.freeze({ leftRoll: -1.8, rightRoll: 0.34, leftSwing: 0.28, rightSwing: -0.22, leftForeground: 0.8, rightForeground: 0.46 }),
  Object.freeze({ leftRoll: -0.34, rightRoll: 0.34, leftSwing: 0.18, rightSwing: -0.22, leftForeground: 0.46, rightForeground: 0.46 }),
  Object.freeze({ leftRoll: -0.34, rightRoll: 0.82, leftSwing: 0.18, rightSwing: -0.52, leftForeground: 0.36, rightForeground: 0.22 }),
  Object.freeze({ leftRoll: -0.82, rightRoll: 0.82, leftSwing: 0.52, rightSwing: -0.52, leftForeground: 0.22, rightForeground: 0.22 }),
  Object.freeze({ leftRoll: -0.82, rightRoll: 0.82, leftSwing: 0.52, rightSwing: -0.52, leftForeground: 0.22, rightForeground: 0.22 }),
  Object.freeze({ leftRoll: -0.82, rightRoll: 0.82, leftSwing: 0.52, rightSwing: -0.52, leftForeground: 0.22, rightForeground: 0.22 }),
  Object.freeze({ leftRoll: -0.82, rightRoll: 0.82, leftSwing: 0.52, rightSwing: -0.52, leftForeground: 0.22, rightForeground: 0.22 }),
  Object.freeze({ leftRoll: -0.82, rightRoll: 0.82, leftSwing: 0.52, rightSwing: -0.52, leftForeground: 0.22, rightForeground: 0.22 }),
]);

function smoothStep(value: number): number {
  return value * value * (3 - 2 * value);
}

function interpolateMacarenaTarget(
  current: MacarenaArmTarget,
  next: MacarenaArmTarget,
  amount: number,
): MacarenaArmTarget {
  const mix = (left: number, right: number): number => left + (right - left) * amount;
  return {
    leftRoll: mix(current.leftRoll, next.leftRoll),
    rightRoll: mix(current.rightRoll, next.rightRoll),
    leftSwing: mix(current.leftSwing, next.leftSwing),
    rightSwing: mix(current.rightSwing, next.rightSwing),
    leftForeground: mix(current.leftForeground, next.leftForeground),
    rightForeground: mix(current.rightForeground, next.rightForeground),
  };
}

/** A cheeky Macarena-style sixteen-count loop with deliberately loose elbows. */
function applyDance(
  parts: Record<CharacterMotionPartId, MutablePart>,
  weight: number,
  time: number,
): void {
  if (weight <= 0.001) return;
  const stepCount = time * MACARENA_COUNTS_PER_SECOND;
  const cyclePosition = ((stepCount % MACARENA_STEPS.length) + MACARENA_STEPS.length)
    % MACARENA_STEPS.length;
  const stepIndex = Math.floor(cyclePosition);
  const stepProgress = smoothStep(cyclePosition - stepIndex);
  const current = MACARENA_STEPS[stepIndex] as MacarenaArmTarget;
  const next = MACARENA_STEPS[(stepIndex + 1) % MACARENA_STEPS.length] as MacarenaArmTarget;
  const target = interpolateMacarenaTarget(current, next, stepProgress);
  const beat = Math.sin(stepCount * Math.PI);
  const leftTap = Math.max(0, beat);
  const rightTap = Math.max(0, -beat);
  const hip = cyclePosition >= 12
    ? Math.sin((cyclePosition - 12) * Math.PI)
    : Math.sin(stepCount * Math.PI) * 0.28;
  const hop = Math.abs(beat);

  addPart(parts, 'torso', {
    x: hip * 0.12,
    y: hop * 0.045 + Math.abs(hip) * 0.035,
    roll: -hip * 0.25,
    scaleX: 1 - hop * 0.025,
    scaleY: 1 + hop * 0.055 + Math.abs(hip) * 0.035,
  }, weight);
  addPart(parts, 'head', {
    x: -hip * 0.05,
    y: hop * 0.04,
    roll: hip * 0.18 + Math.sin(stepCount * Math.PI * 0.5) * 0.06,
  }, weight);
  addPart(parts, 'arm:left', {
    swing: target.leftSwing,
    roll: target.leftRoll,
    foreground: target.leftForeground,
  }, weight);
  addPart(parts, 'arm:right', {
    swing: target.rightSwing,
    roll: target.rightRoll,
    foreground: target.rightForeground,
  }, weight);
  addPart(parts, 'leg:left', {
    y: leftTap * 0.085,
    swing: beat * 0.2 + leftTap * 0.14,
    roll: -hip * 0.2,
  }, weight);
  addPart(parts, 'leg:right', {
    y: rightTap * 0.085,
    swing: -beat * 0.2 - rightTap * 0.14,
    roll: hip * 0.2,
  }, weight);
  addPart(parts, 'tail', {
    roll: Math.sin(stepCount * Math.PI * 0.7 + 0.8) * 0.4 + hip * 0.35,
  }, weight);
}

function blendedAutonomicProfile(weights: CharacterPoseWeights): AutonomicProfile {
  const result = { sway: 0, breath: 0, blink: 0, gaze: 0, arms: 0, tail: 0 };
  for (const pose of CHARACTER_POSES) {
    const source = AUTONOMIC_BY_POSE[pose];
    const weight = weights[pose];
    result.sway += source.sway * weight;
    result.breath += source.breath * weight;
    result.blink += source.blink * weight;
    result.gaze += source.gaze * weight;
    result.arms += source.arms * weight;
    result.tail += source.tail * weight;
  }
  return Object.freeze(result);
}

function applyAutonomicMotion(
  parts: Record<CharacterMotionPartId, MutablePart>,
  profile: AutonomicProfile,
  expression: CharacterExpression,
  time: number,
): void {
  const breathTempo = 1.15 / (1 + Math.max(0, profile.breath - 1) * 0.55);
  const breath = Math.sin(time * breathTempo);
  const swayX = Math.sin(time * 0.55) * 0.012 * profile.sway;
  const swayY = Math.cos(time * 0.37) * 0.007 * profile.sway;
  addPart(parts, 'torso', {
    x: swayX * 0.25,
    y: breath * 0.016 * profile.breath,
    scaleX: 1 - breath * 0.009 * profile.breath,
    scaleY: 1 + breath * 0.022 * profile.breath,
  });
  addPart(parts, 'head', {
    x: swayX,
    y: swayY + breath * 0.011 * profile.breath,
    roll: Math.sin(time * 0.6) * 0.017 * profile.sway,
    scaleX: 1 + breath * 0.004 * profile.breath,
    scaleY: 1 + breath * 0.004 * profile.breath,
  });
  addPart(parts, 'arm:left', { roll: Math.sin(time * 0.8 + 1.7) * 0.04 * profile.arms });
  addPart(parts, 'arm:right', { roll: -Math.sin(time * 0.8) * 0.04 * profile.arms });
  addPart(parts, 'tail', {
    roll: Math.sin(time * 2.6) * 0.13 * profile.tail
      + Math.sin(time * 0.47) * 0.07 * profile.tail,
  });
  if (expression !== 'crying') return;
  const sob = Math.sin(time * 5.2);
  const heave = Math.max(0, Math.sin(time * 2.6));
  addPart(parts, 'torso', { y: -Math.abs(sob) * 0.014, scaleY: 1 + heave * 0.024 });
  addPart(parts, 'head', { y: -Math.abs(sob) * 0.024, roll: sob * 0.024 });
  addPart(parts, 'arm:left', { roll: 0.16 + heave * 0.12, foreground: 0.72 });
  addPart(parts, 'arm:right', { roll: -0.16 - heave * 0.12, foreground: 0.72 });
}

function freezeParts(
  parts: Record<CharacterMotionPartId, MutablePart>,
): Readonly<Record<CharacterMotionPartId, CharacterPartMotionSample>> {
  return Object.freeze(Object.fromEntries(PART_IDS.map((id) => {
    const part = parts[id];
    return [id, Object.freeze({
      x: part.x,
      y: part.y,
      swing: part.swing,
      roll: part.roll,
      foreground: part.foreground,
      scaleX: 1 + part.scaleX,
      scaleY: 1 + part.scaleY,
    })];
  })) as Record<CharacterMotionPartId, CharacterPartMotionSample>);
}

/** Pure projection-independent character motion evaluated at absolute time. */
export function sampleCharacterMotion(
  identity: CharacterIdentityRecipe,
  state: CharacterMotionState,
  time: number,
): CharacterMotionSample {
  validateTime(time);
  const weights = sampleCharacterPoseWeights(state, time);
  const expression = weights.sleep > 0.55 ? 'sleeping' : state.command.expression;
  const autonomic = blendedAutonomicProfile(weights);
  const parts = createParts();
  applyGait(parts, weights.walk, state.command.speed, time, false);
  applyGait(parts, weights.run, state.command.speed, time, true);
  applyAirborne(parts, weights.airborne, time);
  applySit(parts, weights.sit);
  applySleep(parts, weights.sleep, time);
  applyPlay(parts, weights.play, time);
  applyDance(parts, weights.dance, time);
  applyAutonomicMotion(parts, autonomic, expression, time);

  return Object.freeze({
    time,
    command: state.command,
    poseWeights: weights,
    parts: freezeParts(parts),
    face: sampleCharacterFaceMotion(identity, state, time, expression, autonomic),
    flows: sampleCharacterFlows(identity, expression, time),
  });
}
