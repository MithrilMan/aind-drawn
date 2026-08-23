import {
  BUILDING_AUTHORING_SCHEMA,
  CHARACTER_AUTHORING_SCHEMA,
  CHARACTER_EXPRESSIONS,
  CHARACTER_POSES,
  VEHICLE_AUTHORING_SCHEMA,
  VEHICLE_MOTIONS,
  VEHICLE_STEERING_DIRECTIONS,
  SpriteRig,
  SolidRig,
  applyRasterCharacterMotion,
  applyRasterVehicleMotion,
  applySolidCharacterMotion,
  applySolidVehicleMotion,
  createCharacterMotionState,
  createVehicleMotionState,
  sampleCharacterMotion,
  sampleVehicleMotion,
  setCharacterMotion,
  setVehicleMotion,
  vehicleSteeringInput,
  createDefaultAssetAuthoringValues,
  createBuildingIdentity,
  createCharacterIdentity,
  createVehicleIdentity,
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createRasterCharacterBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  type AssetAuthoringValue,
  type AssetBlueprint,
  type AssetFamilyAuthoringSchema,
  type BuildingArchetype,
  type BuildingIdentityRecipe,
  type BuildingIdentityOptions,
  type CharacterDentalStyle,
  type CharacterEarStyle,
  type CharacterEyeStyle,
  type CharacterEyewearStyle,
  type CharacterFacialHairStyle,
  type CharacterHairStyle,
  type CharacterHeadShape,
  type CharacterIdentityOptions,
  type CharacterIdentityRecipe,
  type CharacterIdentitySpecies,
  type CharacterExpression,
  type CharacterMotion,
  type CharacterMotionSample,
  type CharacterMouthStyle,
  type CharacterNoseStyle,
  type CharacterOutfitStyle,
  type CharacterPose,
  type DoorStyle,
  type InkedSolidStrokeDefinition,
  type MediumId,
  type RoofStyle,
  type SolidAssetBlueprint,
  type SolidFinishId,
  type VehicleArchetype,
  type VehicleDoorCount,
  type VehicleIdentityOptions,
  type VehicleIdentityRecipe,
  type VehicleMotionSample,
  type VehicleWheelStyle,
} from '../../../src/index.js';

export type StudioFamilyId = 'character' | 'building' | 'vehicle';
export type FamilyCustomization = Readonly<Record<string, AssetAuthoringValue>>;
export type FamilyDynamicState = Readonly<Record<string, string>>;

export type StudioChoice = Readonly<{ value: string; label: string }>;
export type StudioDynamicControl = Readonly<{
  id: string;
  label: string;
  kind: 'motion' | 'expression' | 'interaction';
  interactionId?: string;
  options: readonly StudioChoice[];
}>;

export type StudioRuntimeFrame = Readonly<{
  deltaSeconds: number;
  elapsedSeconds: number;
  speed: number;
  dynamicState: FamilyDynamicState;
}>;

export type StudioRuntimeAdapter = Readonly<{
  update: (frame: StudioRuntimeFrame) => void;
}>;

export type StudioRuntimeOptions = Readonly<{ autoGaze: boolean }>;
export type FamilyIdentity = BuildingIdentityRecipe | CharacterIdentityRecipe | VehicleIdentityRecipe;
export type StudioRasterRuntimeFactory = (
  rig: SpriteRig,
  identity: FamilyIdentity,
  options: StudioRuntimeOptions,
) => StudioRuntimeAdapter;
export type StudioSolidRuntimeFactory = (
  rig: SolidRig,
  identity: FamilyIdentity,
  options: StudioRuntimeOptions,
) => StudioRuntimeAdapter;

export type FamilyProjection = Readonly<{
  identity: FamilyIdentity;
  raster: AssetBlueprint;
  solid: SolidAssetBlueprint;
  strokes: readonly InkedSolidStrokeDefinition[];
}>;

export type StudioFamilyDefinition = Readonly<{
  id: StudioFamilyId;
  label: string;
  description: string;
  defaultSeed: number;
  initialYaw: number;
  initialPitch: number;
  solidFrameScale: number;
  defaultFinish: SolidFinishId;
  rasterViewTitle: string;
  rasterAriaLabel: string;
  workspaceNote: string;
  playback: boolean;
  livelyGaze: boolean;
  dynamicControls: readonly StudioDynamicControl[];
  defaultDynamicState: FamilyDynamicState;
  authoring: AssetFamilyAuthoringSchema;
  defaultCustomization: FamilyCustomization;
  createProjection: (
    seed: number,
    medium: MediumId,
    customization: FamilyCustomization,
    finish: SolidFinishId,
  ) => FamilyProjection;
  createRasterRuntime: StudioRasterRuntimeFactory;
  createSolidRuntime: StudioSolidRuntimeFactory;
}>;

