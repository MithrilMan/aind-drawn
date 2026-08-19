import { chaikin, closePath, type MutablePoint, type Point } from '../../core/geometry.js';
import { PAPER, type Sketch } from '../../core/sketch.js';
import { mediumById, type Medium } from '../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition, Size2 } from '../types.js';
import type { SceneryRecipe } from './recipe.js';

const PIXELS_PER_UNIT = 72;
const MARGIN = 10;

type BuildingMetrics = Readonly<{
  left: number;
  right: number;
  bottom: number;
  roofY: number;
  cellWidth: number;
  cellHeight: number;
}>;

function buildingMetrics(sketch: Sketch, recipe: SceneryRecipe): BuildingMetrics {
  const left = MARGIN;
  const right = sketch.width - MARGIN;
  const bottom = sketch.height - MARGIN;
  const roofY = MARGIN + ({
    flat: 20,
    gable: 50,
    crooked: 50,
    shed: 38,
    mansard: 60,
  } as const)[recipe.roof];
  return Object.freeze({
    left,
    right,
    bottom,
    roofY,
    cellWidth: (right - left) / recipe.columns,
    cellHeight: (bottom - roofY) / recipe.floors,
  });
}

function drawWindow(
  sketch: Sketch,
  medium: Medium,
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  lit: boolean,
  recipe: SceneryRecipe,
): void {
  const window = chaikin([
    [centerX - width / 2, centerY - height / 2],
    [centerX + width / 2, centerY - height / 2 + sketch.jitter(-2, 2)],
    [centerX + width / 2, centerY + height / 2],
    [centerX - width / 2, centerY + height / 2],
  ], true, 1);
  sketch.paperFill(window);
  medium.tone(sketch, window, {
    style: lit ? 'light' : 'black',
    color: lit ? recipe.palette.accent : recipe.palette.wall,
  });
  medium.edge(sketch, closePath(window), 3, { ghost: true });
  sketch.stroke(
    [[centerX, centerY - height / 2], [centerX, centerY + height / 2]],
    1.7,
    { alpha: 0.5 },
  );
}

function drawChimney(
  sketch: Sketch,
  medium: Medium,
  recipe: SceneryRecipe,
  metrics: BuildingMetrics,
): void {
  const { left, right, roofY } = metrics;
  if (!recipe.chimney.present) return;
  const chimneyWidth = Math.min(34, (right - left) * 0.1);
  const centerX = recipe.chimney.side === 'left'
    ? left + (right - left) * 0.22
    : right - (right - left) * 0.22;
  const topY = Math.max(MARGIN - 2, roofY - recipe.chimney.height * PIXELS_PER_UNIT);
  const chimney: readonly Point[] = [
    [centerX - chimneyWidth / 2, roofY + 5],
    [centerX - chimneyWidth * 0.42, topY],
    [centerX + chimneyWidth * 0.46, topY + sketch.jitter(-2, 2)],
    [centerX + chimneyWidth / 2, roofY + 5],
  ];
  sketch.paperFill(chimney);
  medium.tone(sketch, chimney, { style: 'hatch', color: recipe.palette.wall, gap: 7 });
  medium.edge(sketch, closePath(chimney), 3.2, { ghost: true });
  sketch.stroke(
    [[centerX - chimneyWidth * 0.55, topY], [centerX + chimneyWidth * 0.58, topY]],
    4,
    { ghost: true },
  );
}

