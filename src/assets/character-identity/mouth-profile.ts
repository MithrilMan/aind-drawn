import type { Point } from '../../core/geometry.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export const CHARACTER_EXPRESSIONS = ['idle', 'happy', 'angry', 'sad', 'surprised'] as const;
export type CharacterExpression = typeof CHARACTER_EXPRESSIONS[number];

export type CharacterMouthProfile = Readonly<{
  expression: CharacterExpression;
  outline: readonly Point[];
  open: boolean;
}>;

function ellipse(width: number, height: number, count = 24): readonly Point[] {
  return Object.freeze(Array.from({ length: count }, (_, index): Point => {
    const angle = index / count * Math.PI * 2;
    return [Math.cos(angle) * width, Math.sin(angle) * height];
  }));
}

function band(
  width: number,
  thickness: number,
  curve: (normalizedX: number) => number,
  count = 14,
): readonly Point[] {
  const edge = (index: number, sign: number): Point => {
    const x = -width + index / (count - 1) * width * 2;
    return [x, curve(x / width) + sign * thickness];
  };
  return Object.freeze([
    ...Array.from({ length: count }, (_, index) => edge(index, 1)),
    ...Array.from({ length: count }, (_, index) => edge(count - 1 - index, -1)),
  ]);
}

function semanticCurve(style: CharacterIdentityRecipe['mouth']['style'], bend: number) {
  if (style === 'zigzag') {
    return (x: number): number => {
      const segment = Math.min(3, Math.floor((x + 1) * 2));
      const local = (x + 1) * 2 - segment;
      const from = segment % 2 === 0 ? bend : -bend;
      const to = -from;
      return from + (to - from) * local;
    };
  }
  if (style === 'cat') {
    return (x: number): number => bend * Math.sin(Math.abs(x) * Math.PI);
  }
  return (x: number): number => bend * (1 - x * x);
}

export function createCharacterMouthProfile(
  mouth: CharacterIdentityRecipe['mouth'],
  expression: CharacterExpression = 'idle',
): CharacterMouthProfile {
  const baseWidth = mouth.width * (mouth.style === 'tiny' ? 0.58 : 1);
  if (expression === 'surprised' || (expression === 'idle' && mouth.style === 'open')) {
    return Object.freeze({
      expression,
      outline: ellipse(baseWidth * 0.62, Math.max(0.12, baseWidth * 0.52)),
      open: true,
    });
  }
  const width = baseWidth * (expression === 'happy' ? 1.12 : expression === 'angry' ? 0.9 : 1);
  const thickness = Math.max(0.018, width * 0.075);
  const bend = expression === 'happy' ? -width * 0.34
    : expression === 'sad' ? width * 0.34
      : expression === 'angry' ? width * 0.14
        : mouth.style === 'smile' || mouth.style === 'cat' ? -width * 0.25
          : mouth.style === 'frown' ? width * 0.25
            : mouth.style === 'zigzag' ? width * 0.16 : 0;
  const style = expression === 'idle' ? mouth.style : 'flat';
  return Object.freeze({
    expression,
    outline: band(width, thickness, semanticCurve(style, bend)),
    open: false,
  });
}
