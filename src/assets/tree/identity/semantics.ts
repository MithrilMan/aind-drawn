import type { AssetSemanticManifest, SemanticPartSpec } from '../../../contracts/asset-semantics.js';
import type { TreeIdentityRecipe } from './recipe.js';

export type TreeSemanticPartId = 'trunk' | 'branches' | 'canopy';

const PARTS: readonly SemanticPartSpec[] = Object.freeze([
  Object.freeze({ id: 'trunk', spatial: 'volume' }),
  Object.freeze({ id: 'branches', parentId: 'trunk', spatial: 'volume' }),
  Object.freeze({ id: 'canopy', parentId: 'branches', spatial: 'cluster' }),
]);

export function createTreeSemanticManifest(
  identity: TreeIdentityRecipe,
): AssetSemanticManifest<'tree'> {
  return Object.freeze({
    family: 'tree',
    parts: PARTS,
    socketIds: Object.freeze([
      'base',
      'crown',
      ...identity.branches.map(({ id }) => `${id}:tip`),
    ]),
    colliderIds: Object.freeze(['trunk']),
    interactions: Object.freeze([]),
  });
}

export function treeSemanticPartId(concreteId: string): TreeSemanticPartId {
  if (concreteId === 'trunk') return 'trunk';
  if (concreteId.startsWith('branch:')) return 'branches';
  if (concreteId.startsWith('canopy:')) return 'canopy';
  throw new Error(`Unknown tree semantic owner for ${concreteId}`);
}
