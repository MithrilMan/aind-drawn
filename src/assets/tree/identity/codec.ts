import { AssetValidationCollector } from '../../../validation/value-validator.js';
import {
  colorRecord,
  finishIdentity,
  validateIdentityRoot,
  validatePositiveFields,
  validateUnitFields,
} from '../../../codecs/identity-validation.js';
import {
  TREE_ARCHETYPES,
  TREE_SEASONS,
  type TreeIdentityRecipe,
} from './recipe.js';

/** Decodes an untrusted JSON value into a detached, deeply immutable tree identity. */
export function decodeTreeIdentity(input: unknown): TreeIdentityRecipe {
  const collector = new AssetValidationCollector();
  const root = validateIdentityRoot(input, 'tree', [
    'archetype', 'season', 'height', 'trunk', 'branches', 'canopy', 'palette',
  ], collector);
  collector.oneOf(root.archetype, ['archetype'], TREE_ARCHETYPES);
  collector.oneOf(root.season, ['season'], TREE_SEASONS);
  collector.number(root.height, ['height'], { exclusiveMinimum: 0 });

  const trunk = collector.object(root.trunk, ['trunk'], [
    'heightRatio', 'baseRadiusRatio', 'topRadiusRatio',
  ]);
  validateUnitFields(trunk, ['trunk'], [
    'heightRatio', 'baseRadiusRatio', 'topRadiusRatio',
  ], collector);
  validatePositiveFields(trunk, ['trunk'], [
    'heightRatio', 'baseRadiusRatio', 'topRadiusRatio',
  ], collector);
  if (
    typeof trunk.topRadiusRatio === 'number'
    && typeof trunk.baseRadiusRatio === 'number'
    && trunk.topRadiusRatio >= trunk.baseRadiusRatio
  ) {
    collector.issue(
      ['trunk', 'topRadiusRatio'],
      'identity.invariant',
      'Tree trunk top radius must be narrower than its base',
    );
  }

  const branches = collector.array(root.branches, ['branches']);
  const branchIds = new Set<string>();
  branches.forEach((value, index) => {
    const path = ['branches', index] as const;
    const branch = collector.object(value, path, [
      'id', 'parentId', 'attachAlong', 'azimuth', 'inclination', 'lengthRatio', 'radiusRatio',
    ]);
    collector.string(branch.id, [...path, 'id']);
    collector.string(branch.parentId, [...path, 'parentId']);
    validateUnitFields(branch, path, ['attachAlong', 'lengthRatio', 'radiusRatio'], collector);
    validatePositiveFields(branch, path, ['lengthRatio', 'radiusRatio'], collector);
    collector.number(branch.azimuth, [...path, 'azimuth']);
    collector.number(branch.inclination, [...path, 'inclination'], {
      exclusiveMinimum: 0,
      maximum: Math.PI,
    });
    if (typeof branch.id === 'string') {
      if (branchIds.has(branch.id)) {
        collector.issue([...path, 'id'], 'id.duplicate', `Duplicate branch id ${branch.id}`);
      }
      branchIds.add(branch.id);
    }
    if (
      typeof branch.parentId === 'string'
      && branch.parentId !== 'trunk'
      && !branchIds.has(branch.parentId)
    ) {
      collector.issue(
        [...path, 'parentId'],
        'identity.invariant',
        'Tree branch parent must precede its child',
      );
    }
  });

  const canopy = collector.array(root.canopy, ['canopy']);
  const canopyIds = new Set<string>();
  canopy.forEach((value, index) => {
    const path = ['canopy', index] as const;
    const cluster = collector.object(value, path, [
      'id', 'ownerBranchId', 'along', 'radiiRatio',
      'lobeAmplitude', 'lobeCount', 'lobePhase',
    ]);
    collector.string(cluster.id, [...path, 'id']);
    collector.string(cluster.ownerBranchId, [...path, 'ownerBranchId']);
    collector.number(cluster.along, [...path, 'along'], { minimum: 0, maximum: 1 });
    const radii = collector.array(cluster.radiiRatio, [...path, 'radiiRatio']);
    if (radii.length !== 3) {
      collector.issue([...path, 'radiiRatio'], 'array.length', 'Tree canopy radii must have three values');
    }
    radii.forEach((radius, radiusIndex) => {
      collector.number(
        radius,
        [...path, 'radiiRatio', radiusIndex],
        { exclusiveMinimum: 0, maximum: 1 },
      );
    });
    collector.number(cluster.lobeAmplitude, [...path, 'lobeAmplitude'], {
      minimum: 0,
      maximum: 0.5,
    });
    collector.number(cluster.lobeCount, [...path, 'lobeCount'], {
      integer: true,
      minimum: 1,
    });
    collector.number(cluster.lobePhase, [...path, 'lobePhase']);
    if (typeof cluster.id === 'string') {
      if (canopyIds.has(cluster.id)) {
        collector.issue([...path, 'id'], 'id.duplicate', `Duplicate canopy id ${cluster.id}`);
      }
      canopyIds.add(cluster.id);
    }
    if (
      typeof cluster.ownerBranchId === 'string'
      && !branchIds.has(cluster.ownerBranchId)
    ) {
      collector.issue(
        [...path, 'ownerBranchId'],
        'reference.missing',
        `Unknown canopy owner branch ${cluster.ownerBranchId}`,
      );
    }
  });

  colorRecord(root.palette, ['palette'], ['bark', 'foliage', 'foliageAccent'], collector);
  return finishIdentity(input, collector) as unknown as TreeIdentityRecipe;
}