function drawRoof(
  sketch: Sketch,
  recipe: SceneryRecipe,
  metrics: BuildingMetrics,
): void {
  const { left, right, roofY } = metrics;

  let roof: readonly Point[];
  if (recipe.roof === 'flat') {
    roof = [[left - 6, roofY], [right + 6, roofY]];
  } else if (recipe.roof === 'shed') {
    roof = [[left - 6, roofY - 24], [right + 6, roofY + 5]];
  } else if (recipe.roof === 'mansard') {
    roof = [
      [left - 6, roofY + 5],
      [left + (right - left) * 0.16, MARGIN + 13],
      [right - (right - left) * 0.18, MARGIN + 13 + sketch.jitter(-2, 2)],
      [right + 6, roofY + 5],
    ];
  } else {
    const peakX = recipe.roof === 'crooked' ? sketch.width * 0.63 : sketch.width * 0.5;
    roof = [[left - 6, roofY + 5], [peakX, MARGIN], [right + 6, roofY + 5]];
  }
  sketch.stroke(roof, 6.4, { alpha: 0.88, ghost: true, taper: 0.12 });
  if (recipe.roof === 'mansard') {
    sketch.stroke(
      [[left + (right - left) * 0.16, MARGIN + 13], [right - (right - left) * 0.18, MARGIN + 13]],
      3.2,
      { alpha: 0.62, ghost: true },
    );
  }
}

function drawBalconies(
  sketch: Sketch,
  recipe: SceneryRecipe,
  metrics: BuildingMetrics,
): void {
  for (const balcony of recipe.balconies) {
    const row = recipe.floors - 1 - balcony.floorFromGround;
    const left = metrics.left + metrics.cellWidth * balcony.startColumn + 4;
    const right = metrics.left
      + metrics.cellWidth * (balcony.startColumn + balcony.columnSpan) - 4;
    const floorY = metrics.roofY + metrics.cellHeight * (row + 0.84);
    sketch.stroke([[left - 6, floorY], [right + 6, floorY]], 6.2, {
      alpha: 0.9,
      ghost: true,
    });
    const railTop = floorY - Math.min(26, metrics.cellHeight * 0.28);
    sketch.stroke([[left, railTop], [right, railTop]], 2.8, {
      alpha: 0.78,
      ghost: true,
    });
    const posts = Math.max(2, balcony.columnSpan * 2);
    for (let index = 0; index <= posts; index += 1) {
      const x = left + ((right - left) * index) / posts;
      sketch.stroke([[x, railTop], [x + sketch.jitter(-1.2, 1.2), floorY]], 2.2, {
        alpha: 0.7,
      });
    }
  }
}

function drawBuildingShell(sketch: Sketch, recipe: SceneryRecipe, medium: Medium): void {
  const metrics = buildingMetrics(sketch, recipe);
  const { left, right, bottom, roofY, cellWidth, cellHeight } = metrics;
  const wall: MutablePoint[] = [
    [left + sketch.jitter(-2, 3), roofY],
    [right + sketch.jitter(-3, 2), roofY + sketch.jitter(-3, 3)],
    [right, bottom],
    [left, bottom],
  ];
  sketch.paperFill(wall);
  medium.tone(sketch, wall, { style: recipe.tone, color: recipe.palette.wall, gap: 11 });
  medium.edge(sketch, closePath(wall), 4.4, { ghost: true, amplitude: 1.1 });

  for (let row = 0; row < recipe.floors; row += 1) {
    for (let column = 0; column < recipe.columns; column += 1) {
      if (row === recipe.floors - 1 && column === recipe.door.column) continue;
      const centerX = left + cellWidth * (column + 0.5);
      const centerY = roofY + cellHeight * (row + 0.52);
      const lit = ((row * 17 + column * 31 + recipe.seed) & 3) === 0;
      drawWindow(
        sketch,
        medium,
        centerX,
        centerY,
        Math.min(cellWidth * 0.45, 42),
        Math.min(cellHeight * 0.46, 42),
        lit,
        recipe,
      );
    }
  }
}

function doorPolygon(
  centerX: number,
  bottom: number,
  width: number,
  height: number,
  arched: boolean,
): readonly Point[] {
  if (!arched) {
    return [
      [centerX - width / 2, bottom - height],
      [centerX + width / 2, bottom - height],
      [centerX + width / 2, bottom],
      [centerX - width / 2, bottom],
    ];
  }
  return [
    [centerX - width / 2, bottom],
    [centerX - width / 2, bottom - height * 0.76],
    [centerX - width * 0.34, bottom - height * 0.94],
    [centerX, bottom - height],
    [centerX + width * 0.34, bottom - height * 0.94],
    [centerX + width / 2, bottom - height * 0.76],
    [centerX + width / 2, bottom],
  ];
}

