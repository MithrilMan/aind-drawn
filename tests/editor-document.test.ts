import { describe, expect, it } from 'vitest';

import { createObjectBlueprint } from '../experiments/playground/src/catalog.js';
import {
  cloneDocument,
  createInitialDocument,
  createSceneObject,
  moveSceneObjectToLayer,
  nextAvailableOrdinal,
  parseSceneDocument,
} from '../experiments/playground/src/document.js';
import { DocumentHistory } from '../experiments/playground/src/history.js';

describe('playground scene document', () => {
  it('round-trips a complete versioned document', () => {
    const document = createInitialDocument();
    expect(parseSceneDocument(JSON.stringify(document))).toEqual(document);
  });

  it('drops the obsolete editor animation field from legacy documents', () => {
    const legacy = createInitialDocument() as unknown as {
      version: 1;
      name: string;
      objects: Record<string, unknown>[];
    };
    if (legacy.objects[1] !== undefined) legacy.objects[1].animation = 'walk';
    const parsed = parseSceneDocument(JSON.stringify(legacy));
    expect(parsed.objects[1]).not.toHaveProperty('animation');
  });

  it('migrates older building records to seeded feature settings', () => {
    const legacy = createInitialDocument() as unknown as {
      version: 1;
      name: string;
      objects: Record<string, unknown>[];
    };
    delete legacy.objects.find(({ kind }) => kind === 'building')?.building;
    const parsed = parseSceneDocument(JSON.stringify(legacy));
    expect(parsed.objects.find(({ kind }) => kind === 'building')?.building).toEqual({
      roof: null,
      balcony: null,
      chimney: null,
      doorStyle: null,
      doorState: 'closed',
    });
  });

  it('rejects invalid authored building states', () => {
    const document = createInitialDocument();
    const building = document.objects.find(({ kind }) => kind === 'building');
    if (building?.building === null || building?.building === undefined) return;
    (building.building as { doorState: string }).doorState = 'ajar';
    expect(() => parseSceneDocument(JSON.stringify(document))).toThrow(/invalid settings/i);
  });

  it('rejects duplicate object ids', () => {
    const document = createInitialDocument();
    const first = document.objects[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    document.objects.push(structuredClone(first));
    expect(() => parseSceneDocument(JSON.stringify(document))).toThrow(/duplicated/i);
  });

  it('allocates an unused kind-specific ordinal after imported data', () => {
    const objects = [
      createSceneObject('character:human', 10),
      createSceneObject('character:human', 11),
      createSceneObject('building', 12),
    ];
    expect(nextAvailableOrdinal(objects, 'character:human', 10)).toBe(12);
    expect(nextAvailableOrdinal(objects, 'building', 10)).toBe(10);
  });

  it('reorders the canonical back-to-front painter stack', () => {
    const objects = [
      createSceneObject('building', 1),
      createSceneObject('character:human', 2),
      createSceneObject('lantern', 3),
    ];
    expect(moveSceneObjectToLayer(objects, objects[0]?.id ?? '', 99)).toBe(true);
    expect(objects.map(({ kind }) => kind)).toEqual([
      'character:human',
      'lantern',
      'building',
    ]);
    expect(moveSceneObjectToLayer(objects, 'missing', 0)).toBe(false);
  });

  it('keeps undo and redo snapshots isolated from later mutation', () => {
    const history = new DocumentHistory();
    const document = createInitialDocument();
    history.reset(document);
    const first = document.objects[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    first.name = 'Casa modificata';
    history.commit(document);
    const previous = history.undo();
    expect(previous?.objects[0]?.name).not.toBe('Casa modificata');
    previous?.objects.push(createSceneObject('crate', 99));
    expect(history.redo()?.objects).toHaveLength(document.objects.length);
  });

  it('redraws semantic building geometry at requested dimensions', () => {
    const building = createSceneObject('building', 5);
    building.width = 8.25;
    building.height = 3.75;
    const blueprint = createObjectBlueprint(building);
    expect(blueprint.bounds).toMatchObject({ width: 8.25, height: 3.75 });
    expect(blueprint.colliders[0]).toMatchObject({ width: 8.25, height: 3.75 });
    expect(blueprint.layers.map(({ id }) => id)).toEqual([
      'building:chimney',
      'building:shell',
      'building:roof',
      'building:balconies',
      'door',
    ]);
  });

  it('builds multipart plants through the public playground catalog boundary', () => {
    const flower = createSceneObject('plant:flower', 8);
    const blueprint = createObjectBlueprint(flower);
    expect(blueprint.kind).toBe('plant:flower');
    expect(blueprint.layers.map(({ id }) => id)).toEqual([
      'mound',
      'stem',
      'leaves',
      'bloom',
    ]);
    expect(blueprint.layers.every(({ pivot }) => (
      pivot[0] === 0.5 && pivot[1] === 0
    ))).toBe(true);
  });

  it('clones a document without sharing mutable object records', () => {
    const original = createInitialDocument();
    const clone = cloneDocument(original);
    if (clone.objects[0] !== undefined) clone.objects[0].x += 10;
    const clonedBuilding = clone.objects.find(({ kind }) => kind === 'building');
    if (clonedBuilding?.building !== null && clonedBuilding?.building !== undefined) {
      clonedBuilding.building.roof = 'flat';
    }
    expect(clone).not.toEqual(original);
    expect(original.objects.find(({ kind }) => kind === 'building')?.building?.roof).toBe('mansard');
  });
});
