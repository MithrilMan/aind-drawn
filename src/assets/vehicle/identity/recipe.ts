import { SeedTree, normalizeSeed, type Seed } from '../../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../../core/sketch.js';
import type { AssetIdentityEnvelope } from '../../../contracts/asset-envelope.js';

export const VEHICLE_ARCHETYPES = [
  'city', 'coupe', 'sedan', 'fastback', 'roadster',
  'wagon', 'suv', 'offroad', 'van', 'pickup',
] as const;
export const VEHICLE_WHEEL_STYLES = ['steel', 'hubcap', 'sport'] as const;
export const VEHICLE_HEADLIGHT_STYLES = ['round', 'pill', 'square', 'slit', 'stacked'] as const;
export const VEHICLE_SIDES = ['left', 'right'] as const;

export type VehicleArchetype = typeof VEHICLE_ARCHETYPES[number];
export type VehicleWheelStyle = typeof VEHICLE_WHEEL_STYLES[number];
export type VehicleHeadlightStyle = typeof VEHICLE_HEADLIGHT_STYLES[number];
export type VehicleSide = typeof VEHICLE_SIDES[number];
export type VehicleDoorCount = 2 | 4;
export type VehicleDoorWindowFrame = 'framed' | 'frameless';

/** Right-handed vehicle-local convention: front +X, up +Y, right +Z. */
export function vehicleSideSign(side: VehicleSide): -1 | 1 {
  return side === 'left' ? -1 : 1;
}

export type VehicleIdentityRecipe = AssetIdentityEnvelope<'vehicle'> & Readonly<{
  archetype: VehicleArchetype;
  dimensions: Readonly<{
    length: number;
    width: number;
    height: number;
    groundClearance: number;
  }>;
  body: Readonly<{
    bonnetRatio: number;
    cargoRatio: number;
    beltHeightRatio: number;
    cornerRoundness: number;
  }>;
  cabin: Readonly<{
    startRatio: number;
    endRatio: number;
    roofHeightRatio: number;
    windscreenSlope: number;
    rearSlope: number;
    seatCount: number;
  }>;
  wheels: Readonly<{
    wheelbaseRatio: number;
    radius: number;
    width: number;
    hubRadiusRatio: number;
    style: VehicleWheelStyle;
  }>;
  doors: Readonly<{
    count: VehicleDoorCount;
    sides: readonly VehicleSide[];
    hinge: 'front';
    windowFrame: VehicleDoorWindowFrame;
    openingAngle: number;
    frontStartRatio: number;
    frontEndRatio: number;
    rearEndRatio: number;
  }>;
  details: Readonly<{
    roofRack: boolean;
    spoiler: boolean;
    towHitch: boolean;
    spareWheel: boolean;
    headlight: VehicleHeadlightStyle;
  }>;
  palette: Readonly<{
    body: RgbColor;
    accent: RgbColor;
    glass: RgbColor;
    tyre: RgbColor;
    hub: RgbColor;
    light: RgbColor;
    rearLight: RgbColor;
    interior: RgbColor;
  }>;
}>;

export type VehicleIdentityOptions = Readonly<{
  archetype?: VehicleArchetype;
  wheelStyle?: VehicleWheelStyle;
  doorCount?: VehicleDoorCount;
  roofRack?: boolean;
  spoiler?: boolean;
  headlight?: VehicleHeadlightStyle;
}>;

type ArchetypeProfile = Readonly<{
  length: readonly [number, number];
  width: readonly [number, number];
  height: readonly [number, number];
  clearance: readonly [number, number];
  bonnetRatio: readonly [number, number];
  cargoRatio: readonly [number, number];
  beltHeightRatio: readonly [number, number];
  roofHeightRatio: readonly [number, number];
  windscreenSlope: readonly [number, number];
  rearSlope: readonly [number, number];
  cornerRoundness: readonly [number, number];
  wheelbaseRatio: readonly [number, number];
  wheelRadiusRatio: readonly [number, number];
  wheelWidthRatio: readonly [number, number];
  seats: number;
  doors: VehicleDoorCount;
  roofRackChance: number;
  spoilerChance: number;
  towHitchChance: number;
}>;

function archetypeProfile(profile: ArchetypeProfile): ArchetypeProfile {
  return Object.freeze(profile);
}

