import { closePath, type Point } from '../../core/geometry.js';
import type { Sketch } from '../../core/sketch.js';
import { mediumById, type Medium } from '../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition } from '../types.js';
import {
  createVehicleLayout,
  VEHICLE_CANVAS_MARGIN,
  VEHICLE_PIXELS_PER_UNIT,
  type VehicleLayout,
} from './layout.js';
import type { RasterVehicleRecipe } from './recipe.js';
import { vehicleRollingLayerCapability } from './capabilities.js';

function canvasPoint(layout: VehicleLayout, point: Point): Point {
  return [
    VEHICLE_CANVAS_MARGIN + point[0] * VEHICLE_PIXELS_PER_UNIT,
    layout.canvas.height - VEHICLE_CANVAS_MARGIN - point[1] * VEHICLE_PIXELS_PER_UNIT,
  ];
}

function canvasPoints(layout: VehicleLayout, points: readonly Point[]): readonly Point[] {
  return points.map((point) => canvasPoint(layout, point));
}

function drawBody(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  layout: VehicleLayout,
  medium: Medium,
): void {
  const body = canvasPoints(layout, layout.bodyOutline);
  sketch.paperFill(body);
  medium.tone(sketch, body, {
    style: recipe.style.bodyTone,
    color: recipe.identity.palette.body,
    gap: 9,
  });
  medium.edge(sketch, closePath(body), 4.8, { ghost: true, amplitude: 1.25 });

  const cabin = canvasPoints(layout, layout.cabinOutline);
  sketch.paperFill(cabin);
  medium.tone(sketch, cabin, {
    style: recipe.style.glassTone,
    color: recipe.identity.palette.glass,
    gap: 8,
  });
  medium.edge(sketch, closePath(cabin), 4.1, { ghost: true, amplitude: 1.1 });
  const divisionRatio = recipe.identity.doors.count === 4 ? 0.54 : 0.62;
  const divisionX = recipe.identity.cabin.startRatio
    + (recipe.identity.cabin.endRatio - recipe.identity.cabin.startRatio) * divisionRatio;
  sketch.stroke([
    canvasPoint(layout, [divisionX * recipe.identity.dimensions.length, layout.beltHeight]),
    canvasPoint(layout, [divisionX * recipe.identity.dimensions.length, layout.roofHeight * 0.975]),
  ], 3, { alpha: 0.72, ghost: true, taper: 0.12 });
}

function drawWheel(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  medium: Medium,
): void {
  const centerX = sketch.width / 2;
  const centerY = sketch.height / 2;
  const outerRadius = Math.min(sketch.width, sketch.height) * 0.43;
  const outer = sketch.blobPoints(centerX, centerY, outerRadius, outerRadius, 24);
  medium.tone(sketch, outer, { style: 'black', color: recipe.identity.palette.tyre });
  medium.edge(sketch, closePath(outer), 4.4, { ghost: true, amplitude: 1.2 });
  const hubRadius = outerRadius * recipe.identity.wheels.hubRadiusRatio;
  const hub = sketch.blobPoints(centerX, centerY, hubRadius, hubRadius, 18);
  medium.tone(sketch, hub, { style: recipe.style.metalTone, color: recipe.identity.palette.hub });
  medium.edge(sketch, closePath(hub), 3, { ghost: true });
  if (recipe.identity.wheels.style === 'sport') {
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      sketch.stroke([
        [centerX + Math.cos(angle) * hubRadius * 0.18, centerY + Math.sin(angle) * hubRadius * 0.18],
        [centerX + Math.cos(angle) * hubRadius * 0.88, centerY + Math.sin(angle) * hubRadius * 0.88],
      ], 2.5, { alpha: 0.72, ghost: true });
    }
  } else if (recipe.identity.wheels.style === 'steel') {
    const center = sketch.blobPoints(centerX, centerY, hubRadius * 0.3, hubRadius * 0.3, 12);
    medium.tone(sketch, center, { style: 'black', color: recipe.identity.palette.tyre });
  }
}

