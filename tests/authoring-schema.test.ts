import { describe, expect, it } from 'vitest';

import {
  createDefaultAssetAuthoringValues,
  validateAssetFamilyAuthoringSchema,
  type AssetFamilyAuthoringSchema,
} from '../src/index.js';

function characterSchema(): AssetFamilyAuthoringSchema {
  return Object.freeze({
    id: 'character',
    label: 'Character',
    description: 'A procedural character identity.',
    parameters: Object.freeze([
      Object.freeze({
        id: 'hair',
        label: 'Hair',
        kind: 'choice' as const,
        defaultValue: null,
        preview: Object.freeze({ rasterLayerIds: Object.freeze(['hair']) }),
        options: Object.freeze([
          Object.freeze({ value: null, label: 'Generated' }),
          Object.freeze({ value: 'cap', label: 'Cap' }),
        ]),
      }),
      Object.freeze({
        id: 'height',
        label: 'Height',
        kind: 'range' as const,
        defaultValue: 1,
        minimum: 0.5,
        maximum: 2,
        step: 0.1,
      }),
    ]),
  });
}

describe('asset family authoring schema', () => {
  it('accepts declarative controls and semantic preview layers', () => {
    const schema = characterSchema();
    expect(validateAssetFamilyAuthoringSchema(schema)).toBe(schema);
    expect(createDefaultAssetAuthoringValues(schema)).toEqual({ hair: null, height: 1 });
  });

  it('rejects duplicate parameter and choice values', () => {
    const schema = characterSchema();
    const firstParameter = schema.parameters[0];
    if (firstParameter === undefined) throw new Error('Expected a first parameter');
    expect(() => validateAssetFamilyAuthoringSchema({
      ...schema,
      parameters: [firstParameter, firstParameter],
    })).toThrow(/repeats parameter hair/u);

    const first = schema.parameters[0];
    if (first?.kind !== 'choice') throw new Error('Expected a choice parameter');
    const firstOption = first.options[0];
    if (firstOption === undefined) throw new Error('Expected a first choice option');
    expect(() => validateAssetFamilyAuthoringSchema({
      ...schema,
      parameters: [{
        ...first,
        options: [firstOption, firstOption],
      }],
    })).toThrow(/repeats option/u);
  });

  it('rejects invalid numeric ranges', () => {
    const schema = characterSchema();
    expect(() => validateAssetFamilyAuthoringSchema({
      ...schema,
      parameters: [{
        id: 'height', label: 'Height', kind: 'range', defaultValue: 1,
        minimum: 2, maximum: 1, step: 0.1,
      }],
    })).toThrow(/minimum must be below maximum/u);
  });
});
