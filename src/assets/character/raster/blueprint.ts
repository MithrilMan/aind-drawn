import { chaikin, closePath, type MutablePoint, type Point } from '../../../core/geometry.js';
import { combineSeed } from '../../../core/random.js';
import { PAPER, PAPER_RGB, type Sketch } from '../../../core/sketch.js';
import { mediumById, type Medium } from '../../../materials/medium.js';
import type {
  AssetBlueprint,
  LayerDefinition,
  Pose2,
  RasterBoneDefinition,
  Size2,
  Vector2,
} from '../../../contracts/raster-asset.js';
import type { CharacterIdentityRecipe } from '../identity/recipe.js';
import { createCharacterEyewearProfile } from '../identity/accessory-profile.js';
import { createCharacterRoundEarProfile } from '../identity/ear-profile.js';
import {
  createCharacterFacialHairProfile,
  type CharacterFacialHairComponent,
  type CharacterFacialHairProfile,
} from '../identity/facial-hair-profile.js';
import { createCharacterHairProfile } from '../identity/hair-profile.js';
import { characterEyeRadius, createCharacterEyeProfile } from '../identity/eye-profile.js';
import { createCharacterMouthProfile } from '../identity/mouth-profile.js';
import { createCharacterNoseProfile } from '../identity/nose-profile.js';
import {
  createCharacterTearProfile,
  type CharacterTearComponent,
} from '../identity/tear-profile.js';
import { createCharacterOutfitProfile } from '../identity/outfit-profile.js';
import {
  CHARACTER_SEMANTIC_MANIFEST,
  characterSemanticPartId,
} from '../identity/semantics.js';
import { characterFlowCapability } from './capabilities.js';
import { buildCharacterLayout, CHARACTER_IDENTITY_PIXEL_SCALE } from './layout.js';
import {
  createRasterCharacterRecipe,
  type CharacterRecipe,
  type EyeStyle,
  type RasterCharacterRecipeOptions,
} from './recipe.js';

const HEAD_CANVAS: Size2 = Object.freeze({ width: 196, height: 196 });
const FACIAL_HAIR_CANVAS: Size2 = Object.freeze({ width: 220, height: 260 });
const EYE_CANVAS: Size2 = Object.freeze({ width: 72, height: 72 });
const BROW_CANVAS: Size2 = Object.freeze({ width: 72, height: 36 });
const NOSE_CANVAS: Size2 = Object.freeze({ width: 72, height: 96 });
const MOUTH_CANVAS: Size2 = Object.freeze({ width: 104, height: 66 });
const TEAR_CANVAS: Size2 = Object.freeze({ width: 48, height: 88 });
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

type RasterLayerAuthoring = Omit<LayerDefinition, 'world' | 'semanticPartId'> & Readonly<{
  pixelsPerUnit: number;
  position: Vector2;
  parentBone?: string;
}>;

type AuthoredRasterLayer = Readonly<{
  layer: LayerDefinition;
  bone: RasterBoneDefinition;
}>;

function pose(position: Vector2, rotation = 0): Pose2 {
  return Object.freeze({ position, rotation });
}

function layer(definition: RasterLayerAuthoring): AuthoredRasterLayer {
  const { pixelsPerUnit, position, parentBone, ...rest } = definition;
  return Object.freeze({
    layer: Object.freeze({
      ...rest,
      semanticPartId: characterSemanticPartId(rest.id),
      world: toWorld(rest.canvas, pixelsPerUnit),
    }),
    bone: Object.freeze({
      id: rest.bone,
      ...(parentBone === undefined ? {} : { parentBone }),
      restPose: pose(position),
    }),
  });
}