function drawDoor(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  layout: VehicleLayout,
  medium: Medium,
  state: string,
): void {
  const panel = canvasPoints(layout, layout.doorOutline);
  if (state === 'open') {
    medium.tone(sketch, panel, { style: 'black', color: recipe.identity.palette.tyre });
    const hinge = panel[1] as Point;
    const bottom = panel[0] as Point;
    const topRear = panel[2] as Point;
    const panelWidth = Math.abs(topRear[0] - hinge[0]);
    const openPanel: readonly Point[] = [
      hinge,
      [hinge[0] - panelWidth * 0.28, hinge[1] - panelWidth * 0.18],
      [bottom[0] - panelWidth * 0.58, bottom[1] + panelWidth * 0.18],
      bottom,
    ];
    sketch.paperFill(openPanel);
    medium.tone(sketch, openPanel, { style: recipe.style.bodyTone, color: recipe.identity.palette.body });
    medium.edge(sketch, closePath(openPanel), 4, { ghost: true });
  } else {
    medium.edge(sketch, closePath(panel), 2.8, { alpha: 0.62, ghost: true });
    const handle = canvasPoint(layout, [
      recipe.identity.doors.frontEndRatio * recipe.identity.dimensions.length - 0.18,
      layout.beltHeight * 0.88,
    ]);
    sketch.stroke([[handle[0] - 9, handle[1]], [handle[0] + 1, handle[1] + sketch.jitter(-1, 1)]], 2.5, {
      alpha: 0.74, ghost: true,
    });
  }
}

function drawHingedPanel(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  layout: VehicleLayout,
  medium: Medium,
  outline: readonly Point[],
  state: string,
  direction: -1 | 1,
): void {
  const panel = canvasPoints(layout, outline);
  if (state === 'closed') {
    sketch.stroke([panel[0] as Point, panel[1] as Point], 2.5, { alpha: 0.58, ghost: true });
    return;
  }
  const hinge = direction === 1 ? panel[0] as Point : panel[1] as Point;
  const far = direction === 1 ? panel[1] as Point : panel[0] as Point;
  const length = Math.abs(far[0] - hinge[0]);
  const lifted: readonly Point[] = [
    hinge,
    [hinge[0] + direction * length * 0.58, hinge[1] - length * 0.62],
    [hinge[0] + direction * length * 0.54, hinge[1] - length * 0.55],
    [hinge[0], hinge[1] + 5],
  ];
  sketch.paperFill(lifted);
  medium.tone(sketch, lifted, { style: recipe.style.bodyTone, color: recipe.identity.palette.body });
  medium.edge(sketch, closePath(lifted), 3.8, { ghost: true });
}

function drawDetails(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  layout: VehicleLayout,
  medium: Medium,
): void {
  const { length } = recipe.identity.dimensions;
  const headlight = canvasPoint(layout, [length * 0.955, layout.beltHeight * 0.82]);
  const lightRadius = recipe.identity.details.headlight === 'round' ? 10 : 8;
  const light = sketch.blobPoints(headlight[0], headlight[1], lightRadius * 1.35, lightRadius, 14);
  medium.tone(sketch, light, { style: 'light', color: recipe.identity.palette.light });
  medium.edge(sketch, closePath(light), 2.4, { ghost: true });
  sketch.stroke([
    canvasPoint(layout, [length * 0.9, layout.bodyBottom + 0.12]),
    [canvasPoint(layout, [length, layout.bodyBottom + 0.12])[0] + 4, canvasPoint(layout, [0, layout.bodyBottom + 0.12])[1]],
  ], 5, { alpha: 0.75, ghost: true });
}

