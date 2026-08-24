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
  'AssetComposition',
  'SpriteRig',
  'SolidRig',
  'InkedSolidScenePass',
  'InkedSolidStrokeRig',
  'sampleCharacterMotion',
  'createCharacterMotionState',
  'setCharacterMotion',
  'applyRasterCharacterMotion',
  'applySolidCharacterMotion',
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
  'createTreeIdentity',
  'decodeTreeIdentity',
  'createSolidTreeRecipe',
  'createSolidTreeBlueprint',
  'createRasterVehicleBlueprint',
  'createRasterVehicleRecipe',
  'createSolidVehicleBlueprint',
  'createSolidVehicleInkStrokes',
  'sampleVehicleMotion',
  'createVehicleMotionState',
  'setVehicleMotion',
  'applyRasterVehicleMotion',
  'applySolidVehicleMotion',
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
  'createAssetComposition',
  'createAssetInstanceId',
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
let characterMotionState = library.createCharacterMotionState({ autoBlink: false, autoGaze: false });
characterMotionState = library.setCharacterMotion(characterMotionState, {
  pose: 'run', speed: 0.8, expression: 'happy',
}, 0);
const characterMotionSample = library.sampleCharacterMotion(
  firstCat.identity,
  characterMotionState,
  0.6,
);
assert.deepEqual(
  characterMotionSample,
  library.sampleCharacterMotion(firstCat.identity, characterMotionState, 0.6),
  'Compiled character motion sampling must remain deterministic',
);
assert.deepEqual(
  JSON.parse(JSON.stringify(characterMotionSample)),
  characterMotionSample,
  'Compiled character motion samples must remain serialisable',
);
const compiledCharacterRig = new library.SolidRig(
  library.createSolidCharacterBlueprint(firstCat.identity),
);
library.applySolidCharacterMotion(compiledCharacterRig, characterMotionSample);
const firstArmPose = compiledCharacterRig.getNode('arm:left').quaternion.toArray();
library.applySolidCharacterMotion(compiledCharacterRig, characterMotionSample);
assert.deepEqual(
  compiledCharacterRig.getNode('arm:left').quaternion.toArray(),
  firstArmPose,
  'Compiled character motion application must not accumulate transforms',
);
compiledCharacterRig.dispose();

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
const firstRuntimeBuilding = new library.SolidRig(solidBuilding, {
  instanceId: 'compiled/building/first',
});
const secondRuntimeBuilding = new library.SolidRig(solidBuilding, {
  instanceId: 'compiled/building/second',
});
firstRuntimeBuilding.setInteractionState('door', 'open');
firstRuntimeBuilding.setPlaybackTime(1.5);
secondRuntimeBuilding.setPlaybackTime(4.25);
assert.equal(firstRuntimeBuilding.blueprint, secondRuntimeBuilding.blueprint);
assert.equal(firstRuntimeBuilding.getInstanceState().interactionStates.door, 'open');
assert.equal(secondRuntimeBuilding.getInstanceState().interactionStates.door, 'closed');
const compiledComposition = library.createAssetComposition();
compiledComposition.insert(firstRuntimeBuilding, { ownership: 'owned' });
compiledComposition.insert(secondRuntimeBuilding, { ownership: 'owned' });
compiledComposition.attach('compiled/building/second', 'compiled/building/first', 'door:handle');
compiledComposition.update();
assert.deepEqual(
  secondRuntimeBuilding.getInstanceState().transform,
  firstRuntimeBuilding.getSocketWorldPose('door:handle'),
  'Compiled composition attachments must follow public socket poses',
);
assert.deepEqual(
  compiledComposition.snapshot().map(({ id, playbackTime }) => ({ id, playbackTime })),
  [
    { id: 'compiled/building/first', playbackTime: 1.5 },
    { id: 'compiled/building/second', playbackTime: 4.25 },
  ],
  'Compiled composition snapshots must preserve independent instance state',
);
compiledComposition.dispose();
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
const vehicleMotionState = library.createVehicleMotionState({
  travelDistance: 2.5, speed: 0.7, steering: -0.4,
});
const vehicleMotionSample = library.sampleVehicleMotion(vehicleIdentity, vehicleMotionState, 1.2);
assert.equal(
  vehicleMotionSample.wheelRotation,
  -vehicleMotionState.travelDistance / vehicleIdentity.wheels.radius,
  'Compiled vehicle sampling must derive wheel angle from shared identity radius',
);
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

const treeIdentity = library.createTreeIdentity(6102, {
  archetype: 'windswept',
  season: 'autumn',
});
const decodedTreeIdentity = library.decodeTreeIdentity(
  JSON.parse(JSON.stringify(library.encodeAssetIdentity(treeIdentity))),
);
assert.deepEqual(
  decodedTreeIdentity,
  treeIdentity,
  'Compiled tree identity codec must preserve resolved branching topology',
);
const solidTree = library.createSolidTreeBlueprint(treeIdentity);
assert.equal(
  library.validateSolidAssetBlueprint(solidTree),
  solidTree,
  'Compiled tree solid blueprint must pass pure validation',
);
assert.equal(solidTree.manifest.family, 'tree');
assert.ok(
  solidTree.sockets.some(({ id }) => id.endsWith(':tip')),
  'Compiled tree is missing branch-tip sockets',
);

console.log(`Compiled library verified: ${Object.keys(library).length} public exports`);
