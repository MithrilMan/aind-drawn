import { AssetValidationCollector } from '../../../validation/value-validator.js';
import {
  colorRecord,
  finishIdentity,
  validateIdentityRoot,
  validatePositiveFields,
} from '../../../codecs/identity-validation.js';
import { BUILDING_ARCHETYPES, type BuildingIdentityRecipe } from './recipe.js';

const ROOF_STYLES = ['flat', 'gable', 'crooked', 'shed', 'mansard'] as const;
const DOOR_STYLES = ['arched', 'panel', 'plank'] as const;
const SIDES = ['left', 'right'] as const;

/** Decodes an untrusted JSON value into a detached, deeply immutable building identity. */
export function decodeBuildingIdentity(input: unknown): BuildingIdentityRecipe {
  const collector = new AssetValidationCollector();
  const root = validateIdentityRoot(input, 'building', [
    'archetype', 'width', 'height', 'depth', 'floors', 'columns', 'roof',
    'door', 'balconies', 'chimney', 'palette',
  ], collector);
  collector.oneOf(root.archetype, ['archetype'], BUILDING_ARCHETYPES);
  validatePositiveFields(root, [], ['width', 'height', 'depth'], collector);
  collector.number(root.floors, ['floors'], { integer: true, minimum: 1 });
  collector.number(root.columns, ['columns'], { integer: true, minimum: 1 });
  collector.oneOf(root.roof, ['roof'], ROOF_STYLES);

  const door = collector.object(root.door, ['door'], [
    'style', 'column', 'hinge', 'openingAngle',
  ]);
  collector.oneOf(door.style, ['door', 'style'], DOOR_STYLES);
  collector.number(door.column, ['door', 'column'], {
    integer: true,
    minimum: 0,
    ...(typeof root.columns === 'number' && Number.isInteger(root.columns)
      ? { maximum: Math.max(0, root.columns - 1) }
      : {}),
  });
  collector.oneOf(door.hinge, ['door', 'hinge'], SIDES);
  collector.number(door.openingAngle, ['door', 'openingAngle'], {
    exclusiveMinimum: 0, maximum: Math.PI,
  });

  const balconies = collector.array(root.balconies, ['balconies']);
  const occupied = new Set<string>();
  balconies.forEach((value, index) => {
    const path = ['balconies', index] as const;
    const balcony = collector.object(value, path, [
      'floorFromGround', 'startColumn', 'columnSpan',
    ]);
    collector.number(balcony.floorFromGround, [...path, 'floorFromGround'], {
      integer: true,
      minimum: 1,
      ...(typeof root.floors === 'number' && Number.isInteger(root.floors)
        ? { maximum: Math.max(1, root.floors - 1) }
        : {}),
    });
    collector.number(balcony.startColumn, [...path, 'startColumn'], {
      integer: true, minimum: 0,
    });
    collector.number(balcony.columnSpan, [...path, 'columnSpan'], {
      integer: true, minimum: 1,
    });
    if (
      typeof balcony.startColumn === 'number'
      && typeof balcony.columnSpan === 'number'
      && typeof root.columns === 'number'
      && balcony.startColumn + balcony.columnSpan > root.columns
    ) {
      collector.issue([...path, 'columnSpan'], 'identity.invariant', 'Balcony exceeds the facade columns');
    }
    if (
      typeof balcony.floorFromGround === 'number'
      && typeof balcony.startColumn === 'number'
      && typeof balcony.columnSpan === 'number'
    ) {
      const key = `${balcony.floorFromGround}:${balcony.startColumn}:${balcony.columnSpan}`;
      if (occupied.has(key)) {
        collector.issue(path, 'id.duplicate', 'Duplicate balcony placement');
      }
      occupied.add(key);
    }
  });

  const chimney = collector.object(root.chimney, ['chimney'], ['present', 'side', 'height']);
  collector.boolean(chimney.present, ['chimney', 'present']);
  collector.oneOf(chimney.side, ['chimney', 'side'], SIDES);
  collector.number(chimney.height, ['chimney', 'height'], { exclusiveMinimum: 0 });

  colorRecord(root.palette, ['palette'], ['wall', 'accent', 'glass', 'interior'], collector);
  return finishIdentity(input, collector) as unknown as BuildingIdentityRecipe;
}
