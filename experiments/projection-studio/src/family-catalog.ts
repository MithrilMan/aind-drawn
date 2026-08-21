import {
  BUILDING_AUTHORING_SCHEMA,
  CHARACTER_AUTHORING_SCHEMA,
  CHARACTER_EXPRESSIONS,
  CHARACTER_POSES,
  VEHICLE_AUTHORING_SCHEMA,
  VEHICLE_MOTIONS,
  CharacterAnimator,
  SolidCharacterAnimator,
  SpriteRig,
  SolidRig,
  VehicleAnimator,
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
  type BuildingIdentityOptions,
  type CharacterDentalStyle,
  type CharacterEyeStyle,
  type CharacterHairStyle,
  type CharacterHeadShape,
  type CharacterIdentityOptions,
  type CharacterIdentitySpecies,
  type CharacterExpression,
  type CharacterMotion,
  type CharacterMouthStyle,
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
export type StudioRasterRuntimeFactory = (
  rig: SpriteRig,
  options: StudioRuntimeOptions,
) => StudioRuntimeAdapter;
export type StudioSolidRuntimeFactory = (
  rig: SolidRig,
  options: StudioRuntimeOptions,
) => StudioRuntimeAdapter;

export type FamilyProjection = Readonly<{
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
  const options: CharacterIdentityOptions = {
    species: (optionalString(customization.species) as CharacterIdentitySpecies | undefined) ?? 'human',
    ...(shape === undefined ? {} : { shape }),
    ...(eyeStyle === undefined ? {} : { eyeStyle }),
    ...(hairStyle === undefined ? {} : { hairStyle }),
    ...(mouthStyle === undefined ? {} : { mouthStyle }),
    ...(mouthTeeth === undefined ? {} : { mouthTeeth }),
    ...(mouthTongue === undefined ? {} : { mouthTongue }),
    ...(outfitStyle === undefined ? {} : { outfitStyle }),
  };
  const identity = createCharacterIdentity(seed, options);
  const raster = createRasterCharacterBlueprint(identity, { medium });
  const solid = createSolidCharacterBlueprint(identity, { finish });
  return Object.freeze({
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
  const raster = createRasterVehicleBlueprint(createRasterVehicleRecipe(identity, { medium }));
  const solid = createSolidVehicleBlueprint(identity, { finish });
  return Object.freeze({
    raster,
    solid,
    strokes: createSolidVehicleInkStrokes(solid),
  });
}

type CharacterRuntime = Readonly<{
  readonly currentExpression: CharacterExpression;
  setExpression: (expression: CharacterExpression) => void;
  update: (deltaSeconds: number, motion: CharacterMotion) => void;
}>;

function characterRuntime(animator: CharacterRuntime): StudioRuntimeAdapter {
  return Object.freeze({
    update: ({ deltaSeconds, dynamicState, speed }) => {
      const expression = (dynamicState.expression ?? 'idle') as CharacterExpression;
      if (animator.currentExpression !== expression) animator.setExpression(expression);
      animator.update(deltaSeconds, Object.freeze({
        pose: (dynamicState.pose ?? 'idle') as CharacterPose,
        speed,
        facing: 1 as const,
      }));
    },
  });
}

function vehicleRuntime(animator: VehicleAnimator): StudioRuntimeAdapter {
  return Object.freeze({
    update: ({ deltaSeconds, dynamicState, speed, elapsedSeconds }) => {
      const preset = dynamicState.motion ?? 'parked';
      const steeringChoice = dynamicState.steering ?? 'straight';
      const signedSpeed = preset === 'reverse' ? -speed : preset === 'parked' ? 0 : speed;
      const steering = preset === 'showcase'
        ? Math.sin(elapsedSeconds * 0.8) * 0.72
        : steeringChoice === 'left' ? -0.72 : steeringChoice === 'right' ? 0.72 : 0;
      animator.update(deltaSeconds, Object.freeze({
        travelDistance: elapsedSeconds * signedSpeed * 2.4,
        speed: Math.abs(signedSpeed),
        steering,
        suspension: preset === 'showcase' ? 0.78 : 0.42,
      }));
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
    initialYaw: 28,
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
    createRasterRuntime: (rig: SpriteRig, options: StudioRuntimeOptions) => characterRuntime(
      new CharacterAnimator(rig, { autoGaze: options.autoGaze }),
    ),
    createSolidRuntime: (rig: SolidRig, options: StudioRuntimeOptions) => characterRuntime(
      new SolidCharacterAnimator(rig, { autoGaze: options.autoGaze }),
    ),
  }),
  Object.freeze({
    id: 'building',
    label: 'Building',
    description: 'Cottages, townhouses, apartments, and towers',
    defaultSeed: 4104,
    initialYaw: -24,
    initialPitch: -6,
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
    initialYaw: -32,
    initialPitch: -7,
    solidFrameScale: 0.62,
    defaultFinish: 'glossy',
    rasterViewTitle: 'Side elevation',
    rasterAriaLabel: 'Side elevation 2D vehicle drawing',
    workspaceNote: 'Drive it, steer it, open its moving parts, then inspect every angle.',
    playback: true,
    livelyGaze: false,
    dynamicControls: Object.freeze([
      Object.freeze({ id: 'motion', label: 'Motion', kind: 'motion', options: choices(VEHICLE_MOTIONS) }),
      Object.freeze({ id: 'steering', label: 'Steering', kind: 'motion', options: choices(['left', 'straight', 'right']) }),
      Object.freeze({ id: 'doorLeft', label: 'Left door', kind: 'interaction', interactionId: 'door:left', options: binaryChoices }),
      Object.freeze({ id: 'doorRight', label: 'Right door', kind: 'interaction', interactionId: 'door:right', options: binaryChoices }),
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
    createRasterRuntime: (rig: SpriteRig) => vehicleRuntime(new VehicleAnimator(rig)),
    createSolidRuntime: (rig: SolidRig) => vehicleRuntime(new VehicleAnimator(rig)),
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
