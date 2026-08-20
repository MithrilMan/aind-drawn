import { chaikin, closePath, type MutablePoint, type Point } from '../../core/geometry.js';
import { combineSeed } from '../../core/random.js';
import { PAPER, type Sketch } from '../../core/sketch.js';
import { mediumById, type Medium } from '../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition, Size2 } from '../types.js';
import type { CharacterIdentityRecipe } from '../character-identity/recipe.js';
import { buildCharacterLayout } from './layout.js';
import {
  createRasterCharacterRecipe,
  type CharacterRecipe,
  type EyeStyle,
  type RasterCharacterRecipeOptions,
} from './recipe.js';

const HEAD_CANVAS: Size2 = Object.freeze({ width: 196, height: 196 });
const EYE_CANVAS: Size2 = Object.freeze({ width: 72, height: 72 });
const BROW_CANVAS: Size2 = Object.freeze({ width: 72, height: 36 });
const NOSE_CANVAS: Size2 = Object.freeze({ width: 48, height: 48 });
const MOUTH_CANVAS: Size2 = Object.freeze({ width: 104, height: 66 });
const TAIL_HEIGHT = 150;

function toWorld(canvas: Size2, pixelsPerUnit: number): Size2 {
  return Object.freeze({
    width: canvas.width / pixelsPerUnit,
    height: canvas.height / pixelsPerUnit,
  });
}

function localize(points: readonly Point[], canvas: Size2): MutablePoint[] {
  return points.map(([x, y]) => [x + canvas.width / 2, y + canvas.height / 2]);
}

function layer(
  definition: Omit<LayerDefinition, 'world'> & Readonly<{ pixelsPerUnit: number }>,
): LayerDefinition {
  const { pixelsPerUnit, ...rest } = definition;
  return Object.freeze({
    ...rest,
    world: toWorld(rest.canvas, pixelsPerUnit),
  });
}

function drawHead(
  sketch: Sketch,
  recipe: CharacterRecipe,
  medium: Medium,
  outline: readonly Point[],
): void {
  const points = localize(outline, HEAD_CANVAS);
  sketch.paperFill(points);
  medium.skin(sketch, points, recipe.identity.palette.skin, { gap: 8 });
  if (recipe.style.headTone !== 'light') {
    medium.tone(sketch, points, {
      style: recipe.style.headTone, gap: 9, color: recipe.identity.palette.skin,
    });
  }
  medium.edge(sketch, closePath(points), 4.4 * recipe.style.linePressure, { ghost: true });
}

function drawEars(sketch: Sketch, recipe: CharacterRecipe, medium: Medium): void {
  if (recipe.identity.species === 'human' || recipe.identity.species === 'robot') {
    return;
  }
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2;
  for (const side of [-1, 1]) {
    const points = recipe.identity.species === 'cat'
      ? chaikin([
        [centerX + side * 39, centerY - 29],
        [centerX + side * 55, centerY - 80],
        [centerX + side * 78, centerY - 24],
      ], true, 2)
      : chaikin([
        [centerX + side * 44, centerY - 42],
        [centerX + side * 67, centerY - 72],
        [centerX + side * 58, centerY - 16],
      ], true, 1);
    sketch.paperFill(points);
    medium.tone(sketch, points, {
      style: recipe.identity.species === 'nightmare' ? 'black' : 'light',
      color: recipe.identity.palette.skin,
    });
    medium.edge(sketch, closePath(points), 3.6 * recipe.style.linePressure, { ghost: true });
  }
}