function finalizeLayers(authored: readonly AuthoredRasterLayer[]): Readonly<{
  bones: readonly RasterBoneDefinition[];
  layers: readonly LayerDefinition[];
}> {
  const bones = new Map<string, RasterBoneDefinition>();
  bones.set('root', Object.freeze({ id: 'root', restPose: pose(Object.freeze({ x: 0, y: 0 })) }));
  for (const entry of authored) {
    const candidate = entry.bone.parentBone === undefined
      ? Object.freeze({ ...entry.bone, parentBone: 'root' })
      : entry.bone;
    const existing = bones.get(candidate.id);
    if (existing === undefined) {
      bones.set(candidate.id, candidate);
      continue;
    }
    if (
      existing.parentBone !== candidate.parentBone
      || existing.restPose.position.x !== candidate.restPose.position.x
      || existing.restPose.position.y !== candidate.restPose.position.y
      || existing.restPose.rotation !== candidate.restPose.rotation
    ) {
      throw new Error(`Character bone ${candidate.id} has conflicting authoring poses`);
    }
  }
  return Object.freeze({
    bones: Object.freeze([...bones.values()]),
    layers: Object.freeze(authored.map((entry) => entry.layer)),
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
  if (recipe.identity.ears.style === 'none') return;
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2;
  const roundProfile = createCharacterRoundEarProfile(recipe.identity);
  for (const side of [-1, 1]) {
    const points = roundProfile !== null
      ? sketch.blobPoints(
        centerX + side * roundProfile.center[0] * CHARACTER_IDENTITY_PIXEL_SCALE,
        centerY - roundProfile.center[1] * CHARACTER_IDENTITY_PIXEL_SCALE,
        roundProfile.radii[0] * CHARACTER_IDENTITY_PIXEL_SCALE,
        roundProfile.radii[1] * CHARACTER_IDENTITY_PIXEL_SCALE,
        0,
        0.24,
      )
      : recipe.identity.species === 'cat'
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
    if (roundProfile !== null) {
      sketch.setInk(recipe.identity.palette.skinAccent);
      sketch.stroke(chaikin([
        [centerX + side * 51, centerY - 11],
        [centerX + side * 63, centerY - 1],
        [centerX + side * 52, centerY + 13],
      ], false, 2), 3 * recipe.style.linePressure, { alpha: 0.58, taper: 0.24 });
      sketch.setInk(null);
    }
  }
}

function drawHair(
  sketch: Sketch,
  recipe: CharacterRecipe,
  medium: Medium,
  headWidth: number,
  headHeight: number,
): void {
  const profile = createCharacterHairProfile(recipe.identity);
  if (profile === null) return;
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2;
  const points: MutablePoint[] = profile.outline.map(([x, y]) => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  medium.tone(sketch, points, {
    style: recipe.style.hairTone, color: recipe.identity.palette.hair, gap: 7,
  });
  medium.edge(sketch, closePath(points), 4 * recipe.style.linePressure, { ghost: true });
}

function drawOutfit(sketch: Sketch, recipe: CharacterRecipe, canvas: Size2): void {
  if (recipe.identity.species === 'cat' || recipe.identity.outfit.style === 'plain') return;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const halfWidth = canvas.width * 0.28;
  const halfHeight = canvas.height * 0.32;
  const profile = createCharacterOutfitProfile(recipe.identity);
  sketch.setInk(recipe.identity.palette.accent);
  for (const mark of profile.marks) {
    const points = mark.outline.map(([x, y]): MutablePoint => [
      centerX + x * halfWidth,
      centerY - y * halfHeight,
    ]);
    sketch.inkFill(points, mark.id === 'stripe' ? 0.5 : 0.56);
    sketch.stroke(closePath(points), 1.8 * recipe.style.linePressure, {
      alpha: 0.58, amplitude: 0.42, taper: 0.1, ghost: true,
    });
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
  const radius = characterEyeRadius(recipe.identity) * CHARACTER_IDENTITY_PIXEL_SCALE;
  const profile = createCharacterEyeProfile(recipe.identity, style);
  if (state === 'closed') {
    sketch.stroke(chaikin([
      [centerX - radius, centerY + 2],
      [centerX, centerY - 5],
      [centerX + radius, centerY + 2],
    ], false, 1), 2.8 * recipe.style.linePressure, { taper: 0.28 });
    return;
  }

  const gazeX = state === 'left' ? -radius * 0.42 : state === 'right' ? radius * 0.42 : 0;
  if (profile.field === 'none') {
    pupil(
      sketch,
      centerX + gazeX,
      centerY - profile.pupilOffsetY * radius,
      radius * profile.pupilRadius,
      recipe.identity.eyes.glint,
      recipe.identity.species === 'cat',
    );
    for (const stroke of profile.strokes) {
      sketch.stroke(stroke.points.map(([x, y]) => [
        centerX + x * radius,
        centerY - y * radius,
      ]), stroke.width * radius * 2 * recipe.style.linePressure, { taper: 0.2 });
    }
    return;
  }
  if (profile.field === 'star') {
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
  if (profile.field === 'ink') {
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
    centerY - profile.pupilOffsetY * radius,
    radius * profile.pupilRadius,
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
  const profile = createCharacterNoseProfile(recipe.identity);
  if (profile === null) return;
  const radiusX = profile.radii[0] * 96;
  const radiusY = profile.radii[1] * 96;
  sketch.setInk(recipe.identity.species === 'robot'
    ? recipe.identity.palette.accent
    : recipe.identity.nose.style === 'drop'
      ? recipe.identity.palette.skinAccent
      : recipe.identity.palette.skin);
  sketch.context.fillStyle = sketch.inkAlpha(0.5);
  sketch.wobblyEllipse(centerX, centerY, radiusX, radiusY);
  sketch.context.fill();
  sketch.setInk(null);
  sketch.stroke(
    sketch.blobPoints(centerX, centerY, radiusX, radiusY, 0, 0.2),
    1.8 * recipe.style.linePressure,
    { alpha: 0.62, taper: 0.12 },
  );
}

function drawFacialHairComponent(
  sketch: Sketch,
  recipe: CharacterRecipe,
  medium: Medium,
  component: CharacterFacialHairComponent,
  headWidth: number,
  headHeight: number,
  canvas: Size2,
): void {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const points: MutablePoint[] = component.outline.map(([x, y]) => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  sketch.paperFill(points);
  medium.tone(sketch, points, {
    style: recipe.style.hairTone,
    color: recipe.identity.palette.hair,
    gap: component.id.startsWith('moustache') ? 5 : 6,
  });
  medium.edge(sketch, closePath(points), 2.7 * recipe.style.linePressure, { ghost: true });
}

function drawFacialHairBeard(
  sketch: Sketch,
  recipe: CharacterRecipe,
  medium: Medium,
  profile: CharacterFacialHairProfile,
  headWidth: number,
  headHeight: number,
): void {
  const centerX = FACIAL_HAIR_CANVAS.width / 2;
  const centerY = FACIAL_HAIR_CANVAS.height / 2;
  const points: MutablePoint[] = profile.beard.outline.map(([x, y]) => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  sketch.paperFill(points);
  medium.tone(sketch, points, {
    style: recipe.style.hairTone,
    color: recipe.identity.palette.hair,
    gap: 6,
  });
  medium.edge(sketch, closePath(points), 2.9 * recipe.style.linePressure, { ghost: true });
}

function drawFacialHairOpening(
  sketch: Sketch,
  recipe: CharacterRecipe,
  medium: Medium,
  opening: CharacterFacialHairProfile['opening'],
  headWidth: number,
  headHeight: number,
): void {
  const centerX = FACIAL_HAIR_CANVAS.width / 2;
  const centerY = FACIAL_HAIR_CANVAS.height / 2;
  const points: MutablePoint[] = opening.outline.map(([x, y]) => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  sketch.paperFill(points);
  medium.skin(sketch, points, recipe.identity.palette.skin, { gap: 8 });
  medium.edge(sketch, closePath(points), 1.35 * recipe.style.linePressure, { ghost: true });
}

function roundedFrameOutline(
  center: Point,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): readonly Point[] {
  const [x, y] = center;
  return chaikin([
    [x - halfWidth + radius, y - halfHeight],
    [x + halfWidth - radius, y - halfHeight],
    [x + halfWidth, y - halfHeight + radius],
    [x + halfWidth, y + halfHeight - radius],
    [x + halfWidth - radius, y + halfHeight],
    [x - halfWidth + radius, y + halfHeight],
    [x - halfWidth, y + halfHeight - radius],
    [x - halfWidth, y - halfHeight + radius],
  ], true, 2);
}

function drawEyewear(
  sketch: Sketch,
  recipe: CharacterRecipe,
  headWidth: number,
  headHeight: number,
): void {
  const profile = createCharacterEyewearProfile(recipe.identity);
  if (profile === null) return;
  const centerX = HEAD_CANVAS.width / 2;
  const centerY = HEAD_CANVAS.height / 2;
  const project = ([x, y]: Point): Point => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ];
  const halfWidth = profile.lensHalfSize[0] * headWidth * 0.5;
  const halfHeight = profile.lensHalfSize[1] * headHeight * 0.5;
  const lineWidth = Math.max(4, profile.frameThickness * headWidth);
  const centers = profile.lensCenters.map(project) as [Point, Point];
  sketch.setInk(profile.accessory.color);
  for (const center of centers) {
    sketch.stroke(
      closePath(roundedFrameOutline(center, halfWidth, halfHeight, lineWidth * 0.75)),
      lineWidth,
      { amplitude: 0.22, taper: 0.04, ghost: true },
    );
  }
  const innerLeft = centers[0][0] + halfWidth;
  const innerRight = centers[1][0] - halfWidth;
  const bridgeY = (centers[0][1] + centers[1][1]) * 0.5 - halfHeight * 0.18;
  sketch.stroke([[innerLeft, bridgeY], [innerRight, bridgeY]], lineWidth, {
    amplitude: 0.18, taper: 0.04, ghost: true,
  });
  const outerY = bridgeY - halfHeight * 0.15;
  sketch.stroke([
    [centers[0][0] - halfWidth, outerY], [centerX - headWidth * 0.56, outerY + 8],
  ], lineWidth * 0.72, { alpha: 0.84, taper: 0.08 });
  sketch.stroke([
    [centers[1][0] + halfWidth, outerY], [centerX + headWidth * 0.56, outerY + 8],
  ], lineWidth * 0.72, { alpha: 0.84, taper: 0.08 });
  sketch.setInk(null);
}

function drawMouth(
  sketch: Sketch,
  recipe: CharacterRecipe,
  state: string,
  headWidth: number,
  headHeight: number,
): void {
  const centerX = MOUTH_CANVAS.width / 2;
  const centerY = MOUTH_CANVAS.height / 2;
  const expression = state === 'open' ? 'surprised' : state;
  const resolvedExpression = expression === 'happy' || expression === 'angry'
    || expression === 'sad' || expression === 'surprised' || expression === 'scared'
    || expression === 'crying' || expression === 'sleeping'
    ? expression
    : 'idle';
  const profile = createCharacterMouthProfile(
    recipe.identity.mouth,
    resolvedExpression,
  );
  const project = (points: readonly Point[]): MutablePoint[] => points.map(([x, y]) => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  for (const mouthLayer of profile.layers) {
    const outline = project(mouthLayer.outline);
    if (mouthLayer.role === 'tooth') {
      sketch.paperFill(outline);
    } else if (mouthLayer.role === 'tongue') {
      sketch.paperFill(outline);
      sketch.setInk(recipe.identity.palette.accent);
      sketch.inkFill(outline, 0.46);
      sketch.setInk(null);
    } else {
      sketch.inkFill(outline, mouthLayer.role === 'interior' ? 0.94 : 0.82);
    }
    sketch.stroke(closePath(outline), 1.35 * recipe.style.linePressure, {
      alpha: mouthLayer.role === 'interior' ? 0.5 : 0.72,
      amplitude: 0.32,
      taper: 0.08,
    });
  }
  for (const mouthStroke of profile.strokes) {
    sketch.stroke(project(mouthStroke.points), 1.15 * recipe.style.linePressure, {
      alpha: 0.68,
      amplitude: 0.22,
      taper: 0.12,
    });
  }
}

function drawTearComponent(
  sketch: Sketch,
  recipe: CharacterRecipe,
  state: string,
  side: -1 | 1,
  component: CharacterTearComponent,
  headWidth: number,
  headHeight: number,
): void {
  if (state !== 'crying') return;
  const centerX = TEAR_CANVAS.width / 2;
  const centerY = TEAR_CANVAS.height / 2;
  const outline = component.outline.map(([x, y]): MutablePoint => [
    centerX + x * headWidth * 0.5,
    centerY - y * headHeight * 0.5,
  ]);
  sketch.paperFill(outline);
  sketch.setInk(recipe.identity.palette.tear);
  sketch.inkFill(outline, component.id === 'stream' ? 0.28 : 0.42);
  sketch.stroke(closePath(outline), 1.35 * recipe.style.linePressure, {
    alpha: component.id === 'stream' ? 0.68 : 0.78,
    amplitude: component.id === 'stream' ? 0.36 : 0.28,
    taper: component.id === 'stream' ? 0.22 : 0.12,
  });
  const ys = outline.map(([, y]) => y);
  const xs = outline.map(([x]) => x);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  sketch.setInk(PAPER_RGB);
  sketch.stroke([
    [centerX - side * (right - left) * 0.1, top + (bottom - top) * 0.18],
    [centerX + side * (right - left) * 0.08, top + (bottom - top) * 0.58],
  ], Math.max(0.75, recipe.style.linePressure * 0.82), {
    alpha: component.id === 'stream' ? 0.62 : 0.78,
    amplitude: 0.16,
    taper: 0.42,
  });
  sketch.setInk(null);
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

export function createCharacterBlueprint(recipe: CharacterRecipe): AssetBlueprint<'character'> {
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
  const tearProfile = createCharacterTearProfile(recipe.identity);
  const facialHairProfile = createCharacterFacialHairProfile(recipe.identity);
  const tearAnchorOffsetPixels = layout.eyes.radiusPixels
    * (1 + tearProfile.attachmentClearanceInEyeRadii);

  const authoredLayers: AuthoredRasterLayer[] = [
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
      draw: ({ sketch }) => {
        drawHair(sketch, recipe, medium, layout.head.widthPixels, layout.head.heightPixels);
      },
    }),
    ...(recipe.identity.species === 'cat' ? [layer({
      id: 'muzzle', bone: 'head', order: 3, depth: 0.72,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: headPosition,
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => { drawCatMuzzle(sketch, recipe); },
    })] : []),
    ...(facialHairProfile === null ? [] : [layer({
      id: 'facial-hair:beard', bone: 'facial-hair:beard', parentBone: 'head',
      order: 3.05, depth: 0.735,
      canvas: FACIAL_HAIR_CANVAS, pixelsPerUnit, position: { x: 0, y: 0 },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => {
        drawFacialHairBeard(
          sketch,
          recipe,
          medium,
          facialHairProfile,
          layout.head.widthPixels,
          layout.head.heightPixels,
        );
      },
    })]),
    ...(facialHairProfile?.components.map((component, index) => layer({
      id: `facial-hair:${component.id}`,
      bone: `facial-hair:${component.id}`,
      parentBone: 'head', order: 3.15 + index * 0.01, depth: 0.745,
      canvas: FACIAL_HAIR_CANVAS, pixelsPerUnit, position: { x: 0, y: 0 },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => {
        drawFacialHairComponent(
          sketch,
          recipe,
          medium,
          component,
          layout.head.widthPixels,
          layout.head.heightPixels,
          FACIAL_HAIR_CANVAS,
        );
      },
    })) ?? []),
    ...(facialHairProfile === null ? [] : [layer({
      id: 'facial-hair:opening', bone: 'facial-hair:opening', parentBone: 'head',
      order: 3.35, depth: 0.755,
      canvas: FACIAL_HAIR_CANVAS, pixelsPerUnit, position: { x: 0, y: 0 },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => {
        drawFacialHairOpening(
          sketch,
          recipe,
          medium,
          facialHairProfile.opening,
          layout.head.widthPixels,
          layout.head.heightPixels,
        );
      },
    })]),
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
    ...(createCharacterEyewearProfile(recipe.identity) === null ? [] : [layer({
      id: 'accessory:eyewear', bone: 'accessory:eyewear', parentBone: 'head',
      order: 4.4, depth: 0.84,
      canvas: HEAD_CANVAS, pixelsPerUnit, position: { x: 0, y: 0 },
      pivot: [0.5, 0.5], states: ['idle'],
      draw: ({ sketch }) => {
        drawEyewear(sketch, recipe, layout.head.widthPixels, layout.head.heightPixels);
      },
    })]),
    ...([-1, 1] as const).flatMap((side) => {
      const sideId = side < 0 ? 'left' : 'right';
      const eye = side < 0 ? layout.eyes.left : layout.eyes.right;
      return tearProfile.components.map((component, componentIndex) => layer({
        id: `tear:${sideId}:${component.id}`,
        bone: `tear:${sideId}:${component.id}`,
        parentBone: 'head', order: 4.6 + componentIndex * 0.01, depth: 0.86,
        canvas: TEAR_CANVAS, pixelsPerUnit,
        position: {
          x: eye.x - headPosition.x
            + side * component.offset[0] * layout.head.widthPixels * 0.5 / pixelsPerUnit,
          y: eye.y - headPosition.y
            - tearAnchorOffsetPixels / pixelsPerUnit
            + component.offset[1] * layout.head.heightPixels * 0.5 / pixelsPerUnit,
        },
        pivot: [0.5, 0.5], states: ['idle', 'crying'],
        capabilities: Object.freeze([characterFlowCapability({
          attachment: component.id === 'stream' ? 'source' : 'free',
          activationState: 'crying',
          phase: component.phase + (side < 0 ? 0 : 0.33),
          travel: Object.freeze({
            x: component.travel[0] === 0
              ? 0
              : side * component.travel[0] * layout.head.widthPixels * 0.5 / pixelsPerUnit,
            y: component.travel[1] * layout.head.heightPixels * 0.5 / pixelsPerUnit,
          }),
          pulse: component.pulse,
        })]),
        draw: ({ sketch, state }) => {
          drawTearComponent(
            sketch,
            recipe,
            state,
            side,
            component,
            layout.head.widthPixels,
            layout.head.heightPixels,
          );
        },
      }));
    }),
    layer({
      id: 'mouth', bone: 'mouth', order: 5, depth: 0.9,
      canvas: MOUTH_CANVAS, pixelsPerUnit,
      position: {
        x: layout.mouth.x - headPosition.x,
        y: layout.mouth.y - headPosition.y,
      },
      parentBone: 'head',
      pivot: [0.5, 0.5],
      states: [
        'idle', 'open', 'happy', 'angry', 'sad', 'surprised',
        'scared', 'crying', 'sleeping',
      ],
      draw: ({ sketch, state }) => {
        drawMouth(sketch, recipe, state, layout.head.widthPixels, layout.head.heightPixels);
      },
    }),
  ];

  const projection = finalizeLayers(authoredLayers);
  const bodyWidth = layout.torso.widthPixels * 0.64 / pixelsPerUnit;
  const bodyHeight = layout.bounds.height * 0.78;

  return Object.freeze({
    blueprintVersion: 1,
    family: 'character',
    representation: 'raster',
    assetId: `character:${recipe.identity.seed}`,
    seed: recipe.identity.seed,
    medium: recipe.style.medium,
    manifest: CHARACTER_SEMANTIC_MANIFEST,
    bounds: layout.bounds,
    bones: projection.bones,
    layers: projection.layers,
    colliders: Object.freeze([
      Object.freeze({
        id: 'body',
        kind: 'solid',
        shape: 'rectangle',
        bone: 'root',
        localPose: pose(Object.freeze({ x: 0, y: bodyHeight * 0.5 })),
        size: Object.freeze({ width: bodyWidth, height: bodyHeight }),
      }),
      Object.freeze({
        id: 'head', kind: 'solid', shape: 'rectangle', bone: 'head',
        localPose: pose(Object.freeze({ x: 0, y: 0 })),
        size: Object.freeze({
          width: layout.head.widthPixels / pixelsPerUnit,
          height: layout.head.heightPixels / pixelsPerUnit,
        }),
      }),
    ]),
    sockets: Object.freeze([
      Object.freeze({
        id: 'feet', bone: 'root',
        localPose: pose(Object.freeze({ x: 0, y: 0 })),
      }),
      Object.freeze({
        id: 'head', bone: 'head',
        localPose: pose(Object.freeze({ x: 0, y: 0 })),
      }),
      Object.freeze({
        id: 'crown', bone: 'head',
        localPose: pose(Object.freeze({
          x: 0, y: layout.head.heightPixels * 0.5 / pixelsPerUnit,
        })),
      }),
      Object.freeze({
        id: 'face', bone: 'head',
        localPose: pose(Object.freeze({ x: 0, y: 0 })),
      }),
      Object.freeze({
        id: 'hand:left', bone: 'arm:left',
        localPose: pose(Object.freeze({
          x: -layout.limbs.armLengthPixels * 0.24 / pixelsPerUnit,
          y: -layout.limbs.armLengthPixels * 0.78 / pixelsPerUnit,
        })),
      }),
      Object.freeze({
        id: 'hand:right', bone: 'arm:right',
        localPose: pose(Object.freeze({
          x: layout.limbs.armLengthPixels * 0.24 / pixelsPerUnit,
          y: -layout.limbs.armLengthPixels * 0.78 / pixelsPerUnit,
        })),
      }),
      Object.freeze({
        id: 'tail', bone: recipe.identity.tail.present ? 'tail' : 'torso',
        localPose: pose(recipe.identity.tail.present
          ? Object.freeze({ x: 0, y: 0 })
          : Object.freeze({
            x: tailSocket.x - layout.torso.center.x,
            y: tailSocket.y - layout.torso.center.y,
          })),
      }),
    ]),
    interactionBindings: Object.freeze([]),
  });
}

export function createRasterCharacterBlueprint(
  identity: CharacterIdentityRecipe,
  options: RasterCharacterRecipeOptions = {},
): AssetBlueprint<'character'> {
  return createCharacterBlueprint(createRasterCharacterRecipe(identity, options));
}

export function characterRecipeFingerprint(recipe: CharacterRecipe): string {
  return `${recipe.schemaVersion}:${recipe.identity.seed}:${recipe.identity.species}:${recipe.style.medium}`;
}

export function characterBoilSeed(recipe: CharacterRecipe, layerId: string, state: string, frame: number): number {
  return combineSeed(recipe.identity.seed, `character:boil:${layerId}:${state}:${frame}`);
}
