import { describe, expect, it } from 'vitest';

import {
  MEDIUM_IDS,
  VEHICLE_ARCHETYPES,
  VEHICLE_AUTHORING_SCHEMA,
  SolidRig,
  VehicleAnimator,
  createInkedSolidBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  validateAssetFamilyAuthoringSchema,
} from '../src/index.js';

describe('vehicle asset family', () => {
  it('persists deterministic identity and isolates optional detail namespaces', () => {
    const first = createVehicleIdentity(5101, { archetype: 'pickup', roofRack: true });
    const second = createVehicleIdentity(5101, { archetype: 'pickup', roofRack: true });
    const withoutRack = createVehicleIdentity(5101, { archetype: 'pickup', roofRack: false });
    expect(JSON.parse(JSON.stringify(first))).toEqual(second);
    expect(first.wheels).toEqual(withoutRack.wheels);
    expect(first.palette).toEqual(withoutRack.palette);
    expect(first.details.roofRack).toBe(true);
    expect(withoutRack.details.roofRack).toBe(false);
  });

  it('casts every body archetype into a distinct useful profile', () => {
    const identities = VEHICLE_ARCHETYPES.map((archetype) => (
      createVehicleIdentity(5110, { archetype })
    ));
    expect(identities.map(({ archetype }) => archetype)).toEqual(VEHICLE_ARCHETYPES);
    expect(identities.find(({ archetype }) => archetype === 'van')?.dimensions.height)
      .toBeGreaterThan(identities.find(({ archetype }) => archetype === 'coupe')?.dimensions.height ?? 0);
    expect(identities.find(({ archetype }) => archetype === 'pickup')?.body.cargoRatio)
      .toBeGreaterThan(identities.find(({ archetype }) => archetype === 'city')?.body.cargoRatio ?? 1);
  });

  it('projects one identity into aligned raster, solid, and doodle contracts', () => {
    const identity = createVehicleIdentity(5103, { archetype: 'sedan', doorCount: 4 });
    const raster = createRasterVehicleBlueprint(createRasterVehicleRecipe(identity, { medium: 'ink' }));
    const solid = createSolidVehicleBlueprint(identity, { finish: 'metal' });
    const rasterFront = raster.layers.find(({ id }) => id === 'wheel:front');
    const solidFront = solid.nodes.find(({ id }) => id === 'wheel:front:left');
    expect(rasterFront?.position.x).toBeCloseTo(
      (solidFront?.position[0] ?? 0) + identity.dimensions.length * 0.5,
    );
    expect(rasterFront?.position.y).toBeCloseTo(solidFront?.position[1] ?? 0);
    expect(raster.interactions.map(({ id }) => id)).toEqual(
      solid.interactions.map(({ id }) => id),
    );
    expect(raster.sockets['entry:left']?.x).toBeCloseTo(
      (solid.sockets['entry:left']?.[0] ?? 0) + identity.dimensions.length * 0.5,
    );

    const tyre = solid.parts.find(({ id }) => id === 'wheel:front:left:tyre');
    expect(tyre?.geometry.type).toBe('mesh');
    if (tyre?.geometry.type !== 'mesh') return;
    const depth = Math.max(...tyre.geometry.vertices.map(([, , z]) => z))
      - Math.min(...tyre.geometry.vertices.map(([, , z]) => z));
    expect(depth).toBeCloseTo(identity.wheels.width);

    const strokes = createSolidVehicleInkStrokes(solid);
    expect(strokes.some(({ id }) => id.startsWith('window:division'))).toBe(true);
    for (const medium of MEDIUM_IDS) {
      const inked = createInkedSolidBlueprint(solid, { medium, strokes });
      expect(inked.medium).toBe(medium);
      expect(inked.solid).toBe(solid);
    }
  });

  it('opens articulated parts around stable hinges', () => {
    const solid = createSolidVehicleBlueprint(createVehicleIdentity(5104, { archetype: 'van' }));
    const rig = new SolidRig(solid);
    const door = rig.getNode('door:left');
    const hood = rig.getNode('hood');
    expect(rig.interactionIds).toEqual(['door:left', 'door:right', 'hood', 'cargo']);
    expect(door?.rotation.y).toBeCloseTo(0);
    expect(hood?.rotation.z).toBeCloseTo(0);
    rig.setInteractionState('door:left', 'open');
    rig.setInteractionState('hood', 'open');
    expect(Math.abs(door?.rotation.y ?? 0)).toBeGreaterThan(1);
    expect(hood?.rotation.z).toBeGreaterThan(0.8);
    rig.dispose();
  });

  it('derives wheel rotation from signed travel without frame drift', () => {
    const solid = createSolidVehicleBlueprint(createVehicleIdentity(5105, { archetype: 'coupe' }));
    const rig = new SolidRig(solid);
    const animator = new VehicleAnimator(rig);
    const wheel = rig.getNode('wheel:front:left');
    animator.update(0.1, { travelDistance: 2, speed: 1, steering: 0.4 });
    const first = wheel?.quaternion.clone();
    animator.update(0, { travelDistance: 2, speed: 1, steering: 0.4 });
    expect(wheel?.quaternion.equals(first ?? wheel.quaternion)).toBe(true);
    animator.update(0, { travelDistance: -2, speed: 1, steering: 0.4 });
    expect(wheel?.quaternion.equals(first ?? wheel.quaternion)).toBe(false);
    rig.dispose();
  });

  it('publishes valid generic authoring metadata', () => {
    expect(validateAssetFamilyAuthoringSchema(VEHICLE_AUTHORING_SCHEMA))
      .toBe(VEHICLE_AUTHORING_SCHEMA);
    expect(VEHICLE_AUTHORING_SCHEMA.parameters.map(({ id }) => id)).toEqual([
      'archetype', 'wheelStyle', 'doorCount', 'roofRack', 'spoiler',
    ]);
  });
});
