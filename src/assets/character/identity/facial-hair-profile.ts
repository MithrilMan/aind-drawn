import type { Point } from '../../../core/geometry.js';
import { characterMouthCenterY } from './head-shape.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterFacialHairComponent = Readonly<{
  id: 'moustache:left' | 'moustache:right';
  outline: readonly Point[];
  spatial: Readonly<{
    kind: 'volume';
    center: Point;
    radii: readonly [x: number, y: number, depth: number];
    exponent: number;
  }>;
}>;

export type CharacterFacialHairProfile = Readonly<{
  style: Exclude<CharacterIdentityRecipe['facialHair']['style'], 'none'>;
  beard: Readonly<{
    outline: readonly Point[];
    spatial: Readonly<{
      kind: 'volume-ring';
      center: Point;
      radii: readonly [x: number, y: number];
      depth: number;
      exponent: number;
    }>;
  }>;
  components: readonly CharacterFacialHairComponent[];
  opening: Readonly<{
    outline: readonly Point[];
    spatial: Readonly<{
      kind: 'aperture';
      center: Point;
      radii: readonly [x: number, y: number];
    }>;
  }>;
}>;

function superellipse(
  center: Point,
  radii: readonly [x: number, y: number],
  exponent: number,
  count = 28,
): readonly Point[] {
  return Object.freeze(Array.from({ length: count }, (_, index): Point => {
    const angle = index / count * Math.PI * 2;
    const signedPower = (value: number): number => (
      Math.sign(value) * Math.abs(value) ** (2 / exponent)
    );
    return Object.freeze([
      center[0] + signedPower(Math.cos(angle)) * radii[0],
      center[1] + signedPower(Math.sin(angle)) * radii[1],
    ] as const);
  }));
}

export function createCharacterFacialHairProfile(
  identity: CharacterIdentityRecipe,
): CharacterFacialHairProfile | null {
  if (identity.facialHair.style === 'none') return null;
  const mouthY = characterMouthCenterY(identity);
  const width = identity.facialHair.width;
  const length = identity.facialHair.length;
  const bulk = identity.facialHair.bulk;
  const beardCenter = Object.freeze([0, mouthY - 0.45 * length] as const);
  const beardRadii = Object.freeze([0.84 * width, 0.75 * length] as const);
  const openingCenter = Object.freeze([0, mouthY] as const);
  const openingRadii = Object.freeze([0.42, 0.2] as const);
  return Object.freeze({
    style: identity.facialHair.style,
    beard: Object.freeze({
      outline: superellipse(beardCenter, beardRadii, 3.1, 32),
      spatial: Object.freeze({
        kind: 'volume-ring',
        center: beardCenter,
        radii: beardRadii,
        depth: 0.72 * bulk,
        exponent: 3.1,
      }),
    }),
    components: Object.freeze([]),
    opening: Object.freeze({
      outline: superellipse(openingCenter, openingRadii, 2.4, 32),
      spatial: Object.freeze({
        kind: 'aperture',
        center: openingCenter,
        radii: openingRadii,
      }),
    }),
  });
}
