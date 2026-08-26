import { describe, expect, it } from 'vitest';

import { SolidRig, assetExtensionScope } from '../src/index.js';
import {
  applySolidPaperCircuitBackpackMotion,
  createPaperCircuitBackpackIdentity,
  createPaperCircuitBackpackInkStrokes,
  createSolidPaperCircuitBackpackBlueprint,
  paperCircuitBackpackOpenAmount,
  type PaperCircuitBackpackStyle,
} from '../experiments/doodle-racing/src/extensions/paper-circuit-backpack/index.js';
import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import { GrandstandExplorer } from '../experiments/doodle-racing/src/game/grandstand-explorer.js';
import { createPaperCircuitPersonIdentity } from '../experiments/doodle-racing/src/game/paper-circuit-person.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';

describe('Paper Circuit backpack', () => {
  it('authors three deterministic, structurally distinct backpack styles', () => {
    const person = createPaperCircuitPersonIdentity(81_240);
    const styles: readonly PaperCircuitBackpackStyle[] = [
      'rally-pack', 'roll-top', 'courier',
    ];
    const assets = styles.map((style) => {
      const identity = createPaperCircuitBackpackIdentity(person, { style });
      return Object.freeze({ identity, solid: createSolidPaperCircuitBackpackBlueprint(identity) });
    });

    expect(createPaperCircuitBackpackIdentity(person)).toEqual(
      createPaperCircuitBackpackIdentity(person),
    );
    expect(new Set(assets.map(({ identity }) => identity.style))).toHaveLength(3);
    expect(new Set(assets.map(({ identity }) => identity.dimensions.radii.join(':')))).toHaveLength(3);
    expect(assets.find(({ identity }) => identity.style === 'roll-top')?.solid.parts)
      .toContainEqual(expect.objectContaining({ id: 'roll' }));
    expect(assets.find(({ identity }) => identity.style === 'rally-pack')?.solid.parts)
      .toContainEqual(expect.objectContaining({ id: 'side-pocket:left' }));
    expect(assets.every(({ solid }) => (
      solid.sockets.some(({ id }) => id === 'helmet-storage')
      && solid.parts.some(({ id }) => id === 'flap')
      && solid.parts.some(({ id }) => id === 'back-panel')
      && solid.bounds.maximum[2] - solid.bounds.minimum[2] > 0.6
    ))).toBe(true);
  });

  it('opens its physical flap idempotently while the helmet crosses the storage path', () => {
    const identity = createPaperCircuitBackpackIdentity(
      createPaperCircuitPersonIdentity(81_241),
      { style: 'rally-pack' },
    );
    const solid = createSolidPaperCircuitBackpackBlueprint(identity);
    const rig = new SolidRig(solid, { instanceId: 'test:paper-circuit-backpack' });
    const openAmount = paperCircuitBackpackOpenAmount(0.19);
    expect(openAmount).toBeGreaterThan(0.95);
    applySolidPaperCircuitBackpackMotion(rig, openAmount);
    const first = rig.getNode('flap')?.quaternion.clone();
    applySolidPaperCircuitBackpackMotion(rig, openAmount);
    expect(rig.getNode('flap')?.quaternion.angleTo(first ?? rig.root.quaternion))
      .toBeLessThan(1e-12);
    expect(Math.abs(rig.getNode('flap')?.quaternion.x ?? 0)).toBeGreaterThan(0.4);
    expect(createPaperCircuitBackpackInkStrokes(solid, identity).map(({ partId }) => partId))
      .toEqual(['body', 'body', 'flap']);
    rig.dispose();
  });

  it('stows the helmet from head through the hand and leaves it inside the backpack', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course);
    const explorer = new GrandstandExplorer(world.grandstand, course, 81_242);
    const initial = explorer.snapshot();
    explorer.setVisible(true);
    explorer.updateCinematic(0, Object.freeze({
      ...initial,
      pose: 'sit' as const,
      expression: 'idle' as const,
      helmetCarryAmount: 1,
    }));
    const scope = assetExtensionScope(explorer.helmet);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(true);

    explorer.stowHelmetInBackpack();
    for (let index = 0; index < 8; index += 1) explorer.update(0.05, Object.freeze({
      accelerate: false, brake: false, left: false, right: false, handbrake: false,
    }));
    expect(explorer.helmetItemRig.root.visible).toBe(true);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(false);

    for (let index = 0; index < 12; index += 1) explorer.update(0.05, Object.freeze({
      accelerate: false, brake: false, left: false, right: false, handbrake: false,
    }));
    expect(explorer.helmetItemRig.root.visible).toBe(false);
    expect(explorer.backpackRig.root.visible).toBe(true);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(false);
    explorer.dispose();
  });
});
