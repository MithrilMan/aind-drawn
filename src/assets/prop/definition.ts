import { chaikin, closePath, type MutablePoint, type Point } from '../../core/geometry.js';
import { PAPER, type Sketch } from '../../core/sketch.js';
import type { Medium } from '../../materials/medium.js';
import type { Collider, Size2, SocketMap } from '../types.js';
import type { PropRecipe } from './recipe.js';

export type PropKind = 'lantern' | 'crate' | 'sign' | 'shrub';

export type PropDefinition = Readonly<{
  kind: PropKind;
  baseSize: Size2;
  draw: (sketch: Sketch, recipe: PropRecipe, medium: Medium) => void;
  colliders: (recipe: PropRecipe) => readonly Collider[];
  sockets: (recipe: PropRecipe) => SocketMap;
}>;

function outline(sketch: Sketch, medium: Medium, points: readonly Point[], width = 3.5): void {
  medium.edge(sketch, closePath(points), width, { ghost: true, amplitude: 0.7 });
}

function drawLantern(sketch: Sketch, recipe: PropRecipe, medium: Medium): void {
  const centerX = sketch.width / 2;
  const bottom = sketch.height - 12;
  const body = sketch.blobPoints(centerX, bottom - 56, 30, 38, 0, 0.32);
  sketch.paperFill(body);
  medium.skin(sketch, body, recipe.palette.accent, { gap: 7 });
  outline(sketch, medium, body, 3.2);
  const frame: MutablePoint[] = [
    [centerX - 26, bottom - 92],
    [centerX + 25, bottom - 92],
    [centerX + 31, bottom - 20],
    [centerX - 30, bottom - 20],
  ];
  outline(sketch, medium, frame, 4);
  sketch.stroke([[centerX - 22, bottom - 91], [centerX + 25, bottom - 20]], 2.2, {
    alpha: 0.58,
  });
  sketch.stroke([[centerX + 22, bottom - 91], [centerX - 25, bottom - 20]], 2.2, {
    alpha: 0.58,
  });
  sketch.stroke(chaikin([
    [centerX - 18, bottom - 94],
    [centerX - 13, bottom - 118],
    [centerX + 14, bottom - 118],
    [centerX + 19, bottom - 94],
  ], false, 1), 3.2, { taper: 0.2 });
  const base = sketch.blobPoints(centerX, bottom - 8, 35, 10, 0, 0.25);
  medium.tone(sketch, base, { style: 'black', color: recipe.palette.primary });
  outline(sketch, medium, base, 3.2);
}

function drawCrate(sketch: Sketch, recipe: PropRecipe, medium: Medium): void {
  const left = 14;
  const right = sketch.width - 14;
  const top = 16;
  const bottom = sketch.height - 10;
  const box = chaikin([
    [left + 2, top + 4], [right - 5, top], [right, bottom - 3], [left, bottom],
  ], true, 1);
  sketch.paperFill(box);
  medium.tone(sketch, box, { style: recipe.tone, color: recipe.palette.primary, gap: 9 });
  outline(sketch, medium, box, 4.2);
  sketch.stroke([[left + 14, top + 12], [right - 15, bottom - 14]], 7, {
    alpha: 0.58,
    ghost: true,
  });
  sketch.stroke([[right - 14, top + 12], [left + 15, bottom - 14]], 7, {
    alpha: 0.58,
    ghost: true,
  });
}

function drawSign(sketch: Sketch, recipe: PropRecipe, medium: Medium): void {
  const centerX = sketch.width / 2;
  const board = chaikin([
    [14, 18], [sketch.width - 18, 12], [sketch.width - 10, 74], [18, 80],
  ], true, 1);
  sketch.paperFill(board);
  medium.tone(sketch, board, { style: recipe.tone, color: recipe.palette.primary, gap: 8 });
  outline(sketch, medium, board, 4);
  sketch.stroke([[centerX + 3, 75], [centerX - 1, sketch.height - 8]], 9, {
    alpha: 0.72,
    ghost: true,
  });
  const arrowY = 46;
  sketch.stroke([
    [33, arrowY], [sketch.width - 39, arrowY - 2],
    [sketch.width - 55, arrowY - 17],
    [sketch.width - 39, arrowY - 2],
    [sketch.width - 55, arrowY + 15],
  ], 3, { taper: 0.18, overshoot: 2 });
}

function drawShrub(sketch: Sketch, recipe: PropRecipe, medium: Medium): void {
  const points: MutablePoint[] = [];
  const count = 26;
  const centerX = sketch.width / 2;
  const centerY = sketch.height * 0.61;
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2;
    const radius = index % 2 === 0
      ? sketch.jitter(0.83, 1.04)
      : sketch.jitter(0.72, 0.94);
    points.push([
      centerX + Math.cos(angle) * sketch.width * 0.42 * radius,
      centerY + Math.sin(angle) * sketch.height * 0.36 * radius,
    ]);
  }
  sketch.paperFill(points);
  medium.skin(sketch, points, recipe.palette.primary, { gap: 8, scribble: true });
  outline(sketch, medium, points, 3.8);
  for (let index = 0; index < 6; index += 1) {
    const x = sketch.jitter(sketch.width * 0.25, sketch.width * 0.75);
    const y = sketch.jitter(sketch.height * 0.4, sketch.height * 0.72);
    sketch.context.fillStyle = PAPER;
    sketch.wobblyEllipse(x, y, 2.5, 2.5);
    sketch.context.fill();
  }
}

function standardSockets(recipe: PropRecipe): SocketMap {
  return Object.freeze({
    base: Object.freeze({ x: 0, y: 0 }),
    top: Object.freeze({ x: 0, y: recipe.height }),
  });
}

function crateColliders(recipe: PropRecipe): readonly Collider[] {
  return Object.freeze([Object.freeze({
    id: 'body',
    kind: 'solid',
    shape: 'rectangle',
    x: -recipe.width * 0.45,
    y: 0,
    width: recipe.width * 0.9,
    height: recipe.height * 0.88,
  })]);
}

const noColliders = (): readonly Collider[] => Object.freeze([]);

export const PROP_DEFINITIONS: Readonly<Record<PropKind, PropDefinition>> = Object.freeze({
  lantern: Object.freeze({
    kind: 'lantern',
    baseSize: Object.freeze({ width: 0.72, height: 1.08 }),
    draw: drawLantern,
    colliders: noColliders,
    sockets: standardSockets,
  }),
  crate: Object.freeze({
    kind: 'crate',
    baseSize: Object.freeze({ width: 1.18, height: 1.05 }),
    draw: drawCrate,
    colliders: crateColliders,
    sockets: standardSockets,
  }),
  sign: Object.freeze({
    kind: 'sign',
    baseSize: Object.freeze({ width: 1.42, height: 1.76 }),
    draw: drawSign,
    colliders: noColliders,
    sockets: standardSockets,
  }),
  shrub: Object.freeze({
    kind: 'shrub',
    baseSize: Object.freeze({ width: 1.58, height: 1.18 }),
    draw: drawShrub,
    colliders: noColliders,
    sockets: standardSockets,
  }),
});

export function propDefinition(kind: PropKind): PropDefinition {
  return PROP_DEFINITIONS[kind];
}