function drawHair(sketch: Sketch, recipe: CharacterRecipe, medium: Medium): void {
  if (recipe.identity.hair.style === 'none') {
    return;
  }
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2;
  let points: MutablePoint[];
  if (recipe.identity.hair.style === 'spikes' || recipe.identity.hair.style === 'crown') {
    points = [];
    const count = 9;
    for (let index = 0; index <= count; index += 1) {
      const amount = index / count;
      const x = centerX - 65 + amount * 130;
      const height = index % 2 === 0 ? 42 : 18;
      points.push([x, centerY - 48 - height]);
    }
    points.push([centerX + 66, centerY - 18], [centerX - 66, centerY - 18]);
  } else if (recipe.identity.hair.style === 'tuft') {
    points = chaikin([
      [centerX - 28, centerY - 48],
      [centerX - 8, centerY - 88],
      [centerX + 5, centerY - 56],
      [centerX + 28, centerY - 82],
      [centerX + 34, centerY - 43],
    ], true, 1);
  } else if (recipe.identity.hair.style === 'bob') {
    const height = 48 + recipe.identity.hair.height * 34;
    points = chaikin([
      [centerX - 72, centerY + 25],
      [centerX - 72, centerY - 48],
      [centerX, centerY - height],
      [centerX + 72, centerY - 47],
      [centerX + 72, centerY + 25],
      [centerX + 52, centerY + 7],
      [centerX + 39, centerY - 27],
      [centerX, centerY - 14],
      [centerX - 40, centerY - 27],
      [centerX - 52, centerY + 7],
    ], true, 2);
  } else if (recipe.identity.hair.style === 'fringe') {
    const height = 48 + recipe.identity.hair.height * 42;
    points = chaikin([
      [centerX - 69, centerY - 13],
      [centerX - 58, centerY - 59],
      [centerX, centerY - height],
      [centerX + 61, centerY - 57],
      [centerX + 69, centerY - 13],
      [centerX + 44, centerY - 24],
      [centerX + 31, centerY - 8],
      [centerX + 13, centerY - 28],
      [centerX - 4, centerY - 7],
      [centerX - 25, centerY - 29],
      [centerX - 45, centerY - 13],
    ], true, 1);
  } else {
    const height = 44 + recipe.identity.hair.height * 38;
    points = chaikin([
      [centerX - 70, centerY - 10],
      [centerX - 62, centerY - 62],
      [centerX, centerY - height],
      [centerX + 62, centerY - 61],
      [centerX + 70, centerY - 8],
      [centerX + 38, centerY - 30],
      [centerX, centerY - 18],
      [centerX - 38, centerY - 30],
    ], true, 2);
  }
  medium.tone(sketch, points, {
    style: recipe.style.hairTone, color: recipe.identity.palette.hair, gap: 7,
  });
  medium.edge(sketch, closePath(points), 4 * recipe.style.linePressure, { ghost: true });
}

function drawOutfit(sketch: Sketch, recipe: CharacterRecipe, canvas: Size2): void {
  if (recipe.identity.species === 'cat' || recipe.identity.outfit.style === 'plain') return;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const scale = recipe.identity.outfit.scale;
  sketch.setInk(recipe.identity.palette.accent);
  if (recipe.identity.outfit.style === 'stripe') {
    for (const offset of [-1, 1]) {
      sketch.stroke([
        [centerX - canvas.width * 0.2, centerY + offset * 10 * scale],
        [centerX + canvas.width * 0.2, centerY + offset * 9 * scale],
      ], 4.8 * recipe.style.linePressure, { alpha: 0.52, taper: 0.2, ghost: true });
    }
  } else if (recipe.identity.outfit.style === 'star') {
    const points: MutablePoint[] = [];
    const radius = 16 * scale;
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const pointRadius = index % 2 === 0 ? radius : radius * 0.43;
      points.push([
        centerX + Math.cos(angle) * pointRadius,
        centerY + Math.sin(angle) * pointRadius,
      ]);
    }
    sketch.inkFill(points, 0.48);
    sketch.stroke(closePath(points), 1.8 * recipe.style.linePressure, { alpha: 0.56, taper: 0.1 });
  } else {
    for (const offset of [-1, 0, 1]) {
      sketch.context.fillStyle = sketch.inkAlpha(0.62);
      sketch.wobblyEllipse(centerX, centerY + offset * 13 * scale, 3.4, 3.4);
      sketch.context.fill();
    }
  }
  sketch.setInk(null);
}