const ARCHETYPE_PROFILES: Readonly<Record<VehicleArchetype, ArchetypeProfile>> = Object.freeze({
  city: archetypeProfile({
    length: [3.6, 4.15], width: [1.68, 1.84], height: [1.5, 1.72], clearance: [0.16, 0.22],
    bonnetRatio: [0.17, 0.22], cargoRatio: [0.11, 0.16], beltHeightRatio: [0.48, 0.54],
    roofHeightRatio: [0.88, 0.97], windscreenSlope: [0.92, 1.18], rearSlope: [0.78, 1.04],
    cornerRoundness: [0.9, 1.18],
    wheelbaseRatio: [0.62, 0.68], wheelRadiusRatio: [0.105, 0.12], wheelWidthRatio: [0.16, 0.19],
    seats: 4, doors: 2, roofRackChance: 0.12, spoilerChance: 0.08, towHitchChance: 0.06,
  }),
  coupe: archetypeProfile({
    length: [4.35, 4.85], width: [1.82, 1.98], height: [1.28, 1.47], clearance: [0.11, 0.17],
    bonnetRatio: [0.29, 0.35], cargoRatio: [0.16, 0.21], beltHeightRatio: [0.52, 0.58],
    roofHeightRatio: [0.82, 0.9], windscreenSlope: [0.68, 0.88], rearSlope: [0.72, 0.92],
    cornerRoundness: [0.82, 1.08],
    wheelbaseRatio: [0.61, 0.67], wheelRadiusRatio: [0.1, 0.115], wheelWidthRatio: [0.19, 0.23],
    seats: 2, doors: 2, roofRackChance: 0.02, spoilerChance: 0.62, towHitchChance: 0.01,
  }),
  sedan: archetypeProfile({
    length: [4.65, 5.2], width: [1.8, 1.96], height: [1.43, 1.62], clearance: [0.14, 0.2],
    bonnetRatio: [0.25, 0.31], cargoRatio: [0.17, 0.22], beltHeightRatio: [0.5, 0.56],
    roofHeightRatio: [0.86, 0.94], windscreenSlope: [0.76, 0.98], rearSlope: [0.82, 1.04],
    cornerRoundness: [0.78, 1.02],
    wheelbaseRatio: [0.61, 0.68], wheelRadiusRatio: [0.092, 0.108], wheelWidthRatio: [0.16, 0.2],
    seats: 5, doors: 4, roofRackChance: 0.08, spoilerChance: 0.17, towHitchChance: 0.08,
  }),
  fastback: archetypeProfile({
    length: [4.45, 4.98], width: [1.82, 2], height: [1.34, 1.52], clearance: [0.12, 0.18],
    bonnetRatio: [0.27, 0.33], cargoRatio: [0.1, 0.15], beltHeightRatio: [0.52, 0.58],
    roofHeightRatio: [0.84, 0.92], windscreenSlope: [0.68, 0.88], rearSlope: [0.48, 0.68],
    cornerRoundness: [0.82, 1.08],
    wheelbaseRatio: [0.62, 0.69], wheelRadiusRatio: [0.098, 0.114], wheelWidthRatio: [0.18, 0.22],
    seats: 4, doors: 2, roofRackChance: 0.02, spoilerChance: 0.48, towHitchChance: 0.02,
  }),
  roadster: archetypeProfile({
    length: [4.05, 4.58], width: [1.78, 1.96], height: [1.18, 1.34], clearance: [0.1, 0.16],
    bonnetRatio: [0.35, 0.42], cargoRatio: [0.15, 0.2], beltHeightRatio: [0.55, 0.61],
    roofHeightRatio: [0.8, 0.87], windscreenSlope: [0.62, 0.8], rearSlope: [0.86, 1.08],
    cornerRoundness: [0.9, 1.18],
    wheelbaseRatio: [0.59, 0.65], wheelRadiusRatio: [0.105, 0.122], wheelWidthRatio: [0.2, 0.24],
    seats: 2, doors: 2, roofRackChance: 0, spoilerChance: 0.26, towHitchChance: 0,
  }),
  wagon: archetypeProfile({
    length: [4.55, 5.15], width: [1.8, 1.98], height: [1.5, 1.7], clearance: [0.15, 0.22],
    bonnetRatio: [0.23, 0.29], cargoRatio: [0.08, 0.13], beltHeightRatio: [0.48, 0.54],
    roofHeightRatio: [0.9, 0.97], windscreenSlope: [0.82, 1.04], rearSlope: [1.02, 1.28],
    cornerRoundness: [0.76, 1.02],
    wheelbaseRatio: [0.64, 0.71], wheelRadiusRatio: [0.092, 0.108], wheelWidthRatio: [0.17, 0.21],
    seats: 5, doors: 4, roofRackChance: 0.58, spoilerChance: 0.08, towHitchChance: 0.28,
  }),
  suv: archetypeProfile({
    length: [4.45, 5.25], width: [1.88, 2.08], height: [1.68, 1.96], clearance: [0.2, 0.3],
    bonnetRatio: [0.24, 0.3], cargoRatio: [0.1, 0.15], beltHeightRatio: [0.5, 0.57],
    roofHeightRatio: [0.9, 0.97], windscreenSlope: [0.86, 1.08], rearSlope: [0.94, 1.18],
    cornerRoundness: [0.78, 1.04],
    wheelbaseRatio: [0.62, 0.69], wheelRadiusRatio: [0.1, 0.12], wheelWidthRatio: [0.2, 0.25],
    seats: 5, doors: 4, roofRackChance: 0.62, spoilerChance: 0.16, towHitchChance: 0.46,
  }),
  offroad: archetypeProfile({
    length: [4.15, 4.85], width: [1.88, 2.08], height: [1.76, 2.08], clearance: [0.3, 0.42],
    bonnetRatio: [0.27, 0.34], cargoRatio: [0.14, 0.2], beltHeightRatio: [0.52, 0.59],
    roofHeightRatio: [0.88, 0.95], windscreenSlope: [1.02, 1.3], rearSlope: [1.04, 1.32],
    cornerRoundness: [0.72, 0.9],
    wheelbaseRatio: [0.58, 0.66], wheelRadiusRatio: [0.12, 0.145], wheelWidthRatio: [0.24, 0.3],
    seats: 4, doors: 4, roofRackChance: 0.66, spoilerChance: 0, towHitchChance: 0.74,
  }),
  van: archetypeProfile({
    length: [4.9, 5.65], width: [1.9, 2.08], height: [2.05, 2.42], clearance: [0.18, 0.27],
    bonnetRatio: [0.12, 0.18], cargoRatio: [0.06, 0.11], beltHeightRatio: [0.46, 0.52],
    roofHeightRatio: [0.91, 0.98], windscreenSlope: [1.12, 1.42], rearSlope: [1.12, 1.4],
    cornerRoundness: [0.76, 0.98],
    wheelbaseRatio: [0.63, 0.71], wheelRadiusRatio: [0.083, 0.1], wheelWidthRatio: [0.18, 0.22],
    seats: 7, doors: 4, roofRackChance: 0.56, spoilerChance: 0.01, towHitchChance: 0.34,
  }),
  pickup: archetypeProfile({
    length: [5.1, 5.9], width: [1.92, 2.12], height: [1.75, 2.08], clearance: [0.24, 0.35],
    bonnetRatio: [0.26, 0.32], cargoRatio: [0.31, 0.39], beltHeightRatio: [0.5, 0.57],
    roofHeightRatio: [0.87, 0.95], windscreenSlope: [0.88, 1.12], rearSlope: [1.04, 1.3],
    cornerRoundness: [0.72, 0.94],
    wheelbaseRatio: [0.62, 0.7], wheelRadiusRatio: [0.09, 0.108], wheelWidthRatio: [0.2, 0.25],
    seats: 4, doors: 4, roofRackChance: 0.23, spoilerChance: 0, towHitchChance: 0.82,
  }),
});

