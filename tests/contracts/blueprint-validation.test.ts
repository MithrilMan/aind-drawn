import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  AssetValidationError,
  Random,
  SolidRig,
  SpriteRig,
  createBuildingIdentity,
  createCharacterIdentity,
  createRasterBuildingBlueprint,
  createRasterBuildingRecipe,
  createRasterCharacterBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createSolidBuildingBlueprint,
  createSolidCharacterBlueprint,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
  createSolidVehicleBlueprint,
  createVehicleIdentity,
  validateAssetBlueprintParity,
  validateAssetSemanticManifest,
  validateRasterAssetBlueprint,
  validateSolidAssetBlueprint,
  type AssetBlueprint,
  type CanvasFactory,
  type SolidAssetBlueprint,
} from '../../src/index.js';

const inertCanvasFactory: CanvasFactory = (width, height) => ({
  canvas: { width, height } as HTMLCanvasElement,
  context: {} as CanvasRenderingContext2D,
});

function validationError(run: () => unknown): AssetValidationError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(AssetValidationError);
    return error as AssetValidationError;
  }
  throw new Error('Expected asset validation to fail');
}

function invalidRasterBlueprint(): unknown {
  const identity = createBuildingIdentity(4104);
  const source = createRasterBuildingBlueprint(createRasterBuildingRecipe(identity));
  const first = source.layers[0];
  const firstBone = source.bones[0];
  const duplicateId = source.layers[1]?.id ?? first?.id ?? 'duplicate';
  if (first === undefined || firstBone === undefined) throw new Error('Expected a building layer and bone');
  return {
    ...source,
    bones: [{ ...firstBone, parentBone: 'missing-parent' }, ...source.bones.slice(1)],
    colliders: [{ ...source.colliders[0], x: 0 }, ...source.colliders.slice(1)],
    layers: [
      {
        ...first,
        id: duplicateId,
        bone: 'missing-bone',
        canvas: { ...first.canvas, width: 0 },
        capabilities: [
          { id: 'test:duplicate', data: {} },
          { id: 'test:duplicate', data: {} },
        ],
      },
      ...source.layers.slice(1),
    ],
    manifest: {
      ...source.manifest,
      socketIds: [...source.manifest.socketIds, 'missing-socket'],
      colliderIds: [...source.manifest.colliderIds, 'missing-sensor'],
      interactions: [...source.manifest.interactions, {
        id: 'broken', kind: 'portal', sensorId: 'missing-sensor',
        activationSocketId: 'missing-socket', initialState: 'closed', states: ['closed', 'open'],
      }],
    },
    interactionBindings: [...source.interactionBindings, {
      interactionId: 'broken',
      layers: [{
        layerId: 'missing-layer',
        stateByInteractionState: { closed: 'closed' },
      }],
    }],
  };
}

function invalidSolidBlueprint(): unknown {
  const source = createSolidBuildingBlueprint(createBuildingIdentity(5104));
  const firstNode = source.nodes[0];
  const firstPart = source.parts[0];
  const firstMaterial = source.materials[0];
  if (firstNode === undefined || firstPart === undefined || firstMaterial === undefined) {
    throw new Error('Expected a complete solid building');
  }
  return {
    ...source,
    bounds: { minimum: [0, 0, 0], maximum: [0, -1, 0] },
    nodes: [{
      ...firstNode,
      parentNode: firstNode.id,
      restPose: { ...firstNode.restPose, rotation: [0, 0, 0, 0] },
    }, ...source.nodes.slice(1)],
    colliders: [{ ...source.colliders[0], center: [0, 0, 0] }, ...source.colliders.slice(1)],
    materials: [...source.materials, firstMaterial],
    parts: [{
      ...firstPart,
      materialId: 'missing-material',
      geometry: {
        type: 'mesh',
        vertices: [[0, 0, 0], [1, 0, 0], [2, 0, 0]],
        faces: [[0, 1, 2]],
        smooth: false,
      },
      capabilities: [
        { id: 'test:duplicate', data: {} },
        { id: 'test:duplicate', data: {} },
      ],
    }, ...source.parts.slice(1)],
    manifest: {
      ...source.manifest,
      socketIds: [...source.manifest.socketIds, 'missing-socket'],
      colliderIds: [...source.manifest.colliderIds, 'missing-sensor'],
      interactions: [...source.manifest.interactions, {
        id: 'broken', kind: 'portal', sensorId: 'missing-sensor',
        activationSocketId: 'missing-socket', initialState: 'closed', states: ['closed', 'open'],
      }],
    },
    interactionBindings: [...source.interactionBindings, {
      interactionId: 'broken',
      nodes: [{
        nodeId: 'missing-node',
        stateByInteractionState: { closed: {}, extra: {} },
      }],
    }],
  };
}

