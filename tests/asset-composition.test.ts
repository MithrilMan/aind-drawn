import { describe, expect, it } from 'vitest';

import {
  AssetComposition,
  SolidRig,
  createBuildingIdentity,
  createSolidBuildingBlueprint,
  type Pose2,
  type Pose3,
  type RasterAssetInstance,
} from '../src/index.js';

type FakeRuntimeLog = {
  readonly drawRanks: string[];
  readonly disposed: string[];
};

function pose2(x = 0, y = 0, rotation = 0): Pose2 {
  return Object.freeze({
    position: Object.freeze({ x, y }),
    rotation,
  });
}

function fakeRasterInstance(
  instanceId: string,
  log: FakeRuntimeLog,
): RasterAssetInstance {
  let transform = pose2();
  let playbackTime = 0;
  const interactionStates = new Map<string, string>();
  return {
    dimension: '2d',
    instanceId,
    assetId: 'fake-raster',
    getInstanceState: () => Object.freeze({
      id: instanceId,
      assetId: 'fake-raster',
      transform,
      interactionStates: Object.freeze(Object.fromEntries(interactionStates)),
      playbackTime,
    }),
    getSocketWorldPose: (socketId) => socketId === 'mount' ? transform : null,
    getInteractionState: (interactionId) => interactionStates.get(interactionId) ?? null,
    setWorldPose: (next) => { transform = next; },
    setPlaybackTime: (next) => { playbackTime = next; },
    setInteractionState: (interactionId, state) => { interactionStates.set(interactionId, state); },
    setDrawRank: (rank) => { log.drawRanks.push(`${instanceId}:${rank}`); },
    dispose: () => { log.disposed.push(instanceId); },
  };
}

function expectPose3Close(actual: Pose3, expected: Pose3): void {
  actual.position.forEach((value, index) => {
    expect(value).toBeCloseTo(expected.position[index] ?? Number.NaN, 8);
  });
  const directDistance = actual.rotation.reduce(
    (total, value, index) => total + Math.abs(value - (expected.rotation[index] ?? Number.NaN)),
    0,
  );
  const negatedDistance = actual.rotation.reduce(
    (total, value, index) => total + Math.abs(value + (expected.rotation[index] ?? Number.NaN)),
    0,
  );
  expect(Math.min(directDistance, negatedDistance)).toBeLessThan(1e-8);
}

describe('asset runtime instances', () => {
  it('keeps mutable state independent while sharing one immutable blueprint', () => {
    const blueprint = createSolidBuildingBlueprint(createBuildingIdentity(5201, {
      archetype: 'townhouse',
      doorStyle: 'panel',
    }));
    const first = new SolidRig(blueprint, { instanceId: 'scene/building/first' });
    const second = new SolidRig(blueprint, { instanceId: 'scene/building/second' });

    first.setWorldPose(Object.freeze({
      position: Object.freeze([4, 1, -2] as const),
      rotation: Object.freeze([0, 0, 0, 1] as const),
    }));
    first.setPlaybackTime(1.25);
    second.setPlaybackTime(8.5);
    first.setInteractionState('door', 'open');

    const firstState = first.getInstanceState();
    const secondState = second.getInstanceState();
    expect(first.blueprint).toBe(second.blueprint);
    expect(firstState).toEqual({
      id: 'scene/building/first',
      assetId: blueprint.assetId,
      transform: {
        position: [4, 1, -2],
        rotation: [0, 0, 0, 1],
      },
      interactionStates: { door: 'open' },
      playbackTime: 1.25,
    });
    expect(secondState.interactionStates).toEqual({ door: 'closed' });
    expect(secondState.playbackTime).toBe(8.5);
    expect(first.root.userData).toMatchObject({
      assetId: blueprint.assetId,
      instanceId: 'scene/building/first',
    });
    expect('instanceId' in blueprint).toBe(false);
    expect(Object.isFrozen(firstState)).toBe(true);
    expect(Object.isFrozen(firstState.interactionStates)).toBe(true);
    expect(JSON.parse(JSON.stringify(firstState))).toEqual(firstState);

    first.dispose();
    second.dispose();
  });

  it('generates distinct process-local IDs when none are supplied', () => {
    const blueprint = createSolidBuildingBlueprint(createBuildingIdentity(5202));
    const first = new SolidRig(blueprint);
    const second = new SolidRig(blueprint);
    expect(first.instanceId).not.toBe(second.instanceId);
    expect(first.instanceId).toMatch(new RegExp(`^${blueprint.assetId}#\\d+$`));
    first.dispose();
    second.dispose();
  });
});