function pupil(
  sketch: Sketch,
  centerX: number,
  centerY: number,
  radius: number,
  glint: boolean,
  vertical = false,
): void {
  sketch.context.fillStyle = sketch.inkAlpha(0.96);
  sketch.wobblyEllipse(centerX, centerY, vertical ? radius * 0.28 : radius, radius);
  sketch.context.fill();
  if (glint) {
    sketch.context.fillStyle = PAPER;
    sketch.wobblyEllipse(centerX - radius * 0.35, centerY - radius * 0.38, radius * 0.28, radius * 0.28);
    sketch.context.fill();
  }
}

function drawEye(
  sketch: Sketch,
  recipe: CharacterRecipe,
  style: EyeStyle,
  state: string,
): void {
  const centerX = EYE_CANVAS.width / 2;
  const centerY = EYE_CANVAS.height / 2;
  const radius = Math.min(21, 12 + recipe.identity.eyes.size * 6);
  if (state === 'closed') {
    sketch.stroke(chaikin([
      [centerX - radius, centerY + 2],
      [centerX, centerY - 5],
      [centerX + radius, centerY + 2],
    ], false, 1), 2.8 * recipe.style.linePressure, { taper: 0.28 });
    return;
  }

  const gazeX = state === 'left' ? -radius * 0.42 : state === 'right' ? radius * 0.42 : 0;
  if (style === 'sleepy') {
    pupil(
      sketch,
      centerX + gazeX,
      centerY + 3,
      radius * 0.35,
      recipe.identity.eyes.glint,
      recipe.identity.species === 'cat',
    );
    sketch.stroke([
      [centerX - radius, centerY - 5],
      [centerX, centerY - 8],
      [centerX + radius, centerY - 5],
    ], 3 * recipe.style.linePressure, { taper: 0.2 });
    return;
  }
  if (style === 'dot') {
    pupil(
      sketch,
      centerX + gazeX * 0.4,
      centerY,
      radius * 0.38,
      recipe.identity.eyes.glint,
      recipe.identity.species === 'cat',
    );
    return;
  }
  if (style === 'star') {
    const points: MutablePoint[] = [];
    for (let index = 0; index < 10; index += 1) {
      const angle = -Math.PI / 2 + index * Math.PI / 5;
      const pointRadius = index % 2 === 0 ? radius : radius * 0.42;
      points.push([
        centerX + gazeX * 0.25 + Math.cos(angle) * pointRadius,
        centerY + Math.sin(angle) * pointRadius,
      ]);
    }
    sketch.inkFill(points, 0.95);
    return;
  }

  const disc = sketch.blobPoints(centerX, centerY, radius, radius * 1.02, 0, 0.38);
  if (style === 'void') {
    sketch.paperFill(disc);
    sketch.pencilFill(disc, 0.92);
    sketch.stroke(closePath(disc), 2.8, { amplitude: 0.5, taper: 0.1 });
    if (recipe.identity.eyes.glint) {
      sketch.context.fillStyle = PAPER;
      sketch.wobblyEllipse(centerX - radius * 0.2, centerY - radius * 0.26, radius * 0.16, radius * 0.16);
      sketch.context.fill();
    }
    return;
  }
  sketch.paperFill(disc);
  sketch.stroke(closePath(disc), 2.5 * recipe.style.linePressure, { amplitude: 0.45, taper: 0.1 });
  pupil(
    sketch,
    centerX + gazeX,
    centerY + 1,
    radius * 0.34,
    recipe.identity.eyes.glint,
    recipe.identity.species === 'cat',
  );
}

function drawCatMuzzle(sketch: Sketch, recipe: CharacterRecipe): void {
  if (recipe.identity.species !== 'cat') return;
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2 + 28;
  for (const side of [-1, 1]) {
    const cheek = sketch.blobPoints(
      centerX + side * 14,
      centerY + 5,
      18,
      14,
      side * 0.06,
      0.34,
    );
    sketch.paperFill(cheek);
    sketch.stroke(closePath(cheek), 1.6 * recipe.style.linePressure, {
      alpha: 0.35,
      amplitude: 0.5,
    });
  }
  const nose: readonly Point[] = [
    [centerX - 7, centerY - 4],
    [centerX + 7, centerY - 4],
    [centerX, centerY + 5],
  ];
  sketch.inkFill(nose, 0.9);
  sketch.stroke([[centerX, centerY + 4], [centerX, centerY + 13]], 1.8, { alpha: 0.76 });
  for (const side of [-1, 1]) {
    for (let row = -1; row <= 1; row += 1) {
      const startX = centerX + side * 19;
      sketch.stroke([
        [startX, centerY + 6 + row * 5],
        [centerX + side * 56, centerY + 3 + row * 9],
      ], 1.25, { alpha: 0.52, taper: 0.55 });
    }
  }
}