function optionalString(value: AssetAuthoringValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: AssetAuthoringValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalNumber(value: AssetAuthoringValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function choices(values: readonly string[]): readonly StudioChoice[] {
  return Object.freeze(values.map((value) => Object.freeze({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })));
}

const binaryChoices = choices(['closed', 'open']);

function characterProjection(
  seed: number,
  medium: MediumId,
  customization: FamilyCustomization,
  finish: SolidFinishId,
): FamilyProjection {
  const shape = optionalString(customization.shape) as CharacterHeadShape | undefined;
  const eyeStyle = optionalString(customization.eyeStyle) as CharacterEyeStyle | undefined;
  const hairStyle = optionalString(customization.hairStyle) as CharacterHairStyle | undefined;
  const mouthStyle = optionalString(customization.mouthStyle) as CharacterMouthStyle | undefined;
  const mouthTeeth = optionalString(customization.mouthTeeth) as CharacterDentalStyle | undefined;
  const mouthTongue = optionalBoolean(customization.mouthTongue);
  const outfitStyle = optionalString(customization.outfitStyle) as CharacterOutfitStyle | undefined;
  const earStyle = optionalString(customization.earStyle) as CharacterEarStyle | undefined;
  const noseStyle = optionalString(customization.noseStyle) as CharacterNoseStyle | undefined;
  const facialHairStyle = optionalString(customization.facialHairStyle) as
    CharacterFacialHairStyle | undefined;
  const eyewearStyle = optionalString(customization.eyewearStyle) as
    CharacterEyewearStyle | undefined;
  const options: CharacterIdentityOptions = {
    species: (optionalString(customization.species) as CharacterIdentitySpecies | undefined) ?? 'human',
    ...(shape === undefined ? {} : { shape }),
    ...(eyeStyle === undefined ? {} : { eyeStyle }),
    ...(hairStyle === undefined ? {} : { hairStyle }),
    ...(earStyle === undefined ? {} : { earStyle }),
    ...(noseStyle === undefined ? {} : { noseStyle }),
    ...(facialHairStyle === undefined ? {} : { facialHairStyle }),
    ...(eyewearStyle === undefined ? {} : { eyewearStyle }),
    ...(mouthStyle === undefined ? {} : { mouthStyle }),
    ...(mouthTeeth === undefined ? {} : { mouthTeeth }),
    ...(mouthTongue === undefined ? {} : { mouthTongue }),
    ...(outfitStyle === undefined ? {} : { outfitStyle }),
  };
  const identity = createCharacterIdentity(seed, options);
  const raster = createRasterCharacterBlueprint(identity, { medium });
  const solid = createSolidCharacterBlueprint(identity, { finish });
  return Object.freeze({
    identity,
    raster,
    solid,
    strokes: createSolidCharacterInkStrokes(solid),
  });
}

function buildingProjection(
  seed: number,
  medium: MediumId,
  customization: FamilyCustomization,
  finish: SolidFinishId,
): FamilyProjection {
  const archetype = optionalString(customization.archetype) as BuildingArchetype | undefined;
  const roof = optionalString(customization.roof) as RoofStyle | undefined;
  const doorStyle = optionalString(customization.doorStyle) as DoorStyle | undefined;
  const balcony = optionalBoolean(customization.balcony);
  const chimney = optionalBoolean(customization.chimney);
  const options: BuildingIdentityOptions = {
    ...(archetype === undefined ? {} : { archetype }),
    ...(roof === undefined ? {} : { roof }),
    ...(doorStyle === undefined ? {} : { doorStyle }),
    ...(balcony === undefined ? {} : { balcony }),
    ...(chimney === undefined ? {} : { chimney }),
  };
  const identity = createBuildingIdentity(seed, options);
  const raster = createRasterBuildingBlueprint(createRasterBuildingRecipe(identity, { medium }));
  const solid = createSolidBuildingBlueprint(identity, { finish });
  return Object.freeze({
    identity,
    raster,
    solid,
    strokes: createSolidBuildingInkStrokes(solid),
  });
}

function vehicleProjection(
  seed: number,
  medium: MediumId,
  customization: FamilyCustomization,
  finish: SolidFinishId,
): FamilyProjection {
  const roofRack = optionalBoolean(customization.roofRack);
  const spoiler = optionalBoolean(customization.spoiler);
  const options: VehicleIdentityOptions = {
    ...(optionalString(customization.archetype) === undefined ? {} : {
      archetype: optionalString(customization.archetype) as VehicleArchetype,
    }),
    ...(optionalString(customization.wheelStyle) === undefined ? {} : {
      wheelStyle: optionalString(customization.wheelStyle) as VehicleWheelStyle,
    }),
    ...(optionalNumber(customization.doorCount) === undefined ? {} : {
      doorCount: optionalNumber(customization.doorCount) as VehicleDoorCount,
    }),
    ...(roofRack === undefined ? {} : { roofRack }),
    ...(spoiler === undefined ? {} : { spoiler }),
  };
  const identity = createVehicleIdentity(seed, options);
  const raster = createRasterVehicleBlueprint(createRasterVehicleRecipe(identity, {
    medium,
    side: 'right',
  }));
  const solid = createSolidVehicleBlueprint(identity, { finish });
  return Object.freeze({
    identity,
    raster,
    solid,
    strokes: createSolidVehicleInkStrokes(solid),
  });
}

function characterRuntime(
  identity: CharacterIdentityRecipe,
  options: StudioRuntimeOptions,
  apply: (sample: CharacterMotionSample) => void,
): StudioRuntimeAdapter {
  let state = createCharacterMotionState({ autoGaze: options.autoGaze });
  return Object.freeze({
    update: ({ dynamicState, speed, elapsedSeconds }) => {
      const expression = (dynamicState.expression ?? 'idle') as CharacterExpression;
      const motion: CharacterMotion = Object.freeze({
        pose: (dynamicState.pose ?? 'idle') as CharacterPose,
        speed,
        facing: 1 as const,
        expression,
      });
      state = setCharacterMotion(state, motion, elapsedSeconds);
      apply(sampleCharacterMotion(identity, state, elapsedSeconds));
    },
  });
}

function vehicleRuntime(
  identity: VehicleIdentityRecipe,
  apply: (sample: VehicleMotionSample) => void,
): StudioRuntimeAdapter {
  let state = createVehicleMotionState();
  return Object.freeze({
    update: ({ dynamicState, speed, elapsedSeconds }) => {
      const preset = dynamicState.motion ?? 'parked';
      const steeringChoice = dynamicState.steering ?? 'straight';
      const signedSpeed = preset === 'reverse' ? -speed : preset === 'parked' ? 0 : speed;
      const steeringDirection = VEHICLE_STEERING_DIRECTIONS.find((value) => value === steeringChoice)
        ?? 'straight';
      const steering = preset === 'showcase'
        ? Math.sin(elapsedSeconds * 0.8) * 0.72
        : vehicleSteeringInput(steeringDirection);
      state = setVehicleMotion(state, Object.freeze({
        travelDistance: elapsedSeconds * signedSpeed * 2.4,
        speed: Math.abs(signedSpeed),
        steering,
        suspension: preset === 'showcase' ? 0.78 : 0.42,
      }));
      apply(sampleVehicleMotion(identity, state, elapsedSeconds));
    },
  });
}

function staticRasterRuntime(rig: SpriteRig): StudioRuntimeAdapter {
  return Object.freeze({
    update: ({ elapsedSeconds }) => {
      rig.updateBoil(elapsedSeconds);
    },
  });
}

const staticSolidRuntime: StudioSolidRuntimeFactory = () => Object.freeze({
  update: () => undefined,
});

export const STUDIO_FAMILIES: readonly StudioFamilyDefinition[] = Object.freeze([
  Object.freeze({
    id: 'character',
    label: 'Character',
    description: 'People, creatures, and expressive faces',
    defaultSeed: 4104,
    initialYaw: 0,
    initialPitch: -4,
    solidFrameScale: 0.62,
    defaultFinish: 'skin',
    rasterViewTitle: 'Front view',
    rasterAriaLabel: 'Front-facing 2D character drawing',
    workspaceNote: 'Pose it, add expression, then inspect every angle.',
    playback: true,
    livelyGaze: true,
    dynamicControls: Object.freeze([
      Object.freeze({ id: 'pose', label: 'Pose', kind: 'motion', options: choices(CHARACTER_POSES) }),
      Object.freeze({ id: 'expression', label: 'Expression', kind: 'expression', options: choices(CHARACTER_EXPRESSIONS) }),
    ]),
    defaultDynamicState: Object.freeze({ pose: 'idle', expression: 'idle' }),
    authoring: CHARACTER_AUTHORING_SCHEMA,
    defaultCustomization: createDefaultAssetAuthoringValues(CHARACTER_AUTHORING_SCHEMA),
    createProjection: characterProjection,
    createRasterRuntime: (
      rig: SpriteRig,
      identity: FamilyIdentity,
      options: StudioRuntimeOptions,
    ) => {
      if (identity.family !== 'character') throw new TypeError('Character runtime requires character identity');
      return characterRuntime(identity, options, (sample) => { applyRasterCharacterMotion(rig, sample); });
    },
    createSolidRuntime: (
      rig: SolidRig,
      identity: FamilyIdentity,
      options: StudioRuntimeOptions,
    ) => {
      if (identity.family !== 'character') throw new TypeError('Character runtime requires character identity');
      return characterRuntime(identity, options, (sample) => { applySolidCharacterMotion(rig, sample); });
    },
  }),
  Object.freeze({
    id: 'building',
    label: 'Building',
    description: 'Cottages, townhouses, apartments, and towers',
    defaultSeed: 4104,
    initialYaw: 0,
    initialPitch: 0,
    solidFrameScale: 0.72,
    defaultFinish: 'matte',
    rasterViewTitle: 'Front elevation',
    rasterAriaLabel: 'Front elevation 2D building drawing',
    workspaceNote: 'Open the door, reshape the architecture, then inspect every angle.',
    playback: false,
    livelyGaze: false,
    dynamicControls: Object.freeze([
      Object.freeze({
        id: 'door', label: 'Door', kind: 'interaction', interactionId: 'door', options: binaryChoices,
      }),
    ]),
    defaultDynamicState: Object.freeze({ door: 'closed' }),
    authoring: BUILDING_AUTHORING_SCHEMA,
    defaultCustomization: createDefaultAssetAuthoringValues(BUILDING_AUTHORING_SCHEMA),
    createProjection: buildingProjection,
    createRasterRuntime: staticRasterRuntime,
    createSolidRuntime: staticSolidRuntime,
  }),
  Object.freeze({
    id: 'vehicle',
    label: 'Vehicle',
    description: 'City cars, coupés, saloons, vans, and pickups',
    defaultSeed: 5101,
    initialYaw: 0,
    initialPitch: 0,
    solidFrameScale: 0.62,
    defaultFinish: 'glossy',
    rasterViewTitle: 'Right side elevation',
    rasterAriaLabel: 'Right-side elevation 2D vehicle drawing',
    workspaceNote: 'Drive it, steer it, open its moving parts, then inspect every angle.',
    playback: true,
    livelyGaze: false,
    dynamicControls: Object.freeze([
      Object.freeze({ id: 'motion', label: 'Motion', kind: 'motion', options: choices(VEHICLE_MOTIONS) }),
      Object.freeze({ id: 'steering', label: 'Steering', kind: 'motion', options: choices(VEHICLE_STEERING_DIRECTIONS) }),
      Object.freeze({ id: 'doorRight', label: 'Right door (2D side)', kind: 'interaction', interactionId: 'door:right', options: binaryChoices }),
      Object.freeze({ id: 'doorLeft', label: 'Left door (far side)', kind: 'interaction', interactionId: 'door:left', options: binaryChoices }),
      Object.freeze({ id: 'hood', label: 'Bonnet', kind: 'interaction', interactionId: 'hood', options: binaryChoices }),
      Object.freeze({ id: 'cargo', label: 'Cargo', kind: 'interaction', interactionId: 'cargo', options: binaryChoices }),
    ]),
    defaultDynamicState: Object.freeze({
      motion: 'parked', steering: 'straight', doorLeft: 'closed', doorRight: 'closed',
      hood: 'closed', cargo: 'closed',
    }),
    authoring: VEHICLE_AUTHORING_SCHEMA,
    defaultCustomization: createDefaultAssetAuthoringValues(VEHICLE_AUTHORING_SCHEMA),
    createProjection: vehicleProjection,
    createRasterRuntime: (rig: SpriteRig, identity: FamilyIdentity) => {
      if (identity.family !== 'vehicle') throw new TypeError('Vehicle runtime requires vehicle identity');
      return vehicleRuntime(identity, (sample) => { applyRasterVehicleMotion(rig, sample); });
    },
    createSolidRuntime: (rig: SolidRig, identity: FamilyIdentity) => {
      if (identity.family !== 'vehicle') throw new TypeError('Vehicle runtime requires vehicle identity');
      return vehicleRuntime(identity, (sample) => { applySolidVehicleMotion(rig, sample); });
    },
  }),
]);

export function studioFamilyById(id: StudioFamilyId): StudioFamilyDefinition {
  const family = STUDIO_FAMILIES.find((candidate) => candidate.id === id);
  if (family === undefined) throw new RangeError(`Unknown studio family: ${id}`);
  return family;
}

export function updateCustomization(
  source: FamilyCustomization,
  parameterId: string,
  value: AssetAuthoringValue,
): FamilyCustomization {
  return Object.freeze({ ...source, [parameterId]: value });
}
