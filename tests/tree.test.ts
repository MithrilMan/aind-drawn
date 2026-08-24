import { describe, expect, it } from 'vitest';

import {
  TREE_ARCHETYPES,
  createSolidTreeBlueprint,
  createSolidTreeRecipe,
  createTreeIdentity,
  decodeTreeIdentity,
  encodeAssetIdentity,
  validateSolidAssetBlueprint,
} from '../src/index.js';

describe('tree family', () => {
  it('owns deterministic representation-neutral branch topology', () => {
    const first = createTreeIdentity(9104, { archetype: 'windswept', season: 'autumn' });
    const second = createTreeIdentity(9104, { archetype: 'windswept', season: 'autumn' });

    expect(first).toEqual(second);
    expect(Object.isFrozen(first.branches)).toBe(true);
    expect(first.branches.length).toBeGreaterThanOrEqual(5);
    for (const [index, branch] of first.branches.entries()) {
      if (branch.parentId === 'trunk') continue;
      const parentIndex = first.branches.findIndex(({ id }) => id === branch.parentId);
      expect(parentIndex).toBeGreaterThanOrEqual(0);
      expect(parentIndex).toBeLessThan(index);
    }
    expect(first.canopy.map(({ ownerBranchId }) => ownerBranchId))
      .toEqual(first.branches.map(({ id }) => id));
  });

  it('emits valid faceted bark, organic canopy, sockets, and a trunk collider', () => {
    for (const archetype of TREE_ARCHETYPES) {
      for (let seed = 0; seed < 24; seed += 1) {
        const identity = createTreeIdentity(seed, { archetype });
        const recipe = createSolidTreeRecipe(identity);
        const blueprint = createSolidTreeBlueprint(recipe);
        expect(validateSolidAssetBlueprint(blueprint)).toBe(blueprint);
        expect(blueprint.assetId).toBe(`tree:${seed}`);
        expect(blueprint.parts.some(({ id }) => id === 'trunk')).toBe(true);
        expect(blueprint.parts.filter(({ semanticPartId }) => semanticPartId === 'branches'))
          .toHaveLength(identity.branches.length);
        expect(blueprint.parts.filter(({ semanticPartId }) => semanticPartId === 'canopy'))
          .toHaveLength(identity.canopy.length);
        expect(blueprint.sockets.filter(({ id }) => id.endsWith(':tip')))
          .toHaveLength(identity.branches.length);
        expect(blueprint.colliders).toEqual(expect.arrayContaining([
          expect.objectContaining({ id: 'trunk', shape: 'capsule', node: 'root' }),
        ]));
      }
    }
  });

  it('rejects impossible explicit height instead of producing broken geometry', () => {
    expect(() => createTreeIdentity(91, { height: 0 })).toThrow(/height/i);
    expect(() => createTreeIdentity(91, { height: Number.NaN })).toThrow(/height/i);
  });

  it('decodes persisted tree identity without regenerating topology', () => {
    const identity = createTreeIdentity(9188, { archetype: 'pine', season: 'autumn' });
    const decoded = decodeTreeIdentity(JSON.parse(JSON.stringify(encodeAssetIdentity(identity))));

    expect(decoded).toEqual(identity);
    expect(decoded).not.toBe(identity);
    expect(Object.isFrozen(decoded.canopy)).toBe(true);
    expect(() => decodeTreeIdentity({
      ...identity,
      canopy: [{ ...identity.canopy[0], ownerBranchId: 'branch:missing' }],
    })).toThrow(/validation/i);
  });
});
