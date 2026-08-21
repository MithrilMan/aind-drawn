import {
  BUILDING_AUTHORING_SCHEMA,
  CHARACTER_AUTHORING_SCHEMA,
  createDefaultAssetAuthoringValues,
  createBuildingIdentity,
  createCharacterIdentity,
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createRasterCharacterBlueprint,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
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
  type CharacterMouthStyle,
  type CharacterOutfitStyle,
  type DoorStyle,
  type InkedSolidStrokeDefinition,
  type MediumId,
  type RoofStyle,
  type SolidAssetBlueprint,
  type SolidFinishId,
} from '../../../src/index.js';

export type StudioFamilyId = 'character' | 'building';
export type FamilyCustomization = Readonly<Record<string, AssetAuthoringValue>>;

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
  defaultFinish: SolidFinishId;
  authoring: AssetFamilyAuthoringSchema;
  defaultCustomization: FamilyCustomization;
  createProjection: (
    seed: number,
    medium: MediumId,
    customization: FamilyCustomization,
    finish: SolidFinishId,
  ) => FamilyProjection;
}>;

function optionalString(value: AssetAuthoringValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function optionalBoolean(value: AssetAuthoringValue | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

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

export const STUDIO_FAMILIES: readonly StudioFamilyDefinition[] = Object.freeze([
  Object.freeze({
    id: 'character',
    label: 'Character',
    description: 'People, creatures, and expressive faces',
    defaultSeed: 4104,
    initialYaw: 28,
    initialPitch: -4,
    defaultFinish: 'skin',
    authoring: CHARACTER_AUTHORING_SCHEMA,
    defaultCustomization: createDefaultAssetAuthoringValues(CHARACTER_AUTHORING_SCHEMA),
    createProjection: characterProjection,
  }),
  Object.freeze({
    id: 'building',
    label: 'Building',
    description: 'Cottages, townhouses, apartments, and towers',
    defaultSeed: 4104,
    initialYaw: -24,
    initialPitch: -6,
    defaultFinish: 'matte',
    authoring: BUILDING_AUTHORING_SCHEMA,
    defaultCustomization: createDefaultAssetAuthoringValues(BUILDING_AUTHORING_SCHEMA),
    createProjection: buildingProjection,
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