function drawDoor(
  sketch: Sketch,
  recipe: SceneryRecipe,
  medium: Medium,
  state: string,
): void {
  const metrics = buildingMetrics(sketch, recipe);
  const centerX = metrics.left + metrics.cellWidth * (recipe.door.column + 0.5);
  const width = Math.min(metrics.cellWidth * 0.58, 50);
  const height = Math.min(metrics.cellHeight * 0.88, 72);
  const opening = doorPolygon(
    centerX,
    metrics.bottom,
    width,
    height,
    recipe.door.style === 'arched',
  );
  medium.tone(sketch, opening, { style: 'black', color: recipe.palette.wall });
  medium.edge(sketch, closePath(opening), 3.5, { ghost: true });

  if (state === 'open') {
    const panel: readonly Point[] = [
      [centerX + width / 2, metrics.bottom - height * 0.92],
      [centerX + width * 0.96, metrics.bottom - height * 0.78],
      [centerX + width * 0.96, metrics.bottom],
      [centerX + width / 2, metrics.bottom],
    ];
    sketch.paperFill(panel);
    medium.tone(sketch, panel, { style: 'hatch', color: recipe.palette.accent, gap: 7 });
    medium.edge(sketch, closePath(panel), 3.1, { ghost: true });
    return;
  }

  sketch.paperFill(opening);
  medium.tone(sketch, opening, {
    style: recipe.door.style === 'panel' ? 'light' : 'hatch',
    color: recipe.palette.accent,
    gap: 7,
  });
  medium.edge(sketch, closePath(opening), 3.1, { ghost: true });
  if (recipe.door.style === 'plank') {
    for (let offset = -0.25; offset <= 0.25; offset += 0.25) {
      const x = centerX + width * offset;
      sketch.stroke([[x, metrics.bottom - height * 0.84], [x, metrics.bottom - 3]], 1.6, {
        alpha: 0.45,
      });
    }
  } else if (recipe.door.style === 'panel') {
    sketch.stroke([
      [centerX - width * 0.28, metrics.bottom - height * 0.48],
      [centerX + width * 0.28, metrics.bottom - height * 0.48],
    ], 2, { alpha: 0.52 });
  }
  sketch.context.fillStyle = PAPER;
  sketch.wobblyEllipse(centerX + width * 0.28, metrics.bottom - height * 0.43, 2.2, 2.2);
  sketch.context.fill();
}

function drawPlatform(sketch: Sketch, recipe: SceneryRecipe, medium: Medium): void {
  const top = 14;
  const bottom = sketch.height - 8;
  const shape = chaikin([
    [8, top + sketch.jitter(-3, 3)],
    [sketch.width - 8, top + sketch.jitter(-3, 3)],
    [sketch.width - 13, bottom],
    [14, bottom - sketch.jitter(0, 5)],
  ], true, 1);
  sketch.paperFill(shape);
  medium.tone(sketch, shape, { style: recipe.tone, color: recipe.palette.wall, gap: 9 });
  medium.edge(sketch, closePath(shape), 4.2, { ghost: true, amplitude: 0.9 });
  sketch.stroke([[7, top], [sketch.width - 7, top]], 5.2, { alpha: 0.88, ghost: true });
  for (let x = 35; x < sketch.width - 20; x += 52) {
    sketch.stroke([[x, top + 12], [x + sketch.jitter(-8, 8), bottom - 6]], 1.6, {
      alpha: 0.3,
    });
  }
}

function createLayer(
  id: string,
  order: number,
  canvas: Size2,
  world: Size2,
  states: readonly string[],
  draw: LayerDefinition['draw'],
): LayerDefinition {
  return Object.freeze({
    id,
    bone: 'root',
    order,
    depth: 0,
    canvas,
    world,
    position: Object.freeze({ x: 0, y: -MARGIN / PIXELS_PER_UNIT }),
    pivot: [0.5, 0] as const,
    states,
    draw,
  });
}

