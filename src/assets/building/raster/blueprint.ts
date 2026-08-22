import { closePath, type MutablePoint, type Point } from '../../../core/geometry.js';
import { PAPER, type Sketch } from '../../../core/sketch.js';
import { mediumById, type Medium } from '../../../materials/medium.js';
import {
  createBuildingFacadeGeometry,
  type BuildingFacadeGeometry,
} from '../identity/geometry.js';
import type { AssetBlueprint, LayerDefinition, Size2 } from '../../../contracts/raster-asset.js';
import type { RasterBuildingRecipe } from './recipe.js';

const PIXELS_PER_UNIT = 72;
const MARGIN = 10;

type BuildingMetrics = Readonly<{
  left: number;
  right: number;
  bottom: number;
  roofY: number;
  facade: BuildingFacadeGeometry;
}>;

function buildingMetrics(sketch: Sketch, recipe: RasterBuildingRecipe): BuildingMetrics {
  const facade = createBuildingFacadeGeometry(recipe.identity);
  const left = MARGIN;
  const right = sketch.width - MARGIN;
  const bottom = sketch.height - MARGIN;
  const roofY = bottom - facade.wallHeight * PIXELS_PER_UNIT;
  return Object.freeze({
    left,
    right,
    bottom,
    roofY,
    facade,
  });
}

function drawWindow(
  sketch: Sketch,
  medium: Medium,
  centerX: number,
  centerY: number,
  profile: readonly Point[],
  lit: boolean,
  recipe: RasterBuildingRecipe,
): void {
  const window = profile.map(([x, y]): Point => [
    centerX + x * PIXELS_PER_UNIT,
    centerY - y * PIXELS_PER_UNIT,
  ]);
  sketch.paperFill(window);
  medium.tone(sketch, window, {
    style: lit ? 'light' : 'black',
    color: lit ? recipe.identity.palette.accent : recipe.identity.palette.glass,
  });
  medium.edge(sketch, closePath(window), 3, { ghost: true });
  const minimumY = Math.min(...window.map(([, y]) => y));
  const maximumY = Math.max(...window.map(([, y]) => y));
  sketch.stroke(
    [[centerX, minimumY], [centerX, maximumY]],
    1.7,
    { alpha: 0.5 },
  );
}

function drawChimney(
  sketch: Sketch,
  medium: Medium,
  recipe: RasterBuildingRecipe,
  metrics: BuildingMetrics,
): void {
  const { roofY, facade } = metrics;
  const { chimney } = facade;
  if (!chimney.present) return;
  const chimneyWidth = chimney.width * PIXELS_PER_UNIT;
  const centerX = metrics.left
    + (chimney.centerX + facade.width * 0.5) * PIXELS_PER_UNIT;
  const topY = roofY - chimney.height * 1.08 * PIXELS_PER_UNIT;
  const bottomY = roofY + chimney.height * 0.08 * PIXELS_PER_UNIT;
  const chimneyProfile: readonly Point[] = [
    [centerX - chimneyWidth * 0.5, bottomY],
    [centerX - chimneyWidth * 0.5, topY],
    [centerX + chimneyWidth * 0.5, topY],
    [centerX + chimneyWidth * 0.5, bottomY],
  ];
  sketch.paperFill(chimneyProfile);
  medium.tone(sketch, chimneyProfile, {
    style: 'hatch', color: recipe.identity.palette.wall, gap: 7,
  });
  medium.edge(sketch, closePath(chimneyProfile), 3.2, { ghost: true });
  sketch.stroke(
    [[centerX - chimneyWidth * 0.55, topY], [centerX + chimneyWidth * 0.58, topY]],
    4,
    { ghost: true },
  );
}

function drawRoof(
  sketch: Sketch,
  metrics: BuildingMetrics,
): void {
  const { left, roofY, facade } = metrics;
  const roof = facade.roofProfile.map(([x, y]): Point => [
    left + (x + facade.width * 0.5) * PIXELS_PER_UNIT,
    roofY - y * PIXELS_PER_UNIT,
  ]);
  sketch.paperFill(roof);
  sketch.stroke(closePath(roof), 6.4, { alpha: 0.88, ghost: true, taper: 0.12 });
}

