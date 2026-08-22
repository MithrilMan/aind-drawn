import { closePath, type Point } from '../../../core/geometry.js';
import type { Sketch } from '../../../core/sketch.js';
import { mediumById, type Medium } from '../../../materials/medium.js';
import type { AssetBlueprint, LayerDefinition } from '../../../contracts/raster-asset.js';
import {
  createVehicleLayout,
  vehicleViewX,
  VEHICLE_CANVAS_MARGIN,
  VEHICLE_PIXELS_PER_UNIT,
  type VehicleLayout,
} from './layout.js';
import type { RasterVehicleRecipe } from './recipe.js';
import { vehicleRollingLayerCapability } from './capabilities.js';

function canvasPoint(layout: VehicleLayout, point: Point): Point {
  const projectedX = layout.side === 'left' ? layout.bounds.width - point[0] : point[0];
  return [
    VEHICLE_CANVAS_MARGIN + projectedX * VEHICLE_PIXELS_PER_UNIT,
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
  if (recipe.identity.doors.count === 4) {
    const divisionX = recipe.identity.doors.frontStartRatio * recipe.identity.dimensions.length;
    const windowTop = (layout.doorWindowOutline[1] as Point)[1];
    sketch.stroke([
      canvasPoint(layout, [divisionX, layout.bodyBottom]),
      canvasPoint(layout, [divisionX, windowTop]),
    ], 3, { alpha: 0.72, ghost: true, taper: 0.12 });
  }
}

function drawWheel(
  sketch: Sketch,
  recipe: RasterVehicleRecipe,
  medium: Medium,
): void {
  const centerX = sketch.width / 2;
  const centerY = sketch.height / 2;
  const outerRadius = Math.min(sketch.width, sketch.height) * 0.43;
  const outer = sketch.blobPoints(centerX, centerY, outerRadius, outerRadius, 0, 0.16);
  medium.tone(sketch, outer, { style: 'black', color: recipe.identity.palette.tyre });
  medium.edge(sketch, closePath(outer), 4.4, { ghost: true, amplitude: 1.2 });
  const hubRadius = outerRadius * recipe.identity.wheels.hubRadiusRatio;
  const hub = sketch.blobPoints(centerX, centerY, hubRadius, hubRadius, 0, 0.12);
  medium.tone(sketch, hub, { style: recipe.style.metalTone, color: recipe.identity.palette.hub });
  medium.edge(sketch, closePath(hub), 3, { ghost: true });
  const spokeCount = recipe.identity.wheels.style === 'hubcap' ? 4 : 5;
  for (let index = 0; index < spokeCount; index += 1) {
    const angle = index / spokeCount * Math.PI * 2 + 0.18;
    const innerRatio = recipe.identity.wheels.style === 'steel' ? 0.42 : 0.16;
    const outerRatio = recipe.identity.wheels.style === 'sport' ? 0.9 : 0.76;
    sketch.stroke([
      [centerX + Math.cos(angle) * hubRadius * innerRatio, centerY + Math.sin(angle) * hubRadius * innerRatio],
      [centerX + Math.cos(angle) * hubRadius * outerRatio, centerY + Math.sin(angle) * hubRadius * outerRatio],
    ], recipe.identity.wheels.style === 'sport' ? 2.5 : 2.1, { alpha: 0.72, ghost: true });
  }
  const markerAngle = 0.18;
  sketch.stroke([
    [centerX + Math.cos(markerAngle) * hubRadius * 0.72, centerY + Math.sin(markerAngle) * hubRadius * 0.72],
    [centerX + Math.cos(markerAngle) * hubRadius * 0.98, centerY + Math.sin(markerAngle) * hubRadius * 0.98],
  ], 4.1, { alpha: 0.9, ghost: true });
  if (recipe.identity.wheels.style === 'steel') {
    const center = sketch.blobPoints(centerX, centerY, hubRadius * 0.3, hubRadius * 0.3, 0, 0.08);
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
  const window = canvasPoints(layout, layout.doorWindowOutline);
  if (state === 'open') {
    const opening = canvasPoints(layout, layout.doorOpeningOutline);
    sketch.paperFill(opening);
    medium.tone(sketch, opening, { style: 'black', color: recipe.identity.palette.interior });
    medium.edge(sketch, closePath(opening), 3.5, { ghost: true });
    const hingeX = canvasPoint(layout, [layout.doorHinge.x, layout.doorHinge.y])[0];
    const projection = Math.max(0.12, Math.cos(recipe.identity.doors.openingAngle));
    const project = ([x, y]: Point): Point => [hingeX + (x - hingeX) * projection, y];
    const openPanel = panel.map(project);
    const openWindow = window.map(project);
    sketch.paperFill(openPanel);
    medium.tone(sketch, openPanel, { style: recipe.style.bodyTone, color: recipe.identity.palette.body });
    medium.edge(sketch, closePath(openPanel), 4, { ghost: true });
    if (recipe.identity.doors.windowFrame === 'framed') {
      sketch.paperFill(openWindow);
      medium.tone(sketch, openWindow, { style: recipe.style.bodyTone, color: recipe.identity.palette.body });
    }
    const glass = openWindow.map(([x, y]) => [
      hingeX + (x - hingeX) * 0.92,
      y + (layout.canvas.height * 0.5 - y) * 0.025,
    ] as Point);
    sketch.paperFill(glass);
    medium.tone(sketch, glass, { style: recipe.style.glassTone, color: recipe.identity.palette.glass });
    medium.edge(sketch, closePath(openWindow), recipe.identity.doors.windowFrame === 'framed' ? 4 : 2.6, {
      ghost: true,
    });
  } else {
    medium.edge(sketch, closePath(panel), 2.8, { alpha: 0.62, ghost: true });
    medium.edge(sketch, closePath(window), recipe.identity.doors.windowFrame === 'framed' ? 3.2 : 2.1, {
      alpha: 0.68,
      ghost: true,
    });
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
  sketch.paperFill(panel);
  medium.tone(sketch, panel, { style: 'black', color: recipe.identity.palette.interior });
  medium.edge(sketch, closePath(panel), 3.2, { alpha: 0.7, ghost: true });
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
  const layout = createVehicleLayout(recipe.identity, recipe.side);
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
      if (recipe.side === 'left') drawDoor(sketch, recipe, layout, medium, state);
    }),
    fullLayer('door:right', 30, layout, ['closed', 'open'], ({ sketch, state }) => {
      if (recipe.side === 'right') drawDoor(sketch, recipe, layout, medium, state);
    }),
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
  const projectedX = (x: number): number => vehicleViewX(recipe.identity, recipe.side, x);
  const projectedIntervalX = (x: number, width: number): number => (
    recipe.side === 'left' ? projectedX(x + width) : projectedX(x)
  );
  const doorSensorX = length * recipe.identity.doors.frontStartRatio;
  const doorSensorWidth = length
    * (recipe.identity.doors.frontEndRatio - recipe.identity.doors.frontStartRatio);
  const hoodSensorX = length * (1 - recipe.identity.body.bonnetRatio);
  const hoodSensorWidth = length * recipe.identity.body.bonnetRatio;
  const cargoSensorX = length * 0.02;
  const cargoSensorWidth = length * Math.max(recipe.identity.body.cargoRatio, 0.15);
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
        x: projectedIntervalX(doorSensorX, doorSensorWidth), y: layout.bodyBottom,
        width: doorSensorWidth,
        height: sensorHeight,
      }),
      Object.freeze({
        id: 'door:right:sensor', kind: 'sensor', shape: 'rectangle',
        x: projectedIntervalX(doorSensorX, doorSensorWidth), y: layout.bodyBottom,
        width: doorSensorWidth,
        height: sensorHeight,
      }),
      Object.freeze({
        id: 'hood:sensor', kind: 'sensor', shape: 'rectangle',
        x: projectedIntervalX(hoodSensorX, hoodSensorWidth), y: layout.bodyBottom,
        width: hoodSensorWidth, height: sensorHeight,
      }),
      Object.freeze({
        id: 'cargo:sensor', kind: 'sensor', shape: 'rectangle',
        x: projectedIntervalX(cargoSensorX, cargoSensorWidth), y: layout.bodyBottom,
        width: cargoSensorWidth, height: sensorHeight,
      }),
    ]),
    sockets: Object.freeze({
      'entry:left': Object.freeze({
        x: projectedX(length
          * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
        y: 0,
      }),
      'entry:right': Object.freeze({
        x: projectedX(length
          * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
        y: 0,
      }),
      driver: Object.freeze({
        x: projectedX(length
          * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
        y: layout.beltHeight,
      }),
      cargo: Object.freeze({
        x: projectedX(length * recipe.identity.body.cargoRatio * 0.5),
        y: layout.beltHeight,
      }),
      tow: Object.freeze({ x: projectedX(0), y: layout.bodyBottom }),
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
