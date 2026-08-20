import { chaikin, type Point } from '../../core/geometry.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterHairProfile = Readonly<{
  style: CharacterIdentityRecipe['hair']['style'];
  /** Front silhouette in head-radius units with positive Y pointing up. */
  outline: readonly Point[];
  /** Head-depth multiple used by solid adapters. */
  depth: number;
  /** Front face position as a head-depth multiple. */
  front: number;
}>;

function smooth(points: readonly Point[], iterations: number): readonly Point[] {
  return Object.freeze(chaikin(points, true, iterations).map((point) => Object.freeze(point)));
}

function spikeOutline(count: number, spread: number, baseY: number, height: number): readonly Point[] {
  const upper = Array.from({ length: count }, (_, index): Point => {
    const amount = count === 1 ? 0.5 : index / (count - 1);
    const alternating = index % 2 === 0 ? 1 : 0.66;
    return [(amount - 0.5) * spread * 2, baseY + height * alternating];
  });
  return Object.freeze([
    [-spread, baseY] as const,
    ...upper,
    [spread, baseY] as const,
  ]);
}

export function createCharacterHairProfile(
  hair: CharacterIdentityRecipe['hair'],
): CharacterHairProfile | null {
  if (hair.style === 'none') return null;
  const crownY = 0.98 + hair.height * 0.16;
  if (hair.style === 'cap') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.86, 0.24], [-0.78, 0.74], [0, crownY], [0.78, 0.74],
        [0.86, 0.24], [0.55, 0.42], [0, 0.34], [-0.55, 0.42],
      ], 2),
      depth: 1.28,
      front: 1.05,
    });
  }
  if (hair.style === 'bob') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.98, -0.62], [-1.02, 0.28], [-0.86, 0.78], [0, crownY],
        [0.86, 0.78], [1.02, 0.28], [0.98, -0.62], [0.9, -0.48],
        [0.88, 0.28], [0, 0.2], [-0.88, 0.28], [-0.9, -0.48],
      ], 2),
      depth: 1.48,
      front: 1.07,
    });
  }
  if (hair.style === 'fringe') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.9, 0.16], [-0.8, 0.75], [0, crownY], [0.8, 0.75], [0.9, 0.16],
        [0.63, 0.28], [0.47, 0.04], [0.25, 0.34], [0, 0.02],
        [-0.25, 0.34], [-0.48, 0.06], [-0.64, 0.27],
      ], 1),
      depth: 1.38,
      front: 1.09,
    });
  }
  if (hair.style === 'tuft') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.42, 0.42], [-0.24, crownY], [-0.06, 0.62], [0.08, crownY * 0.96],
        [0.22, 0.58], [0.43, crownY * 0.9], [0.46, 0.38],
      ], 1),
      depth: 0.78,
      front: 1.03,
    });
  }
  const crown = hair.style === 'crown';
  return Object.freeze({
    style: hair.style,
    outline: spikeOutline(crown ? 5 : 9, crown ? 0.78 : 0.94, 0.3, crownY - 0.18),
    depth: crown ? 0.72 : 0.94,
    front: crown ? 1.02 : 1.04,
  });
}
