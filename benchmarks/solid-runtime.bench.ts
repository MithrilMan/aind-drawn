import { afterAll, bench, describe } from 'vitest';

import {
  SolidRig,
  SolidSceneResourceCache,
  SolidSurfaceResourceCache,
  createCharacterIdentity,
  createSolidCharacterBlueprint,
} from '../src/index.js';

const INSTANCE_COUNT = 16;
const blueprint = createSolidCharacterBlueprint(createCharacterIdentity(8_106), {
  artDirection: 'storybook',
});

function constructRigs(cache?: SolidSurfaceResourceCache): SolidRig[] {
  return Array.from({ length: INSTANCE_COUNT }, (_, index) => new SolidRig(blueprint, {
    instanceId: `solid-benchmark:${index}`,
    ...(cache === undefined ? {} : { surfaceCache: cache }),
  }));
}

function disposeRigs(rigs: readonly SolidRig[]): void {
  for (const rig of rigs) rig.dispose();
}

function constructCompiledRigs(resources: SolidSceneResourceCache): SolidRig[] {
  return Array.from({ length: INSTANCE_COUNT }, (_, index) => new SolidRig(blueprint, {
    instanceId: `solid-compiled-benchmark:${index}`,
    resources,
  }));
}

describe('repeated solid rig construction', () => {
  bench('allocates independent physical surface resources', () => {
    disposeRigs(constructRigs());
  });

  bench('shares physical surface resources across concurrent scene rigs', () => {
    const cache = new SolidSurfaceResourceCache();
    disposeRigs(constructRigs(cache));
    cache.dispose();
  });

  const compiledResources = new SolidSceneResourceCache();
  bench('reuses compiled geometry and surfaces from scene resources', () => {
    disposeRigs(constructCompiledRigs(compiledResources));
  });

  const warmCache = new SolidSurfaceResourceCache();
  const resident = new SolidRig(blueprint, {
    instanceId: 'solid-benchmark:resident',
    surfaceCache: warmCache,
  });
  bench('spawns into a scene with resident surface resources', () => {
    disposeRigs(constructRigs(warmCache));
  });

  afterAll(() => {
    resident.dispose();
    warmCache.dispose();
    compiledResources.dispose();
  });
});
