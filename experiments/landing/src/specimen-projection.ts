import {
  createCharacterIdentity,
  createCharacterMotionState,
  createRasterCharacterBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  createVehicleMotionState,
  sampleCharacterMotion,
  sampleVehicleMotion,
  setCharacterMotion,
  type AssetBlueprint,
  type InkedSolidStrokeDefinition,
  type CharacterMotionSample,
  type VehicleMotionSample,
  type MediumId,
  type SolidAssetBlueprint,
} from '../../../src/index.js';

export type SpecimenFamily = 'character' | 'vehicle';
export type SpecimenMedium = Extract<MediumId, 'graphite' | 'oil'>;

export type SpecimenProjection = Readonly<{
  family: SpecimenFamily;
  medium: SpecimenMedium;
  raster: AssetBlueprint;
  solid: SolidAssetBlueprint;
  strokes: readonly InkedSolidStrokeDefinition[];
}>;

const characterIdentity = createCharacterIdentity(4104, { species: 'human' });
const characterMotion = setCharacterMotion(
  createCharacterMotionState({ autoBlink: true, autoGaze: true }),
  { pose: 'dance', speed: .68, expression: 'happy', facing: 1 },
  0,
);
const characterSolid = createSolidCharacterBlueprint(characterIdentity);
const characterStrokes = createSolidCharacterInkStrokes(characterSolid);
const vehicleIdentity = createVehicleIdentity(8417, {
  archetype: 'coupe',
  doorCount: 2,
  spoiler: true,
});
const vehicleSolid = createSolidVehicleBlueprint(vehicleIdentity);
const vehicleStrokes = createSolidVehicleInkStrokes(vehicleSolid);

export function sampleSpecimenCharacterMotion(time: number): CharacterMotionSample {
  return sampleCharacterMotion(characterIdentity, characterMotion, time);
}

export type VehicleInteractionCue = Readonly<{
  label: string;
  states: Readonly<Record<'door:left' | 'door:right' | 'hood' | 'cargo', 'closed' | 'open'>>;
}>;

const vehicleInteractionOrder = Object.freeze([
  'door:left',
  'hood',
  'door:right',
  'cargo',
] as const);

export function sampleSpecimenVehicleMotion(time: number): VehicleMotionSample {
  return sampleVehicleMotion(vehicleIdentity, createVehicleMotionState({
    travelDistance: time * .74,
    speed: .58,
    steering: Math.sin(time * .63) * .72,
    suspension: .62,
  }), time);
}

export function sampleSpecimenVehicleInteractions(time: number): VehicleInteractionCue {
  const cueIndex = Math.floor(time / 2.7);
  const interaction = vehicleInteractionOrder[
    Math.floor(cueIndex / 2) % vehicleInteractionOrder.length
  ] ?? 'hood';
  const open = cueIndex % 2 === 1;
  return Object.freeze({
    label: open ? `${interaction.toUpperCase()} OPEN` : 'SHOWCASE DRIVE',
    states: Object.freeze({
      'door:left': open && interaction === 'door:left' ? 'open' : 'closed',
      'door:right': open && interaction === 'door:right' ? 'open' : 'closed',
      hood: open && interaction === 'hood' ? 'open' : 'closed',
      cargo: open && interaction === 'cargo' ? 'open' : 'closed',
    }),
  });
}

export function createSpecimenProjection(
  family: SpecimenFamily,
  medium: SpecimenMedium,
): SpecimenProjection {
  if (family === 'character') {
    return Object.freeze({
      family,
      medium,
      raster: createRasterCharacterBlueprint(characterIdentity, { medium }),
      solid: characterSolid,
      strokes: characterStrokes,
    });
  }
  return Object.freeze({
    family,
    medium,
    raster: createRasterVehicleBlueprint(createRasterVehicleRecipe(vehicleIdentity, {
      medium,
      side: 'right',
    })),
    solid: vehicleSolid,
    strokes: vehicleStrokes,
  });
}
