import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  CharacterAnimator,
  SolidFaceAnimator,
  SolidRig,
  SpriteRig,
  createCharacterBlueprint,
  createCharacterRecipe,
  createPropBlueprint,
  createPropRecipe,
  createSolidFaceBlueprint,
  createSolidFaceRecipe,
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

    const animator = new CharacterAnimator(rig);
    const gaitSamples: Readonly<{ left: number; right: number }>[] = Array.from(
      { length: 10 },
      (): Readonly<{ left: number; right: number }> => {
        animator.update(0.05, { locomotion: 'walk', speed: 1 });
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
  });
});

describe('solid rig runtime', () => {
  it('builds semantic meshes and animates the rest pose without geometry rebuilds', () => {
    const blueprint = createSolidFaceBlueprint(createSolidFaceRecipe(404, {
      species: 'human', shape: 'round', finish: 'ceramic',
    }));
    const rig = new SolidRig(blueprint);
    expect(rig.nodeIds).toEqual(['head']);
    expect(rig.partIds).toHaveLength(blueprint.parts.length);
    expect(rig.partIds).toEqual(expect.arrayContaining(blueprint.parts.map(({ id }) => id)));
    const pupil = rig.getPart('eye:left:pupil');
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
    rig.dispose();
    expect(rig.partIds).toEqual([]);
  });
});
