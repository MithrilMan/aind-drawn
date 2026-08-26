import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  CHARACTER_ART_BINDINGS,
  CHARACTER_EXTENSION_HOST,
  MEDIUM_IDS,
  SolidRig,
  assetExtensionScope,
  createAssetExtensionPlan,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
  extendAssetIdentity,
  extendRasterAssetBlueprint,
  extendSolidAssetBlueprint,
  mediumById,
  validateAssetBlueprintParity,
} from '../src/index.js';
import {
  PAPER_CIRCUIT_EXTENSION_REGISTRY,
  PAPER_CIRCUIT_HELMET_EXTENSION_ID,
  PAPER_CIRCUIT_HELMET_HOLD_DURATION,
  PAPER_CIRCUIT_VISOR_COLUMNS,
  PAPER_CIRCUIT_VISOR_ROWS,
  applySolidPaperCircuitVisorReachMotion,
  applySolidPaperCircuitVisorMotion,
  createPaperCircuitHelmetIdentity,
  createPaperCircuitHelmetInkStrokes,
  createPaperCircuitVisorGeometry,
  createSolidPaperCircuitHelmetBlueprint,
  createPaperCircuitVisorMotionState,
  samplePaperCircuitVisorMotion,
  samplePaperCircuitHelmetEquipMotion,
  samplePaperCircuitVisorReachMotion,
  setPaperCircuitVisorPosition,
  paperCircuitFaceOpeningHalfWidthAt,
} from '../experiments/doodle-racing/src/extensions/paper-circuit-helmet/index.js';
import { createPaperCircuitPersonIdentity } from '../experiments/doodle-racing/src/game/characters/shared/paper-circuit-person.js';
import { createCourseLayout } from '../experiments/doodle-racing/src/game/course.js';
import { GrandstandExplorer } from '../experiments/doodle-racing/src/game/characters/explorer/grandstand-explorer.js';
import { createRaceWorldLayout } from '../experiments/doodle-racing/src/game/race-world.js';

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function extendedHelmet(seed = 51_904) {
  const person = createPaperCircuitPersonIdentity(seed);
  const helmet = createPaperCircuitHelmetIdentity(person);
  const identity = extendAssetIdentity(person, [helmet]);
  const baseRaster = createRasterCharacterBlueprint(identity, { artDirection: 'storybook' });
  const baseSolid = createSolidCharacterBlueprint(identity, { artDirection: 'storybook' });
  const plan = createAssetExtensionPlan(
    identity,
    baseSolid.manifest,
    CHARACTER_ART_BINDINGS,
    CHARACTER_EXTENSION_HOST,
    PAPER_CIRCUIT_EXTENSION_REGISTRY,
  );
  return Object.freeze({
    person,
    helmet,
    identity,
    baseRaster,
    baseSolid,
    raster: extendRasterAssetBlueprint(baseRaster, plan),
    solid: extendSolidAssetBlueprint(baseSolid, plan),
  });
}

