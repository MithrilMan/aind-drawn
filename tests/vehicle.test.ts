import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  MEDIUM_IDS,
  VEHICLE_ARCHETYPES,
  VEHICLE_AUTHORING_SCHEMA,
  SolidRig,
  applySolidVehicleMotion,
  buildSolidVehicleLayout,
  createInkedSolidBlueprint,
  createRasterVehicleBlueprint,
  createRasterVehicleRecipe,
  createVehicleCabinSideProfile,
  createVehicleLayout,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  createVehicleMotionState,
  sampleVehicleMotion,
  setVehicleMotion,
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
      .toMatchObject({ steering: true });
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
    expect(solid.parts.find(({ id }) => id === 'door:left:window-opening')).toMatchObject({
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

    const body = solid.parts.find(({ id }) => id === 'body');
    expect(body).toMatchObject({
      placement: { position: [0, 0, 0] },
      geometry: { type: 'mesh', smooth: false },
    });
    if (body?.geometry.type === 'mesh') {
      expect(body.geometry.vertices.length).toBeGreaterThanOrEqual(32);
      expect(body.geometry.vertices.length % 8).toBe(0);
      expect(body.geometry.faces.length).toBeGreaterThanOrEqual(23);
      for (let ring = 0; ring < body.geometry.vertices.length / 8; ring += 1) {
        const shoulder = body.geometry.vertices[ring * 8 + 2];
        const ridge = body.geometry.vertices[ring * 8 + 3];
        expect(shoulder?.[2]).toBeLessThan(ridge?.[2] ?? Number.NEGATIVE_INFINITY);
        expect(shoulder?.[1]).toBeLessThan(ridge?.[1] ?? Number.NEGATIVE_INFINITY);
      }
    }

    const tyre = solid.parts.find(({ id }) => id === 'wheel:front:left:tyre');
    expect(tyre === undefined ? undefined : vehicleRollingPartOf(tyre))
      .toMatchObject({ steering: true, side: -1 });
    expect(tyre?.geometry.type).toBe('mesh');
    if (tyre?.geometry.type !== 'mesh') return;
    const depth = Math.max(...tyre.geometry.vertices.map(([, , z]) => z))
      - Math.min(...tyre.geometry.vertices.map(([, , z]) => z));
    expect(depth).toBeCloseTo(identity.wheels.width);

    const strokes = createSolidVehicleInkStrokes(solid);
    expect(strokes.some(({ id }) => id.startsWith('window:division'))).toBe(true);
    expect(strokes.some(({ id }) => id.endsWith(':panel-seam'))).toBe(false);
    expect(strokes.some(({ id }) => id.endsWith(':rim-marker'))).toBe(true);
    for (const medium of MEDIUM_IDS) {
      const inked = createInkedSolidBlueprint(solid, { medium, strokes });
      expect(inked.medium).toBe(medium);
      expect(inked.solid).toBe(solid);
    }
  });

  it('covers every fixed cabin-to-hood deck interval across archetypes and seeds', () => {
    const seeds = [4_115, ...Array.from({ length: 32 }, (_, index) => 5_200 + index)];
    for (const archetype of VEHICLE_ARCHETYPES) {
      for (const seed of seeds) {
        const identity = createVehicleIdentity(seed, { archetype });
        const layout = buildSolidVehicleLayout(identity);
        const body = createSolidVehicleBlueprint(identity).parts.find(({ id }) => id === 'body');
        expect(body?.geometry.type).toBe('mesh');
        if (body?.geometry.type !== 'mesh') continue;
        const geometry = body.geometry;

        const cabinFrontX = -layout.length * 0.5
          + identity.cabin.endRatio * layout.length;
        const hasFrontDeckGap = layout.hoodHingeX - cabinFrontX > 1e-6;
        const frontDeck = geometry.faces.find((face) => {
          const vertices = face.map((index) => geometry.vertices[index]);
          const xs = vertices.map((vertex) => vertex?.[0] ?? Number.NaN);
          const ys = vertices.map((vertex) => vertex?.[1] ?? Number.NaN);
          return face.length === 4
            && Math.abs(Math.min(...xs) - cabinFrontX) <= 1e-6
            && Math.abs(Math.max(...xs) - layout.hoodHingeX) <= 1e-6
            && ys.every((y) => Math.abs(y - layout.beltHeight) <= 1e-6);
        });
        expect(frontDeck !== undefined).toBe(hasFrontDeckGap);
        expect(geometry.vertices.flat().every(Number.isFinite)).toBe(true);
        expect(geometry.faces.every((face) => (
          face.length >= 3
          && new Set(face).size === face.length
          && face.every((index) => index >= 0 && index < geometry.vertices.length)
        ))).toBe(true);
      }
    }
  });

  it('mounts generated spoilers to the body instead of leaving a floating wing', () => {
    const identity = createVehicleIdentity(4_879);
    expect(identity.details.spoiler).toBe(true);
    const solid = createSolidVehicleBlueprint(identity);
    const layout = buildSolidVehicleLayout(identity);
    const wing = solid.parts.find(({ id }) => id === 'spoiler');
    const supports = solid.parts.filter(({ id }) => id.startsWith('spoiler:support:'));
    expect(wing?.semanticPartId).toBe('accessories');
    expect(supports).toHaveLength(2);
    expect(new Set(supports.map(({ placement: { position } }) => Math.sign(position[2]))))
      .toEqual(new Set([-1, 1]));
    for (const support of supports) {
      expect(support.semanticPartId).toBe('accessories');
      expect(support.geometry.type).toBe('superellipsoid');
      if (support.geometry.type !== 'superellipsoid' || wing === undefined) continue;
      expect(support.placement.position[1] + support.geometry.radii[1])
        .toBeGreaterThanOrEqual(wing.placement.position[1] - 0.035);
      expect(support.placement.position[1] - support.geometry.radii[1])
        .toBeLessThanOrEqual(layout.beltHeight);
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

  it('projects one shaped recessed door construction across every vehicle archetype', () => {
    const closePoints = (
      actual: readonly (readonly [number, number])[],
      expected: readonly (readonly [number, number])[],
    ): void => {
      expect(actual).toHaveLength(expected.length);
      for (let index = 0; index < expected.length; index += 1) {
        expect(actual[index]?.[0]).toBeCloseTo(expected[index]?.[0] ?? Number.NaN);
        expect(actual[index]?.[1]).toBeCloseTo(expected[index]?.[1] ?? Number.NaN);
      }
    };
    for (const archetype of VEHICLE_ARCHETYPES) {
      for (let seed = 1; seed <= 32; seed += 1) {
        const identity = createVehicleIdentity(seed, { archetype });
        const raster = createVehicleLayout(identity, 'right');
        const solidLayout = buildSolidVehicleLayout(identity);
        const toSolidDoorSpace = (points: readonly (readonly [number, number])[]) => points.map(
          ([x, y]) => [
            x - identity.dimensions.length * 0.5 - solidLayout.doorHingeX,
            y - solidLayout.bodyBottom,
          ] as const,
        );
        closePoints(toSolidDoorSpace(raster.doorOutline), solidLayout.doorPanelOutline);
        closePoints(toSolidDoorSpace(raster.doorWindowOutline), solidLayout.doorWindowOutline);
        closePoints(
          toSolidDoorSpace(raster.doorWindowGlassOutline),
          solidLayout.doorWindowGlassOutline,
        );
        closePoints(toSolidDoorSpace(raster.doorOpeningOutline), solidLayout.doorOpeningOutline);

        const frame = solidLayout.doorWindowOutline;
        const frontTop = frame[frame.length - 2];
        const frontBottom = frame[frame.length - 1];
        expect((frontBottom?.[0] ?? 0) - (frontTop?.[0] ?? 0))
          .toBeGreaterThan(solidLayout.doorLength * 0.08);
        expect((frontTop?.[1] ?? 0) - (frontBottom?.[1] ?? 0)).toBeGreaterThan(0.14);
        expect(solidLayout.doorAssemblyHeight)
          .toBeGreaterThan(solidLayout.doorPanelHeight + 0.14);
      }
    }

    const identity = createVehicleIdentity(4_879, { archetype: 'coupe' });
    const layout = buildSolidVehicleLayout(identity);
    const solid = createSolidVehicleBlueprint(identity);
    const body = solid.parts.find(({ id }) => id === 'body');
    expect(body?.geometry.type).toBe('mesh');
    const beltRidge = body?.geometry.type === 'mesh'
      ? Math.max(...body.geometry.vertices
        .filter(([, y]) => Math.abs(y - layout.beltHeight) <= 1e-6)
        .map(([, , z]) => Math.abs(z)))
      : Number.NaN;
    for (const side of ['left', 'right'] as const) {
      const sign = vehicleSideSign(side);
      const node = layout.nodes.find(({ id }) => id === `door:${side}`);
      const panel = solid.parts.find(({ id }) => id === `door:${side}`);
      const opening = solid.parts.find(({ id }) => id === `door:${side}:opening`);
      const windowOpening = solid.parts.find(({ id }) => id === `door:${side}:window-opening`);
      expect(node?.restPose.position[2]).toBeCloseTo(sign * layout.doorSurfaceHalfWidth);
      expect(panel).toMatchObject({ node: `door:${side}`, geometry: { type: 'mesh' } });
      expect(opening).toMatchObject({ node: 'chassis', geometry: { type: 'mesh' } });
      expect(windowOpening?.node).toBe('chassis');
      if (panel?.geometry.type !== 'mesh' || node === undefined) continue;
      const panelGeometry = panel.geometry;
      const exteriorZ = panelGeometry.vertices.map(([, , z]) => node.restPose.position[2] + z);
      const outwardExtent = sign === 1 ? Math.max(...exteriorZ) : -Math.min(...exteriorZ);
      expect(outwardExtent).toBeLessThanOrEqual(layout.doorSurfaceHalfWidth + 0.0041);
      const panelTop = Math.max(...panelGeometry.vertices.map(([, y]) => y));
      const topExtent = panelGeometry.vertices
        .filter(([, y]) => Math.abs(y - panelTop) <= 1e-6)
        .map(([, , z]) => Math.abs(node.restPose.position[2] + z));
      expect(Math.max(...topExtent)).toBeCloseTo(beltRidge + 0.004);
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
    const identity = createVehicleIdentity(5105, { archetype: 'coupe' });
    const solid = createSolidVehicleBlueprint(identity);
    const rig = new SolidRig(solid);
    const wheel = rig.getNode('wheel:front:left');
    let state = createVehicleMotionState({ travelDistance: 2, speed: 1, steering: 0.4 });
    applySolidVehicleMotion(rig, sampleVehicleMotion(identity, state, 0.1));
    const first = wheel?.quaternion.clone();
    const repeated = setVehicleMotion(state, { travelDistance: 2, speed: 1, steering: 0.4 });
    expect(repeated).toBe(state);
    applySolidVehicleMotion(rig, sampleVehicleMotion(identity, repeated, 0.1));
    expect(wheel?.quaternion.equals(first ?? wheel.quaternion)).toBe(true);
    state = setVehicleMotion(state, { travelDistance: -2, speed: 1, steering: 0.4 });
    applySolidVehicleMotion(rig, sampleVehicleMotion(identity, state, 0.1));
    expect(wheel?.quaternion.equals(first ?? wheel.quaternion)).toBe(false);
    rig.dispose();
  });

  it('maps named steering directions to the right-handed vehicle axes', () => {
    const identity = createVehicleIdentity(5112, { archetype: 'sedan' });
    const solid = createSolidVehicleBlueprint(identity);
    const rig = new SolidRig(solid);
    const wheel = rig.getNode('wheel:front:right');
    let state = createVehicleMotionState({
      travelDistance: 0,
      steering: vehicleSteeringInput('left', 1),
    });
    applySolidVehicleMotion(rig, sampleVehicleMotion(identity, state, 0));
    const leftForward = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(wheel?.quaternion ?? new THREE.Quaternion());
    expect(leftForward.z).toBeLessThan(0);
    state = setVehicleMotion(state, {
      travelDistance: 0,
      steering: vehicleSteeringInput('right', 1),
    });
    applySolidVehicleMotion(rig, sampleVehicleMotion(identity, state, 0));
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
