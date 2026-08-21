import type { Bounds3, Point3 } from '../../core/geometry3.js';
import type { SolidNodeDefinition } from '../solid-types.js';
import type { VehicleIdentityRecipe } from '../vehicle-identity/recipe.js';

export type SolidVehicleLayout = Readonly<{
  length: number;
  width: number;
  height: number;
  bodyBottom: number;
  beltHeight: number;
  roofHeight: number;
  rearAxleX: number;
  frontAxleX: number;
  doorHeight: number;
  doorLength: number;
  doorHingeX: number;
  hoodLength: number;
  hoodHingeX: number;
  cargoLength: number;
  cargoHingeX: number;
  bounds: Bounds3;
  nodes: readonly SolidNodeDefinition[];
  sockets: Readonly<Record<string, Point3>>;
}>;

export function buildSolidVehicleLayout(identity: VehicleIdentityRecipe): SolidVehicleLayout {
  const { length, width, height, groundClearance } = identity.dimensions;
  const radius = identity.wheels.radius;
  const bodyBottom = Math.max(groundClearance, radius * 0.58);
  const beltHeight = bodyBottom + (height - bodyBottom) * identity.body.beltHeightRatio;
  const roofHeight = bodyBottom + (height - bodyBottom) * identity.cabin.roofHeightRatio;
  const axleInset = length * (1 - identity.wheels.wheelbaseRatio) / 2;
  const rearAxleX = -length * 0.5 + axleInset;
  const frontAxleX = length * 0.5 - axleInset;
  const doorHingeX = -length * 0.5 + identity.doors.frontEndRatio * length;
  const doorRearX = -length * 0.5 + identity.doors.frontStartRatio * length;
  const doorLength = doorHingeX - doorRearX;
  const doorHeight = Math.max(radius * 0.95, beltHeight - bodyBottom - radius * 0.05);
  const hoodHingeX = -length * 0.5 + Math.max(identity.cabin.endRatio, 1 - identity.body.bonnetRatio) * length;
  const hoodLength = Math.max(0.42, length * 0.97 - (hoodHingeX + length * 0.5));
  const cargoHingeX = -length * 0.5 + identity.cabin.startRatio * length;
  const cargoLength = Math.max(0.42, cargoHingeX - (-length * 0.47));
  const doorZ = width * 0.5 + 0.035;
  const wheelZ = width * 0.5 + identity.wheels.width * 0.32;
  const nodes: readonly SolidNodeDefinition[] = Object.freeze([
    Object.freeze({ id: 'root', position: [0, 0, 0] as const }),
    Object.freeze({ id: 'chassis', parentNode: 'root', position: [0, 0, 0] as const }),
    Object.freeze({ id: 'wheel:rear:left', parentNode: 'root', position: [rearAxleX, radius, wheelZ] as const }),
    Object.freeze({ id: 'wheel:rear:right', parentNode: 'root', position: [rearAxleX, radius, -wheelZ] as const }),
    Object.freeze({ id: 'wheel:front:left', parentNode: 'root', position: [frontAxleX, radius, wheelZ] as const }),
    Object.freeze({ id: 'wheel:front:right', parentNode: 'root', position: [frontAxleX, radius, -wheelZ] as const }),
    Object.freeze({ id: 'door:left', parentNode: 'chassis', position: [doorHingeX, bodyBottom, doorZ] as const }),
    Object.freeze({ id: 'door:right', parentNode: 'chassis', position: [doorHingeX, bodyBottom, -doorZ] as const }),
    Object.freeze({ id: 'hood', parentNode: 'chassis', position: [hoodHingeX, beltHeight, 0] as const }),
    Object.freeze({ id: 'cargo', parentNode: 'chassis', position: [cargoHingeX, beltHeight, 0] as const }),
  ]);
  const openDoorDepth = width * 0.5 + doorLength * 0.96;
  const maximumY = Math.max(height + radius * 0.25, beltHeight + Math.max(hoodLength, cargoLength) * 0.9);
  return Object.freeze({
    length,
    width,
    height,
    bodyBottom,
    beltHeight,
    roofHeight,
    rearAxleX,
    frontAxleX,
    doorHeight,
    doorLength,
    doorHingeX,
    hoodLength,
    hoodHingeX,
    cargoLength,
    cargoHingeX,
    bounds: Object.freeze({
      minimum: [-length * 0.53, 0, -openDoorDepth] as const,
      maximum: [length * 0.53, maximumY, openDoorDepth] as const,
    }),
    nodes,
    sockets: Object.freeze({
      'entry:left': [doorHingeX - doorLength * 0.5, 0, width * 0.5 + 0.72] as const,
      'entry:right': [doorHingeX - doorLength * 0.5, 0, -width * 0.5 - 0.72] as const,
      driver: [doorHingeX - doorLength * 0.45, beltHeight * 0.88, width * 0.22] as const,
      passenger: [doorHingeX - doorLength * 0.45, beltHeight * 0.88, -width * 0.22] as const,
      cargo: [cargoHingeX - cargoLength * 0.45, beltHeight * 0.72, 0] as const,
      tow: [-length * 0.53, bodyBottom, 0] as const,
    }),
  });
}