function drawRoofRack(sketch: Sketch, recipe: RasterVehicleRecipe, layout: VehicleLayout): void {
  if (!recipe.identity.details.roofRack) return;
  const start = recipe.identity.cabin.startRatio + 0.12;
  const end = recipe.identity.cabin.endRatio - 0.08;
  const length = recipe.identity.dimensions.length;
  const y = layout.roofHeight + 0.09;
  sketch.stroke([
    canvasPoint(layout, [start * length, y]), canvasPoint(layout, [end * length, y]),
  ], 4, { alpha: 0.82, ghost: true });
  for (const x of [start, end]) {
    sketch.stroke([
      canvasPoint(layout, [x * length, layout.roofHeight * 0.99]),
      canvasPoint(layout, [x * length, y]),
    ], 3, { alpha: 0.75, ghost: true });
  }
}

function drawSpoiler(sketch: Sketch, recipe: RasterVehicleRecipe, layout: VehicleLayout): void {
  if (!recipe.identity.details.spoiler) return;
  const length = recipe.identity.dimensions.length;
  const base = canvasPoint(layout, [length * 0.06, layout.beltHeight * 1.02]);
  sketch.stroke([[base[0], base[1]], [base[0], base[1] - 12]], 3.2, { ghost: true });
  sketch.stroke([[base[0] - 5, base[1] - 13], [base[0] + 29, base[1] - 10]], 5, { ghost: true });
}

function fullLayer(
  id: string,
  order: number,
  layout: VehicleLayout,
  states: readonly string[],
  draw: LayerDefinition['draw'],
): LayerDefinition {
  return Object.freeze({
    id,
    bone: id,
    order,
    depth: 0,
    canvas: layout.canvas,
    world: Object.freeze({ width: layout.bounds.width, height: layout.bounds.height }),
    position: Object.freeze({ x: layout.bounds.x, y: layout.bounds.y }),
    pivot: [0, 0] as const,
    states,
    draw,
  });
}

