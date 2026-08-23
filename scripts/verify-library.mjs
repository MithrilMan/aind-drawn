import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const entryUrl = new URL('../dist/library/index.js', import.meta.url);
const declarationUrl = new URL('../dist/library/index.d.ts', import.meta.url);
const publicApiSnapshotUrl = new URL('./public-api.snapshot.json', import.meta.url);

await access(entryUrl);
await access(declarationUrl);

const library = await import(entryUrl.href);
const publicApiSnapshot = JSON.parse(await readFile(publicApiSnapshotUrl, 'utf8'));
assert.deepEqual(
  Object.keys(library).sort(),
  publicApiSnapshot,
  'Public API exports changed; review the package surface and update scripts/public-api.snapshot.json intentionally',
);
const requiredExports = [
  'SpriteRig',
  'SolidRig',
  'InkedSolidPass',
  'InkedSolidStrokeRig',
  'SolidCharacterAnimator',
  'createCharacterBlueprint',
  'createCharacterIdentity',
  'createCharacterRecipe',
  'createRasterCharacterBlueprint',
  'createBuildingIdentity',
  'createRasterBuildingBlueprint',
  'createRasterBuildingRecipe',
  'createSolidBuildingBlueprint',
  'createSolidBuildingRecipe',
  'validateAssetBlueprintParity',
  'validateAssetSemanticManifest',
  'createVehicleIdentity',
  'createRasterVehicleBlueprint',
  'createRasterVehicleRecipe',
  'createSolidVehicleBlueprint',
  'createSolidVehicleInkStrokes',
  'VehicleAnimator',
  'createSolidFaceBlueprint',
  'createSolidFaceRecipe',
  'createSolidCharacterBlueprint',
  'createSolidCharacterFaceBlueprint',
  'createInkedSolidBlueprint',
  'inkedSolidMediumDefaults',
  'createSolidCharacterInkStrokes',
  'createSolidBuildingInkStrokes',
  'decodeCharacterIdentity',
  'decodeBuildingIdentity',
  'decodeVehicleIdentity',
  'encodeAssetIdentity',
  'validateRasterAssetBlueprint',
  'validateSolidAssetBlueprint',
];

for (const exportName of requiredExports) {
  assert.equal(typeof library[exportName], 'function', `Missing public export: ${exportName}`);
}

function assertNoObsoleteEnvelopeFields(value, label) {
  assert.equal('version' in value, false, `${label} must not expose version`);
  assert.equal('kind' in value, false, `${label} must not expose kind`);
  assert.equal('id' in value, false, `${label} must not expose id`);
}

const firstCat = library.createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
const secondCat = library.createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
assert.deepEqual(firstCat, secondCat, 'Compiled recipes must remain deterministic');
assert.ok(Object.isFrozen(firstCat), 'Compiled recipes must remain immutable');
assert.deepEqual(
  {
    schemaVersion: firstCat.schemaVersion,
    family: firstCat.family,
    representation: firstCat.representation,
  },
  { schemaVersion: 1, family: 'character', representation: 'raster' },
  'Compiled recipes must expose the canonical envelope',
);
assertNoObsoleteEnvelopeFields(firstCat, 'Compiled character recipe');

const cat = library.createCharacterBlueprint(firstCat);
assert.deepEqual(
  {
    blueprintVersion: cat.blueprintVersion,
    family: cat.family,
    representation: cat.representation,
    assetId: cat.assetId,
  },
  { blueprintVersion: 1, family: 'character', representation: 'raster', assetId: 'character:913' },
  'Compiled blueprints must expose the canonical envelope',
);
assertNoObsoleteEnvelopeFields(cat, 'Compiled character blueprint');
assert.ok(cat.layers.some(({ id }) => id === 'muzzle'), 'Compiled cat is missing its muzzle');
assert.ok(cat.layers.some(({ id }) => id === 'tail'), 'Compiled cat is missing its tail');

