import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INKED_SOLID_SCENE_PAPER,
  InkedSolidScenePass,
  SolidRig,
  createBuildingIdentity,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
} from '../src/index.js';

class RecordingRenderer {
  public autoClear = true;
  public readonly xr = { enabled: true };
  public readonly shadowMap = { autoUpdate: true };
  public readonly calls: Readonly<{ scene: THREE.Scene; target: THREE.WebGLRenderTarget | null }>[] = [];
  private target: THREE.WebGLRenderTarget | null = null;

  public getRenderTarget(): THREE.WebGLRenderTarget | null {
    return this.target;
  }

  public setRenderTarget(target: THREE.WebGLRenderTarget | null): void {
    this.target = target;
  }

  public render(scene: THREE.Scene): void {
    this.calls.push(Object.freeze({ scene, target: this.target }));
  }
}

function asWebGlRenderer(renderer: RecordingRenderer): THREE.WebGLRenderer {
  return renderer as unknown as THREE.WebGLRenderer;
}

function containsStroke(root: THREE.Object3D): boolean {
  let found = false;
  root.traverse(({ name }) => {
    if (name.startsWith('stroke:')) found = true;
  });
  return found;
}

describe('multi-instance inked-solid scene rendering', () => {
  it('registers different families and repeated blueprints in one shared pass', () => {
    const characterSolid = createSolidCharacterBlueprint(createCharacterIdentity(7_101));
    const buildingSolid = createSolidBuildingBlueprint(createBuildingIdentity(7_102));
    const graphiteCharacter = createInkedSolidBlueprint(characterSolid, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(characterSolid),
    });
    const markerCharacter = createInkedSolidBlueprint(characterSolid, {
      medium: 'marker',
      strokes: createSolidCharacterInkStrokes(characterSolid),
    });
    const watercolorBuilding = createInkedSolidBlueprint(buildingSolid, {
      medium: 'watercolor',
      strokes: createSolidBuildingInkStrokes(buildingSolid),
    });
    const firstCharacter = new SolidRig(characterSolid, { instanceId: 'character:first' });
    const secondCharacter = new SolidRig(characterSolid, { instanceId: 'character:second' });
    const building = new SolidRig(buildingSolid, { instanceId: 'building:first' });
    secondCharacter.root.position.x = 2;
    building.root.position.x = -2;
    const scene = new THREE.Scene();
    scene.add(firstCharacter.root, secondCharacter.root, building.root);
    const unrelatedMaterial = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    const unrelatedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const unrelated = new THREE.Mesh(unrelatedGeometry, unrelatedMaterial);
    scene.add(unrelated);

    const renderer = new RecordingRenderer();
    const pass = new InkedSolidScenePass(asWebGlRenderer(renderer));
    const firstRegistration = pass.register({
      instanceId: firstCharacter.instanceId,
      blueprint: graphiteCharacter,
      rig: firstCharacter,
    });
    const secondRegistration = pass.register({
      instanceId: secondCharacter.instanceId,
      blueprint: markerCharacter,
      rig: secondCharacter,
    });
    const buildingRegistration = pass.register({
      instanceId: building.instanceId,
      blueprint: watercolorBuilding,
      rig: building,
    });

    const before = pass.getDiagnostics();
    expect(before.registeredInstances).toBe(3);
    expect(before.carrierParts).toBe(
      characterSolid.parts.length * 2 + buildingSolid.parts.length,
    );
    expect(before.semanticStrokeMeshes).toBeGreaterThan(0);
    expect(before.proxyMeshes).toBe(
      (before.carrierParts + before.semanticStrokeMeshes) * 4,
    );
    expect(before.passMaterials).toBeGreaterThan(0);
    expect(before.steadyStatePerMeshAllocations).toBe(0);
    expect(pass.paper).toEqual(DEFAULT_INKED_SOLID_SCENE_PAPER);
    expect(containsStroke(firstCharacter.root)).toBe(true);

    pass.setSize(640, 360, 1.5);
    pass.render(scene, new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100), 1.25);
    expect(renderer.calls).toHaveLength(5);
    expect(unrelated.material).toBe(unrelatedMaterial);

    firstRegistration.dispose();
    expect(containsStroke(firstCharacter.root)).toBe(false);
    secondRegistration.dispose();
    buildingRegistration.dispose();
    firstRegistration.dispose();
    expect(pass.getDiagnostics()).toMatchObject({
      registeredInstances: 0,
      carrierParts: 0,
      semanticStrokeMeshes: 0,
      proxyMeshes: 0,
      passMaterials: 0,
    });

    pass.dispose();
    firstCharacter.dispose();
    secondCharacter.dispose();
    building.dispose();
    unrelatedGeometry.dispose();
    unrelatedMaterial.dispose();
  });

  it('validates registration ownership and restores explicit depth-only scene state', () => {
    const solid = createSolidBuildingBlueprint(createBuildingIdentity(7_103));
    const inked = createInkedSolidBlueprint(solid, { medium: 'ink' });
    const rig = new SolidRig(solid, { instanceId: 'building:depth' });
    const renderer = new RecordingRenderer();
    const pass = new InkedSolidScenePass(asWebGlRenderer(renderer), {
      unregisteredOcclusion: 'depth-only',
    });
    expect(() => pass.register({ instanceId: 'wrong', blueprint: inked, rig }))
      .toThrow(/instanceId/u);
    const registration = pass.register({ instanceId: rig.instanceId, blueprint: inked, rig });
    expect(() => pass.register({ instanceId: rig.instanceId, blueprint: inked, rig }))
      .toThrow(/Duplicate/u);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x123456);
    scene.fog = new THREE.Fog(0xffffff, 1, 10);
    scene.add(rig.root);
    const camera = new THREE.PerspectiveCamera();
    const background = scene.background;
    const fog = scene.fog;

    pass.render(scene, camera, 0);
    expect(renderer.calls).toHaveLength(9);
    expect(pass.getDiagnostics().renderCalls).toBe(9);
    expect(scene.overrideMaterial).toBeNull();
    expect(scene.background).toBe(background);
    expect(scene.fog).toBe(fog);
    expect(renderer.autoClear).toBe(true);
    expect(renderer.xr.enabled).toBe(true);
    expect(renderer.shadowMap.autoUpdate).toBe(true);

    pass.dispose();
    registration.dispose();
    rig.dispose();
  });
});