function drawBrow(sketch: Sketch, recipe: CharacterRecipe, side: -1 | 1): void {
  const centerX = BROW_CANVAS.width / 2;
  const centerY = BROW_CANVAS.height / 2;
  const tilt = recipe.identity.brows.tilt * side * 18;
  sketch.setInk(recipe.identity.palette.hair);
  sketch.stroke([
    [centerX - 20, centerY - tilt],
    [centerX, centerY - 2],
    [centerX + 20, centerY + tilt],
  ], 3.4 * recipe.style.linePressure, { alpha: 0.86, taper: 0.24, ghost: true });
  sketch.setInk(null);
}

function drawNose(sketch: Sketch, recipe: CharacterRecipe): void {
  const centerX = NOSE_CANVAS.width / 2;
  const centerY = NOSE_CANVAS.height / 2;
  const radius = 3 + recipe.identity.nose.size * 24;
  sketch.setInk(recipe.identity.species === 'robot'
    ? recipe.identity.palette.accent
    : recipe.identity.palette.skin);
  sketch.context.fillStyle = sketch.inkAlpha(0.5);
  sketch.wobblyEllipse(centerX, centerY, radius, radius * 0.82);
  sketch.context.fill();
  sketch.setInk(null);
  sketch.stroke(
    sketch.blobPoints(centerX, centerY, radius, radius * 0.82, 0, 0.2),
    1.8 * recipe.style.linePressure,
    { alpha: 0.62, taper: 0.12 },
  );
}

function drawMouth(sketch: Sketch, recipe: CharacterRecipe, state: string): void {
  const centerX = MOUTH_CANVAS.width / 2;
  const centerY = MOUTH_CANVAS.height / 2;
  const width = 23 + recipe.identity.mouth.width * 38;
  if (state === 'open') {
    const mouth = sketch.blobPoints(centerX, centerY, width * 0.45, 10, 0, 0.4);
    sketch.inkFill(mouth, 0.9);
    return;
  }
  if (recipe.identity.mouth.style === 'zigzag') {
    sketch.line([
      [centerX - width / 2, centerY],
      [centerX - width / 4, centerY - 5],
      [centerX, centerY + 4],
      [centerX + width / 4, centerY - 4],
      [centerX + width / 2, centerY + 1],
    ], 2, 0.8);
    return;
  }
  const bend = recipe.identity.mouth.style === 'frown'
    ? -8
    : recipe.identity.mouth.style === 'smile' || recipe.identity.mouth.style === 'cat' ? 8 : 0;
  sketch.stroke(chaikin([
    [centerX - width / 2, centerY],
    [centerX, centerY + bend],
    [centerX + width / 2, centerY],
  ], false, 1), 2.6 * recipe.style.linePressure, { taper: 0.3, overshoot: 2 });
}

function drawTorso(sketch: Sketch, recipe: CharacterRecipe, medium: Medium, canvas: Size2): void {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  // The canvas includes generous bleed for the hand-drawn edge. Keep the
  // visible mass aligned with the torso dimensions computed by the layout.
  const width = canvas.width * 0.28;
  const height = canvas.height * 0.32;
  const body = recipe.identity.species === 'cat'
    ? chaikin([
      [centerX - width * 0.72, centerY - height],
      [centerX + width * 0.72, centerY - height],
      [centerX + width * 1.08, centerY + height * 0.36],
      [centerX + width * 0.82, centerY + height],
      [centerX - width * 0.82, centerY + height],
      [centerX - width * 1.08, centerY + height * 0.36],
    ], true, 2)
    : chaikin([
      [centerX - width, centerY - height],
      [centerX + width, centerY - height * 0.96],
      [centerX + width * 1.08, centerY + height],
      [centerX - width * 1.02, centerY + height],
    ], true, 2);
  sketch.paperFill(body);
  if (recipe.identity.species === 'cat') {
    medium.skin(sketch, body, recipe.identity.palette.skin, { gap: 8, scribble: true });
    const chest = sketch.blobPoints(
      centerX,
      centerY + height * 0.24,
      width * 0.42,
      height * 0.62,
      0,
      0.3,
    );
    sketch.paperFill(chest);
    sketch.stroke(closePath(chest), 1.6 * recipe.style.linePressure, { alpha: 0.38, amplitude: 0.5 });
  } else {
    medium.tone(sketch, body, {
      style: recipe.style.bodyTone, color: recipe.identity.palette.cloth, gap: 8,
    });
  }
  medium.edge(sketch, closePath(body), 4.1 * recipe.style.linePressure, { ghost: true });
}