function drawBalconies(
  sketch: Sketch,
  metrics: BuildingMetrics,
): void {
  for (const balcony of metrics.facade.balconies) {
    const centerX = metrics.left
      + (balcony.centerX + metrics.facade.width * 0.5) * PIXELS_PER_UNIT;
    const halfWidth = balcony.width * PIXELS_PER_UNIT * 0.5;
    const left = centerX - halfWidth;
    const right = centerX + halfWidth;
    const floorY = metrics.bottom
      - metrics.facade.floorHeight * balcony.floorFromGround * PIXELS_PER_UNIT;
    sketch.stroke([[left, floorY], [right, floorY]], 6.2, {
      alpha: 0.9,
      ghost: true,
    });
    const railTop = floorY - balcony.railHeight * PIXELS_PER_UNIT;
    sketch.stroke([[left, railTop], [right, railTop]], 2.8, {
      alpha: 0.78,
      ghost: true,
    });
    const posts = balcony.postCount;
    for (let index = 0; index <= posts; index += 1) {
      const x = left + ((right - left) * index) / posts;
      sketch.stroke([[x, railTop], [x + sketch.jitter(-1.2, 1.2), floorY]], 2.2, {
        alpha: 0.7,
      });
    }
  }
}

function drawBuildingShell(
  sketch: Sketch,
  recipe: RasterBuildingRecipe,
  medium: Medium,
): void {
  const metrics = buildingMetrics(sketch, recipe);
  const { left, right, bottom, roofY, facade } = metrics;
  const wall: MutablePoint[] = [
    [left + sketch.jitter(-2, 3), roofY],
    [right + sketch.jitter(-3, 2), roofY + sketch.jitter(-3, 3)],
    [right, bottom],
    [left, bottom],
  ];
  sketch.paperFill(wall);
  medium.tone(sketch, wall, {
    style: recipe.style.tone, color: recipe.identity.palette.wall, gap: 11,
  });
  medium.edge(sketch, closePath(wall), 4.4, { ghost: true, amplitude: 1.1 });

  for (const window of facade.windows) {
    const centerX = left
      + (window.center[0] + facade.width * 0.5) * PIXELS_PER_UNIT;
    const centerY = bottom - window.center[1] * PIXELS_PER_UNIT;
    drawWindow(
      sketch,
      medium,
      centerX,
      centerY,
      window.profile,
      window.lit,
      recipe,
    );
  }
}


