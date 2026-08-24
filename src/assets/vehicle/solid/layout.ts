import type { Point } from '../../../core/geometry.js';
import type { Bounds3, Point3 } from '../../../core/geometry3.js';
import type {
  Pose3,
  SolidNodeDefinition,
  SolidSocketDefinition,
} from '../../../contracts/solid-asset.js';
import { createVehicleBodySideSection } from '../identity/body-side-section.js';
import { createVehicleCabinCrossSection } from '../identity/cabin-section.js';
import { createVehicleDoorSideProfile } from '../identity/door-profile.js';
import { createVehicleCabinSideProfile } from '../identity/geometry.js';
import { vehicleSideSign, type VehicleIdentityRecipe } from '../identity/recipe.js';

export type SolidVehicleLayout = Readonly<{
  length: number;
  width: number;
  height: number;
  bodyBottom: number;
  beltHeight: number;
  roofHeight: number;
  rearAxleX: number;
  frontAxleX: number;
  doorPanelHeight: number;
  doorAssemblyHeight: number;
  doorLength: number;
  doorHingeX: number;
  doorPanelOutline: readonly Point[];
  doorWindowOutline: readonly Point[];
  doorWindowGlassOutline: readonly Point[];
  doorOpeningOutline: readonly Point[];
  doorHandle: Point;
  doorSurfaceHalfWidth: number;
  cabinBeltHalfWidth: number;
  cabinRoofHalfWidth: number;
  roofOverhang: number;
  hoodLength: number;
  hoodHingeX: number;
  cargoLength: number;
  cargoHingeX: number;
  bounds: Bounds3;
  nodes: readonly SolidNodeDefinition[];
  sockets: readonly SolidSocketDefinition[];
}>;

function pose(position: Point3): Pose3 {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
}

