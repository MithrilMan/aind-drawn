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
  'SolidCharacterAnimator',
  'createCharacterBlueprint',
  'createCharacterIdentity',
  'createCharacterRecipe',
  'createRasterCharacterBlueprint',
  'createPropBlueprint',
  'createPropRecipe',
  'createSceneryBlueprint',
  'createSceneryRecipe',
  'createSolidFaceBlueprint',
  'createSolidFaceRecipe',
  'createSolidCharacterBlueprint',
  'createSolidCharacterFaceBlueprint',
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

const buildingRecipe = library.createSceneryRecipe(612, {
  scenery: 'building',
  roof: 'mansard',
  balcony: true,
  chimney: true,
  doorStyle: 'arched',
});
const building = library.createSceneryBlueprint(buildingRecipe);
assert.ok(building.layers.some(({ id }) => id === 'door'), 'Compiled building is missing its door layer');
assert.equal(building.interactions[0]?.id, 'door', 'Compiled building is missing its door interaction');
assert.ok(building.sockets['door:entry'], 'Compiled building is missing its entry socket');

const crateDefinition = library.propDefinition('crate');
assert.equal(crateDefinition.kind, 'crate');
assert.ok(crateDefinition.baseSize.width > 0 && crateDefinition.baseSize.height > 0);

console.log(`Compiled library verified: ${Object.keys(library).length} public exports`);
