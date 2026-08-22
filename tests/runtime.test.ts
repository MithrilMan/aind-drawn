import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  CharacterAnimator,
  SolidCharacterAnimator,
  SolidFaceAnimator,
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
  createSolidGeometry,
  createSolidCharacterInkStrokes,
  createSolidCharacterBlueprint,
  createSolidBuildingBlueprint,
  characterFlowOf,
  solidFaceMotionOf,
  type AssetBlueprint,
  type CanvasFactory,
} from '../src/index.js';
import { inkedSolidSurfaceFlow } from '../src/projections/inked-solid/runtime/surface-flow.js';

const inertCanvasFactory: CanvasFactory = (width, height) => ({
  canvas: { width, height } as HTMLCanvasElement,
  context: {} as CanvasRenderingContext2D,
});

function testBlueprint(): AssetBlueprint {
  const size = Object.freeze({ width: 8, height: 8 });
  const layer = (id: string, order: number) => Object.freeze({
    id,
    bone: id,
    order,
    depth: 0,
    canvas: size,
    world: Object.freeze({ width: 1, height: 1 }),
    position: Object.freeze({ x: 0, y: 0 }),
    pivot: [0.5, 0.5] as const,
    states: ['idle'] as const,
    draw: (): void => undefined,
  });
  return Object.freeze({
    id: 'test',
    kind: 'test',
    seed: 1,
    medium: 'graphite',
    bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
    layers: Object.freeze([layer('back', -5), layer('front', 4)]),
    colliders: Object.freeze([]),
    sockets: Object.freeze({}),
    interactions: Object.freeze([]),
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
      id: 'interactive-door',
      kind: 'test',
      seed: 4,
      medium: 'graphite',
      bounds: Object.freeze({ x: 0, y: 0, width: 1, height: 1 }),
      layers: Object.freeze([Object.freeze({
        id: 'door',
        bone: 'root',
        order: 0,
        depth: 0,
        canvas: size,
        world: Object.freeze({ width: 1, height: 1 }),
        position: Object.freeze({ x: 0, y: 0 }),
        pivot: [0.5, 0] as const,
        states: Object.freeze(['closed', 'open']),
        draw: (): void => undefined,
      })]),
      colliders: Object.freeze([Object.freeze({
        id: 'door:sensor', kind: 'sensor', shape: 'rectangle',
        x: 0, y: 0, width: 1, height: 1,
      })]),
      sockets: Object.freeze({ entry: Object.freeze({ x: 0, y: 0 }) }),
      interactions: Object.freeze([Object.freeze({
        id: 'door',
        kind: 'portal',
        sensorColliderId: 'door:sensor',
        activationSocketId: 'entry',
        initialState: 'closed',
        states: Object.freeze(['closed', 'open']),
        layerBindings: Object.freeze([Object.freeze({
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
      id: 'moving-character',
      kind: 'character',
      seed: 27,
      medium: 'graphite',
      bounds: Object.freeze({ x: -0.5, y: 0, width: 1, height: 2 }),
      layers: Object.freeze(['arm:left', 'arm:right', 'leg:left', 'leg:right'].map((id, index) => Object.freeze({
        id,
        bone: id,
        order: index,
        depth: 0,
        canvas: size,
        world: Object.freeze({ width: 0.2, height: 0.8 }),
        position: Object.freeze({ x: index % 2 === 0 ? -0.2 : 0.2, y: index < 2 ? 1.2 : 0.5 }),
        pivot: [0.5, 1] as const,
        states: ['idle'] as const,
        draw: (): void => undefined,
      }))),
      colliders: Object.freeze([]),
      sockets: Object.freeze({}),
      interactions: Object.freeze([]),
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

    const animator = new CharacterAnimator(rig, { autoBlink: false, autoGaze: false });
    const gaitSamples: Readonly<{ left: number; right: number }>[] = Array.from(
      { length: 10 },
      (): Readonly<{ left: number; right: number }> => {
        animator.update(0.05, { pose: 'walk', speed: 1 });
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
    expect(blueprint.layers.find(({ id }) => id === 'tear:right:drop')?.parentBone)
      .toBe('head');
    const tearProfile = createCharacterTearProfile(identity);
    const rasterEye = blueprint.layers.find(({ id }) => id === 'eye:left');
    const rasterTear = blueprint.layers.find(({ id }) => id === 'tear:left:stream');
    expect(tearProfile.attachmentClearanceInEyeRadii).toBeGreaterThan(0);
    expect(tearProfile.components.map(({ id }) => id)).toEqual(['stream', 'drop', 'bead']);
    expect(rasterTear?.position.y).toBeLessThan(rasterEye?.position.y ?? 0);
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
});

describe('solid rig runtime', () => {
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
    const rasterAnimator = new CharacterAnimator(rasterRig, {
      autoBlink: false,
      autoGaze: false,
    });

    const solidBlueprint = createSolidCharacterBlueprint(identity);
    const solidRig = new SolidRig(solidBlueprint);
    const solidAnimator = new SolidCharacterAnimator(solidRig, {
      autoBlink: false,
      autoGaze: false,
    });
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

    rasterAnimator.setExpression('angry');
    rasterAnimator.update(0);
    solidAnimator.setExpression('angry');
    solidAnimator.update(0);
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

    rasterAnimator.setExpression('sad');
    rasterAnimator.update(0);
    solidAnimator.setExpression('sad');
    solidAnimator.update(0);
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
    expect(strokes.strokeIds).toEqual(expect.arrayContaining([
      'hair:strand:0', 'clothing:collar-seam',
    ]));
    expect(rig.getPart('head')?.children.some(
      ({ name }) => name === 'stroke:hair:strand:0',
    )).toBe(true);
    expect(rig.getPart('body:torso')?.children.some(
      ({ name }) => name === 'stroke:clothing:collar-seam',
    )).toBe(true);
    strokes.visible = false;
    expect(strokes.visible).toBe(false);
    strokes.dispose();
    expect(rig.getPart('head')?.children.some(({ name }) => name.startsWith('stroke:')))
      .toBe(false);
    rig.dispose();
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

  it('builds semantic meshes and animates the rest pose without geometry rebuilds', () => {
    const blueprint = createSolidFaceBlueprint(createSolidFaceRecipe(404, {
      species: 'human', shape: 'round', finish: 'ceramic',
    }));
    const rig = new SolidRig(blueprint);
    expect(rig.nodeIds).toEqual(['head']);
    expect(rig.root.userData.solidAssetId).toBe(blueprint.id);
    expect(rig.partIds).toHaveLength(blueprint.parts.length);
    expect(rig.partIds).toEqual(expect.arrayContaining(blueprint.parts.map(({ id }) => id)));
    const pupil = rig.getPart('eye:left:pupil');
    expect(pupil?.userData.solidAssetId).toBe(blueprint.id);
    const geometry = pupil?.geometry;
    const before = pupil?.position.clone();
    const animator = new SolidFaceAnimator(rig, { autoBlink: false, autoGaze: false });
    animator.setGaze(1, 0.4, 1);
    animator.update(0.12);
    expect(pupil?.geometry).toBe(geometry);
    expect(pupil?.position.distanceTo(before ?? new THREE.Vector3())).toBeGreaterThan(0.01);
    animator.setExpression('surprised');
    animator.update(0.1);
    expect(pupil?.scale.x).toBeGreaterThan(1);
    expect(rig.getPart('mouth')?.visible).toBe(false);
    expect(rig.getPart('mouth:surprised')?.visible).toBe(true);
    animator.setExpression('sad');
    animator.update(0.1);
    expect(rig.getPart('mouth:surprised')?.visible).toBe(false);
    expect(rig.getPart('mouth:sad')?.visible).toBe(true);
    const tear = rig.getPart('tear:left:drop');
    expect(tear?.visible).toBe(false);
    animator.setExpression('crying');
    animator.update(0.1);
    const tearPosition = tear?.position.clone();
    expect(tear?.visible).toBe(true);
    animator.update(0.2);
    expect(tear?.position.distanceTo(tearPosition ?? new THREE.Vector3())).toBeGreaterThan(0);
    animator.setExpression('idle');
    animator.update(0.1);
    expect(tear?.visible).toBe(false);
    rig.dispose();
    expect(rig.partIds).toEqual([]);
  });

  it('does not restart a blink when the same solid expression is assigned every frame', () => {
    const rig = new SolidRig(createSolidFaceBlueprint(createSolidFaceRecipe(4104, {
      species: 'human', shape: 'round', finish: 'skin',
    })));
    const pupil = rig.getPart('eye:left:pupil');
    const restScaleY = pupil?.scale.y ?? 0;
    const animator = new SolidFaceAnimator(rig, { autoBlink: false, autoGaze: false });

    for (let frame = 0; frame < 30; frame += 1) {
      animator.setExpression('idle');
      animator.update(1 / 60);
      expect(pupil?.scale.y).toBeCloseTo(restScaleY, 6);
    }

    animator.setExpression('angry');
    animator.update(0.07);
    expect(pupil?.scale.y).toBeLessThan(restScaleY * 0.2);
    animator.setExpression('angry');
    animator.update(0.07);
    expect(pupil?.scale.y).toBeGreaterThan(restScaleY * 0.5);
    rig.dispose();
  });

  it('keeps a complete solid body articulated while the face animator targets the head', () => {
    const blueprint = createSolidCharacterBlueprint(createCharacterIdentity(5150, {
      species: 'cat', hairStyle: 'none',
    }));
    const rig = new SolidRig(blueprint);
    const torso = rig.getNode('torso');
    const head = rig.getNode('head');
    const tail = rig.getPart('tail:4');
    expect(torso).not.toBeNull();
    expect(head?.parent).toBe(torso);
    expect(rig.getNode('arm:left')?.parent).toBe(torso);
    expect(tail?.quaternion.equals(new THREE.Quaternion())).toBe(false);

    const headBefore = head?.position.clone();
    const animator = new SolidCharacterAnimator(rig, { autoBlink: false, autoGaze: false });
    animator.setGaze(1, 0.3, 1);
    animator.update(0.12);
    expect(head?.position.distanceTo(headBefore ?? new THREE.Vector3())).toBeGreaterThan(0);
    for (let index = 0; index < 8; index += 1) {
      animator.update(0.05, { pose: 'walk', speed: 1 });
    }
    expect(Math.abs(rig.getNode('leg:left')?.rotation.x ?? 0)).toBeGreaterThan(0.1);
    expect(rig.getNode('leg:right')?.rotation.x).toBeCloseTo(
      -(rig.getNode('leg:left')?.rotation.x ?? 0),
    );
    animator.setExpression('angry');
    const torsoBeforeSleep = torso?.position.y ?? 0;
    animator.update(0.05, { pose: 'sleep' });
    expect(animator.currentExpression).toBe('angry');
    expect(rig.getPart('mouth:angry')?.visible).toBe(true);
    const firstSleepStep = torso?.position.y ?? 0;
    expect(Math.abs(firstSleepStep - torsoBeforeSleep)).toBeLessThan(0.08);
    for (let index = 0; index < 8; index += 1) {
      animator.update(0.05, { pose: 'sleep' });
    }
    expect(rig.getPart('mouth:sleeping')?.visible).toBe(true);
    expect((torso?.position.y ?? 0) - firstSleepStep).toBeLessThan(-0.08);
    for (let index = 0; index < 8; index += 1) {
      animator.update(0.05, { pose: 'idle' });
    }
    expect(rig.getPart('mouth:angry')?.visible).toBe(true);

    animator.setExpression('crying');
    animator.update(0.05, { pose: 'idle' });
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