function drawDoor(
  sketch: Sketch,
  recipe: RasterBuildingRecipe,
  medium: Medium,
  state: string,
): void {
  const metrics = buildingMetrics(sketch, recipe);
  const { facade } = metrics;
  const { door } = facade;
  const centerX = metrics.left
    + (door.centerX + facade.width * 0.5) * PIXELS_PER_UNIT;
  const width = door.width * PIXELS_PER_UNIT;
  const height = door.height * PIXELS_PER_UNIT;
  const opening = door.profile.map(([x, y]): Point => [
    centerX + x * PIXELS_PER_UNIT,
    metrics.bottom - y * PIXELS_PER_UNIT,
  ]);
  medium.tone(sketch, opening, { style: 'black', color: recipe.identity.palette.interior });
  medium.edge(sketch, closePath(opening), 3.5, { ghost: true });

  if (state === 'open') {
    const hingeX = metrics.left
      + (door.hingeX + facade.width * 0.5) * PIXELS_PER_UNIT;
    const projection = Math.max(0.12, Math.cos(recipe.identity.door.openingAngle));
    const panel = opening.map(([x, y]): Point => [hingeX + (x - hingeX) * projection, y]);
    sketch.paperFill(panel);
    medium.tone(sketch, panel, {
      style: 'hatch', color: recipe.identity.palette.accent, gap: 7,
    });
    medium.edge(sketch, closePath(panel), 3.1, { ghost: true });
    return;
  }

  sketch.paperFill(opening);
  medium.tone(sketch, opening, {
    style: recipe.identity.door.style === 'panel' ? 'light' : 'hatch',
    color: recipe.identity.palette.accent,
    gap: 7,
  });
  medium.edge(sketch, closePath(opening), 3.1, { ghost: true });
  if (recipe.identity.door.style === 'plank') {
    for (let offset = -0.25; offset <= 0.25; offset += 0.25) {
      const x = centerX + width * offset;
      sketch.stroke([[x, metrics.bottom - height * 0.84], [x, metrics.bottom - 3]], 1.6, {
        alpha: 0.45,
      });
    }
  } else if (recipe.identity.door.style === 'panel') {
    sketch.stroke([
      [centerX - width * 0.28, metrics.bottom - height * 0.48],
      [centerX + width * 0.28, metrics.bottom - height * 0.48],
    ], 2, { alpha: 0.52 });
  }
  const latchSign = recipe.identity.door.hinge === 'left' ? 1 : -1;
  sketch.context.fillStyle = PAPER;
  sketch.wobblyEllipse(centerX + width * 0.28 * latchSign, metrics.bottom - height * 0.43, 2.2, 2.2);
  sketch.context.fill();
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

export function createRasterBuildingBlueprint(recipe: RasterBuildingRecipe): AssetBlueprint {
  const dimensions = recipe.identity;
  const canvas: Size2 = Object.freeze({
    width: Math.ceil(dimensions.width * PIXELS_PER_UNIT) + MARGIN * 2,
    height: Math.ceil(dimensions.height * PIXELS_PER_UNIT) + MARGIN * 2,
  });
  const world = Object.freeze({
    width: canvas.width / PIXELS_PER_UNIT,
    height: canvas.height / PIXELS_PER_UNIT,
  });

  const identity = recipe.identity;
  const facade = createBuildingFacadeGeometry(identity);
  const chimney = createLayer('building:chimney', -1, canvas, world, ['idle'], ({ sketch }) => {
    drawChimney(sketch, mediumById(recipe.style.medium), recipe, buildingMetrics(sketch, recipe));
  });
  const shell = createLayer('building:shell', 0, canvas, world, ['idle'], ({ sketch }) => {
    drawBuildingShell(sketch, recipe, mediumById(recipe.style.medium));
  });
  const roof = createLayer('building:roof', 1, canvas, world, ['idle'], ({ sketch }) => {
    drawRoof(sketch, buildingMetrics(sketch, recipe));
  });
  const balconies = createLayer('building:balconies', 2, canvas, world, ['idle'], ({ sketch }) => {
    drawBalconies(sketch, buildingMetrics(sketch, recipe));
  });
  const door = createLayer('door', 3, canvas, world, ['closed', 'open'], ({ sketch, state }) => {
    drawDoor(sketch, recipe, mediumById(recipe.style.medium), state);
  });
  const doorX = facade.door.centerX;
  const sensorWidth = Math.min(1.35, facade.bayWidth * 0.95);

  return Object.freeze({
    id: `building:${identity.seed}`,
    kind: 'building',
    seed: identity.seed,
    medium: recipe.style.medium,
    bounds: Object.freeze({
      x: -identity.width / 2, y: 0, width: identity.width, height: identity.height,
    }),
    layers: Object.freeze([chimney, shell, roof, balconies, door]),
    colliders: Object.freeze([
      Object.freeze({
        id: 'body', kind: 'solid', shape: 'rectangle',
        x: -identity.width / 2, y: 0, width: identity.width, height: identity.height,
      }),
      Object.freeze({
        id: 'door:sensor', kind: 'sensor', shape: 'rectangle',
        x: doorX - sensorWidth / 2, y: 0, width: sensorWidth, height: 1.45,
      }),
    ]),
    sockets: Object.freeze({
      base: Object.freeze({ x: 0, y: 0 }),
      top: Object.freeze({ x: 0, y: identity.height }),
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