describe('asset extensions', () => {
  it('keeps the extension in deterministic, fully resolved authored identity', () => {
    const first = extendedHelmet();
    const repeated = extendedHelmet();

    expect(first.identity.extensions).toEqual([first.helmet]);
    expect(first.identity).toEqual(repeated.identity);
    expect(first.helmet.id).toBe(PAPER_CIRCUIT_HELMET_EXTENSION_ID);
    expect(first.helmet.data.transitionSeconds).toBeGreaterThan(0);
    expect(first.helmet.data.item.palette.shell).toHaveLength(3);
    expect(first.helmet.data.item.model).toBe('rally-bubble');
    expect(Object.isFrozen(first.identity)).toBe(true);
    expect(Object.isFrozen(first.helmet.data)).toBe(true);
  });

  it('composes one semantic contract into matching raster and solid projections', () => {
    const asset = extendedHelmet();
    const scope = assetExtensionScope(asset.helmet);
    const helmetId = scope.id('helmet');
    const visorId = scope.id('visor');

    expect(() => {
      validateAssetBlueprintParity(asset.raster, asset.solid);
    }).not.toThrow();
    expect(asset.raster.assetId).toBe(asset.solid.assetId);
    expect(asset.raster.assetId).not.toBe(asset.baseRaster.assetId);
    expect(asset.solid.manifest.parts).toContainEqual(expect.objectContaining({
      id: helmetId,
      parentId: 'head',
      spatial: 'shell',
    }));
    expect(asset.solid.manifest.parts).toContainEqual(expect.objectContaining({
      id: visorId,
      parentId: helmetId,
      spatial: 'articulated',
    }));
    expect(asset.baseSolid.parts.some((part) => part.semanticPartId === helmetId)).toBe(false);
    expect(asset.solid.parts.some((part) => part.semanticPartId === helmetId)).toBe(true);
    expect(asset.raster.layers.some((layer) => layer.semanticPartId === visorId)).toBe(true);
    expect(createPaperCircuitHelmetInkStrokes(asset.solid, asset.helmet))
      .toContainEqual(expect.objectContaining({ partId: scope.id('part:visor'), closed: true }));
  });

  it('builds a true shell and applies the articulated visor without pose accumulation', () => {
    const asset = extendedHelmet();
    const scope = assetExtensionScope(asset.helmet);
    const shell = asset.solid.parts.find((part) => part.id === scope.id('part:helmet'));
    expect(shell?.geometry.type).toBe('mesh');
    if (shell?.geometry.type !== 'mesh') throw new Error('Expected helmet shell mesh');
    expect(Math.min(...shell.geometry.vertices.map((point) => point[2]))).toBeLessThan(0);
    expect(Math.max(...shell.geometry.vertices.map((point) => point[2]))).toBeGreaterThan(0);

    const object = createSolidPaperCircuitHelmetBlueprint(asset.helmet.data.item);
    const objectShell = object.parts.find((part) => part.id === 'shell');
    expect(shell.geometry).toEqual(objectShell?.geometry);
    const mount = asset.solid.nodes.find((node) => node.id === scope.id('helmet'));
    expect(mount?.restScale?.[0]).toBe(mount?.restScale?.[1]);
    expect(mount?.restScale?.[1]).toBe(mount?.restScale?.[2]);
    expect(mount?.restScale?.[0]).toBeGreaterThan(0);

    const item = Object.freeze({
      ...asset.helmet.data.item,
      visor: Object.freeze({
        ...asset.helmet.data.item.visor,
        clearance: 0,
      }),
    });
    const visorGeometry = createPaperCircuitVisorGeometry(item);
    const backOffset = PAPER_CIRCUIT_VISOR_COLUMNS * PAPER_CIRCUIT_VISOR_ROWS;
    for (const row of [0, Math.floor(PAPER_CIRCUIT_VISOR_ROWS / 2), PAPER_CIRCUIT_VISOR_ROWS - 1]) {
      const normalizedY = item.shell.faceOpening.topY + item.visor.edgeOverlap
        + row / (PAPER_CIRCUIT_VISOR_ROWS - 1) * (
          item.shell.faceOpening.bottomY - item.visor.edgeOverlap
          - item.shell.faceOpening.topY - item.visor.edgeOverlap
        );
      const vertex = visorGeometry.geometry.vertices[
        backOffset + row * PAPER_CIRCUIT_VISOR_COLUMNS
      ];
      if (vertex === undefined) throw new Error('Expected visor boundary vertex');
      const world = [
        vertex[0] + visorGeometry.hinge[0],
        vertex[1] + visorGeometry.hinge[1],
        vertex[2] + visorGeometry.hinge[2],
      ] as const;
      const slopeX = (world[0] / item.shell.radii[0])
        / (world[2] / item.shell.radii[2]);
      const slopeY = (world[1] / item.shell.radii[1])
        / (world[2] / item.shell.radii[2]);
      expect(slopeX).toBeCloseTo(
        -paperCircuitFaceOpeningHalfWidthAt(item, normalizedY, item.visor.edgeOverlap),
        8,
      );
      expect(slopeY).toBeCloseTo(normalizedY, 8);
    }

    const rig = new SolidRig(asset.solid, { instanceId: 'test:helmet' });
    let state = createPaperCircuitVisorMotionState('down');
    state = setPaperCircuitVisorPosition(state, asset.helmet, 'up', 0);
    const amount = samplePaperCircuitVisorMotion(
      state,
      asset.helmet,
      asset.helmet.data.transitionSeconds,
    );
    applySolidPaperCircuitVisorMotion(rig, asset.helmet, amount);
    const visor = rig.getNode(scope.id('visor'));
    expect(visor).not.toBeNull();
    const firstRotation = visor?.quaternion.clone();
    applySolidPaperCircuitVisorMotion(rig, asset.helmet, amount);
    expect(visor?.quaternion.angleTo(firstRotation ?? visor.quaternion)).toBeLessThan(1e-12);
    expect(Math.abs(visor?.quaternion.x ?? 0)).toBeGreaterThan(0.2);
    expect(setPaperCircuitVisorPosition(state, asset.helmet, 'up', 10)).toBe(state);

    const containment = asset.solid.containments?.[0];
    expect(containment?.variants.length).toBeGreaterThan(0);
    if (containment === undefined) throw new Error('Expected helmet containment');
    rig.setContainmentState(containment.id, true);
    for (const variant of containment.variants) {
      expect(rig.getPart(variant.sourcePartId)?.visible).toBe(false);
      if (variant.containedPartId !== undefined) {
        expect(rig.getPart(variant.containedPartId)?.visible).toBe(true);
      }
    }
    rig.dispose();
  });

  it('equips the helmet when a valid human identity has no parts to contain', () => {
    const seedWithoutHairEarsOrEyewear = 6;
    const asset = extendedHelmet(seedWithoutHairEarsOrEyewear);
    expect(asset.person.hair.style).toBe('none');
    expect(asset.person.ears.style).toBe('none');
    expect(asset.person.accessories).toEqual([]);
    expect(asset.solid.containments).toBeUndefined();

    const course = createCourseLayout();
    const world = createRaceWorldLayout(course, 76_115);
    const explorer = new GrandstandExplorer(
      world.grandstand,
      course,
      seedWithoutHairEarsOrEyewear,
    );
    const scope = assetExtensionScope(explorer.helmet);
    explorer.setPreviewMode(true);
    explorer.setVisible(true);
    for (let index = 0; index < 57; index += 1) explorer.updatePreview(0.05);

    expect(explorer.rig.containmentIds).toEqual([]);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(true);
    explorer.dispose();
  });

  it('projects transparent wearables through every raster medium glaze', () => {
    for (const medium of MEDIUM_IDS) {
      expect(mediumById(medium).glaze, medium).toBeTypeOf('function');
    }
  });

  it('holds before equipping and layers the visor hand reach over character motion', () => {
    const asset = extendedHelmet();
    expect(samplePaperCircuitHelmetEquipMotion(PAPER_CIRCUIT_HELMET_HOLD_DURATION * 0.9)).toBe(0);
    expect(samplePaperCircuitHelmetEquipMotion(PAPER_CIRCUIT_HELMET_HOLD_DURATION + 1)).toBe(1);
    let visor = createPaperCircuitVisorMotionState('down');
    visor = setPaperCircuitVisorPosition(visor, asset.helmet, 'up', 2);
    const reach = samplePaperCircuitVisorReachMotion(
      visor,
      asset.helmet,
      2 + asset.helmet.data.transitionSeconds * 0.5,
    );
    expect(reach).toBeGreaterThan(0.9);
    const rig = new SolidRig(asset.solid, { instanceId: 'test:visor-reach' });
    const before = rig.getNode('arm:right')?.quaternion.clone();
    applySolidPaperCircuitVisorReachMotion(rig, reach);
    expect(rig.getNode('arm:right')?.quaternion.angleTo(before ?? rig.root.quaternion))
      .toBeGreaterThan(1);
    rig.dispose();
  });

  it('authors the experiment extension only through the public library entrypoint', () => {
    for (const file of [
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/identity.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/geometry.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/extension.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/motion.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/equip-motion.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/ink-strokes.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-helmet/object-blueprint.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-backpack/identity.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-backpack/object-blueprint.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-backpack/motion.ts',
      'experiments/doodle-racing/src/extensions/paper-circuit-backpack/ink-strokes.ts',
    ]) {
      const content = source(file);
      expect(content, file).not.toMatch(/from ['"][^'"]*src\/(?!index\.js)/);
    }
  });

  it('puts the helmet on the selected Grandstand explorer, not on the base character family', () => {
    const course = createCourseLayout();
    const world = createRaceWorldLayout(course, 76_115);
    const explorer = new GrandstandExplorer(world.grandstand, course, 51_904);
    const scope = assetExtensionScope(explorer.helmet);

    expect(explorer.identity.extensions).toEqual([explorer.helmet]);
    expect(explorer.solid.parts.some((part) => part.id === scope.id('part:helmet'))).toBe(true);
    expect(
      createSolidCharacterBlueprint(createPaperCircuitPersonIdentity(51_904)).parts
        .some((part) => part.id === scope.id('part:helmet')),
    ).toBe(false);
    explorer.setPreviewMode(true);
    explorer.setVisible(true);
    explorer.updatePreview(0.05);
    expect(explorer.backpackRig.root.visible).toBe(true);
    expect(explorer.helmetItemRig.root.visible).toBe(false);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(false);
    for (let index = 0; index < 43; index += 1) explorer.updatePreview(0.05);
    expect(explorer.helmetItemRig.root.visible).toBe(true);
    for (let index = 0; index < 14; index += 1) explorer.updatePreview(0.05);
    expect(explorer.helmetItemRig.root.visible).toBe(false);
    expect(explorer.rig.getPart(scope.id('part:helmet'))?.visible).toBe(true);
    expect(explorer.rig.containmentIds).toEqual([scope.id('containment:helmet')]);
    explorer.dispose();
  });
});
