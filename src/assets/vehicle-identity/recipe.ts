import { SeedTree, normalizeSeed, type Seed } from '../../core/random.js';
import { ACCENT_COLORS, type RgbColor } from '../../core/sketch.js';

export const VEHICLE_ARCHETYPES = ['city', 'coupe', 'sedan', 'van', 'pickup'] as const;
export const VEHICLE_WHEEL_STYLES = ['steel', 'hubcap', 'sport'] as const;

export type VehicleArchetype = typeof VEHICLE_ARCHETYPES[number];
export type VehicleWheelStyle = typeof VEHICLE_WHEEL_STYLES[number];
export type VehicleDoorCount = 2 | 4;

export type VehicleIdentityRecipe = Readonly<{
  version: 1;
  kind: 'vehicle-identity';
  seed: number;
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
    frontStartRatio: number;
    frontEndRatio: number;
    rearEndRatio: number;
  }>;
  details: Readonly<{
    roofRack: boolean;
    spoiler: boolean;
    towHitch: boolean;
    spareWheel: boolean;
    headlight: 'round' | 'pill' | 'square';
  }>;
  palette: Readonly<{
    body: RgbColor;
    accent: RgbColor;
    glass: RgbColor;
    tyre: RgbColor;
    hub: RgbColor;
    light: RgbColor;
  }>;
}>;

export type VehicleIdentityOptions = Readonly<{
  archetype?: VehicleArchetype;
  wheelStyle?: VehicleWheelStyle;
  doorCount?: VehicleDoorCount;
  roofRack?: boolean;
  spoiler?: boolean;
}>;

type ArchetypeProfile = Readonly<{
  length: readonly [number, number];
  width: readonly [number, number];
  height: readonly [number, number];
  clearance: readonly [number, number];
  bonnetRatio: readonly [number, number];
  cargoRatio: readonly [number, number];
  beltHeightRatio: readonly [number, number];
  cabinStartRatio: readonly [number, number];
  cabinEndRatio: readonly [number, number];
  roofHeightRatio: readonly [number, number];
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
    bonnetRatio: [0.12, 0.17], cargoRatio: [0.1, 0.15], beltHeightRatio: [0.48, 0.54],
    cabinStartRatio: [0.18, 0.23], cabinEndRatio: [0.82, 0.88], roofHeightRatio: [0.88, 0.97],
    wheelbaseRatio: [0.62, 0.68], wheelRadiusRatio: [0.105, 0.12], wheelWidthRatio: [0.16, 0.19],
    seats: 4, doors: 2, roofRackChance: 0.12, spoilerChance: 0.08, towHitchChance: 0.06,
  }),
  coupe: archetypeProfile({
    length: [4.35, 4.85], width: [1.82, 1.98], height: [1.28, 1.47], clearance: [0.11, 0.17],
    bonnetRatio: [0.22, 0.28], cargoRatio: [0.16, 0.22], beltHeightRatio: [0.52, 0.58],
    cabinStartRatio: [0.29, 0.35], cabinEndRatio: [0.73, 0.79], roofHeightRatio: [0.82, 0.9],
    wheelbaseRatio: [0.61, 0.67], wheelRadiusRatio: [0.1, 0.115], wheelWidthRatio: [0.19, 0.23],
    seats: 2, doors: 2, roofRackChance: 0.02, spoilerChance: 0.62, towHitchChance: 0.01,
  }),
  sedan: archetypeProfile({
    length: [4.65, 5.2], width: [1.8, 1.96], height: [1.43, 1.62], clearance: [0.14, 0.2],
    bonnetRatio: [0.2, 0.25], cargoRatio: [0.18, 0.23], beltHeightRatio: [0.5, 0.56],
    cabinStartRatio: [0.27, 0.32], cabinEndRatio: [0.72, 0.78], roofHeightRatio: [0.86, 0.94],
    wheelbaseRatio: [0.61, 0.68], wheelRadiusRatio: [0.092, 0.108], wheelWidthRatio: [0.16, 0.2],
    seats: 5, doors: 4, roofRackChance: 0.08, spoilerChance: 0.17, towHitchChance: 0.08,
  }),
  van: archetypeProfile({
    length: [4.9, 5.65], width: [1.9, 2.08], height: [2.05, 2.42], clearance: [0.18, 0.27],
    bonnetRatio: [0.08, 0.15], cargoRatio: [0.08, 0.14], beltHeightRatio: [0.46, 0.52],
    cabinStartRatio: [0.12, 0.18], cabinEndRatio: [0.9, 0.95], roofHeightRatio: [0.91, 0.98],
    wheelbaseRatio: [0.63, 0.71], wheelRadiusRatio: [0.083, 0.1], wheelWidthRatio: [0.18, 0.22],
    seats: 7, doors: 4, roofRackChance: 0.56, spoilerChance: 0.01, towHitchChance: 0.34,
  }),
  pickup: archetypeProfile({
    length: [5.1, 5.9], width: [1.92, 2.12], height: [1.75, 2.08], clearance: [0.24, 0.35],
    bonnetRatio: [0.2, 0.27], cargoRatio: [0.3, 0.38], beltHeightRatio: [0.5, 0.57],
    cabinStartRatio: [0.26, 0.32], cabinEndRatio: [0.58, 0.67], roofHeightRatio: [0.87, 0.95],
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
  const frontStartRatio = cabin.float(...profile.cabinStartRatio);
  const frontEndRatio = Math.min(0.61, frontStartRatio + cabin.float(0.19, 0.25));
  const doorCount = options.doorCount ?? profile.doors;

  return Object.freeze({
    version: 1,
    kind: 'vehicle-identity',
    seed: normalizedSeed,
    archetype,
    dimensions: Object.freeze({
      length,
      width,
      height,
      groundClearance: dimensions.float(...profile.clearance),
    }),
    body: Object.freeze({
      bonnetRatio: body.float(...profile.bonnetRatio),
      cargoRatio: body.float(...profile.cargoRatio),
      beltHeightRatio: body.float(...profile.beltHeightRatio),
      cornerRoundness: body.float(0.72, 1.18),
    }),
    cabin: Object.freeze({
      startRatio: frontStartRatio,
      endRatio: cabin.float(...profile.cabinEndRatio),
      roofHeightRatio: cabin.float(...profile.roofHeightRatio),
      windscreenSlope: cabin.float(0.68, 1.08),
      rearSlope: cabin.float(0.58, 1.02),
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
      frontStartRatio,
      frontEndRatio,
      rearEndRatio: doorCount === 4 ? Math.min(0.78, frontEndRatio + doors.float(0.16, 0.22)) : frontEndRatio,
    }),
    details: Object.freeze({
      roofRack: options.roofRack ?? details.chance(profile.roofRackChance),
      spoiler: options.spoiler ?? details.chance(profile.spoilerChance),
      towHitch: details.chance(profile.towHitchChance),
      spareWheel: archetype === 'pickup' && details.chance(0.42),
      headlight: details.pick(['round', 'pill', 'square'] as const),
    }),
    palette: Object.freeze({
      body: freezeColor(palette.pick(BODY_COLORS)),
      accent: freezeColor(palette.pick(ACCENT_COLORS)),
      glass: freezeColor(palette.pick(GLASS_COLORS)),
      tyre: freezeColor([39, 39, 37]),
      hub: freezeColor([135, 139, 138]),
      light: freezeColor([237, 210, 126]),
    }),
  });
}
