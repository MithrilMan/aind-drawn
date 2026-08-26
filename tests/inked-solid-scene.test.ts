import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INKED_SOLID_SCENE_PAPER,
  InkedSolidScenePass,
  SolidRig,
  createBuildingIdentity,
  createCharacterIdentity,
  createInkedSolidBlueprint,
  createSemanticSurface,
  createSolidBuildingBlueprint,
  createSolidBuildingInkStrokes,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
} from '../src/index.js';
import { InkedSolidCarrierOwnerKeys } from '../src/projections/inked-solid/runtime/carrier-owner-keys.js';

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
  it('keeps transparent parts out of the opaque carrier while preserving their strokes', () => {
    const solid = createSolidBuildingBlueprint(createBuildingIdentity(7_100));
    const transparentPart = solid.parts[0];
    if (transparentPart === undefined) throw new Error('Expected a building part');
    const transparentSurface = createSemanticSurface({
      id: transparentPart.surfaceId,
      color: [180, 220, 230],
      substance: 'glass',
      drawing: Object.freeze({
        application: 'glaze',
        drawing: Object.freeze({ value: 'paper', gesture: 'quiet' }),
      }),
      physical: Object.freeze({ opacity: 0.35 }),
    });
    const transparentSolid = Object.freeze({
      ...solid,
      surfaces: Object.freeze(solid.surfaces.map((surface) => (
        surface.id === transparentPart.surfaceId ? transparentSurface : surface
      ))),
    });
    const stroke = Object.freeze({
      id: 'glass-edge',
      partId: transparentPart.id,
      path: Object.freeze({
        type: 'part-local' as const,
        points: Object.freeze([
          Object.freeze([0, 0, 0] as const),
          Object.freeze([0.1, 0.1, 0] as const),
        ]),
      }),
      radius: 0.01,
    });
    const inked = createInkedSolidBlueprint(transparentSolid, {
      medium: 'ink',
      strokes: Object.freeze([stroke]),
    });
    const rig = new SolidRig(transparentSolid, { instanceId: 'building:transparent' });
    const pass = new InkedSolidScenePass(asWebGlRenderer(new RecordingRenderer()));
    const registration = pass.register({ instanceId: rig.instanceId, blueprint: inked, rig });

    expect(inked.carrierPartIds).not.toContain(transparentPart.id);
    const diagnostics = pass.getDiagnostics();
    expect(diagnostics.carrierParts).toBe(
      solid.parts.length - solid.parts
        .filter(({ surfaceId }) => surfaceId === transparentPart.surfaceId).length,
    );
    expect(diagnostics.semanticStrokeMeshes).toBeGreaterThan(0);

    registration.dispose();
    pass.dispose();
    rig.dispose();
  });

  it('allocates deterministic collision-free part owner keys', () => {
    const first = new InkedSolidCarrierOwnerKeys();
    const second = new InkedSolidCarrierOwnerKeys();
    const seeds = Array.from({ length: 1_024 }, (_, index) => (index * 47) - 313);
    const firstKeys = seeds.map((seed) => first.allocate(seed));
    const secondKeys = seeds.map((seed) => second.allocate(seed));
    expect(firstKeys).toEqual(secondKeys);
    expect(new Set(firstKeys).size).toBe(1_024);
    expect(firstKeys.every((key) => key > 0 && key < 1)).toBe(true);
    expect(() => first.allocate(0)).toThrow(/1024/u);
  });

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
    const revealValues: number[] = [];
    firstCharacter.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.name === '') {
        const geometry = object.geometry as THREE.BufferGeometry;
        const candidate = geometry.getAttribute('inkedStrokeProgress');
        if (candidate instanceof THREE.BufferAttribute) {
          for (let index = 0; index < candidate.count; index += 1) {
            revealValues.push(candidate.getX(index));
          }
        }
      }
    });
    expect(revealValues.length).toBeGreaterThan(0);
    expect(Math.min(...revealValues)).toBe(0);
    expect(Math.max(...revealValues)).toBe(1);
    expect(() => { firstRegistration.setStrokeReveal(0.45); }).not.toThrow();
    expect(() => { firstRegistration.setStrokeReveal(-0.01); })
      .toThrow(/between zero and one/u);

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