export function buildSolidVehicleLayout(identity: VehicleIdentityRecipe): SolidVehicleLayout {
  const { length, width, height } = identity.dimensions;
  const radius = identity.wheels.radius;
  const cabinSideProfile = createVehicleCabinSideProfile(identity);
  const { bodyBottom, beltHeight, roofHeight } = cabinSideProfile;
  const axleInset = length * (1 - identity.wheels.wheelbaseRatio) / 2;
  const rearAxleX = -length * 0.5 + axleInset;
  const frontAxleX = length * 0.5 - axleInset;
  const doorProfile = createVehicleDoorSideProfile(identity);
  const bodySection = createVehicleBodySideSection(identity);
  const cabinSection = createVehicleCabinCrossSection(identity);
  const doorHingeX = doorProfile.hingeX;
  const doorLength = doorProfile.length;
  const doorPanelHeight = doorProfile.panelHeight;
  const localDoorPoints = (points: readonly Point[]): readonly Point[] => Object.freeze(
    points.map(([x, y]) => Object.freeze([
      x - doorHingeX,
      y - bodyBottom,
    ] as const)),
  );
  const doorPanelOutline = localDoorPoints(doorProfile.panelOutline);
  const doorWindowOutline = localDoorPoints(doorProfile.windowFrameOutline);
  const doorWindowGlassOutline = localDoorPoints(doorProfile.windowGlassOutline);
  const doorOpeningOutline = localDoorPoints(doorProfile.openingOutline);
  const doorHandle = Object.freeze([
    doorProfile.handle[0] - doorHingeX,
    doorProfile.handle[1] - bodyBottom,
  ] as const);
  const hoodHingeX = -length * 0.5 + Math.max(identity.cabin.endRatio, 1 - identity.body.bonnetRatio) * length;
  const hoodLength = Math.max(0.42, length * 0.99 - (hoodHingeX + length * 0.5));
  const cargoHingeX = -length * 0.5 + identity.cabin.startRatio * length;
  const cargoLength = Math.max(0.42, cargoHingeX - (-length * 0.49));
  const doorZ = bodySection.sideHalfWidth;
  const wheelZ = width * 0.5 + identity.wheels.width * 0.32;
  const nodes: readonly SolidNodeDefinition[] = Object.freeze([
    Object.freeze({ id: 'root', restPose: pose([0, 0, 0] as const) }),
    Object.freeze({ id: 'chassis', parentNode: 'root', restPose: pose([0, 0, 0] as const) }),
    Object.freeze({
      id: 'wheel:rear:left', parentNode: 'root',
      restPose: pose([rearAxleX, radius, vehicleSideSign('left') * wheelZ] as const),
    }),
    Object.freeze({
      id: 'wheel:rear:right', parentNode: 'root',
      restPose: pose([rearAxleX, radius, vehicleSideSign('right') * wheelZ] as const),
    }),
    Object.freeze({
      id: 'wheel:front:left', parentNode: 'root',
      restPose: pose([frontAxleX, radius, vehicleSideSign('left') * wheelZ] as const),
    }),
    Object.freeze({
      id: 'wheel:front:right', parentNode: 'root',
      restPose: pose([frontAxleX, radius, vehicleSideSign('right') * wheelZ] as const),
    }),
    ...identity.doors.sides.map((side) => Object.freeze({
      id: `door:${side}`,
      parentNode: 'chassis',
      restPose: pose([doorHingeX, bodyBottom, vehicleSideSign(side) * doorZ] as const),
    })),
    Object.freeze({ id: 'hood', parentNode: 'chassis', restPose: pose([hoodHingeX, beltHeight, 0] as const) }),
    Object.freeze({ id: 'cargo', parentNode: 'chassis', restPose: pose([cargoHingeX, beltHeight, 0] as const) }),
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
    doorPanelHeight,
    doorAssemblyHeight: doorProfile.assemblyHeight,
    doorLength,
    doorHingeX,
    doorPanelOutline,
    doorWindowOutline,
    doorWindowGlassOutline,
    doorOpeningOutline,
    doorHandle,
    doorSurfaceHalfWidth: bodySection.sideHalfWidth,
    cabinBeltHalfWidth: cabinSection.beltHalfWidth,
    cabinRoofHalfWidth: cabinSection.roofHalfWidth,
    roofOverhang: cabinSection.roofOverhang,
    hoodLength,
    hoodHingeX,
    cargoLength,
    cargoHingeX,
    bounds: Object.freeze({
      minimum: [-length * 0.53, 0, -openDoorDepth] as const,
      maximum: [length * 0.53, maximumY, openDoorDepth] as const,
    }),
    nodes,
    sockets: Object.freeze([
      ...identity.doors.sides.map((side) => Object.freeze({
        id: `door:${side}:handle`,
        node: `door:${side}`,
        localPose: pose([
          doorHandle[0],
          doorHandle[1],
          vehicleSideSign(side) * 0.035,
        ] as const),
      })),
      Object.freeze({ id: 'entry:left', node: 'root', localPose: pose([
        doorHingeX - doorLength * 0.5,
        0,
        vehicleSideSign('left') * (width * 0.5 + 0.72),
      ] as const) }),
      Object.freeze({ id: 'entry:right', node: 'root', localPose: pose([
        doorHingeX - doorLength * 0.5,
        0,
        vehicleSideSign('right') * (width * 0.5 + 0.72),
      ] as const) }),
      Object.freeze({ id: 'hood:service', node: 'root', localPose: pose([
        length * 0.5 + 0.78,
        0,
        0,
      ] as const) }),
      Object.freeze({ id: 'driver', node: 'chassis', localPose: pose([
        doorHingeX - doorLength * 0.45,
        beltHeight * 0.88,
        vehicleSideSign('left') * width * 0.22,
      ] as const) }),
      Object.freeze({ id: 'passenger', node: 'chassis', localPose: pose([
        doorHingeX - doorLength * 0.45,
        beltHeight * 0.88,
        vehicleSideSign('right') * width * 0.22,
      ] as const) }),
      Object.freeze({
        id: 'cargo', node: 'chassis',
        localPose: pose([cargoHingeX - cargoLength * 0.45, beltHeight * 0.72, 0] as const),
      }),
      Object.freeze({ id: 'tow', node: 'root', localPose: pose([-length * 0.53, bodyBottom, 0] as const) }),
    ]),
  });
}