export function createSceneryBlueprint(recipe: SceneryRecipe): AssetBlueprint {
  const canvas: Size2 = Object.freeze({
    width: Math.ceil(recipe.width * PIXELS_PER_UNIT) + MARGIN * 2,
    height: Math.ceil(recipe.height * PIXELS_PER_UNIT) + MARGIN * 2,
  });
  const world = Object.freeze({
    width: canvas.width / PIXELS_PER_UNIT,
    height: canvas.height / PIXELS_PER_UNIT,
  });

  if (recipe.scenery === 'platform') {
    const layer = createLayer('scenery', 0, canvas, world, ['idle'], ({ sketch }) => {
      drawPlatform(sketch, recipe, mediumById(recipe.medium));
    });
    return Object.freeze({
      id: `scenery:${recipe.scenery}:${recipe.seed}`,
      kind: `scenery:${recipe.scenery}`,
      seed: recipe.seed,
      medium: recipe.medium,
      bounds: Object.freeze({
        x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
      }),
      layers: Object.freeze([layer]),
      colliders: Object.freeze([Object.freeze({
        id: 'body', kind: 'solid', shape: 'rectangle',
        x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
      })]),
      sockets: Object.freeze({
        base: Object.freeze({ x: 0, y: 0 }),
        top: Object.freeze({ x: 0, y: recipe.height }),
      }),
      interactions: Object.freeze([]),
    });
  }

  const chimney = createLayer('building:chimney', -1, canvas, world, ['idle'], ({ sketch }) => {
    drawChimney(sketch, mediumById(recipe.medium), recipe, buildingMetrics(sketch, recipe));
  });
  const shell = createLayer('building:shell', 0, canvas, world, ['idle'], ({ sketch }) => {
    drawBuildingShell(sketch, recipe, mediumById(recipe.medium));
  });
  const roof = createLayer('building:roof', 1, canvas, world, ['idle'], ({ sketch }) => {
    drawRoof(sketch, recipe, buildingMetrics(sketch, recipe));
  });
  const balconies = createLayer('building:balconies', 2, canvas, world, ['idle'], ({ sketch }) => {
    drawBalconies(sketch, recipe, buildingMetrics(sketch, recipe));
  });
  const door = createLayer('door', 3, canvas, world, ['closed', 'open'], ({ sketch, state }) => {
    drawDoor(sketch, recipe, mediumById(recipe.medium), state);
  });
  const cellWidth = recipe.width / recipe.columns;
  const doorX = -recipe.width / 2 + cellWidth * (recipe.door.column + 0.5);
  const sensorWidth = Math.min(1.35, cellWidth * 0.95);

  return Object.freeze({
    id: `scenery:${recipe.scenery}:${recipe.seed}`,
    kind: `scenery:${recipe.scenery}`,
    seed: recipe.seed,
    medium: recipe.medium,
    bounds: Object.freeze({
      x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
    }),
    layers: Object.freeze([chimney, shell, roof, balconies, door]),
    colliders: Object.freeze([
      Object.freeze({
        id: 'body', kind: 'solid', shape: 'rectangle',
        x: -recipe.width / 2, y: 0, width: recipe.width, height: recipe.height,
      }),
      Object.freeze({
        id: 'door:sensor', kind: 'sensor', shape: 'rectangle',
        x: doorX - sensorWidth / 2, y: 0, width: sensorWidth, height: 1.45,
      }),
    ]),
    sockets: Object.freeze({
      base: Object.freeze({ x: 0, y: 0 }),
      top: Object.freeze({ x: 0, y: recipe.height }),
      'door:entry': Object.freeze({ x: doorX, y: 0 }),
    }),
    interactions: Object.freeze([Object.freeze({
      id: 'door',
      kind: 'portal',
      sensorColliderId: 'door:sensor',
      activationSocketId: 'door:entry',
      initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      layerBindings: Object.freeze([Object.freeze({
        layerId: 'door',
        stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
      })]),
    })]),
  });
}
