import * as THREE from 'three';
import { afterAll, bench, describe } from 'vitest';

import {
  MEDIUM_IDS,
  InkedSolidScenePass,
  SolidRig,
  SolidSurfaceResourceCache,
  createBuildingIdentity,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
} from '../src/index.js';

class CountingRenderer {
  public autoClear = true;
  public readonly xr = { enabled: false };
  public readonly shadowMap = { autoUpdate: true };
  public renderCalls = 0;
  private target: THREE.WebGLRenderTarget | null = null;

  public getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }

  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.target = target;
  }

  public render(): void {
    this.renderCalls += 1;
  }
}

const INSTANCE_COUNT = 48;
const renderer = new CountingRenderer();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 16 / 9, 0.1, 200);
camera.position.set(0, 4, 28);
camera.lookAt(0, 2, 0);
camera.updateProjectionMatrix();
const pass = new InkedSolidScenePass(renderer as unknown as THREE.WebGLRenderer);
pass.setSize(1280, 720, 1);

const characterSolid = createSolidCharacterBlueprint(createCharacterIdentity(8_101));
const buildingSolid = createSolidBuildingBlueprint(createBuildingIdentity(8_102));
const characterStrokes = createSolidCharacterInkStrokes(characterSolid);
const buildingStrokes = createSolidBuildingInkStrokes(buildingSolid);
const rigs: SolidRig[] = [];
const surfaceCache = new SolidSurfaceResourceCache();

for (let index = 0; index < INSTANCE_COUNT; index += 1) {
  const solid = index % 2 === 0 ? characterSolid : buildingSolid;
  const strokes = index % 2 === 0 ? characterStrokes : buildingStrokes;
  const rig = new SolidRig(solid, {
    instanceId: `benchmark:${index}`,
    surfaceCache,
  });
  rig.root.position.set((index % 8) * 2.5 - 8.75, Math.floor(index / 8) * 0.15, 0);
  rigs.push(rig);
  scene.add(rig.root);
  pass.register({
    instanceId: rig.instanceId,
    blueprint: createInkedSolidBlueprint(solid, {
      medium: MEDIUM_IDS[index % MEDIUM_IDS.length] ?? 'graphite',
      strokes,
    }),
    rig,
  });
}

const diagnostics = pass.getDiagnostics();
console.info('Inked-solid benchmark configuration', {
  instances: diagnostics.registeredInstances,
  carrierParts: diagnostics.carrierParts,
  semanticStrokeMeshes: diagnostics.semanticStrokeMeshes,
  drawCallsPerFrame: diagnostics.renderCalls,
  renderTargets: diagnostics.renderTargets,
  steadyStatePerMeshAllocations: diagnostics.steadyStatePerMeshAllocations,
  surfaceResources: surfaceCache.getDiagnostics(),
});

let elapsedSeconds = 0;

describe('multi-instance inked-solid scene pass', () => {
  bench('renders 48 animated instances across six media', () => {
    elapsedSeconds += 1 / 60;
    for (let index = 0; index < rigs.length; index += 1) {
      const rig = rigs[index];
      if (rig !== undefined) rig.root.rotation.y = elapsedSeconds * (0.08 + index * 0.001);
    }
    pass.render(scene, camera, elapsedSeconds);
  });
});

afterAll(() => {
  pass.dispose();
  for (const rig of rigs) rig.dispose();
  surfaceCache.dispose();
});
