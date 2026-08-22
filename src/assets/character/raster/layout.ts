import { TAU, type MutablePoint } from '../../../core/geometry.js';
import type { Bounds } from '../../../core/geometry.js';
import {
  characterEyeCenterY,
  characterHeadRadius2d,
  characterMouthCenterY,
} from '../identity/head-shape.js';
import type { Vector2 } from '../../../contracts/raster-asset.js';
import type { CharacterRecipe } from './recipe.js';

export type CharacterLayout = Readonly<{
  pixelsPerUnit: number;
  head: Readonly<{
    center: Vector2;
    widthPixels: number;
    heightPixels: number;
    outline: readonly MutablePoint[];
  }>;
  torso: Readonly<{
    center: Vector2;
    widthPixels: number;
    heightPixels: number;
    shoulderY: number;
    hipY: number;
  }>;
  limbs: Readonly<{
    armLengthPixels: number;
    legLengthPixels: number;
    shoulderX: number;
    hipX: number;
  }>;
  eyes: Readonly<{
    left: Vector2;
    right: Vector2;
    radiusPixels: number;
  }>;
  mouth: Vector2;
  bounds: Bounds;
  sockets: Readonly<Record<string, Vector2>>;
}>;

const PIXELS_PER_UNIT = 96;
const HEAD_SCALE = 106;

function createHeadOutline(recipe: CharacterRecipe, width: number, height: number): MutablePoint[] {
  const identity = recipe.identity;
  const count = 28;
  const points: MutablePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    const radius = characterHeadRadius2d(identity.head, -angle);
    const x = Math.cos(angle) * width * 0.5 * radius;
    const y = Math.sin(angle) * height * 0.5 * radius;
    const cosine = Math.cos(identity.head.tilt);
    const sine = Math.sin(identity.head.tilt);
    points.push([x * cosine - y * sine, x * sine + y * cosine]);
  }
  return points;
}

export function buildCharacterLayout(recipe: CharacterRecipe): CharacterLayout {
  const identity = recipe.identity;
  const headWidth = HEAD_SCALE * identity.head.width;
  const headHeight = HEAD_SCALE * identity.head.height;
  const torsoWidth = HEAD_SCALE * identity.body.width;
  const torsoHeight = HEAD_SCALE * identity.body.height;
  const armLength = HEAD_SCALE * identity.body.armLength;
  const legLength = HEAD_SCALE * identity.body.legLength;
  const headCenterPixels = legLength + torsoHeight + headHeight * 0.27;
  const torsoCenterPixels = legLength + torsoHeight * 0.5;
  const shoulderYPixels = legLength + torsoHeight * 0.76;
  const hipYPixels = legLength + torsoHeight * 0.12;
  const shoulderX = torsoWidth * 0.46;
  const hipX = torsoWidth * identity.body.stance;

  const eyeY = headCenterPixels + headHeight * 0.5 * characterEyeCenterY(identity);
  const eyeX = headWidth * 0.5 * identity.eyes.spacing;
  const eyeRadius = headWidth * 0.095 * identity.eyes.size;
  const mouthY = headCenterPixels + headHeight * 0.5 * characterMouthCenterY(identity);
  const handY = (shoulderYPixels - armLength * 0.78) / PIXELS_PER_UNIT;

  const minimumX = -Math.max(headWidth * 0.58, shoulderX + armLength * 0.45) / PIXELS_PER_UNIT;
  const bodyMaximumX = -minimumX;
  const tailMaximumX = identity.tail.present
    ? (torsoWidth * 0.4 + HEAD_SCALE * identity.tail.length) / PIXELS_PER_UNIT
    : bodyMaximumX;
  const maximumX = Math.max(bodyMaximumX, tailMaximumX);
  const maximumY = (headCenterPixels + headHeight * 0.55) / PIXELS_PER_UNIT;

  return Object.freeze({
    pixelsPerUnit: PIXELS_PER_UNIT,
    head: Object.freeze({
      center: Object.freeze({ x: 0, y: headCenterPixels / PIXELS_PER_UNIT }),
      widthPixels: headWidth,
      heightPixels: headHeight,
      outline: Object.freeze(createHeadOutline(recipe, headWidth, headHeight)),
    }),
    torso: Object.freeze({
      center: Object.freeze({ x: 0, y: torsoCenterPixels / PIXELS_PER_UNIT }),
      widthPixels: torsoWidth,
      heightPixels: torsoHeight,
      shoulderY: shoulderYPixels / PIXELS_PER_UNIT,
      hipY: hipYPixels / PIXELS_PER_UNIT,
    }),
    limbs: Object.freeze({
      armLengthPixels: armLength,
      legLengthPixels: legLength,
      shoulderX: shoulderX / PIXELS_PER_UNIT,
      hipX: hipX / PIXELS_PER_UNIT,
    }),
    eyes: Object.freeze({
      left: Object.freeze({ x: -eyeX / PIXELS_PER_UNIT, y: eyeY / PIXELS_PER_UNIT }),
      right: Object.freeze({ x: eyeX / PIXELS_PER_UNIT, y: eyeY / PIXELS_PER_UNIT }),
      radiusPixels: eyeRadius,
    }),
    mouth: Object.freeze({ x: 0, y: mouthY / PIXELS_PER_UNIT }),
    bounds: Object.freeze({
      x: minimumX,
      y: 0,
      width: maximumX - minimumX,
      height: maximumY,
    }),
    sockets: Object.freeze({
      feet: Object.freeze({ x: 0, y: 0 }),
      head: Object.freeze({ x: 0, y: headCenterPixels / PIXELS_PER_UNIT }),
      'hand:left': Object.freeze({
        x: -(shoulderX + armLength * 0.24) / PIXELS_PER_UNIT,
        y: handY,
      }),
      'hand:right': Object.freeze({
        x: (shoulderX + armLength * 0.24) / PIXELS_PER_UNIT,
        y: handY,
      }),
      tail: Object.freeze({
        x: torsoWidth * 0.38 / PIXELS_PER_UNIT,
        y: (hipYPixels + torsoHeight * 0.2) / PIXELS_PER_UNIT,
      }),
    }),
  });
}
