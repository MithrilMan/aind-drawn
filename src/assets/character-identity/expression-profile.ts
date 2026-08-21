export const CHARACTER_EXPRESSIONS = [
  'idle',
  'happy',
  'angry',
  'sad',
  'surprised',
  'scared',
  'crying',
  'sleeping',
] as const;

export type CharacterExpression = typeof CHARACTER_EXPRESSIONS[number];

export type CharacterExpressionProfile = Readonly<{
  expression: CharacterExpression;
  eyes: Readonly<{
    /** Uniform size multiplier around the authored rest construction. */
    scale: number;
    /** Vertical opening ratio; zero is closed and one is fully open. */
    openness: number;
  }>;
  brows: Readonly<{
    /** Vertical offset in head half-height units; positive points up. */
    lift: number;
    /** Angle in radians; positive raises each eyebrow's inner endpoint. */
    innerRaise: number;
  }>;
}>;

function profile(
  expression: CharacterExpression,
  eyeScale: number,
  eyeOpenness: number,
  browLift: number,
  browInnerRaise: number,
): CharacterExpressionProfile {
  return Object.freeze({
    expression,
    eyes: Object.freeze({ scale: eyeScale, openness: eyeOpenness }),
    brows: Object.freeze({ lift: browLift, innerRaise: browInnerRaise }),
  });
}

const CHARACTER_EXPRESSION_PROFILES: Readonly<Record<
  CharacterExpression,
  CharacterExpressionProfile
>> = Object.freeze({
  idle: profile('idle', 1, 1, 0, 0),
  happy: profile('happy', 1, 0.78, 0.1, 0),
  // Anger is carried by a compressed eye and lowered inner brow endpoints.
  // The brow centre remains above the eye instead of intersecting the pupil.
  angry: profile('angry', 1, 0.76, 0.08, -0.28),
  sad: profile('sad', 1, 0.94, 0.1, 0.38),
  surprised: profile('surprised', 1.13, 1, 0.24, 0),
  scared: profile('scared', 1.16, 1, 0.3, 0.22),
  crying: profile('crying', 1, 0.48, 0.12, 0.44),
  sleeping: profile('sleeping', 1, 0.06, 0.08, 0.24),
});

/**
 * Representation-neutral facial pose. Raster and solid adapters translate
 * these semantic values into their own coordinate systems without redefining
 * what an expression means.
 */
export function createCharacterExpressionProfile(
  expression: CharacterExpression,
): CharacterExpressionProfile {
  return CHARACTER_EXPRESSION_PROFILES[expression];
}
