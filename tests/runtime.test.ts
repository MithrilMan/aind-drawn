import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  applyRasterCharacterMotion,
  applySolidCharacterMotion,
  createCharacterMotionState,
  sampleCharacterMotion,
  setCharacterMotion,
  SolidMaterialProvider,
  InkedSolidStrokeRig,
  SOLID_FINISH_CATALOG,
  SolidRig,
  SpriteRig,
  createCharacterBlueprint,
  createBuildingIdentity,
  createCharacterRecipe,
  createRasterCharacterBlueprint,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
  createCharacterIdentity,
  createCharacterTearProfile,
  createInkedSolidBlueprint,
  isolateSolidRigParts,
  createSolidGeometry,
  createSolidCharacterInkStrokes,
  createSolidCharacterBlueprint,
  createSolidBuildingBlueprint,
  createSolidVehicleBlueprint,
  createVehicleIdentity,
  characterFlowOf,
  solidFaceMotionOf,
  type AssetBlueprint,
  type CanvasFactory,
  type CharacterIdentityRecipe,
  type CharacterMotion,
  type CharacterMotionState,
} from '../src/index.js';
import { inkedSolidSurfaceFlow } from '../src/projections/inked-solid/runtime/surface-flow.js';

const inertCanvasFactory: CanvasFactory = (width, height) => ({
  canvas: { width, height } as HTMLCanvasElement,
  context: {} as CanvasRenderingContext2D,
});

function applySolidCharacterFrame(
  rig: SolidRig,
  identity: CharacterIdentityRecipe,
  state: CharacterMotionState,
  motion: CharacterMotion,
  time: number,
): CharacterMotionState {
  const next = setCharacterMotion(state, motion, time);
  applySolidCharacterMotion(rig, sampleCharacterMotion(identity, next, time));
  return next;
}

