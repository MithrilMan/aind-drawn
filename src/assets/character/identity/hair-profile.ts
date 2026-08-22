import { chaikin, type Point } from '../../../core/geometry.js';
import { characterEyeCenterY } from './head-shape.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterHairTuftCluster = Readonly<{
  count: number;
  azimuthSpread: number;
  elevation: number;
  height: number;
  radius: number;
  stagger: number;
  /** Tangential tip displacement in head-height units. */
  sweep: number;
}>;

export type CharacterHairProfile = Readonly<{
  style: CharacterIdentityRecipe['hair']['style'];
  /** Front silhouette in head-radius units with positive Y pointing up. */
  outline: readonly Point[];
  /** Spatial mounting intent consumed by real-volume representations. */
  spatial: Readonly<
    | {
      kind: 'head-shell';
      /** Fraction of the head circumference covered, centered on the face. */
      azimuthCoverage: number;
      /** Normalized lower edge at the front, sides, and rear of the head. */
      frontHairline: number;
      sideDrop: number;
      rearDrop: number;
      radialClearance: number;
      thickness: number;
      crownLift: number;
      edgeWave: Readonly<{ amplitude: number; count: number; phase: number }>;
      ridgeWave: Readonly<{ amplitude: number; count: number; phase: number }>;
      tufts: CharacterHairTuftCluster | null;
    }
    | {
      kind: 'surface-cluster';
      radialClearance: number;
      tufts: CharacterHairTuftCluster;
    }
    | {
      kind: 'head-wrap';
      bandY: number;
      bandHeight: number;
      peakHeight: number;
      peakCount: number;
      radialClearance: number;
    }
  >;
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
  identity: CharacterIdentityRecipe,
): CharacterHairProfile | null {
  const hair = identity.hair;
  if (hair.style === 'none') return null;
  const crownY = 0.98 + hair.height * 0.16;
  if (hair.style === 'cap') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.86, 0.24], [-0.78, 0.74], [0, crownY], [0.78, 0.74],
        [0.86, 0.24], [0.55, 0.42], [0, 0.34], [-0.55, 0.42],
      ], 2),
      spatial: Object.freeze({
        kind: 'head-shell', azimuthCoverage: 1,
        frontHairline: 0.34, sideDrop: 0.18, rearDrop: 0.08,
        radialClearance: 0.025, thickness: 0.1, crownLift: 0.04,
        edgeWave: Object.freeze({ amplitude: 0.025, count: 4, phase: 0.4 }),
        ridgeWave: Object.freeze({ amplitude: 0.015, count: 5, phase: 0.2 }),
        tufts: null,
      }),
    });
  }
  if (hair.style === 'bob') {
    const featureClearance = characterEyeCenterY(identity)
      + 0.16 * identity.eyes.size
      + (identity.brows.present ? identity.brows.lift * 0.32 : 0);
    const frontHairline = Math.max(0.34, Math.min(0.52, featureClearance));
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.98, -0.62], [-1.02, 0.28], [-0.86, 0.78], [0, crownY],
        [0.86, 0.78], [1.02, 0.28], [0.98, -0.62], [0.9, -0.48],
        [0.88, 0.28], [0, 0.2], [-0.88, 0.28], [-0.9, -0.48],
      ], 2),
      spatial: Object.freeze({
        kind: 'head-shell', azimuthCoverage: 1,
        frontHairline, sideDrop: -0.68, rearDrop: -0.72,
        radialClearance: 0.035, thickness: 0.13, crownLift: 0.035,
        edgeWave: Object.freeze({ amplitude: 0.07, count: 5, phase: -0.6 }),
        ridgeWave: Object.freeze({ amplitude: 0.02, count: 4, phase: 0.1 }),
        tufts: null,
      }),
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
      spatial: Object.freeze({
        kind: 'head-shell', azimuthCoverage: 1,
        frontHairline: 0.16, sideDrop: 0.2, rearDrop: 0.16,
        radialClearance: 0.035, thickness: 0.115, crownLift: 0.055,
        edgeWave: Object.freeze({ amplitude: 0.2, count: 6, phase: 0.35 }),
        ridgeWave: Object.freeze({ amplitude: 0.025, count: 5, phase: 0.2 }),
        tufts: null,
      }),
    });
  }
  if (hair.style === 'tuft') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.42, 0.42], [-0.24, crownY], [-0.06, 0.62], [0.08, crownY * 0.96],
        [0.22, 0.58], [0.43, crownY * 0.9], [0.46, 0.38],
      ], 1),
      spatial: Object.freeze({
        kind: 'surface-cluster', radialClearance: 0.035,
        tufts: Object.freeze({
          count: 3, azimuthSpread: 0.76, elevation: 0.76,
          height: 0.28 + hair.height * 0.18, radius: 0.12, stagger: 0.16, sweep: 0,
        }),
      }),
    });
  }
  if (hair.style === 'quiff') {
    return Object.freeze({
      style: hair.style,
      outline: smooth([
        [-0.52, 0.45], [-0.3, 0.92], [0.02, crownY * 1.08],
        [0.42, crownY * 1.02], [0.72, 0.78], [0.58, 0.48], [0.12, 0.55],
      ], 2),
      spatial: Object.freeze({
        kind: 'surface-cluster', radialClearance: 0.04,
        tufts: Object.freeze({
          count: 5, azimuthSpread: 0.68, elevation: 0.8,
          height: 0.36 + hair.height * 0.24, radius: 0.115, stagger: 0.08, sweep: 0.42,
        }),
      }),
    });
  }
  const crown = hair.style === 'crown';
  return Object.freeze({
    style: hair.style,
    outline: spikeOutline(crown ? 5 : 9, crown ? 0.78 : 0.94, 0.3, crownY - 0.18),
    spatial: crown
      ? Object.freeze({
        kind: 'head-wrap',
        bandY: 0.48,
        bandHeight: 0.18,
        peakHeight: 0.46 + hair.height * 0.3,
        peakCount: 8,
        radialClearance: 0.09,
      })
      : Object.freeze({
        kind: 'head-shell', azimuthCoverage: 1,
        frontHairline: 0.3, sideDrop: 0.22, rearDrop: 0.18,
        radialClearance: 0.04, thickness: 0.12, crownLift: 0.04,
        edgeWave: Object.freeze({ amplitude: 0.055, count: 7, phase: 0.1 }),
        ridgeWave: Object.freeze({ amplitude: 0.02, count: 9, phase: -0.25 }),
        tufts: Object.freeze({
          count: 9, azimuthSpread: Math.PI * 2, elevation: 0.62,
          height: 0.3 + hair.height * 0.22, radius: 0.105, stagger: 0.22, sweep: 0,
        }),
      }),
  });
}
