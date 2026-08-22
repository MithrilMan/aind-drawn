import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  createBuildingIdentity,
  createCharacterIdentity,
  createSolidBuildingBlueprint,
  createSolidCharacterBlueprint,
  createSolidVehicleBlueprint,
  createVehicleIdentity,
} from '../src/index.js';

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

function sourceExists(path: string): boolean {
  return existsSync(new URL(`../${path}`, import.meta.url));
}

describe('architectural boundaries', () => {
  it('keeps the inked-solid medium compiler free of family vocabulary', () => {
    const files = [
      'src/projections/inked-solid/medium-projection.ts',
      'src/projections/inked-solid/projection-provider.ts',
      'src/projections/inked-solid/projection-providers/graphite.ts',
      'src/projections/inked-solid/projection-providers/ink.ts',
      'src/projections/inked-solid/projection-providers/watercolor.ts',
      'src/projections/inked-solid/projection-providers/oil.ts',
      'src/projections/inked-solid/projection-providers/chalk.ts',
      'src/projections/inked-solid/projection-providers/marker.ts',
    ];
    const familyVocabulary = /\b(character|building|vehicle|face|hair|eye|mouth|roof|wall|door|window|wheel|tyre)\b/i;
    for (const file of files) expect(source(file), file).not.toMatch(familyVocabulary);
  });

  it('keeps shared blueprint and rig contracts free of family imports', () => {
    const files = [
      'src/contracts/raster-asset.ts',
      'src/contracts/solid-asset.ts',
      'src/contracts/asset-capabilities.ts',
      'src/runtime/sprite-rig.ts',
      'src/runtime/solid-rig.ts',
      'src/projections/inked-solid/runtime/pass.ts',
    ];
    const familyImport = /from ['"][^'"]*(character|building|vehicle|solid-face)[^'"]*['"]/i;
    for (const file of files) expect(source(file), file).not.toMatch(familyImport);
  });

  it('organizes multi-representation code by semantic family', () => {
    const expected = [
      'src/assets/building/identity',
      'src/assets/building/raster',
      'src/assets/building/solid',
      'src/assets/character/identity',
      'src/assets/character/raster',
      'src/assets/character/solid',
      'src/assets/character/runtime',
      'src/assets/vehicle/identity',
      'src/assets/vehicle/raster',
      'src/assets/vehicle/solid',
      'src/assets/vehicle/runtime',
      'src/contracts',
      'src/projections/inked-solid',
    ];
    const obsolete = [
      'src/assets/building-identity',
      'src/assets/solid-building',
      'src/assets/character-identity',
      'src/assets/solid-character',
      'src/assets/solid-face',
      'src/assets/vehicle-identity',
      'src/assets/solid-vehicle',
      'src/assets/contracts',
      'src/assets/projections',
      'src/assets/plant',
      'src/assets/platform',
      'src/assets/prop',
    ];
    for (const path of expected) expect(sourceExists(path), path).toBe(true);
    for (const path of obsolete) expect(sourceExists(path), path).toBe(false);
  });

  it('keeps Projection Studio stages dependent on catalog runtime adapters', () => {
    for (const file of [
      'experiments/projection-studio/src/raster-stage.ts',
      'experiments/projection-studio/src/three-stage.ts',
    ]) {
      const content = source(file);
      expect(content, file).not.toMatch(/(?:Character|Vehicle|Building)Animator/);
      expect(content, file).not.toMatch(/\.kind\s*[!=]==?\s*['"]/);
    }
  });

  it('requires every family material to publish generic drawing intent', () => {
    const blueprints = [
      createSolidCharacterBlueprint(createCharacterIdentity(4104)),
      createSolidBuildingBlueprint(createBuildingIdentity(4104)),
      createSolidVehicleBlueprint(createVehicleIdentity(5101)),
    ];
    for (const blueprint of blueprints) {
      expect(blueprint.materials.length).toBeGreaterThan(0);
      for (const material of blueprint.materials) {
        expect(material.drawing.application).toMatch(/^(paper|pigment|tint|flat|ink|wash|glaze)$/);
        expect(material.drawing.tone).toMatch(/^(black|hatch|scribble|stipple|light)$/);
        expect(material).not.toHaveProperty('role');
      }
    }
  });
});
