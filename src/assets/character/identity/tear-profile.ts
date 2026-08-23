import type { Point } from '../../../core/geometry.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterTearComponentId = 'stream' | 'drop' | 'bead';
export type CharacterTearSide = 'left' | 'right';
export type CharacterTearMotionId = `tear:${CharacterTearSide}:${CharacterTearComponentId}`;

export type CharacterTearComponent = Readonly<{
  id: CharacterTearComponentId;
  /** Tear-local head-radius units. Positive X points outwards; positive Y points up. */
  offset: Point;
  /** Component-local head-radius units, centred around `offset`. */
  outline: readonly Point[];
  /** Normalized phase offset used by flowing components. */
  phase: number;
  /** Head-radius displacement over one flow cycle. */
  travel: Point;
  /** Fractional scale variation used to keep the liquid alive. */
  pulse: number;
}>;

export type CharacterTearProfile = Readonly<{
  width: number;
  length: number;
  attachmentClearanceInEyeRadii: number;
  components: readonly CharacterTearComponent[];
}>;

function freezePoints(points: readonly Point[]): readonly Point[] {
  return Object.freeze(points.map(([x, y]) => Object.freeze([x, y] as const)));
}

function component(
  id: CharacterTearComponentId,
  offset: Point,
  outline: readonly Point[],
  phase: number,
  travel: Point,
  pulse: number,
): CharacterTearComponent {
  return Object.freeze({
    id,
    offset: Object.freeze(offset),
    outline: freezePoints(outline),
    phase,
    travel: Object.freeze(travel),
    pulse,
  });
}

function ellipse(width: number, height: number, count = 18): readonly Point[] {
  return Array.from({ length: count }, (_, index): Point => {
    const angle = index / count * Math.PI * 2;
    return [Math.cos(angle) * width, Math.sin(angle) * height];
  });
}

/**
 * Representation-neutral wet-tear gesture. A stream remains attached to the
 * lower eyelid while a heavier drop and a small flung bead cycle independently.
 * Raster and solid adapters project these authored components without
 * inventing their own tear anatomy.
 */
export function createCharacterTearProfile(
  identity: CharacterIdentityRecipe,
): CharacterTearProfile {
  const width = 0.042 + identity.eyes.size * 0.014;
  const length = 0.19 + identity.eyes.size * 0.05;
  const streamHeight = length * 0.72;
  const streamHalfWidth = width * 0.64;
  const dropWidth = width * 1.08;
  const dropHeight = length * 0.19;
  const beadWidth = width * 0.62;
  const beadHeight = length * 0.105;

  return Object.freeze({
    width,
    length,
    attachmentClearanceInEyeRadii: 0.1,
    components: Object.freeze([
      component(
        'stream',
        [0, -streamHeight * 0.5],
        [
          [-streamHalfWidth * 0.42, streamHeight * 0.5],
          [streamHalfWidth * 0.34, streamHeight * 0.5],
          [streamHalfWidth * 0.7, streamHeight * 0.2],
          [streamHalfWidth * 0.92, -streamHeight * 0.18],
          [streamHalfWidth * 0.52, -streamHeight * 0.46],
          [0, -streamHeight * 0.5],
          [-streamHalfWidth * 0.58, -streamHeight * 0.42],
          [-streamHalfWidth * 0.82, -streamHeight * 0.08],
          [-streamHalfWidth * 0.68, streamHeight * 0.25],
        ],
        0,
        [0, 0],
        0.055,
      ),
      component(
        'drop',
        [width * 0.16, -length * 0.82],
        [
          [0, dropHeight],
          [dropWidth * 0.7, dropHeight * 0.32],
          [dropWidth, -dropHeight * 0.3],
          [dropWidth * 0.62, -dropHeight * 0.82],
          [0, -dropHeight],
          [-dropWidth * 0.66, -dropHeight * 0.78],
          [-dropWidth, -dropHeight * 0.24],
          [-dropWidth * 0.62, dropHeight * 0.34],
        ],
        0.14,
        [width * 0.34, -length * 0.7],
        0.16,
      ),
      component(
        'bead',
        [width * 1.95, -length * 0.48],
        ellipse(beadWidth, beadHeight),
        0.62,
        [width * 1.65, -length * 0.92],
        0.22,
      ),
    ]),
  });
}
