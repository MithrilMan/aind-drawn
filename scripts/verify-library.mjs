import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';

const entryUrl = new URL('../dist/library/index.js', import.meta.url);
const declarationUrl = new URL('../dist/library/index.d.ts', import.meta.url);

await access(entryUrl);
await access(declarationUrl);

const library = await import(entryUrl.href);
const requiredExports = [
  'SpriteRig',
  'SolidRig',
  'InkedSolidPass',
  'SolidCharacterAnimator',
  'createCharacterBlueprint',
  'createCharacterIdentity',
  'createCharacterRecipe',
  'createRasterCharacterBlueprint',
  'createPropBlueprint',
  'createPropRecipe',
  'createBuildingIdentity',
  'createRasterBuildingBlueprint',
  'createRasterBuildingRecipe',
  'createSolidBuildingBlueprint',
  'createSolidBuildingRecipe',
  'createPlatformBlueprint',
  'createPlatformRecipe',
  'createSolidFaceBlueprint',
  'createSolidFaceRecipe',
  'createSolidCharacterBlueprint',
  'createSolidCharacterFaceBlueprint',
  'createInkedSolidBlueprint',
  'propDefinition',
];

for (const exportName of requiredExports) {
  assert.equal(typeof library[exportName], 'function', `Missing public export: ${exportName}`);
}

const firstCat = library.createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
const secondCat = library.createCharacterRecipe(913, { species: 'cat', medium: 'watercolor' });
assert.deepEqual(firstCat, secondCat, 'Compiled recipes must remain deterministic');
assert.ok(Object.isFrozen(firstCat), 'Compiled recipes must remain immutable');

const cat = library.createCharacterBlueprint(firstCat);
assert.ok(cat.layers.some(({ id }) => id === 'muzzle'), 'Compiled cat is missing its muzzle');
assert.ok(cat.layers.some(({ id }) => id === 'tail'), 'Compiled cat is missing its tail');

const buildingIdentity = library.createBuildingIdentity(612, {
  archetype: 'townhouse',
  roof: 'mansard',
  balcony: true,
  chimney: true,
  doorStyle: 'arched',
});
const building = library.createRasterBuildingBlueprint(
  library.createRasterBuildingRecipe(buildingIdentity),
);
assert.ok(building.layers.some(({ id }) => id === 'door'), 'Compiled building is missing its door layer');
assert.equal(building.interactions[0]?.id, 'door', 'Compiled building is missing its door interaction');
assert.ok(building.sockets['door:entry'], 'Compiled building is missing its entry socket');
const solidBuilding = library.createSolidBuildingBlueprint(buildingIdentity);
assert.equal(solidBuilding.interactions[0]?.id, 'door', 'Compiled solid building is missing its door interaction');
assert.ok(solidBuilding.parts.some(({ id }) => id === 'building:roof'), 'Compiled solid building is missing its roof volume');
const inkedBuilding = library.createInkedSolidBlueprint(solidBuilding);
assert.equal(inkedBuilding.solid, solidBuilding, 'Inked solids must retain the source solid blueprint');
assert.equal(inkedBuilding.representation, 'inked-solid');

const crateDefinition = library.propDefinition('crate');
assert.equal(crateDefinition.kind, 'crate');
assert.ok(crateDefinition.baseSize.width > 0 && crateDefinition.baseSize.height > 0);

console.log(`Compiled library verified: ${Object.keys(library).length} public exports`);