function testBlueprint(): AssetBlueprint {
  const size = Object.freeze({ width: 8, height: 8 });
  const layer = (id: string, order: number) => Object.freeze({
    id,
    semanticPartId: 'art',
    bone: id,
    order,
    depth: 0,
    canvas: size,
    world: Object.freeze({ width: 1, height: 1 }),
    pivot: [0.5, 0.5] as const,
    states: ['idle'] as const,
    draw: (): void => undefined,
  });
  return Object.freeze({
    blueprintVersion: 1,
    family: 'test',
    representation: 'raster',
    assetId: 'test',
    seed: 1,
    medium: 'graphite',
    manifest: Object.freeze({
      family: 'test',
      parts: Object.freeze([Object.freeze({ id: 'art', spatial: 'surface' as const })]),
      socketIds: Object.freeze([]),
      colliderIds: Object.freeze([]),
      interactions: Object.freeze([]),
    }),
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
    bones: Object.freeze(['back', 'front'].map((id) => Object.freeze({
      id,
      restPose: Object.freeze({
        position: Object.freeze({ x: 0, y: 0 }),
        rotation: 0,
      }),
    }))),
    layers: Object.freeze([layer('back', -5), layer('front', 4)]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
}

describe('sprite rig runtime', () => {
  it('keeps every local layer inside its draw-rank block', () => {
    const rig = new SpriteRig(testBlueprint(), {
      boilFrames: 1,
      canvasFactory: inertCanvasFactory,
      drawRank: 7,
    });
    const orders: number[] = [];
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh) orders.push(object.renderOrder);
    });
    expect(orders.sort((left, right) => left - right)).toEqual([6995, 7004]);
    rig.setDrawRank(-2);
    const reranked: number[] = [];
    rig.root.traverse((object) => {
      if (object instanceof THREE.Mesh) reranked.push(object.renderOrder);
    });
    expect(reranked.sort((left, right) => left - right)).toEqual([-2005, -1996]);
    rig.dispose();
  });

  it('applies declarative interaction states to bound layers', () => {
    const size = Object.freeze({ width: 8, height: 8 });
    const blueprint: AssetBlueprint = Object.freeze({
      blueprintVersion: 1,
      family: 'test',
      representation: 'raster',
      assetId: 'interactive-door',
      seed: 4,
      medium: 'graphite',
      manifest: Object.freeze({
        family: 'test',
        parts: Object.freeze([Object.freeze({ id: 'door', spatial: 'articulated' as const })]),
        socketIds: Object.freeze(['entry']),
        colliderIds: Object.freeze(['door:sensor']),
        interactions: Object.freeze([Object.freeze({
          id: 'door', kind: 'portal' as const,
          sensorId: 'door:sensor', activationSocketId: 'entry',
          initialState: 'closed', states: Object.freeze(['closed', 'open']),
        })]),
      }),
      bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
      bones: Object.freeze([Object.freeze({
        id: 'root',
        restPose: Object.freeze({
          position: Object.freeze({ x: 0, y: 0 }), rotation: 0,
        }),
      })]),
      layers: Object.freeze([Object.freeze({
        id: 'door',
        semanticPartId: 'door',
        bone: 'root',
        order: 0,
        depth: 0,
        canvas: size,
        world: Object.freeze({ width: 1, height: 1 }),
        pivot: [0.5, 0] as const,
        states: Object.freeze(['closed', 'open']),
        draw: (): void => undefined,
      })]),
      colliders: Object.freeze([Object.freeze({
        id: 'door:sensor', kind: 'sensor', shape: 'rectangle',
        bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({ x: 0.5, y: 0.5 }), rotation: 0,
        }),
        size: Object.freeze({ width: 1, height: 1 }),
      })]),
      sockets: Object.freeze([Object.freeze({
        id: 'entry', bone: 'root',
        localPose: Object.freeze({
          position: Object.freeze({ x: 0, y: 0 }), rotation: 0,
        }),
      })]),
      interactionBindings: Object.freeze([Object.freeze({
        interactionId: 'door',
        layers: Object.freeze([Object.freeze({
          layerId: 'door',
          stateByInteractionState: Object.freeze({ closed: 'closed', open: 'open' }),
        })]),
      })]),
    });
    const rig = new SpriteRig(blueprint, { boilFrames: 1, canvasFactory: inertCanvasFactory });
    expect(rig.interactionIds).toEqual(['door']);
    expect(rig.getInteractionState('door')).toBe('closed');
    rig.setInteractionState('door', 'open');
    expect(rig.getInteractionState('door')).toBe('open');
    expect(() => { rig.setInteractionState('door', 'missing'); }).toThrow(RangeError);
    rig.dispose();
  });

  it('keeps limbs attached to the character root and animates their bones', () => {
    const size = Object.freeze({ width: 8, height: 8 });
    const limbBlueprint: AssetBlueprint = Object.freeze({
      blueprintVersion: 1,
      family: 'character',
      representation: 'raster',
      assetId: 'moving-character',
      seed: 27,
      medium: 'graphite',
      manifest: Object.freeze({
        family: 'character',
        parts: Object.freeze([Object.freeze({ id: 'limbs', spatial: 'articulated' as const })]),
        socketIds: Object.freeze([]), colliderIds: Object.freeze([]), interactions: Object.freeze([]),
      }),
      bounds: Object.freeze({ x: -0.5, y: 0, width: 1, height: 2 }),
      bones: Object.freeze(['arm:left', 'arm:right', 'leg:left', 'leg:right']
        .map((id, index) => Object.freeze({
          id,
          restPose: Object.freeze({
            position: Object.freeze({
              x: index % 2 === 0 ? -0.2 : 0.2,
              y: index < 2 ? 1.2 : 0.5,
            }),
            rotation: 0,
          }),
        }))),
      layers: Object.freeze(['arm:left', 'arm:right', 'leg:left', 'leg:right'].map((id, index) => Object.freeze({
        id,
        semanticPartId: 'limbs',
        bone: id,
        order: index,
        depth: 0,
        canvas: size,
        world: Object.freeze({ width: 0.2, height: 0.8 }),
        pivot: [0.5, 1] as const,
        states: ['idle'] as const,
        draw: (): void => undefined,
      }))),
      colliders: Object.freeze([]),
      sockets: Object.freeze([]),
      interactionBindings: Object.freeze([]),
    });
    const rig = new SpriteRig(limbBlueprint, { boilFrames: 1, canvasFactory: inertCanvasFactory });
    const character = new THREE.Group();
    character.add(rig.root);
    character.updateMatrixWorld(true);
    const leg = rig.getBone('leg:left');
    expect(leg).not.toBeNull();
    const before = leg?.getWorldPosition(new THREE.Vector3());

    character.position.set(4, 3, 0);
    character.updateMatrixWorld(true);
    const after = leg?.getWorldPosition(new THREE.Vector3());
    expect(after?.x).toBeCloseTo((before?.x ?? 0) + 4);
    expect(after?.y).toBeCloseTo((before?.y ?? 0) + 3);

    const identity = createCharacterIdentity(27);
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, { pose: 'walk', speed: 1 }, 0);
    const gaitSamples: Readonly<{ left: number; right: number }>[] = Array.from(
      { length: 10 },
      (_, index): Readonly<{ left: number; right: number }> => {
        applyRasterCharacterMotion(rig, sampleCharacterMotion(identity, state, (index + 1) * 0.05));
        return {
          left: rig.getBone('leg:left')?.rotation.z ?? 0,
          right: rig.getBone('leg:right')?.rotation.z ?? 0,
        };
      },
    );
    const strongest = gaitSamples.reduce((best, sample) => (
      Math.abs(sample.left) > Math.abs(best.left) ? sample : best
    ));
    expect(Math.abs(strongest.left)).toBeGreaterThan(0.2);
    expect(strongest.right).toBeCloseTo(-strongest.left);
    expect(Math.abs(gaitSamples[0]?.left ?? 0)).toBeLessThan(Math.abs(strongest.left));
    rig.dispose();
  });

  it('anchors limbs at the top edge and preserves tear attachment semantics', () => {
    const identity = createCharacterIdentity(4107);
    const blueprint = createCharacterBlueprint(createCharacterRecipe(4107));
    for (const id of ['arm:left', 'arm:right', 'leg:left', 'leg:right']) {
      expect(blueprint.layers.find((layer) => layer.id === id)?.pivot).toEqual([0.5, 1]);
    }
    const torsoOrder = blueprint.layers.find((layer) => layer.id === 'torso')?.order;
    expect(blueprint.layers.find((layer) => layer.id === 'arm:left')?.order).toBeGreaterThan(torsoOrder ?? 0);
    expect(blueprint.layers.find((layer) => layer.id === 'arm:right')?.order).toBeGreaterThan(torsoOrder ?? 0);

    expect(blueprint.layers.find(({ id }) => id === 'tear:left:stream')?.states)
      .toEqual(['idle', 'crying']);
    const rasterDrop = blueprint.layers.find(({ id }) => id === 'tear:right:drop');
    expect(blueprint.bones.find(({ id }) => id === rasterDrop?.bone)?.parentBone).toBe('head');
    const tearProfile = createCharacterTearProfile(identity);
    const rasterEye = blueprint.layers.find(({ id }) => id === 'eye:left');
    const rasterTear = blueprint.layers.find(({ id }) => id === 'tear:left:stream');
    expect(tearProfile.attachmentClearanceInEyeRadii).toBeGreaterThan(0);
    expect(tearProfile.components.map(({ id }) => id)).toEqual(['stream', 'drop', 'bead']);
    const rasterEyeY = blueprint.bones.find(({ id }) => id === rasterEye?.bone)?.restPose.position.y;
    const rasterTearY = blueprint.bones.find(({ id }) => id === rasterTear?.bone)?.restPose.position.y;
    expect(rasterTearY).toBeLessThan(rasterEyeY ?? 0);
    expect(blueprint.layers.filter((layer) => characterFlowOf(layer) !== undefined)).toHaveLength(6);

    const solid = createSolidCharacterBlueprint(identity);
    const solidEye = solid.parts.find(({ id }) => id === 'eye:left:white');
    const solidTear = solid.parts.find(({ id }) => id === 'tear:left:stream');
    expect(solidTear?.placement.position[1]).toBeLessThan(
      solidEye?.placement.position[1] ?? 0,
    );
    expect(solid.parts.filter((part) => solidFaceMotionOf(part)?.kind === 'flow-effect'))
      .toHaveLength(6);
  });

  it('resolves animated raster sockets through bone, root, and mirrored transforms', () => {
    const size = Object.freeze({ width: 8, height: 8 });
    const blueprint: AssetBlueprint = Object.freeze({
      blueprintVersion: 1,
      family: 'character',
      representation: 'raster',
      assetId: 'character:4210',
      seed: 4210,
      medium: 'graphite',
      manifest: Object.freeze({
        family: 'character',
        parts: Object.freeze([Object.freeze({ id: 'limbs', spatial: 'articulated' as const })]),
        socketIds: Object.freeze(['hand:left']),
        colliderIds: Object.freeze([]), interactions: Object.freeze([]),
      }),
      bounds: Object.freeze({ x: -1, y: 0, width: 2, height: 2 }),
      bones: Object.freeze([Object.freeze({
        id: 'arm:left',
        restPose: Object.freeze({
          position: Object.freeze({ x: -0.3, y: 1.4 }), rotation: 0,
        }),
      })]),
      layers: Object.freeze([Object.freeze({
        id: 'arm:left', semanticPartId: 'limbs', bone: 'arm:left', order: 0, depth: 0,
        canvas: size, world: Object.freeze({ width: 0.2, height: 0.8 }),
        pivot: [0.5, 1] as const, states: Object.freeze(['idle']),
        draw: (): void => undefined,
      })]),
      colliders: Object.freeze([]),
      sockets: Object.freeze([Object.freeze({
        id: 'hand:left', bone: 'arm:left',
        localPose: Object.freeze({
          position: Object.freeze({ x: 0, y: -0.8 }), rotation: 0,
        }),
      })]),
      interactionBindings: Object.freeze([]),
    });
    const rig = new SpriteRig(blueprint, { boilFrames: 1, canvasFactory: inertCanvasFactory });
    const initial = rig.getSocketWorldPose('hand:left');
    const identity = createCharacterIdentity(4210);
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, { pose: 'walk', speed: 1 }, 0);
    applyRasterCharacterMotion(rig, sampleCharacterMotion(identity, state, 0.2));
    const animated = rig.getSocketWorldPose('hand:left');
    expect(initial).not.toBeNull();
    expect(animated).not.toBeNull();
    expect(Math.hypot(
      (animated?.position.x ?? 0) - (initial?.position.x ?? 0),
      (animated?.position.y ?? 0) - (initial?.position.y ?? 0),
    )).toBeGreaterThan(0.05);

    rig.root.position.set(3, 2, 0);
    rig.root.scale.x = -1;
    const mirrored = rig.getSocketWorldPose('hand:left');
    expect(mirrored?.position.x).toBeCloseTo(3 - (animated?.position.x ?? 0));
    expect(mirrored?.position.y).toBeCloseTo(2 + (animated?.position.y ?? 0));
    expect(JSON.parse(JSON.stringify(mirrored))).toEqual(mirrored);
    expect(rig.getSocketWorldPose('missing')).toBeNull();
    rig.dispose();
  });
});