function failingSpriteBlueprint(): AssetBlueprint<'test'> {
  const size = Object.freeze({ width: 8, height: 8 });
  const layer = (id: string, draw: () => void) => Object.freeze({
    id,
    semanticPartId: 'art',
    bone: 'root',
    order: id === 'first' ? 0 : 1,
    depth: 0,
    canvas: size,
    world: Object.freeze({ width: 1, height: 1 }),
    pivot: [0.5, 0.5] as const,
    states: ['idle'] as const,
    draw,
  });
  return Object.freeze({
    blueprintVersion: 1,
    family: 'test',
    representation: 'raster',
    assetId: 'test:failing-sprite',
    seed: 1,
    medium: 'graphite',
    manifest: Object.freeze({
      family: 'test',
      parts: Object.freeze([Object.freeze({ id: 'art', spatial: 'surface' as const })]),
      socketIds: Object.freeze([]), colliderIds: Object.freeze([]), interactions: Object.freeze([]),
    }),
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
    bones: Object.freeze([Object.freeze({
      id: 'root',
      restPose: Object.freeze({
        position: Object.freeze({ x: 0, y: 0 }), rotation: 0,
      }),
    })]),
    layers: Object.freeze([
      layer('first', () => undefined),
      layer('second', () => { throw new Error('controlled draw failure'); }),
    ]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

describe('blueprint validation', () => {
  it('shares one semantic manifest across raster and solid adapters', () => {
    const projections = [
      (() => {
        const identity = createCharacterIdentity(3101);
        return [
          createRasterCharacterBlueprint(identity),
          createSolidCharacterBlueprint(identity),
        ] as const;
      })(),
      (() => {
        const identity = createBuildingIdentity(3102);
        return [
          createRasterBuildingBlueprint(createRasterBuildingRecipe(identity)),
          createSolidBuildingBlueprint(identity),
        ] as const;
      })(),
      (() => {
        const identity = createVehicleIdentity(3103);
        return [
          createRasterVehicleBlueprint(createRasterVehicleRecipe(identity)),
          createSolidVehicleBlueprint(identity),
        ] as const;
      })(),
    ];

    for (const [raster, solid] of projections) {
      expect(raster.manifest).toBe(solid.manifest);
      expect(validateAssetSemanticManifest(raster.manifest)).toBe(raster.manifest);
      expect(() => { validateAssetBlueprintParity(raster, solid); }).not.toThrow();
      expect('interactions' in raster).toBe(false);
      expect('interactions' in solid).toBe(false);
      const semanticParts = new Set(raster.manifest.parts.map(({ id }) => id));
      expect(raster.layers.every(({ semanticPartId }) => semanticParts.has(semanticPartId))).toBe(true);
      expect(solid.parts.every(({ semanticPartId }) => semanticParts.has(semanticPartId))).toBe(true);
    }
  });

  it('reports semantic part, socket, collider, and binding parity drift generically', () => {
    const identity = createBuildingIdentity(3110, { chimney: false });
    const raster = createRasterBuildingBlueprint(createRasterBuildingRecipe(identity));
    const solid = createSolidBuildingBlueprint(identity);
    const withoutChimney = {
      ...raster,
      manifest: {
        ...raster.manifest,
        parts: raster.manifest.parts.filter(({ id }) => id !== 'chimney'),
      },
      layers: raster.layers.filter(({ semanticPartId }) => semanticPartId !== 'chimney'),
    } as AssetBlueprint<'building'>;
    expect(validationError(() => { validateAssetBlueprintParity(withoutChimney, solid); }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'parity.missing' })]));

    const withoutRoofSocket = {
      ...raster,
      manifest: {
        ...raster.manifest,
        socketIds: raster.manifest.socketIds.filter((id) => id !== 'roof'),
      },
      sockets: raster.sockets.filter(({ id }) => id !== 'roof'),
    } as AssetBlueprint<'building'>;
    expect(validationError(() => { validateAssetBlueprintParity(withoutRoofSocket, solid); }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'parity.missing' })]));

    const withoutDoorLeaf = {
      ...raster,
      manifest: {
        ...raster.manifest,
        colliderIds: raster.manifest.colliderIds.filter((id) => id !== 'door:leaf'),
      },
      colliders: raster.colliders.filter(({ id }) => id !== 'door:leaf'),
    } as AssetBlueprint<'building'>;
    expect(validationError(() => { validateAssetBlueprintParity(withoutDoorLeaf, solid); }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'parity.missing' })]));

    const withoutBinding = {
      ...raster,
      interactionBindings: [],
    } as AssetBlueprint<'building'>;
    expect(validationError(() => { validateAssetBlueprintParity(withoutBinding, solid); }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: 'manifest.binding_missing' })]));
  });

  it('rejects removed blueprint-level interaction definitions', () => {
    const identity = createBuildingIdentity(3111);
    const raster = createRasterBuildingBlueprint(createRasterBuildingRecipe(identity));
    const legacyShape = { ...raster, interactions: raster.manifest.interactions };
    const error = validationError(() => validateRasterAssetBlueprint(legacyShape));
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['interactions'], code: 'object.unknown_key' }),
    ]));
  });

  it('accepts representative and property-generated output from every current factory', () => {
    const random = new Random('blueprint-validator-properties');
    const seeds = [0, 1, 4107, 5101, ...Array.from(
      { length: 20 },
      () => Math.floor(random.next() * 4_294_967_296),
    )];
    for (const seed of seeds) {
      const character = createCharacterIdentity(seed);
      const building = createBuildingIdentity(seed);
      const vehicle = createVehicleIdentity(seed);
      const rasterBlueprints = [
        createRasterCharacterBlueprint(character),
        createRasterBuildingBlueprint(createRasterBuildingRecipe(building)),
        createRasterVehicleBlueprint(createRasterVehicleRecipe(vehicle)),
      ];
      const solidBlueprints = [
        createSolidCharacterBlueprint(character),
        createSolidBuildingBlueprint(building),
        createSolidVehicleBlueprint(vehicle),
      ];
      for (const blueprint of rasterBlueprints) {
        expect(validateRasterAssetBlueprint(blueprint)).toBe(blueprint);
      }
      for (const blueprint of solidBlueprints) {
        expect(validateSolidAssetBlueprint(blueprint)).toBe(blueprint);
      }
    }
    const face = createSolidFaceBlueprint(createSolidFaceRecipe(707));
    expect(validateSolidAssetBlueprint(face)).toBe(face);
  });

  it('reports independent raster contract failures in one error', () => {
    const error = validationError(() => validateRasterAssetBlueprint(invalidRasterBlueprint()));
    expect(error.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'id.duplicate',
      'value.exclusive_minimum',
      'reference.missing',
      'reference.sensor',
      'object.unknown_key',
    ]));
    expect(error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ['interactionBindings', 1, 'layers', 0, 'layerId'] }),
    ]));
  });

  it('reports hierarchy, geometry, material, and interaction failures together', () => {
    const error = validationError(() => validateSolidAssetBlueprint(invalidSolidBlueprint()));
    expect(error.issues.map(({ code }) => code)).toEqual(expect.arrayContaining([
      'bounds.order',
      'hierarchy.cycle',
      'id.duplicate',
      'geometry.degenerate',
      'reference.missing',
      'reference.sensor',
      'quaternion.unit',
      'object.unknown_key',
    ]));
  });

  it('rejects invalid blueprints before raster allocation', () => {
    let canvasAllocations = 0;
    const canvasFactory: CanvasFactory = (width, height) => {
      canvasAllocations += 1;
      return inertCanvasFactory(width, height);
    };
    expect(() => new SpriteRig(
      invalidRasterBlueprint() as AssetBlueprint,
      { canvasFactory },
    )).toThrow(AssetValidationError);
    expect(canvasAllocations).toBe(0);
  });

  it('disposes raster resources when drawing fails after allocation', () => {
    const dispose = vi.spyOn(THREE.Texture.prototype, 'dispose');
    expect(() => new SpriteRig(failingSpriteBlueprint(), {
      boilFrames: 1,
      canvasFactory: inertCanvasFactory,
    })).toThrow('controlled draw failure');
    expect(dispose).toHaveBeenCalledTimes(1);
    dispose.mockRestore();
  });

  it('disposes solid materials when construction fails after allocation', () => {
    const blueprint = createSolidFaceBlueprint(createSolidFaceRecipe(404));
    const dispose = vi.spyOn(THREE.MeshPhysicalMaterial.prototype, 'dispose');
    expect(() => new SolidRig(blueprint, { detail: Number.NaN })).toThrow(RangeError);
    expect(dispose).toHaveBeenCalledTimes(blueprint.materials.length);
    dispose.mockRestore();
  });

  it('rejects invalid solids before material or geometry construction', () => {
    const materialDispose = vi.spyOn(THREE.MeshPhysicalMaterial.prototype, 'dispose');
    expect(() => new SolidRig(
      invalidSolidBlueprint() as SolidAssetBlueprint,
    )).toThrow(AssetValidationError);
    expect(materialDispose).not.toHaveBeenCalled();
    materialDispose.mockRestore();
  });
});