export function createRasterVehicleBlueprint(recipe: RasterVehicleRecipe): AssetBlueprint {
  const layout = createVehicleLayout(recipe.identity);
  const medium = mediumById(recipe.medium);
  const wheelCanvasSize = Math.ceil(recipe.identity.wheels.radius * 2.55 * VEHICLE_PIXELS_PER_UNIT);
  const wheelWorldSize = recipe.identity.wheels.radius * 2.55;
  const wheelLayer = (id: string, center: Readonly<{ x: number; y: number }>, order: number): LayerDefinition =>
    Object.freeze({
      id,
      bone: id,
      order,
      depth: 0,
      canvas: Object.freeze({ width: wheelCanvasSize, height: wheelCanvasSize }),
      world: Object.freeze({ width: wheelWorldSize, height: wheelWorldSize }),
      position: center,
      pivot: [0.5, 0.5] as const,
      states: ['idle'] as const,
      capabilities: Object.freeze([vehicleRollingLayerCapability({
        radius: recipe.identity.wheels.radius,
        steering: id === 'wheel:front',
      })]),
      draw: ({ sketch }): void => {
        drawWheel(sketch, recipe, medium);
      },
    });

  const layers: readonly LayerDefinition[] = Object.freeze([
    fullLayer('body', 10, layout, ['idle'], ({ sketch }) => {
      drawBody(sketch, recipe, layout, medium);
    }),
    wheelLayer('wheel:rear', layout.rearWheel, 20),
    wheelLayer('wheel:front', layout.frontWheel, 21),
    fullLayer('door:left', 30, layout, ['closed', 'open'], ({ sketch, state }) => {
      drawDoor(sketch, recipe, layout, medium, state);
    }),
    fullLayer('door:right', 30, layout, ['closed', 'open'], () => undefined),
    fullLayer('hood', 31, layout, ['closed', 'open'], ({ sketch, state }) => {
      drawHingedPanel(sketch, recipe, layout, medium, layout.hoodOutline, state, 1);
    }),
    fullLayer('cargo', 32, layout, ['closed', 'open'], ({ sketch, state }) => {
      drawHingedPanel(sketch, recipe, layout, medium, layout.cargoOutline, state, -1);
    }),
    fullLayer('detail:lights', 40, layout, ['idle'], ({ sketch }) => {
      drawDetails(sketch, recipe, layout, medium);
    }),
    fullLayer('detail:roof-rack', 41, layout, ['idle'], ({ sketch }) => {
      drawRoofRack(sketch, recipe, layout);
    }),
    fullLayer('detail:spoiler', 42, layout, ['idle'], ({ sketch }) => {
      drawSpoiler(sketch, recipe, layout);
    }),
  ]);

  const length = recipe.identity.dimensions.length;
  const sensorHeight = Math.max(1, recipe.identity.dimensions.height * 0.7);
  return Object.freeze({
    id: `vehicle:${recipe.seed}`,
    kind: 'vehicle',
    seed: recipe.seed,
    medium: recipe.medium,
    bounds: layout.bounds,
    layers,
    colliders: Object.freeze([
      Object.freeze({
        id: 'vehicle:body', kind: 'solid', shape: 'rectangle',
        x: length * 0.04, y: layout.bodyBottom,
        width: length * 0.92, height: recipe.identity.dimensions.height - layout.bodyBottom,
      }),
      Object.freeze({
        id: 'door:left:sensor', kind: 'sensor', shape: 'rectangle',
        x: length * recipe.identity.doors.frontStartRatio, y: layout.bodyBottom,
        width: length * (recipe.identity.doors.frontEndRatio - recipe.identity.doors.frontStartRatio),
        height: sensorHeight,
      }),
      Object.freeze({
        id: 'door:right:sensor', kind: 'sensor', shape: 'rectangle',
        x: length * recipe.identity.doors.frontStartRatio, y: layout.bodyBottom,
        width: length * (recipe.identity.doors.frontEndRatio - recipe.identity.doors.frontStartRatio),
        height: sensorHeight,
      }),
      Object.freeze({
        id: 'hood:sensor', kind: 'sensor', shape: 'rectangle',
        x: length * (1 - recipe.identity.body.bonnetRatio), y: layout.bodyBottom,
        width: length * recipe.identity.body.bonnetRatio, height: sensorHeight,
      }),
      Object.freeze({
        id: 'cargo:sensor', kind: 'sensor', shape: 'rectangle',
        x: length * 0.02, y: layout.bodyBottom,
        width: length * Math.max(recipe.identity.body.cargoRatio, 0.15), height: sensorHeight,
      }),
    ]),
    sockets: Object.freeze({
      'entry:left': Object.freeze({
        x: length * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2,
        y: 0,
      }),
      'entry:right': Object.freeze({
        x: length * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2,
        y: 0,
      }),
      driver: Object.freeze({
        x: length * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2,
        y: layout.beltHeight,
      }),
      cargo: Object.freeze({ x: length * recipe.identity.body.cargoRatio * 0.5, y: layout.beltHeight }),
      tow: Object.freeze({ x: 0, y: layout.bodyBottom }),
    }),
    interactions: Object.freeze([
      Object.freeze({
        id: 'door:left', kind: 'portal', sensorColliderId: 'door:left:sensor',
        activationSocketId: 'entry:left', initialState: 'closed', states: ['closed', 'open'] as const,
        layerBindings: Object.freeze([Object.freeze({
          layerId: 'door:left', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        id: 'door:right', kind: 'portal', sensorColliderId: 'door:right:sensor',
        activationSocketId: 'entry:right', initialState: 'closed', states: ['closed', 'open'] as const,
        layerBindings: Object.freeze([Object.freeze({
          layerId: 'door:right', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        id: 'hood', kind: 'toggle', sensorColliderId: 'hood:sensor', activationSocketId: 'driver',
        initialState: 'closed', states: ['closed', 'open'] as const,
        layerBindings: Object.freeze([Object.freeze({
          layerId: 'hood', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        id: 'cargo', kind: 'toggle', sensorColliderId: 'cargo:sensor', activationSocketId: 'cargo',
        initialState: 'closed', states: ['closed', 'open'] as const,
        layerBindings: Object.freeze([Object.freeze({
          layerId: 'cargo', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
    ]),
  });
}
