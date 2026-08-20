import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  CharacterAnimator,
  SolidCharacterAnimator,
  SolidFaceAnimator,
  InkedSolidStrokeRig,
  SolidRig,
  SpriteRig,
  createCharacterBlueprint,
  createBuildingIdentity,
  createCharacterRecipe,
  createPropBlueprint,
  createPropRecipe,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createSolidCharacterInkStrokes,
  createSolidCharacterBlueprint,
  createSolidBuildingBlueprint,
  type AssetBlueprint,
  type CanvasFactory,
} from '../src/index.js';

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

  it('anchors limbs at the top edge while ground props use their bottom edge', () => {
    const blueprint = createCharacterBlueprint(createCharacterRecipe(4107));
    for (const id of ['arm:left', 'arm:right', 'leg:left', 'leg:right']) {
      expect(blueprint.layers.find((layer) => layer.id === id)?.pivot).toEqual([0.5, 1]);
    }
    const torsoOrder = blueprint.layers.find((layer) => layer.id === 'torso')?.order;
    expect(blueprint.layers.find((layer) => layer.id === 'arm:left')?.order).toBeGreaterThan(torsoOrder ?? 0);
    expect(blueprint.layers.find((layer) => layer.id === 'arm:right')?.order).toBeGreaterThan(torsoOrder ?? 0);
    const prop = createPropBlueprint(createPropRecipe(4107, { prop: 'lantern' }));
    expect(prop.layers[0]?.pivot).toEqual([0.5, 0]);
    expect(blueprint.layers.find(({ id }) => id === 'tear:left')?.states)
      .toEqual(['idle', 'crying']);
    expect(blueprint.layers.find(({ id }) => id === 'tear:right')?.parentBone)
      .toBe('head');
  });
});

describe('solid rig runtime', () => {
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
      'face:cheek:left', 'face:cheek:right', 'clothing:collar-seam',
    ]));
    expect(rig.getPart('head')?.children.some(
      ({ name }) => name === 'stroke:face:cheek:left',
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
    const tear = rig.getPart('tear:left');
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
    rig.dispose();
  });
});
