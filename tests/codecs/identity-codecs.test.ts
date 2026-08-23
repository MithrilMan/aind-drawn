import { describe, expect, it } from 'vitest';

import {
  AssetValidationError,
  createBuildingIdentity,
  createCharacterIdentity,
  createVehicleIdentity,
  decodeBuildingIdentity,
  decodeCharacterIdentity,
  decodeVehicleIdentity,
  encodeAssetIdentity,
} from '../../src/index.js';

function json(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function validationError(run: () => unknown): AssetValidationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AssetValidationError);
    return error as AssetValidationError;
  }
  throw new Error('Expected asset validation to fail');
}

describe('identity codecs', () => {
  it('round-trips every current family into detached deeply immutable values', () => {
    const character = createCharacterIdentity(4107, {
      species: 'human', eyewearStyle: 'heavy-square', facialHairStyle: 'full-rounded',
    });
    const building = createBuildingIdentity(612, {
      archetype: 'townhouse', balcony: true, chimney: true,
    });
    const vehicle = createVehicleIdentity(5101, {
      archetype: 'pickup', roofRack: true, doorCount: 4,
    });
    const decodedCharacter = decodeCharacterIdentity(json(character));
    const decodedBuilding = decodeBuildingIdentity(json(building));
    const decodedVehicle = decodeVehicleIdentity(json(vehicle));

    expect(decodedCharacter).toEqual(character);
    expect(decodedBuilding).toEqual(building);
    expect(decodedVehicle).toEqual(vehicle);
    expect(decodedCharacter).not.toBe(character);
    expect(decodedBuilding).not.toBe(building);
    expect(decodedVehicle).not.toBe(vehicle);
    expect(Object.isFrozen(decodedCharacter.palette.skin)).toBe(true);
    expect(Object.isFrozen(decodedCharacter.accessories)).toBe(true);
    expect(Object.isFrozen(decodedBuilding.balconies)).toBe(true);
    expect(Object.isFrozen(decodedVehicle.doors.sides)).toBe(true);

    const encoded = encodeAssetIdentity(decodedCharacter);
    expect(encoded).toEqual(character);
    expect(encoded).not.toBe(decodedCharacter);
    expect(Object.isFrozen(encoded)).toBe(true);
    expect(Object.isFrozen(encoded.palette)).toBe(true);
  });

  it('decodes representative generated seeds without rerunning a generator', () => {
    for (let seed = 0; seed < 20; seed += 1) {
      const character = createCharacterIdentity(seed);
      const building = createBuildingIdentity(seed);
      const vehicle = createVehicleIdentity(seed);
      expect(decodeCharacterIdentity(json(character))).toEqual(character);
      expect(decodeBuildingIdentity(json(building))).toEqual(building);
      expect(decodeVehicleIdentity(json(vehicle))).toEqual(vehicle);
    }
  });

  it('rejects future, foreign, and obsolete envelopes with stable paths and codes', () => {
    const valid = json(createCharacterIdentity(91)) as Record<string, unknown>;
    const error = validationError(() => decodeCharacterIdentity({
      ...valid,
      schemaVersion: 2,
      family: 'building',
      version: 1,
    }));

    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['schemaVersion'], code: 'value.literal' }),
      expect.objectContaining({ path: ['family'], code: 'value.literal' }),
      expect.objectContaining({ path: ['version'], code: 'object.unknown_key' }),
    ]));
  });

  it('reports multiple character invariants in one error', () => {
    const valid = json(createCharacterIdentity(92)) as Record<string, unknown>;
    const palette = valid.palette as Record<string, unknown>;
    const nose = valid.nose as Record<string, unknown>;
    const error = validationError(() => decodeCharacterIdentity({
      ...valid,
      palette: { ...palette, skin: [255, -1, 400] },
      nose: { ...nose, present: true, style: 'none' },
      surprise: true,
    }));

    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['palette', 'skin', 1], code: 'value.minimum' }),
      expect.objectContaining({ path: ['palette', 'skin', 2], code: 'value.maximum' }),
      expect.objectContaining({ path: ['nose', 'present'], code: 'identity.invariant' }),
      expect.objectContaining({ path: ['surprise'], code: 'object.unknown_key' }),
    ]));
  });

  it('rejects impossible building and vehicle topology', () => {
    const building = json(createBuildingIdentity(93, { balcony: true })) as Record<string, unknown>;
    const balconies = building.balconies as Record<string, unknown>[];
    const buildingError = validationError(() => decodeBuildingIdentity({
      ...building,
      roof: 'dome',
      balconies: [{ ...balconies[0], startColumn: 999, columnSpan: 3 }],
    }));
    expect(buildingError.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'value.enum', 'identity.invariant',
    ]));

    const vehicle = json(createVehicleIdentity(94)) as Record<string, unknown>;
    const cabin = vehicle.cabin as Record<string, unknown>;
    const doors = vehicle.doors as Record<string, unknown>;
    const vehicleError = validationError(() => decodeVehicleIdentity({
      ...vehicle,
      cabin: { ...cabin, startRatio: 0.8, endRatio: 0.2 },
      doors: {
        ...doors,
        sides: ['left'],
        frontStartRatio: 0.7,
        frontEndRatio: 0.5,
        rearEndRatio: 0.9,
      },
    }));
    expect(vehicleError.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['cabin', 'endRatio'], code: 'identity.invariant' }),
      expect.objectContaining({ path: ['doors', 'sides'], code: 'identity.invariant' }),
      expect.objectContaining({ path: ['doors', 'frontEndRatio'], code: 'identity.invariant' }),
      expect.objectContaining({ path: ['doors', 'rearEndRatio'], code: 'identity.invariant' }),
    ]));
  });
});
