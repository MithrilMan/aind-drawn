import { readFileSync } from 'node:fs';
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

describe('architectural boundaries', () => {
  it('keeps the inked-solid medium compiler free of family vocabulary', () => {
    const files = [
      'src/assets/inked-solid/medium-projection.ts',
      'src/assets/inked-solid/projection-provider.ts',
      'src/assets/inked-solid/projection-providers/graphite.ts',
      'src/assets/inked-solid/projection-providers/ink.ts',
      'src/assets/inked-solid/projection-providers/watercolor.ts',
      'src/assets/inked-solid/projection-providers/oil.ts',
      'src/assets/inked-solid/projection-providers/chalk.ts',
      'src/assets/inked-solid/projection-providers/marker.ts',
    ];
    const familyVocabulary = /\b(character|building|vehicle|face|hair|eye|mouth|roof|wall|door|window|wheel|tyre)\b/i;
    for (const file of files) expect(source(file), file).not.toMatch(familyVocabulary);
  });

  it('keeps shared blueprint and rig contracts free of family imports', () => {
    const files = [
      'src/assets/types.ts',
      'src/assets/solid-types.ts',
      'src/runtime/sprite-rig.ts',
      'src/runtime/solid-rig.ts',
      'src/runtime/inked-solid-pass.ts',
    ];
    const familyImport = /from ['"][^'"]*(character|building|vehicle|solid-face)[^'"]*['"]/i;
    for (const file of files) expect(source(file), file).not.toMatch(familyImport);
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