const buildingIdentity = library.createBuildingIdentity(612, {
  archetype: 'townhouse',
  roof: 'mansard',
  balcony: true,
  chimney: true,
  doorStyle: 'arched',
});
assert.deepEqual(
  {
    schemaVersion: buildingIdentity.schemaVersion,
    family: buildingIdentity.family,
    seed: buildingIdentity.seed,
  },
  { schemaVersion: 1, family: 'building', seed: 612 },
  'Compiled identities must expose the canonical envelope',
);
assertNoObsoleteEnvelopeFields(buildingIdentity, 'Compiled building identity');
const encodedBuildingIdentity = library.encodeAssetIdentity(buildingIdentity);
const decodedBuildingIdentity = library.decodeBuildingIdentity(
  JSON.parse(JSON.stringify(encodedBuildingIdentity)),
);
assert.deepEqual(
  decodedBuildingIdentity,
  buildingIdentity,
  'Compiled identity codecs must preserve resolved semantic data',
);
assert.notEqual(
  decodedBuildingIdentity,
  buildingIdentity,
  'Compiled identity decoders must return detached values',
);
assert.ok(Object.isFrozen(decodedBuildingIdentity.palette), 'Decoded identities must be deeply immutable');
assert.throws(
  () => library.decodeBuildingIdentity({ ...encodedBuildingIdentity, schemaVersion: 2 }),
  (error) => error?.name === 'AssetValidationError'
    && error.issues?.some(({ path, code }) => path[0] === 'schemaVersion' && code === 'value.literal'),
  'Compiled decoders must reject unsupported schema versions with structured issues',
);
const building = library.createRasterBuildingBlueprint(
  library.createRasterBuildingRecipe(buildingIdentity),
);
assert.equal(
  library.validateRasterAssetBlueprint(building),
  building,
  'Compiled raster validators must preserve valid blueprints by reference',
);
assert.ok(building.layers.some(({ id }) => id === 'door'), 'Compiled building is missing its door layer');
assert.equal(building.manifest.interactions[0]?.id, 'door', 'Compiled building is missing its door interaction');
assert.ok(
  building.sockets.some(({ id, bone }) => id === 'door:entry' && bone === 'root'),
  'Compiled building is missing its attached entry socket',
);
const solidBuilding = library.createSolidBuildingBlueprint(buildingIdentity);
assert.equal(
  library.validateSolidAssetBlueprint(solidBuilding),
  solidBuilding,
  'Compiled solid validators must preserve valid blueprints by reference',
);
assert.equal(building.assetId, solidBuilding.assetId, 'Building projections must share an asset ID');
assert.equal(solidBuilding.manifest.interactions[0]?.id, 'door', 'Compiled solid building is missing its door interaction');
assert.equal(building.manifest, solidBuilding.manifest, 'Building projections must share one manifest');
library.validateAssetBlueprintParity(building, solidBuilding);
assert.ok(solidBuilding.parts.some(({ id }) => id === 'building:roof'), 'Compiled solid building is missing its roof volume');
assert.ok(
  solidBuilding.nodes.every((node) => node.restPose?.rotation?.length === 4 && !('position' in node)),
  'Compiled solid nodes must expose complete rest poses without obsolete position fields',
);
const solidBuildingRig = new library.SolidRig(solidBuilding);
const closedDoorHandle = solidBuildingRig.getSocketWorldPose('door:handle');
solidBuildingRig.setInteractionState('door', 'open');
const openDoorHandle = solidBuildingRig.getSocketWorldPose('door:handle');
assert.notDeepEqual(openDoorHandle, closedDoorHandle, 'Compiled attached sockets must follow interaction nodes');
assert.deepEqual(
  JSON.parse(JSON.stringify(openDoorHandle)),
  openDoorHandle,
  'Compiled world-pose queries must return serialisable values',
);
solidBuildingRig.dispose();
const inkedBuilding = library.createInkedSolidBlueprint(solidBuilding, {
  medium: 'graphite',
  strokes: library.createSolidBuildingInkStrokes(solidBuilding),
});
assert.equal(inkedBuilding.solid, solidBuilding, 'Inked solids must retain the source solid blueprint');
assert.equal(inkedBuilding.representation, 'inked-solid');
assert.equal(inkedBuilding.assetId, solidBuilding.assetId, 'Inked solids must retain the source asset ID');
assert.ok(inkedBuilding.strokes.length > 0, 'Compiled inked building is missing semantic strokes');

const vehicleIdentity = library.createVehicleIdentity(5101, {
  archetype: 'pickup',
  roofRack: true,
});
const vehicle = library.createRasterVehicleBlueprint(
  library.createRasterVehicleRecipe(vehicleIdentity),
);
const solidVehicle = library.createSolidVehicleBlueprint(vehicleIdentity);
assert.equal(vehicle.assetId, solidVehicle.assetId, 'Vehicle projections must share an asset ID');
assert.deepEqual(
  vehicle.manifest.interactions.map(({ id }) => id),
  solidVehicle.manifest.interactions.map(({ id }) => id),
  'Vehicle projections must retain the same interactions',
);
assert.equal(vehicle.manifest, solidVehicle.manifest, 'Vehicle projections must share one manifest');
library.validateAssetBlueprintParity(vehicle, solidVehicle);
assert.ok(
  solidVehicle.parts.some(({ id }) => id === 'wheel:front:left:tyre'),
  'Compiled solid vehicle is missing its front tyre volume',
);

console.log(`Compiled library verified: ${Object.keys(library).length} public exports`);