function drawLimb(
  sketch: Sketch,
  recipe: CharacterRecipe,
  length: number,
  width: number,
  endpoint: 'none' | 'hand' | 'foot' | 'paw',
): void {
  const centerX = sketch.width / 2;
  const startY = 6;
  const endY = Math.min(sketch.height - 12, startY + length);
  sketch.stroke([
    [centerX, startY],
    [centerX + sketch.jitter(-4, 4), endY],
  ], width * recipe.style.linePressure, { taper: 0.18, ghost: true });
  if (endpoint !== 'none') {
    const pawScale = endpoint === 'paw' ? 0.9 : endpoint === 'hand' ? 0.84 : 0.72;
    const shape = sketch.blobPoints(
      centerX + 5,
      endY,
      width * pawScale,
      width * (endpoint === 'foot' ? 0.42 : 0.56),
      0.05,
      0.35,
    );
    sketch.paperFill(shape);
    if (endpoint !== 'paw') {
      sketch.setInk(recipe.identity.palette.accent);
      sketch.polygon(shape);
      sketch.context.fillStyle = sketch.inkAlpha(0.16);
      sketch.context.fill();
      sketch.setInk(null);
    }
    sketch.stroke(closePath(shape), 2.5 * recipe.style.linePressure, { amplitude: 0.5, taper: 0.12 });
    if (endpoint === 'paw') {
      for (let toe = -1; toe <= 1; toe += 1) {
        const x = centerX + 5 + toe * width * 0.34;
        sketch.stroke([[x, endY - 1], [x + 1, endY + width * 0.25]], 1.1, { alpha: 0.46 });
      }
    }
  }
}

function drawTail(sketch: Sketch, recipe: CharacterRecipe): void {
  if (!recipe.identity.tail.present) return;
  const curl = recipe.identity.tail.curl;
  const points = chaikin([
    [24, 116],
    [sketch.width * 0.34, 112 - curl * 10],
    [sketch.width * 0.55, 76 - curl * 24],
    [sketch.width * 0.78, 48 + curl * 16],
    [sketch.width - 20, 30 + curl * 26],
  ], false, 3);
  sketch.stroke(points, recipe.identity.species === 'cat' ? 11 : 9, {
    alpha: 0.84,
    ghost: true,
    taper: 0.46,
    amplitude: 0.72,
  });
}