describe('solid rig runtime', () => {
  it('resolves animated hand sockets as renderer-neutral world poses', () => {
    const identity = createCharacterIdentity(4211);
    const rig = new SolidRig(createSolidCharacterBlueprint(identity));
    const initial = rig.getSocketWorldPose('hand:right');
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = setCharacterMotion(state, { pose: 'walk', speed: 1 }, 0);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 0.2));
    const animated = rig.getSocketWorldPose('hand:right');
    expect(initial).not.toBeNull();
    expect(animated).not.toBeNull();
    expect(Math.hypot(
      (animated?.position[0] ?? 0) - (initial?.position[0] ?? 0),
      (animated?.position[1] ?? 0) - (initial?.position[1] ?? 0),
      (animated?.position[2] ?? 0) - (initial?.position[2] ?? 0),
    )).toBeGreaterThan(0.05);

    rig.root.position.set(4, -2, 1);
    const translated = rig.getSocketWorldPose('hand:right');
    expect(translated?.position[0]).toBeCloseTo((animated?.position[0] ?? 0) + 4);
    expect(translated?.position[1]).toBeCloseTo((animated?.position[1] ?? 0) - 2);
    expect(translated?.position[2]).toBeCloseTo((animated?.position[2] ?? 0) + 1);
    rig.root.scale.x = -1;
    const mirrored = rig.getSocketWorldPose('hand:right');
    expect(mirrored?.position[0]).toBeCloseTo(4 - (animated?.position[0] ?? 0));
    expect(mirrored?.position[1]).toBeCloseTo((animated?.position[1] ?? 0) - 2);
    expect(mirrored?.position[2]).toBeCloseTo((animated?.position[2] ?? 0) + 1);
    expect(JSON.parse(JSON.stringify(translated))).toEqual(translated);
    rig.dispose();
  });

  it('carries vehicle door sockets and colliders with the hinge idempotently', () => {
    const rig = new SolidRig(createSolidVehicleBlueprint(createVehicleIdentity(4212, {
      archetype: 'sedan',
    })));
    const closedSocket = rig.getSocketWorldPose('door:left:handle');
    const closedCollider = rig.getColliderWorldShape('door:left:leaf');
    rig.setInteractionState('door:left', 'open');
    const openSocket = rig.getSocketWorldPose('door:left:handle');
    const openCollider = rig.getColliderWorldShape('door:left:leaf');
    expect(closedSocket).not.toBeNull();
    expect(closedCollider).not.toBeNull();
    expect(openSocket).not.toEqual(closedSocket);
    expect(openCollider?.worldTransform).not.toEqual(closedCollider?.worldTransform);
    expect(openCollider?.definition).toMatchObject({ node: 'door:left', shape: 'box' });

    rig.setInteractionState('door:left', 'open');
    expect(rig.getSocketWorldPose('door:left:handle')).toEqual(openSocket);
    expect(rig.getColliderWorldShape('door:left:leaf')?.worldTransform)
      .toEqual(openCollider?.worldTransform);
    expect(JSON.parse(JSON.stringify(openCollider))).toEqual(openCollider);
    expect(rig.getColliderWorldShape('missing')).toBeNull();
    rig.dispose();
  });

  it('resolves the complete physical finish catalog through one owned provider', () => {
    expect(SOLID_FINISH_CATALOG.map(({ id }) => id)).toEqual(expect.arrayContaining([
      'glossy', 'rubber', 'ceramic', 'pearl', 'flocked', 'wood', 'wool',
      'resin', 'chrome', 'crazed', 'skin',
    ]));
    const provider = new SolidMaterialProvider();
    const materials = new Map(SOLID_FINISH_CATALOG.map(({ id }, index) => [
      id,
      provider.create({
        id: `finish:${id}`,
        color: [120 + index, 96, 74] as const,
        finish: id,
        drawing: { application: 'pigment', tone: 'hatch' },
      }),
    ]));
    expect(materials.get('pearl')?.iridescenceThicknessMap).not.toBeNull();
    expect(materials.get('pearl')?.iridescence).toBeGreaterThan(0.8);
    expect(materials.get('flocked')?.sheen).toBe(1);
    expect(materials.get('wood')?.normalMap).not.toBeNull();
    expect(materials.get('wood')?.roughnessMap).not.toBeNull();
    expect(materials.get('wool')?.normalMap).not.toBeNull();
    expect(materials.get('resin')?.normalMap).not.toBeNull();
    expect(materials.get('chrome')?.metalness).toBe(1);
    expect(materials.get('crazed')?.normalMap).not.toBeNull();

    const sharedWood = provider.create({
      id: 'finish:wood:second', color: [90, 70, 50], finish: 'wood',
      drawing: { application: 'pigment', tone: 'hatch' },
    });
    expect(sharedWood.normalMap).toBe(materials.get('wood')?.normalMap);
    let materialDisposals = 0;
    let textureDisposals = 0;
    sharedWood.addEventListener('dispose', () => { materialDisposals += 1; });
    sharedWood.normalMap?.addEventListener('dispose', () => { textureDisposals += 1; });
    provider.dispose();
    expect(materialDisposals).toBe(1);
    expect(textureDisposals).toBe(1);
    expect(() => provider.create({
      id: 'late', color: [0, 0, 0], finish: 'matte',
      drawing: { application: 'pigment', tone: 'hatch' },
    })).toThrow(/disposed/i);
  });

  it('scales runtime tessellation without changing authored geometry intent', () => {
    const specification = {
      type: 'superellipsoid' as const,
      radii: [1, 1.2, 0.9] as const,
      exponent: 2.2,
      widthSegments: 48,
      heightSegments: 36,
    };
    const authored = createSolidGeometry(specification);
    const reduced = createSolidGeometry(specification, { detail: 0.35 });
    expect(reduced.getAttribute('position').count)
      .toBeLessThan(authored.getAttribute('position').count);
    expect(reduced.boundingBox?.min.x).toBeCloseTo(authored.boundingBox?.min.x ?? 0, 1);
    expect(reduced.boundingBox?.max.y).toBeCloseTo(authored.boundingBox?.max.y ?? 0, 1);
    authored.dispose();
    reduced.dispose();
  });

  it('keeps one faceted normal per authored polygon instead of exposing fan diagonals', () => {
    const geometry = createSolidGeometry({
      type: 'mesh',
      vertices: [
        [0, 0, 0],
        [2, 0, 0],
        [2, 1, 0.08],
        [0, 1, 0],
      ],
      faces: [[0, 1, 2, 3]],
      smooth: false,
    });
    const normals = geometry.getAttribute('normal');
    expect(normals.count).toBe(6);
    const first = new THREE.Vector3().fromBufferAttribute(normals, 0);
    for (let index = 1; index < normals.count; index += 1) {
      expect(new THREE.Vector3().fromBufferAttribute(normals, index).distanceTo(first))
        .toBeLessThan(1e-6);
    }
    geometry.dispose();
  });

  it('projects one eyebrow expression contract into raster and solid rigs', () => {
    const identity = createCharacterIdentity(4_104);
    expect(identity.brows.present).toBe(true);

    const authoredRaster = createRasterCharacterBlueprint(identity);
    const rasterBlueprint: AssetBlueprint = Object.freeze({
      ...authoredRaster,
      layers: Object.freeze(authoredRaster.layers.map((layer) => Object.freeze({
        ...layer,
        draw: (): void => undefined,
      }))),
    });
    const rasterRig = new SpriteRig(rasterBlueprint, {
      boilFrames: 1,
      canvasFactory: inertCanvasFactory,
    });
    const solidBlueprint = createSolidCharacterBlueprint(identity);
    const solidRig = new SolidRig(solidBlueprint);
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    const solidLeftBrow = solidRig.getPart('brow:left');
    const solidRightBrow = solidRig.getPart('brow:right');
    const solidLeftPupil = solidRig.getPart('eye:left:pupil');
    if (solidLeftBrow === null || solidRightBrow === null || solidLeftPupil === null) {
      throw new Error('Seed 4104 must expose two brows and a left pupil');
    }
    const leftRest = solidLeftBrow.quaternion.clone();
    const rightRest = solidRightBrow.quaternion.clone();
    const pupilRestScaleY = solidLeftPupil.scale.y;
    const relativeRoll = (
      rest: THREE.Quaternion,
      current: THREE.Quaternion,
    ): number => new THREE.Euler().setFromQuaternion(
      rest.clone().invert().multiply(current),
      'XYZ',
    ).z;

    state = setCharacterMotion(state, { expression: 'angry' }, 0);
    const angry = sampleCharacterMotion(identity, state, 0);
    applyRasterCharacterMotion(rasterRig, angry);
    applySolidCharacterMotion(solidRig, angry);
    const rasterAngryLeft = rasterRig.getBone('brow:left')?.rotation.z ?? 0;
    const rasterAngryRight = rasterRig.getBone('brow:right')?.rotation.z ?? 0;
    const solidAngryLeft = relativeRoll(leftRest, solidLeftBrow.quaternion);
    const solidAngryRight = relativeRoll(rightRest, solidRightBrow.quaternion);
    expect(rasterAngryLeft).toBeLessThan(0);
    expect(rasterAngryRight).toBeGreaterThan(0);
    expect(solidAngryLeft).toBeCloseTo(rasterAngryLeft);
    expect(solidAngryRight).toBeCloseTo(rasterAngryRight);
    expect(solidLeftPupil.scale.y / pupilRestScaleY).toBeCloseTo(
      rasterRig.getBone('eye:left')?.scale.y ?? 0,
    );

    solidRig.root.updateMatrixWorld(true);
    const browBounds = new THREE.Box3().setFromObject(solidLeftBrow);
    const pupilBounds = new THREE.Box3().setFromObject(solidLeftPupil);
    expect(browBounds.min.y).toBeGreaterThan(pupilBounds.max.y);

    state = setCharacterMotion(state, { expression: 'sad' }, 0.1);
    const sad = sampleCharacterMotion(identity, state, 0.1);
    applyRasterCharacterMotion(rasterRig, sad);
    applySolidCharacterMotion(solidRig, sad);
    const rasterSadLeft = rasterRig.getBone('brow:left')?.rotation.z ?? 0;
    const rasterSadRight = rasterRig.getBone('brow:right')?.rotation.z ?? 0;
    expect(rasterSadLeft).toBeGreaterThan(0);
    expect(rasterSadRight).toBeLessThan(0);
    expect(relativeRoll(leftRest, solidLeftBrow.quaternion)).toBeCloseTo(rasterSadLeft);
    expect(relativeRoll(rightRest, solidRightBrow.quaternion)).toBeCloseTo(rasterSadRight);

    rasterRig.dispose();
    solidRig.dispose();
  });

  it('selects mark flow from carrier topology instead of screen-space curvature', () => {
    expect(inkedSolidSurfaceFlow({
      type: 'superellipsoid', radii: [1, 1, 1], exponent: 2,
      widthSegments: 16, heightSegments: 12,
    })).toBe('view-oriented');
    expect(inkedSolidSurfaceFlow({
      type: 'mesh', vertices: [], faces: [], smooth: true,
    })).toBe('view-oriented');
    expect(inkedSolidSurfaceFlow({
      type: 'box', size: [1, 1, 1],
    })).toBe('faceted');
    expect(inkedSolidSurfaceFlow({
      type: 'extruded-profile', outline: [[0, 0], [1, 0], [0, 1]],
      depth: 0.2, bevel: 0.03, curveSegments: 3,
    })).toBe('faceted');
    expect(inkedSolidSurfaceFlow({
      type: 'mesh', vertices: [], faces: [], smooth: false,
    })).toBe('faceted');
  });

  it('parents semantic ink strokes to their owning animated solid parts', () => {
    const solid = createSolidCharacterBlueprint(createCharacterIdentity(818, {
      hairStyle: 'cap',
    }));
    const inked = createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(solid),
    });
    const rig = new SolidRig(solid);
    const strokes = new InkedSolidStrokeRig(inked, rig);
    expect(strokes.strokeIds).toContain('hair:strand:0');
    expect(strokes.strokeIds).not.toContain('clothing:collar-seam');
    expect(rig.getPart('head')?.children.some(
      ({ name }) => name === 'stroke:hair:strand:0',
    )).toBe(true);
    expect(rig.getPart('body:torso')?.children.some(
      ({ name }) => name === 'stroke:clothing:collar-seam',
    )).toBe(false);
    strokes.visible = false;
    expect(strokes.visible).toBe(false);
    strokes.dispose();
    expect(rig.getPart('head')?.children.some(({ name }) => name.startsWith('stroke:')))
      .toBe(false);
    rig.dispose();
  });

  it('keeps small humanoid endpoints on the visible accent deposition', () => {
    const human = createSolidCharacterBlueprint(createCharacterIdentity(4_107, {
      species: 'human',
    }));
    const cat = createSolidCharacterBlueprint(createCharacterIdentity(4_107, {
      species: 'cat',
    }));

    for (const id of ['hand:left', 'hand:right', 'foot:left', 'foot:right']) {
      expect(human.parts.find((part) => part.id === id)?.materialId).toBe('accent');
    }
    expect(cat.parts.find(({ id }) => id === 'hand:left')?.materialId).toBe('skin');
  });

  it('applies representation-neutral interaction states to solid nodes', () => {
    const blueprint = createSolidBuildingBlueprint(createBuildingIdentity(812, {
      archetype: 'townhouse', width: 5.6, height: 7.2,
    }));
    const rig = new SolidRig(blueprint);
    const door = rig.getNode('door');
    expect(rig.interactionIds).toEqual(['door']);
    expect(rig.getInteractionState('door')).toBe('closed');
    expect(door?.rotation.y).toBeCloseTo(0);
    rig.setInteractionState('door', 'open');
    expect(rig.getInteractionState('door')).toBe('open');
    expect(Math.abs(door?.rotation.y ?? 0)).toBeGreaterThan(1);
    expect(() => { rig.setInteractionState('door', 'missing'); }).toThrow(RangeError);
    rig.dispose();
  });

  it('isolates semantic solid parts and reports their world-space focus', () => {
    const blueprint = createSolidVehicleBlueprint(createVehicleIdentity(4_115, {
      archetype: 'coupe',
    }));
    const rig = new SolidRig(blueprint);
    const doorPartIds = blueprint.parts
      .filter(({ node }) => node === 'door:left')
      .map(({ id }) => id);
    rig.setWorldPose(Object.freeze({
      position: Object.freeze([8, 1, -3] as const),
      rotation: Object.freeze([0, 0, 0, 1] as const),
    }));
    rig.setInteractionState('door:left', 'open');

    const focus = isolateSolidRigParts(rig, doorPartIds);

    expect(focus.partIds).toEqual(doorPartIds);
    expect(focus.center[0]).toBeGreaterThan(8);
    expect(focus.center[2]).toBeLessThan(-3);
    expect(focus.size.every((extent) => extent > 0)).toBe(true);
    expect(rig.partIds.filter((partId) => rig.getPart(partId)?.visible)).toEqual(doorPartIds);
    expect(() => isolateSolidRigParts(rig, [])).toThrow(RangeError);
    expect(() => isolateSolidRigParts(rig, ['missing'])).toThrow(/Unknown solid focus part/);
    rig.dispose();
  });

  it('builds semantic meshes and animates the rest pose without geometry rebuilds', () => {
    const identity = createCharacterIdentity(404, { species: 'human', shape: 'round' });
    const blueprint = createSolidFaceBlueprint(createSolidFaceRecipe(404, {
      species: 'human', shape: 'round', finish: 'ceramic',
    }));
    const rig = new SolidRig(blueprint);
    expect(rig.nodeIds).toEqual(['head']);
    expect(rig.root.userData.assetId).toBe(blueprint.assetId);
    expect(rig.partIds).toHaveLength(blueprint.parts.length);
    expect(rig.partIds).toEqual(expect.arrayContaining(blueprint.parts.map(({ id }) => id)));
    const pupil = rig.getPart('eye:left:pupil');
    expect(pupil?.userData.assetId).toBe(blueprint.assetId);
    const geometry = pupil?.geometry;
    const before = pupil?.position.clone();
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = applySolidCharacterFrame(rig, identity, state, {
      gaze: { x: 1, y: 0.4, headFollow: 1 },
    }, 0.12);
    expect(pupil?.geometry).toBe(geometry);
    expect(pupil?.position.distanceTo(before ?? new THREE.Vector3())).toBeGreaterThan(0.01);
    state = applySolidCharacterFrame(rig, identity, state, { expression: 'surprised' }, 0.22);
    expect(pupil?.scale.x).toBeGreaterThan(1);
    expect(rig.getPart('mouth')?.visible).toBe(false);
    expect(rig.getPart('mouth:surprised')?.visible).toBe(true);
    state = applySolidCharacterFrame(rig, identity, state, { expression: 'sad' }, 0.32);
    expect(rig.getPart('mouth:surprised')?.visible).toBe(false);
    expect(rig.getPart('mouth:sad')?.visible).toBe(true);
    const tear = rig.getPart('tear:left:drop');
    expect(tear?.visible).toBe(false);
    state = applySolidCharacterFrame(rig, identity, state, { expression: 'crying' }, 0.42);
    const tearPosition = tear?.position.clone();
    expect(tear?.visible).toBe(true);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 0.62));
    expect(tear?.position.distanceTo(tearPosition ?? new THREE.Vector3())).toBeGreaterThan(0);
    applySolidCharacterFrame(rig, identity, state, { expression: 'idle' }, 0.72);
    expect(tear?.visible).toBe(false);
    rig.dispose();
    expect(rig.partIds).toEqual([]);
  });

  it('keeps repeated expression commands idempotent and free of hidden blink state', () => {
    const identity = createCharacterIdentity(4104, { species: 'human', shape: 'round' });
    const rig = new SolidRig(createSolidFaceBlueprint(createSolidFaceRecipe(4104, {
      species: 'human', shape: 'round', finish: 'skin',
    })));
    const pupil = rig.getPart('eye:left:pupil');
    const restScaleY = pupil?.scale.y ?? 0;
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    expect(setCharacterMotion(state, { expression: 'idle' }, 1)).toBe(state);
    state = setCharacterMotion(state, { expression: 'angry' }, 1.1);
    const repeated = setCharacterMotion(state, { expression: 'angry' }, 4.5);
    expect(repeated).toBe(state);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 1.1));
    const angryScale = pupil?.scale.y ?? 0;
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, repeated, 4.5));
    expect(pupil?.scale.y).toBeCloseTo(angryScale, 6);
    expect(angryScale).toBeLessThan(restScaleY);
    rig.dispose();
  });

  it('keeps a complete solid body articulated while the face animator targets the head', () => {
    const identity = createCharacterIdentity(5150, {
      species: 'cat', hairStyle: 'none',
    });
    const blueprint = createSolidCharacterBlueprint(identity);
    const rig = new SolidRig(blueprint);
    const torso = rig.getNode('torso');
    const head = rig.getNode('head');
    const tail = rig.getPart('tail:4');
    expect(torso).not.toBeNull();
    expect(head?.parent).toBe(torso);
    expect(rig.getNode('arm:left')?.parent).toBe(torso);
    expect(tail?.quaternion.equals(new THREE.Quaternion())).toBe(false);

    const headBefore = head?.position.clone();
    let state = createCharacterMotionState({ autoBlink: false, autoGaze: false });
    state = applySolidCharacterFrame(rig, identity, state, {
      gaze: { x: 1, y: 0.3, headFollow: 1 },
    }, 0.12);
    expect(head?.position.distanceTo(headBefore ?? new THREE.Vector3())).toBeGreaterThan(0);
    state = setCharacterMotion(state, { pose: 'walk', speed: 1 }, 0.12);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 0.52));
    expect(Math.abs(rig.getNode('leg:left')?.rotation.x ?? 0)).toBeGreaterThan(0.1);
    expect(rig.getNode('leg:right')?.rotation.x).toBeCloseTo(
      -(rig.getNode('leg:left')?.rotation.x ?? 0),
    );
    const torsoBeforeSleep = torso?.position.y ?? 0;
    state = applySolidCharacterFrame(rig, identity, state, {
      pose: 'sleep', expression: 'angry',
    }, 0.57);
    expect(state.command.expression).toBe('angry');
    expect(rig.getPart('mouth:angry')?.visible).toBe(true);
    const firstSleepStep = torso?.position.y ?? 0;
    expect(Math.abs(firstSleepStep - torsoBeforeSleep)).toBeLessThan(0.08);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 0.97));
    expect(rig.getPart('mouth:sleeping')?.visible).toBe(true);
    expect((torso?.position.y ?? 0) - firstSleepStep).toBeLessThan(-0.08);
    state = setCharacterMotion(state, { pose: 'idle' }, 0.97);
    applySolidCharacterMotion(rig, sampleCharacterMotion(identity, state, 1.37));
    expect(rig.getPart('mouth:angry')?.visible).toBe(true);

    applySolidCharacterFrame(rig, identity, state, { expression: 'crying' }, 1.42);
    rig.root.updateMatrixWorld(true);
    const torsoBounds = new THREE.Box3().setFromObject(rig.getPart('body:torso') ?? rig.root);
    for (const side of ['left', 'right'] as const) {
      const hand = rig.getPart(`hand:${side}`);
      const handCenter = hand?.getWorldPosition(new THREE.Vector3());
      expect(handCenter?.z).toBeGreaterThan(torsoBounds.max.z * 0.72);
    }
    rig.dispose();
  });
});
