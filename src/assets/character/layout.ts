import { TAU, type MutablePoint } from '../../core/geometry.js';
import { SeedTree } from '../../core/random.js';
import type { Bounds } from '../../core/geometry.js';
import type { Vector2 } from '../types.js';
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

function targetRadius(shape: CharacterRecipe['head']['shape'], angle: number): number {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  if (shape === 'square') {
    const exponent = 5.5;
    return 1 / Math.pow(
      Math.pow(Math.abs(cosine), exponent) + Math.pow(Math.abs(sine), exponent),
      1 / exponent,
    );
  }
  if (shape === 'drop') {
    return sine < 0 ? 1 - 0.26 * Math.pow(-sine, 1.5) : 1;
  }
  if (shape === 'pear') {
    return 1 - 0.2 * Math.pow(Math.max(0, -sine), 1.3)
      + 0.12 * Math.pow(Math.max(0, sine), 1.4);
  }
  if (shape === 'lump') {
    return 1 + 0.1 * Math.sin(angle * 2 + 1) + 0.055 * Math.sin(angle * 3);
  }
  return 1;
}

function createHeadOutline(recipe: CharacterRecipe, width: number, height: number): MutablePoint[] {
  const random = new SeedTree(recipe.seed).random('character:layout:head');
  const phase = random.float(0, TAU);
  const count = 28;
  const points: MutablePoint[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    const carefulWobble = (
      0.025 * Math.sin(angle * 3 + phase)
      + 0.016 * Math.sin(angle * 7 + phase * 1.7)
    ) * recipe.head.wobble;
    const radius = targetRadius(recipe.head.shape, angle) * (1 + carefulWobble);
    const x = Math.cos(angle) * width * 0.5 * radius;
    const y = Math.sin(angle) * height * 0.5 * radius;
    const cosine = Math.cos(recipe.head.tilt);
    const sine = Math.sin(recipe.head.tilt);
    points.push([x * cosine - y * sine, x * sine + y * cosine]);
  }
  return points;
}

export function buildCharacterLayout(recipe: CharacterRecipe): CharacterLayout {
  const headWidth = HEAD_SCALE * recipe.head.width;
  const headHeight = HEAD_SCALE * recipe.head.height;
  const torsoWidth = HEAD_SCALE * recipe.body.width;
  const torsoHeight = HEAD_SCALE * recipe.body.height;
  const armLength = HEAD_SCALE * recipe.body.armLength;
  const legLength = HEAD_SCALE * recipe.body.legLength;
  const headCenterPixels = legLength + torsoHeight + headHeight * 0.27;
  const torsoCenterPixels = legLength + torsoHeight * 0.5;
  const shoulderYPixels = legLength + torsoHeight * 0.76;
  const hipYPixels = legLength + torsoHeight * 0.12;
  const shoulderX = torsoWidth * 0.46;
  const hipX = torsoWidth * recipe.body.stance;

  const eyeY = headCenterPixels - headHeight * (0.1 - recipe.eyes.verticalOffset);
  const eyeX = headWidth * recipe.eyes.spacing;
  const eyeRadius = headWidth * 0.095 * recipe.eyes.size;
  const mouthY = headCenterPixels - headHeight * recipe.mouth.verticalOffset;
  const handY = (shoulderYPixels - armLength * 0.78) / PIXELS_PER_UNIT;

  const minimumX = -Math.max(headWidth * 0.58, shoulderX + armLength * 0.45) / PIXELS_PER_UNIT;
  const bodyMaximumX = -minimumX;
  const tailMaximumX = recipe.tail.present
    ? (torsoWidth * 0.4 + HEAD_SCALE * recipe.tail.length) / PIXELS_PER_UNIT
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
