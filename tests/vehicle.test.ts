import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  MEDIUM_IDS,
  VEHICLE_ARCHETYPES,
  VEHICLE_AUTHORING_SCHEMA,
  SolidRig,
  VehicleAnimator,
  buildSolidVehicleLayout,
  createInkedSolidBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createVehicleCabinSideProfile,
  createVehicleLayout,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  vehicleSideSign,
  vehicleSteeringInput,
  vehicleRollingLayerOf,
  vehicleRollingPartOf,
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
    expect(first.doors.hinge).toBe('front');
    expect(first.doors.sides).toEqual(['left', 'right']);
    expect(vehicleSideSign('left')).toBe(-1);
    expect(vehicleSideSign('right')).toBe(1);
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
    const rasterFrontBone = raster.bones.find(({ id }) => id === rasterFront?.bone);
    const solidFront = solid.nodes.find(({ id }) => id === 'wheel:front:left');
    expect(rasterFrontBone?.restPose.position.x).toBeCloseTo(
      (solidFront?.restPose.position[0] ?? 0) + identity.dimensions.length * 0.5,
    );
    expect(rasterFrontBone?.restPose.position.y).toBeCloseTo(solidFront?.restPose.position[1] ?? 0);
    expect(rasterFront === undefined ? undefined : vehicleRollingLayerOf(rasterFront))
      .toMatchObject({ radius: identity.wheels.radius, steering: true });
    expect(raster.manifest).toBe(solid.manifest);
    expect(raster.manifest.interactions.map(({ id }) => id)).toEqual(
      solid.manifest.interactions.map(({ id }) => id),
    );
    expect(raster.sockets.find(({ id }) => id === 'entry:left')?.localPose.position.x).toBeCloseTo(
      (solid.sockets.find(({ id }) => id === 'entry:left')?.localPose.position[0] ?? 0)
        + identity.dimensions.length * 0.5,
    );
    expect(identity.doors.frontStartRatio).toBeGreaterThan(identity.cabin.startRatio);
    expect(identity.doors.frontEndRatio).toBeLessThan(identity.cabin.endRatio);
    expect(identity.doors.frontEndRatio - identity.doors.frontStartRatio).toBeLessThanOrEqual(0.3);
    const roof = solid.parts.find(({ id }) => id === 'roof');
    expect(roof?.geometry.type).toBe('extruded-profile');
    if (roof?.geometry.type === 'extruded-profile') {
      expect(roof.placement.position[2]).toBeCloseTo(roof.geometry.depth * 0.5);
    }
    expect(solid.parts.find(({ id }) => id === 'door:left:opening')).toMatchObject({
      node: 'chassis', materialId: 'interior',
    });
    expect(solid.parts.find(({ id }) => id === 'hood:opening')).toMatchObject({
      node: 'chassis', materialId: 'interior',
    });
    expect(solid.parts.find(({ id }) => id === 'cargo:opening')).toMatchObject({
      node: 'chassis', materialId: 'interior',
    });
    expect(solid.parts.find(({ id }) => id === 'door:left:window')?.node).toBe('door:left');
    expect(solid.parts.find(({ id }) => id === 'door:left:window-frame')?.node).toBe('door:left');

    const tyre = solid.parts.find(({ id }) => id === 'wheel:front:left:tyre');
    expect(tyre === undefined ? undefined : vehicleRollingPartOf(tyre))
      .toMatchObject({ radius: identity.wheels.radius, steering: true, side: -1 });
    expect(tyre?.geometry.type).toBe('mesh');
    if (tyre?.geometry.type !== 'mesh') return;
    const depth = Math.max(...tyre.geometry.vertices.map(([, , z]) => z))
      - Math.min(...tyre.geometry.vertices.map(([, , z]) => z));
    expect(depth).toBeCloseTo(identity.wheels.width);

    const strokes = createSolidVehicleInkStrokes(solid);
    expect(strokes.some(({ id }) => id.startsWith('window:division'))).toBe(true);
    expect(strokes.some(({ id }) => id.endsWith(':rim-marker'))).toBe(true);
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
    expect(door?.rotation.y).toBeCloseTo(solid.interactionBindings[0]
      ?.nodes[0]?.stateByInteractionState.open?.rotation?.[1] ?? 0);
    expect(hood?.rotation.z).toBeGreaterThan(0.8);
    rig.dispose();
  });

  it('moves the complete door assembly outward on both named sides', () => {
    const framed = createSolidVehicleBlueprint(createVehicleIdentity(5106, { archetype: 'sedan' }));
    const frameless = createSolidVehicleBlueprint(createVehicleIdentity(5106, { archetype: 'coupe' }));
    const leftRotation = framed.interactionBindings.find(
      ({ interactionId }) => interactionId === 'door:left',
    )?.nodes[0]?.stateByInteractionState.open?.rotation?.[1];
    const rightRotation = framed.interactionBindings.find(
      ({ interactionId }) => interactionId === 'door:right',
    )?.nodes[0]?.stateByInteractionState.open?.rotation?.[1];
    expect(leftRotation).toBeCloseTo(framed.interactionBindings[0]
      ?.nodes[0]?.stateByInteractionState.open?.rotation?.[1] ?? 0);
    expect(leftRotation).toBeLessThan(0);
    expect(rightRotation).toBeGreaterThan(0);
    expect(framed.parts.some(({ id }) => id === 'door:left:window-frame')).toBe(true);
    expect(frameless.parts.some(({ id }) => id === 'door:left:window-frame')).toBe(false);
    for (const side of ['left', 'right'] as const) {
      expect(framed.parts.find(({ id }) => id === `door:${side}:window`)?.node).toBe(`door:${side}`);
      expect(framed.parts.find(({ id }) => id === `door:${side}:handle`)?.node).toBe(`door:${side}`);
    }
  });

  it('projects the right-handed side convention without swapping semantic parts', () => {
    const identity = createVehicleIdentity(5107, { archetype: 'coupe' });
    const right = createVehicleLayout(identity, 'right');
    const left = createVehicleLayout(identity, 'left');
    const solidLayout = buildSolidVehicleLayout(identity);
    expect(right.frontWheel.x).toBeCloseTo(identity.dimensions.length - left.frontWheel.x);
    expect(right.rearWheel.x).toBeCloseTo(identity.dimensions.length - left.rearWheel.x);
    expect(solidLayout.nodes.find(({ id }) => id === 'door:left')?.restPose.position[2]).toBeLessThan(0);
    expect(solidLayout.nodes.find(({ id }) => id === 'door:right')?.restPose.position[2]).toBeGreaterThan(0);
    expect(solidLayout.nodes.find(({ id }) => id === 'wheel:front:left')?.restPose.position[2]).toBeLessThan(0);
    expect(solidLayout.nodes.find(({ id }) => id === 'wheel:front:right')?.restPose.position[2]).toBeGreaterThan(0);
    expect(solidLayout.nodes.find(({ id }) => id === 'wheel:rear:left')?.restPose.position[2]).toBeLessThan(0);
    expect(solidLayout.nodes.find(({ id }) => id === 'wheel:rear:right')?.restPose.position[2]).toBeGreaterThan(0);
    expect(solidLayout.sockets.find(({ id }) => id === 'entry:left')?.localPose.position[2]).toBeLessThan(0);
    expect(solidLayout.sockets.find(({ id }) => id === 'entry:right')?.localPose.position[2]).toBeGreaterThan(0);
    const solid = createSolidVehicleBlueprint(identity);
    expect(solid.colliders.find(({ id }) => id === 'door:left:sensor')?.localPose.position[2])
      .toBeLessThan(0);
    expect(solid.colliders.find(({ id }) => id === 'door:right:sensor')?.localPose.position[2])
      .toBeGreaterThan(0);
  });

  it('keeps the shared cabin and roof profiles monotonic across body archetypes', () => {
    for (const archetype of ['city', 'coupe', 'sedan', 'van', 'pickup'] as const) {
      for (let seed = 1; seed <= 48; seed += 1) {
        const identity = createVehicleIdentity(seed, { archetype });
        const profile = createVehicleCabinSideProfile(identity);
        const rasterLayout = createVehicleLayout(identity, 'right');
        const doorLength = (identity.doors.frontEndRatio - identity.doors.frontStartRatio)
          * identity.dimensions.length;
        expect(doorLength).toBeLessThan(1.55);
        for (let index = 1; index < profile.outline.length; index += 1) {
          expect(profile.outline[index]?.[0]).toBeGreaterThan(profile.outline[index - 1]?.[0] ?? 0);
        }
        expect(rasterLayout.cabinOutline).toEqual(profile.outline.map(([x, y]) => (
          [x + identity.dimensions.length * 0.5, y]
        )));
      }
      const identity = createVehicleIdentity(4107, { archetype });
      const roof = createSolidVehicleBlueprint(identity).parts.find(({ id }) => id === 'roof');
      expect(roof?.geometry.type).toBe('extruded-profile');
      if (roof?.geometry.type !== 'extruded-profile') continue;
      const outer = roof.geometry.outline.slice(0, 4);
      for (let index = 1; index < outer.length; index += 1) {
        expect(outer[index]?.[0]).toBeGreaterThan(outer[index - 1]?.[0] ?? 0);
      }
    }
  });

  it('keeps closed bonnet and cargo lids tapered inside the body width', () => {
    const identity = createVehicleIdentity(4107, { archetype: 'coupe' });
    const solid = createSolidVehicleBlueprint(identity);
    for (const id of ['hood', 'cargo']) {
      const lid = solid.parts.find((part) => part.id === id);
      expect(lid?.geometry.type).toBe('mesh');
      if (lid?.geometry.type !== 'mesh') continue;
      const width = Math.max(...lid.geometry.vertices.map(([, , z]) => z))
        - Math.min(...lid.geometry.vertices.map(([, , z]) => z));
      expect(width).toBeLessThan(identity.dimensions.width * 0.7);
      expect(Math.max(...lid.geometry.vertices.map(([, y]) => y))).toBeCloseTo(0);
      expect(Math.min(...lid.geometry.vertices.map(([, y]) => y))).toBeLessThan(0);
    }
    const hoodRotation = solid.interactionBindings.find(({ interactionId }) => interactionId === 'hood')
      ?.nodes[0]?.stateByInteractionState.open?.rotation?.[2] ?? 0;
    const cargoRotation = solid.interactionBindings.find(({ interactionId }) => interactionId === 'cargo')
      ?.nodes[0]?.stateByInteractionState.open?.rotation?.[2] ?? 0;
    expect(hoodRotation).toBeGreaterThan(0);
    expect(cargoRotation).toBeLessThan(0);
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

  it('maps named steering directions to the right-handed vehicle axes', () => {
    const solid = createSolidVehicleBlueprint(createVehicleIdentity(5112, { archetype: 'sedan' }));
    const rig = new SolidRig(solid);
    const animator = new VehicleAnimator(rig);
    const wheel = rig.getNode('wheel:front:right');
    animator.update(0, { travelDistance: 0, steering: vehicleSteeringInput('left', 1) });
    const leftForward = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(wheel?.quaternion ?? new THREE.Quaternion());
    expect(leftForward.z).toBeLessThan(0);
    animator.update(0, { travelDistance: 0, steering: vehicleSteeringInput('right', 1) });
    const rightForward = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(wheel?.quaternion ?? new THREE.Quaternion());
    expect(rightForward.z).toBeGreaterThan(0);
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
