import type { Point } from '../../core/geometry.js';
import { SeedTree } from '../../core/random.js';
import type { CharacterIdentityRecipe } from './recipe.js';

export type CharacterOutfitMark = Readonly<{
  id: string;
  outline: readonly Point[];
}>;

export type CharacterOutfitProfile = Readonly<{
  style: CharacterIdentityRecipe['outfit']['style'];
  marks: readonly CharacterOutfitMark[];
}>;

function radialOutline(radius: number, points: number, innerScale = 1): readonly Point[] {
  return Object.freeze(Array.from({ length: points }, (_, index): Point => {
    const angle = -Math.PI / 2 + index / points * Math.PI * 2;
    const amount = index % 2 === 0 ? 1 : innerScale;
    return [Math.cos(angle) * radius * amount, Math.sin(angle) * radius * amount];
  }));
}

/** Shared garment marks in normalized torso half-extents, positive Y up. */
export function createCharacterOutfitProfile(
  identity: CharacterIdentityRecipe,
): CharacterOutfitProfile {
  const style = identity.outfit.style;
  if (style === 'plain') return Object.freeze({ style, marks: Object.freeze([]) });
  const scale = identity.outfit.scale;
  const random = new SeedTree(identity.seed).random('character:outfit-profile');
  if (style === 'stripe') {
    const segments = 7;
    const top: Point[] = [];
    const bottom: Point[] = [];
    for (let index = 0; index < segments; index += 1) {
      const amount = index / (segments - 1);
      const x = (-0.7 + amount * 1.4) * scale;
      const center = random.float(-0.028, 0.028) + Math.sin(amount * Math.PI * 1.4) * 0.018;
      const halfWidth = random.float(0.055, 0.085) * scale;
      top.push([x, center + halfWidth]);
      bottom.unshift([x + random.float(-0.012, 0.012), center - halfWidth]);
    }
    return Object.freeze({
      style,
      marks: Object.freeze([Object.freeze({
        id: 'stripe', outline: Object.freeze([...top, ...bottom]),
      })]),
    });
  }
  if (style === 'star') {
    return Object.freeze({
      style,
      marks: Object.freeze([Object.freeze({
        id: 'star', outline: radialOutline(0.32 * scale, 10, 0.43),
      })]),
    });
  }
  return Object.freeze({
    style,
    marks: Object.freeze([-0.34, 0, 0.34].map((y, index) => Object.freeze({
      id: `button:${index}`,
      outline: Object.freeze(radialOutline(0.07, 12).map(([x, localY]): Point => [
        x, localY + y * scale,
      ])),
    }))),
  });
}
