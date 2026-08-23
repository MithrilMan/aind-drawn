import { closePath, type Point } from '../../../core/geometry.js';
import type { Sketch } from '../../../core/sketch.js';
import { mediumById, type Medium } from '../../../materials/medium.js';
import type {
  AssetBlueprint,
  LayerDefinition,
  RasterBoneDefinition,
  Vector2,
} from '../../../contracts/raster-asset.js';
import {
  createVehicleLayout,
  vehicleViewX,
  VEHICLE_CANVAS_MARGIN,
  VEHICLE_PIXELS_PER_UNIT,
  type VehicleLayout,
} from './layout.js';
import type { RasterVehicleRecipe } from './recipe.js';
import { vehicleRollingLayerCapability } from './capabilities.js';
import {
  VEHICLE_SEMANTIC_MANIFEST,
  vehicleSemanticPartId,
} from '../identity/semantics.js';

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
  const windowFrame = canvasPoints(layout, layout.doorWindowOutline);
  const windowGlass = canvasPoints(layout, layout.doorWindowGlassOutline);
  if (state === 'open') {
    const opening = canvasPoints(layout, layout.doorOpeningOutline);
    sketch.paperFill(opening);
    medium.tone(sketch, opening, { style: 'black', color: recipe.identity.palette.interior });
    medium.edge(sketch, closePath(opening), 3.5, { ghost: true });
    const hingeX = canvasPoint(layout, [layout.doorHinge.x, layout.doorHinge.y])[0];
    const projection = Math.max(0.12, Math.cos(recipe.identity.doors.openingAngle));
    const project = ([x, y]: Point): Point => [hingeX + (x - hingeX) * projection, y];
    const openPanel = panel.map(project);
    const openWindowFrame = windowFrame.map(project);
    const openWindowGlass = windowGlass.map(project);
    sketch.paperFill(openPanel);
    medium.tone(sketch, openPanel, { style: recipe.style.bodyTone, color: recipe.identity.palette.body });
    medium.edge(sketch, closePath(openPanel), 4, { ghost: true });
    if (recipe.identity.doors.windowFrame === 'framed') {
      sketch.paperFill(openWindowFrame);
      medium.tone(sketch, openWindowFrame, {
        style: recipe.style.bodyTone,
        color: recipe.identity.palette.body,
      });
    }
    sketch.paperFill(openWindowGlass);
    medium.tone(sketch, openWindowGlass, {
      style: recipe.style.glassTone,
      color: recipe.identity.palette.glass,
    });
    medium.edge(
      sketch,
      closePath(openWindowFrame),
      recipe.identity.doors.windowFrame === 'framed' ? 4 : 2.6,
      { ghost: true },
    );
  } else {
    medium.edge(sketch, closePath(panel), 2.8, { alpha: 0.62, ghost: true });
    medium.edge(
      sketch,
      closePath(windowFrame),
      recipe.identity.doors.windowFrame === 'framed' ? 3.2 : 2.1,
      { alpha: 0.68, ghost: true },
    );
    const handle = canvasPoint(layout, [layout.doorHandle.x, layout.doorHandle.y]);
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

type AuthoredRasterLayer = Readonly<{
  bone: RasterBoneDefinition;
  layer: LayerDefinition;
}>;

function authoredLayer(layerDefinition: LayerDefinition, position: Vector2): AuthoredRasterLayer {
  return Object.freeze({
    bone: Object.freeze({
      id: layerDefinition.bone,
      parentBone: 'root',
      restPose: Object.freeze({ position, rotation: 0 }),
    }),
    layer: layerDefinition,
  });
}

function fullLayer(
  id: string,
  order: number,
  layout: VehicleLayout,
  states: readonly string[],
  draw: LayerDefinition['draw'],
): AuthoredRasterLayer {
  return authoredLayer(Object.freeze({
    id,
    semanticPartId: vehicleSemanticPartId(id),
    bone: id,
    order,
    depth: 0,
    canvas: layout.canvas,
    world: Object.freeze({ width: layout.bounds.width, height: layout.bounds.height }),
    pivot: [0, 0] as const,
    states,
    draw,
  }), Object.freeze({ x: layout.bounds.x, y: layout.bounds.y }));
}

export function createRasterVehicleBlueprint(recipe: RasterVehicleRecipe): AssetBlueprint<'vehicle'> {
  const layout = createVehicleLayout(recipe.identity, recipe.style.side);
  const medium = mediumById(recipe.style.medium);
  const wheelCanvasSize = Math.ceil(recipe.identity.wheels.radius * 2.55 * VEHICLE_PIXELS_PER_UNIT);
  const wheelWorldSize = recipe.identity.wheels.radius * 2.55;
  const wheelLayer = (id: string, center: Vector2, order: number): AuthoredRasterLayer =>
    authoredLayer(Object.freeze({
      id,
      semanticPartId: vehicleSemanticPartId(id),
      bone: id,
      order,
      depth: 0,
      canvas: Object.freeze({ width: wheelCanvasSize, height: wheelCanvasSize }),
      world: Object.freeze({ width: wheelWorldSize, height: wheelWorldSize }),
      pivot: [0.5, 0.5] as const,
      states: ['idle'] as const,
      capabilities: Object.freeze([vehicleRollingLayerCapability({
        steering: id === 'wheel:front',
      })]),
      draw: ({ sketch }): void => {
        drawWheel(sketch, recipe, medium);
      },
    }), center);

  const authoredLayers: readonly AuthoredRasterLayer[] = Object.freeze([
    fullLayer('body', 10, layout, ['idle'], ({ sketch }) => {
      drawBody(sketch, recipe, layout, medium);
    }),
    wheelLayer('wheel:rear', layout.rearWheel, 20),
    wheelLayer('wheel:front', layout.frontWheel, 21),
    fullLayer('door:left', 30, layout, ['closed', 'open'], ({ sketch, state }) => {
      if (recipe.style.side === 'left') drawDoor(sketch, recipe, layout, medium, state);
    }),
    fullLayer('door:right', 30, layout, ['closed', 'open'], ({ sketch, state }) => {
      if (recipe.style.side === 'right') drawDoor(sketch, recipe, layout, medium, state);
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
  const bones: readonly RasterBoneDefinition[] = Object.freeze([
    Object.freeze({
      id: 'root',
      restPose: Object.freeze({
        position: Object.freeze({ x: 0, y: 0 }),
        rotation: 0,
      }),
    }),
    ...authoredLayers.map(({ bone }) => bone),
  ]);
  const layers = Object.freeze(authoredLayers.map(({ layer }) => layer));

  const length = recipe.identity.dimensions.length;
  const sensorHeight = Math.max(1, recipe.identity.dimensions.height * 0.7);
  const projectedX = (x: number): number => vehicleViewX(recipe.identity, recipe.style.side, x);
  const projectedIntervalX = (x: number, width: number): number => (
    recipe.style.side === 'left' ? projectedX(x + width) : projectedX(x)
  );
  const doorSensorX = length * recipe.identity.doors.frontStartRatio;
  const doorSensorWidth = length
    * (recipe.identity.doors.frontEndRatio - recipe.identity.doors.frontStartRatio);
  const doorBottom = Math.min(...layout.doorOpeningOutline.map(([, y]) => y));
  const doorTop = Math.max(...layout.doorOpeningOutline.map(([, y]) => y));
  const doorHeight = doorTop - doorBottom;
  const hoodSensorX = length * (1 - recipe.identity.body.bonnetRatio);
  const hoodSensorWidth = length * recipe.identity.body.bonnetRatio;
  const cargoSensorX = length * 0.02;
  const cargoSensorWidth = length * Math.max(recipe.identity.body.cargoRatio, 0.15);
  return Object.freeze({
    blueprintVersion: 1,
    family: 'vehicle',
    representation: 'raster',
    assetId: `vehicle:${recipe.identity.seed}`,
    seed: recipe.identity.seed,
    medium: recipe.style.medium,
    manifest: VEHICLE_SEMANTIC_MANIFEST,
    bounds: layout.bounds,
    bones,
    layers,
    colliders: Object.freeze([
      Object.freeze({
        id: 'vehicle:body', kind: 'solid', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: length * 0.5,
            y: (layout.bodyBottom + recipe.identity.dimensions.height) * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({
          width: length * 0.92,
          height: recipe.identity.dimensions.height - layout.bodyBottom,
        }),
      }),
      Object.freeze({
        id: 'door:left:sensor', kind: 'sensor', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedIntervalX(doorSensorX, doorSensorWidth) + doorSensorWidth * 0.5,
            y: layout.bodyBottom + sensorHeight * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({ width: doorSensorWidth, height: sensorHeight }),
      }),
      Object.freeze({
        id: 'door:right:sensor', kind: 'sensor', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedIntervalX(doorSensorX, doorSensorWidth) + doorSensorWidth * 0.5,
            y: layout.bodyBottom + sensorHeight * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({ width: doorSensorWidth, height: sensorHeight }),
      }),
      ...(['left', 'right'] as const).map((side) => Object.freeze({
        id: `door:${side}:leaf`, kind: 'solid' as const, shape: 'rectangle' as const,
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedIntervalX(doorSensorX, doorSensorWidth) + doorSensorWidth * 0.5,
            y: doorBottom + doorHeight * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({ width: doorSensorWidth, height: doorHeight }),
      })),
      Object.freeze({
        id: 'hood:sensor', kind: 'sensor', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedIntervalX(hoodSensorX, hoodSensorWidth) + hoodSensorWidth * 0.5,
            y: layout.bodyBottom + sensorHeight * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({ width: hoodSensorWidth, height: sensorHeight }),
      }),
      Object.freeze({
        id: 'cargo:sensor', kind: 'sensor', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedIntervalX(cargoSensorX, cargoSensorWidth) + cargoSensorWidth * 0.5,
            y: layout.bodyBottom + sensorHeight * 0.5,
          }),
          rotation: 0,
        }),
        size: Object.freeze({ width: cargoSensorWidth, height: sensorHeight }),
      }),
    ]),
    sockets: Object.freeze([
      ...(['left', 'right'] as const).map((side) => Object.freeze({
        id: `door:${side}:handle`, bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(layout.doorHinge.x - doorSensorWidth * 0.18),
            y: doorBottom + doorHeight * 0.58,
          }),
          rotation: 0,
        }),
      })),
      Object.freeze({
        id: 'entry:left', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(length
              * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
            y: 0,
          }),
          rotation: 0,
        }),
      }),
      Object.freeze({
        id: 'entry:right', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(length
              * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
            y: 0,
          }),
          rotation: 0,
        }),
      }),
      Object.freeze({
        id: 'driver', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(length
              * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
            y: layout.beltHeight,
          }),
          rotation: 0,
        }),
      }),
      Object.freeze({
        id: 'passenger', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(length
              * (recipe.identity.doors.frontStartRatio + recipe.identity.doors.frontEndRatio) / 2),
            y: layout.beltHeight,
          }),
          rotation: 0,
        }),
      }),
      Object.freeze({
        id: 'cargo', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({
            x: projectedX(length * recipe.identity.body.cargoRatio * 0.5),
            y: layout.beltHeight,
          }),
          rotation: 0,
        }),
      }),
      Object.freeze({
        id: 'tow', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({ x: projectedX(0), y: layout.bodyBottom }),
          rotation: 0,
        }),
      }),
    ]),
    interactionBindings: Object.freeze([
      Object.freeze({
        interactionId: 'door:left',
        layers: Object.freeze([Object.freeze({
          layerId: 'door:left', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        interactionId: 'door:right',
        layers: Object.freeze([Object.freeze({
          layerId: 'door:right', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        interactionId: 'hood',
        layers: Object.freeze([Object.freeze({
          layerId: 'hood', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
      Object.freeze({
        interactionId: 'cargo',
        layers: Object.freeze([Object.freeze({
          layerId: 'cargo', stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      }),
    ]),
  });
}