const BODY_COLORS: readonly RgbColor[] = [
  [167, 72, 58], [61, 101, 126], [78, 122, 96], [202, 151, 53],
  [119, 91, 132], [214, 211, 197], [65, 68, 72],
];
const GLASS_COLORS: readonly RgbColor[] = [
  [82, 117, 126], [102, 128, 132], [74, 93, 112], [112, 124, 116],
];
const REAR_LIGHT_COLORS: readonly RgbColor[] = [
  [184, 49, 43], [158, 38, 36], [201, 64, 48],
];

function freezeColor(color: RgbColor): RgbColor {
  return Object.freeze([color[0], color[1], color[2]] as const);
}

export function createVehicleIdentity(
  seed: Seed,
  options: VehicleIdentityOptions = {},
): VehicleIdentityRecipe {
  const normalizedSeed = normalizeSeed(seed);
  const tree = new SeedTree(normalizedSeed);
  const archetype = options.archetype ?? tree.random('vehicle:archetype').weighted([
    { value: 'city' as const, weight: 3 },
    { value: 'coupe' as const, weight: 2 },
    { value: 'sedan' as const, weight: 3 },
    { value: 'fastback' as const, weight: 2 },
    { value: 'roadster' as const, weight: 1.4 },
    { value: 'wagon' as const, weight: 2 },
    { value: 'suv' as const, weight: 2.5 },
    { value: 'offroad' as const, weight: 1.5 },
    { value: 'van' as const, weight: 2 },
    { value: 'pickup' as const, weight: 2 },
  ]);
  const profile = ARCHETYPE_PROFILES[archetype];
  const dimensions = tree.random('vehicle:dimensions');
  const body = tree.random('vehicle:body');
  const cabin = tree.random('vehicle:cabin');
  const wheels = tree.random('vehicle:wheels');
  const doors = tree.random('vehicle:doors');
  const details = tree.random('vehicle:details');
  const palette = tree.random('vehicle:palette');
  const length = dimensions.float(...profile.length);
  const width = dimensions.float(...profile.width);
  const height = dimensions.float(...profile.height);
  const wheelbaseRatio = wheels.float(...profile.wheelbaseRatio);
  const bonnetRatio = body.float(...profile.bonnetRatio);
  const cargoRatio = body.float(...profile.cargoRatio);
  const cabinStartRatio = cargoRatio;
  const cabinEndRatio = 1 - bonnetRatio;
  const doorCount = options.doorCount ?? profile.doors;
  const doorStart = cabinStartRatio + 0.012;
  const doorEnd = cabinEndRatio - 0.025;
  const splitStartRatio = doorCount === 4
    ? doorStart + (doorEnd - doorStart) * doors.float(0.44, 0.5)
    : doorStart;
  const maximumDoorRatio = doorCount === 4
    ? doors.float(0.19, 0.24)
    : doors.float(0.24, 0.29);
  const frontStartRatio = Math.max(splitStartRatio, doorEnd - maximumDoorRatio);
  const frontEndRatio = doorEnd;

  return Object.freeze({
    schemaVersion: 1,
    family: 'vehicle',
    seed: normalizedSeed,
    archetype,
    dimensions: Object.freeze({
      length,
      width,
      height,
      groundClearance: dimensions.float(...profile.clearance),
    }),
    body: Object.freeze({
      bonnetRatio,
      cargoRatio,
      beltHeightRatio: body.float(...profile.beltHeightRatio),
      cornerRoundness: body.float(...profile.cornerRoundness),
    }),
    cabin: Object.freeze({
      startRatio: cabinStartRatio,
      endRatio: cabinEndRatio,
      roofHeightRatio: cabin.float(...profile.roofHeightRatio),
      windscreenSlope: cabin.float(...profile.windscreenSlope),
      rearSlope: cabin.float(...profile.rearSlope),
      seatCount: profile.seats,
    }),
    wheels: Object.freeze({
      wheelbaseRatio,
      radius: length * wheels.float(...profile.wheelRadiusRatio),
      width: width * wheels.float(...profile.wheelWidthRatio),
      hubRadiusRatio: wheels.float(0.42, 0.58),
      style: options.wheelStyle ?? wheels.pick(VEHICLE_WHEEL_STYLES),
    }),
    doors: Object.freeze({
      count: doorCount,
      sides: Object.freeze([...VEHICLE_SIDES]),
      hinge: 'front',
      windowFrame: archetype === 'coupe' || archetype === 'fastback' || archetype === 'roadster'
        ? 'frameless'
        : 'framed',
      openingAngle: tree.random('vehicle:doors:motion').float(Math.PI * 0.42, Math.PI * 0.47),
      frontStartRatio,
      frontEndRatio,
      rearEndRatio: doorCount === 4 ? frontStartRatio : doorStart,
    }),
    details: Object.freeze({
      roofRack: options.roofRack ?? details.chance(profile.roofRackChance),
      spoiler: options.spoiler ?? details.chance(profile.spoilerChance),
      towHitch: details.chance(profile.towHitchChance),
      spareWheel: (archetype === 'pickup' || archetype === 'offroad') && details.chance(0.42),
      headlight: options.headlight ?? details.pick(VEHICLE_HEADLIGHT_STYLES),
    }),
    palette: Object.freeze({
      body: freezeColor(palette.pick(BODY_COLORS)),
      accent: freezeColor(palette.pick(ACCENT_COLORS)),
      glass: freezeColor(palette.pick(GLASS_COLORS)),
      tyre: freezeColor([39, 39, 37]),
      hub: freezeColor([135, 139, 138]),
      light: freezeColor([237, 210, 126]),
      rearLight: freezeColor(palette.pick(REAR_LIGHT_COLORS)),
      interior: freezeColor([34, 35, 33]),
    }),
  });
}