export function createCharacterBlueprint(recipe: CharacterRecipe): AssetBlueprint {
  const layout = buildCharacterLayout(recipe);
  const medium = mediumById(recipe.style.medium);
  const pixelsPerUnit = layout.pixelsPerUnit;
  const headPosition = layout.head.center;
  const torsoCanvas = Object.freeze({
    width: Math.ceil(layout.torso.widthPixels * 1.8),
    height: Math.ceil(layout.torso.heightPixels * 1.55),
  });
  const armCanvas = Object.freeze({
    width: 58,
    height: Math.ceil(layout.limbs.armLengthPixels + 24),
  });
  const legCanvas = Object.freeze({
    width: 58,
    height: Math.ceil(layout.limbs.legLengthPixels + 28),
  });
  const tailCanvas = Object.freeze({
    width: Math.ceil(106 * recipe.identity.tail.length + 58),
    height: TAIL_HEIGHT,
  });
  const tailSocket = layout.sockets.tail ?? layout.torso.center;
  const tailInkAnchor = Object.freeze({ x: 24, y: 116 });
  const pawEndpoint = recipe.identity.species === 'cat' ? 'paw' as const : 'hand' as const;
  const footEndpoint = recipe.identity.species === 'cat' ? 'paw' as const : 'foot' as const;

  const layers: LayerDefinition[] = [
    ...(recipe.identity.tail.present ? [layer({
      id: 'tail', bone: 'tail', parentBone: 'torso', order: -6, depth: 0,
      canvas: tailCanvas, pixelsPerUnit,
      position: {
        x: tailSocket.x - layout.torso.center.x,
        y: tailSocket.y - layout.torso.center.y,
      },
      pivot: [
        tailInkAnchor.x / tailCanvas.width,
        1 - tailInkAnchor.y / tailCanvas.height,
      ],
      states: ['idle'],
      draw: ({ sketch }) => { drawTail(sketch, recipe); },
    })] : []),
    layer({
      id: 'arm:left', bone: 'arm:left', order: -2, depth: 0,
      canvas: armCanvas, pixelsPerUnit,
      position: { x: -layout.limbs.shoulderX, y: layout.torso.shoulderY },
      pivot: [0.5, 1], states: ['idle'],
      draw: ({ sketch }) => {
        drawLimb(sketch, recipe, layout.limbs.armLengthPixels, 8, pawEndpoint);
      },
    }),
    layer({
      id: 'arm:right', bone: 'arm:right', order: -1, depth: 0,
      canvas: armCanvas, pixelsPerUnit,
      position: { x: layout.limbs.shoulderX, y: layout.torso.shoulderY },
      pivot: [0.5, 1], states: ['idle'],
      draw: ({ sketch }) => {
        drawLimb(sketch, recipe, layout.limbs.armLengthPixels, 8, pawEndpoint);
      },
    }),
    layer({
      id: 'leg:left', bone: 'leg:left', order: -5, depth: 0,
      canvas: legCanvas, pixelsPerUnit,
      position: { x: -layout.limbs.hipX, y: layout.torso.hipY },
      pivot: [0.5, 1], states: ['idle'],
      draw: ({ sketch }) => {
        drawLimb(sketch, recipe, layout.limbs.legLengthPixels, 9, footEndpoint);
      },
    }),
    layer({
      id: 'leg:right', bone: 'leg:right', order: -4, depth: 0,
      canvas: legCanvas, pixelsPerUnit,
      position: { x: layout.limbs.hipX, y: layout.torso.hipY },
      pivot: [0.5, 1], states: ['idle'],
      draw: ({ sketch }) => {
        drawLimb(sketch, recipe, layout.limbs.legLengthPixels, 9, footEndpoint);
      },
    }),
    layer({
      id: 'torso', bone: 'torso', order: -3, depth: 0,
      canvas: torsoCanvas, pixelsPerUnit,
      position: layout.torso.center,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawTorso(sketch, recipe, medium, torsoCanvas); },
    }),
    ...(recipe.identity.species !== 'cat' ? [layer({
      id: 'outfit', bone: 'outfit', parentBone: 'torso', order: -2.5, depth: 0.05,
      canvas: torsoCanvas, pixelsPerUnit,
      position: { x: 0, y: 0 },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawOutfit(sketch, recipe, torsoCanvas); },
    })] : []),
    layer({
      id: 'ears', bone: 'head', order: 0, depth: 0.1,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: headPosition,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawEars(sketch, recipe, medium); },
    }),
    layer({
      id: 'head', bone: 'head', order: 1, depth: 0.2,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: headPosition,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawHead(sketch, recipe, medium, layout.head.outline); },
    }),
    layer({
      id: 'hair', bone: 'head', order: 2, depth: 0.4,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: headPosition,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawHair(sketch, recipe, medium); },
    }),
    ...(recipe.identity.species === 'cat' ? [layer({
      id: 'muzzle', bone: 'head', order: 3, depth: 0.72,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: headPosition,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawCatMuzzle(sketch, recipe); },
    })] : []),
    ...(recipe.identity.brows.present ? ([-1, 1] as const).map((side) => layer({
      id: `brow:${side < 0 ? 'left' : 'right'}`,
      bone: `brow:${side < 0 ? 'left' : 'right'}`,
      parentBone: 'head', order: 3.5, depth: 0.76,
      canvas: BROW_CANVAS, pixelsPerUnit,
      position: {
        x: (side < 0 ? layout.eyes.left.x : layout.eyes.right.x) - headPosition.x,
        y: (side < 0 ? layout.eyes.left.y : layout.eyes.right.y)
          - headPosition.y + layout.eyes.radiusPixels * 1.5 / pixelsPerUnit,
      },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawBrow(sketch, recipe, side); },
    })) : []),
    ...(recipe.identity.nose.present && recipe.identity.species !== 'cat' ? [layer({
      id: 'nose', bone: 'nose', parentBone: 'head', order: 3.7, depth: 0.78,
      canvas: NOSE_CANVAS, pixelsPerUnit,
      position: {
        x: 0,
        y: (layout.eyes.left.y + layout.mouth.y) * 0.5 - headPosition.y,
      },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawNose(sketch, recipe); },
    })] : []),
    layer({
      id: 'eye:left', bone: 'eye:left', order: 4, depth: 0.8,
      canvas: EYE_CANVAS, pixelsPerUnit,
      position: {
        x: layout.eyes.left.x - headPosition.x,
        y: layout.eyes.left.y - headPosition.y,
      },
      parentBone: 'head',
      pivot: [0.5, 0.5], states: ['open', 'closed', 'left', 'right'],
      draw: ({ sketch, state }) => { drawEye(sketch, recipe, recipe.identity.eyes.style, state); },
    }),
    layer({
      id: 'eye:right', bone: 'eye:right', order: 4, depth: 0.8,
      canvas: EYE_CANVAS, pixelsPerUnit,
      position: {
        x: layout.eyes.right.x - headPosition.x,
        y: layout.eyes.right.y - headPosition.y,
      },
      parentBone: 'head',
      pivot: [0.5, 0.5], states: ['open', 'closed', 'left', 'right'],
      draw: ({ sketch, state }) => { drawEye(
        sketch,
        recipe,
        recipe.identity.eyes.alternateStyle ?? recipe.identity.eyes.style,
        state,
      ); },
    }),
    layer({
      id: 'mouth', bone: 'mouth', order: 5, depth: 0.9,
      canvas: MOUTH_CANVAS, pixelsPerUnit,
      position: {
        x: layout.mouth.x - headPosition.x,
        y: layout.mouth.y - headPosition.y,
      },
      parentBone: 'head',
      pivot: [0.5, 0.5], states: ['idle', 'open'],
      draw: ({ sketch, state }) => { drawMouth(sketch, recipe, state); },
    }),
  ];

  return Object.freeze({
    id: `character:${recipe.identity.seed}`,
    kind: 'character',
    seed: recipe.identity.seed,
    medium: recipe.style.medium,
    bounds: layout.bounds,
    layers: Object.freeze(layers),
    colliders: Object.freeze([
      Object.freeze({
        id: 'body',
        kind: 'solid',
        shape: 'rectangle',
        x: -layout.torso.widthPixels * 0.32 / pixelsPerUnit,
        y: 0,
        width: layout.torso.widthPixels * 0.64 / pixelsPerUnit,
        height: layout.bounds.height * 0.78,
      }),
    ]),
    sockets: layout.sockets,
    interactions: Object.freeze([]),
  });
}

export function createRasterCharacterBlueprint(
  identity: CharacterIdentityRecipe,
  options: RasterCharacterRecipeOptions = {},
): AssetBlueprint {
  return createCharacterBlueprint(createRasterCharacterRecipe(identity, options));
}

export function characterRecipeFingerprint(recipe: CharacterRecipe): string {
  return `${recipe.version}:${recipe.identity.seed}:${recipe.identity.species}:${recipe.style.medium}`;
}

export function characterBoilSeed(recipe: CharacterRecipe, layerId: string, state: string, frame: number): number {
  return combineSeed(recipe.identity.seed, `character:boil:${layerId}:${state}:${frame}`);
}