describe('asset composition', () => {
  it('updates attached children after parents in deterministic dependency order', () => {
    const blueprint = createSolidBuildingBlueprint(createBuildingIdentity(5203, {
      archetype: 'cottage',
      doorStyle: 'arched',
    }));
    const child = new SolidRig(blueprint, { instanceId: 'scene/child' });
    const parent = new SolidRig(blueprint, { instanceId: 'scene/parent' });
    const composition = new AssetComposition();
    composition.insert(child, { ownership: 'owned' });
    composition.insert(parent, { ownership: 'owned' });
    composition.setWorldPose('scene/parent', Object.freeze({
      position: Object.freeze([7, 2, -3] as const),
      rotation: Object.freeze([0, 0, 0, 1] as const),
    }));
    composition.attach('scene/child', 'scene/parent', 'door:handle');

    const closedSocket = parent.getSocketWorldPose('door:handle');
    if (closedSocket === null) throw new Error('Building is missing door:handle');
    expectPose3Close(child.getInstanceState().transform, closedSocket);

    composition.setInteractionState('scene/parent', 'door', 'open');
    composition.setPlaybackTime('scene/parent', 2.5);
    composition.setPlaybackTime('scene/child', 9.75);
    const updateOrder: string[] = [];
    composition.update((instance) => { updateOrder.push(instance.instanceId); });
    expect(updateOrder).toEqual(['scene/parent', 'scene/child']);

    const openSocket = parent.getSocketWorldPose('door:handle');
    if (openSocket === null) throw new Error('Building lost door:handle');
    expectPose3Close(child.getInstanceState().transform, openSocket);
    expect(composition.snapshot().map(({ id, playbackTime }) => ({ id, playbackTime }))).toEqual([
      { id: 'scene/parent', playbackTime: 2.5 },
      { id: 'scene/child', playbackTime: 9.75 },
    ]);
    expect(JSON.parse(JSON.stringify(composition.snapshot()))).toEqual(composition.snapshot());

    composition.dispose();
  });

  it('owns draw ordering and disposes only explicitly owned resources', () => {
    const log: FakeRuntimeLog = { drawRanks: [], disposed: [] };
    const back = fakeRasterInstance('back', log);
    const front = fakeRasterInstance('front', log);
    const composition = new AssetComposition();
    composition.insert(back, { ownership: 'owned' });
    composition.insert(front, { ownership: 'borrowed' });
    composition.setRasterDrawOrder(['front', 'back']);
    expect(log.drawRanks.slice(-2)).toEqual(['front:0', 'back:1']);

    expect(composition.remove('back')).toBe(back);
    expect(composition.remove('back')).toBeNull();
    expect(log.disposed).toEqual(['back']);
    expect(log.drawRanks.at(-1)).toBe('front:0');

    composition.dispose();
    composition.dispose();
    expect(log.disposed).toEqual(['back']);
  });

  it('rejects duplicate instances, incomplete draw orders, and attachment cycles', () => {
    const log: FakeRuntimeLog = { drawRanks: [], disposed: [] };
    const first = fakeRasterInstance('first', log);
    const second = fakeRasterInstance('second', log);
    const composition = new AssetComposition();
    composition.insert(first, { ownership: 'borrowed' });
    composition.insert(second, { ownership: 'borrowed' });

    expect(() => { composition.insert(first, { ownership: 'owned' }); }).toThrow(/already exists/);
    expect(() => { composition.setRasterDrawOrder(['first']); }).toThrow(/every raster instance/);
    composition.attach('second', 'first', 'mount');
    expect(() => { composition.attach('first', 'second', 'mount'); }).toThrow(/cycle/);
    expect(composition.getAttachment('second')).toEqual({
      childId: 'second', parentId: 'first', socketId: 'mount',
    });
    composition.dispose();
  });
});
