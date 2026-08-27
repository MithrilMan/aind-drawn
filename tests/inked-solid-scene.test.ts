import * as THREE from 'three';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_INKED_SOLID_SCENE_PAPER,
  INKED_SOLID_VISUALIZATION_IDS,
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
  inkedSolidVisualizationById,
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

function compositeMaterial(renderer: RecordingRenderer): THREE.ShaderMaterial {
  const scene = renderer.calls.at(-1)?.scene;
  if (scene === undefined) throw new Error('Expected a composite scene');
  let result: THREE.ShaderMaterial | undefined;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    if (object.material instanceof THREE.ShaderMaterial
      && object.material.uniforms.visualizationMode !== undefined) {
      result = object.material;
    }
  });
  if (result === undefined) throw new Error('Expected an inked-solid composite material');
  return result;
}

describe('multi-instance inked-solid scene rendering', () => {
  it('compiles distinct deterministic scene visualizations into the compositor', () => {
    const policies = INKED_SOLID_VISUALIZATION_IDS.map(inkedSolidVisualizationById);
    expect(new Set(policies.map((policy) => JSON.stringify(policy))).size).toBe(policies.length);
    expect(policies.every((policy) => Object.isFrozen(policy))).toBe(true);
    expect(policies.every((policy) => Object.isFrozen(policy.cutShadowOffset))).toBe(true);
    expect(inkedSolidVisualizationById('sepia-graphite')).toMatchObject({
      colorModel: 'sepia',
      contourBoost: 0.38,
      tornEdgeStrength: 0,
    });
    expect(inkedSolidVisualizationById('paper-collage')).toMatchObject({
      colorModel: 'collage',
      posterizeSteps: 8,
      tornEdgeStrength: 0.24,
      cutShadowStrength: 0.5,
    });

    const expectedModes = [0, 1, 2];
    for (const [index, visualization] of INKED_SOLID_VISUALIZATION_IDS.entries()) {
      const renderer = new RecordingRenderer();
      const pass = new InkedSolidScenePass(asWebGlRenderer(renderer), { visualization });
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100);
      camera.updateProjectionMatrix();
      pass.render(scene, camera, 0);
      const material = compositeMaterial(renderer);
      expect(pass.visualization).toBe(inkedSolidVisualizationById(visualization));
      expect(material.uniforms.visualizationMode?.value).toBe(expectedModes[index]);
      expect(material.uniforms.visualizationContourBoost?.value)
        .toBe(pass.visualization.contourBoost);
      expect(material.uniforms.visualizationTornEdgeStrength?.value)
        .toBe(pass.visualization.tornEdgeStrength);
      pass.dispose();
    }
    expect(() => inkedSolidVisualizationById('neon' as never)).toThrow(/Unknown/u);
  });

  it('can re-art-direct a projection without breaking the exact solid-rig contract', () => {
    const solid = createSolidCharacterBlueprint(createCharacterIdentity(7_098));
    const inked = createInkedSolidBlueprint(solid, {
      medium: 'ink',
      artDirection: 'cut-paper',
      viewMarks: false,
    });
    const rig = new SolidRig(solid, { instanceId: 'character:cut-paper' });
    const pass = new InkedSolidScenePass(asWebGlRenderer(new RecordingRenderer()), {
      visualization: 'paper-collage',
    });

    expect(inked.solid).toBe(solid);
    expect(inked.appearance).not.toBe(solid.appearance);
    expect(inked.appearance.artDirection.id).toBe('cut-paper');
    expect(inked.viewMarks.every(({ style }) => style === 'none')).toBe(true);
    const registration = pass.register({
      instanceId: rig.instanceId,
      blueprint: inked,
      rig,
    });
    expect(pass.getDiagnostics().registeredInstances).toBe(1);

    registration.dispose();
    pass.dispose();
    rig.dispose();
  });

  it('skips carrier synchronization and submission outside the camera frustum', () => {
    const solid = createSolidCharacterBlueprint(createCharacterIdentity(7_099));
    const inked = createInkedSolidBlueprint(solid, {
      medium: 'graphite',
      strokes: createSolidCharacterInkStrokes(solid),
    });
    const visibleRig = new SolidRig(solid, { instanceId: 'character:visible' });
    const hiddenRig = new SolidRig(solid, { instanceId: 'character:offscreen' });
    hiddenRig.root.position.x = 100;
    const scene = new THREE.Scene();
    scene.add(visibleRig.root, hiddenRig.root);
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 200);
    camera.position.set(0, 0, 10);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    const renderer = new RecordingRenderer();
    const pass = new InkedSolidScenePass(asWebGlRenderer(renderer));
    const visibleRegistration = pass.register({
      instanceId: visibleRig.instanceId,
      blueprint: inked,
      rig: visibleRig,
    });
    const hiddenRegistration = pass.register({
      instanceId: hiddenRig.instanceId,
      blueprint: inked,
      rig: hiddenRig,
    });

    pass.render(scene, camera, 0);
    const firstCarrierScene = renderer.calls[0]?.scene;
    if (firstCarrierScene === undefined) throw new Error('Expected the albedo carrier pass');
    const offscreenProxies = firstCarrierScene.children.filter(({ name }) => (
      name.includes('character:offscreen')
    ));
    expect(offscreenProxies.length).toBeGreaterThan(0);
    expect(offscreenProxies.every(({ visible }) => !visible)).toBe(true);
    expect(pass.getDiagnostics()).toMatchObject({
      registeredInstances: 2,
      visibleInstances: 1,
      submittedProxyMeshes: pass.getDiagnostics().proxyMeshes / 2,
      compilation: {
        artifacts: 1,
        cacheHits: 1,
        cacheMisses: 1,
      },
    });

    hiddenRig.root.position.x = 1;
    pass.render(scene, camera, 1 / 60);
    expect(offscreenProxies.some(({ visible }) => visible)).toBe(true);
    expect(pass.getDiagnostics().visibleInstances).toBe(2);
    expect(pass.getDiagnostics().submittedProxyMeshes).toBe(pass.getDiagnostics().proxyMeshes);

    hiddenRegistration.dispose();
    visibleRegistration.dispose();
    pass.dispose();
    hiddenRig.dispose();
    visibleRig.dispose();
  });

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
    const registration = pass.register({
      instanceId: rig.instanceId,
      blueprint: inked,
      rig,
      geometryUsage: 'dynamic',
    });

    expect(inked.carrierPartIds).not.toContain(transparentPart.id);
    const diagnostics = pass.getDiagnostics();
    expect(diagnostics.carrierParts).toBe(
      solid.parts.length - solid.parts
        .filter(({ surfaceId }) => surfaceId === transparentPart.surfaceId).length,
    );
    expect(diagnostics.semanticStrokeMeshes).toBeGreaterThan(0);
    expect(diagnostics.compiledInstances).toBe(0);
    expect(diagnostics.dynamicInstances).toBe(1);
    expect(diagnostics.proxyMeshes).toBe(
      diagnostics.carrierParts + diagnostics.semanticStrokeMeshes,
    );

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
    expect(before.proxyMeshes).toBe(3);
    expect(before.compiledInstances).toBe(3);
    expect(before.dynamicInstances).toBe(0);
    expect(before.compilation).toMatchObject({
      artifacts: 3,
      compiledMeshes: 3,
      cacheMisses: 3,
    });
    expect(before.passMaterials).toBeGreaterThan(0);
    expect(before.steadyStatePerMeshAllocations).toBe(0);
    expect(pass.paper).toEqual(DEFAULT_INKED_SOLID_SCENE_PAPER);
    expect(containsStroke(firstCharacter.root)).toBe(false);
    expect(() => { firstRegistration.setStrokeReveal(0.45); }).not.toThrow();
    expect(() => { firstRegistration.setStrokeReveal(-0.01); })
      .toThrow(/between zero and one/u);

    pass.setSize(640, 360, 1.5);
    pass.render(scene, new THREE.PerspectiveCamera(30, 16 / 9, 0.1, 100), 1.25);
    expect(renderer.calls).toHaveLength(2);
    const compiledRevealValues: number[] = [];
    renderer.calls[0]?.scene.traverse((object) => {
      if (!(object instanceof THREE.SkinnedMesh)) return;
      const geometry = object.geometry as THREE.BufferGeometry;
      const candidate = geometry.getAttribute('inkedRevealProgress');
      if (!(candidate instanceof THREE.BufferAttribute)) return;
      for (let index = 0; index < candidate.count; index += 1) {
        const value = candidate.getX(index);
        if (value >= 0) compiledRevealValues.push(value);
      }
    });
    expect(compiledRevealValues.length).toBeGreaterThan(0);
    expect(Math.min(...compiledRevealValues)).toBe(0);
    expect(Math.max(...compiledRevealValues)).toBe(1);
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
    expect(renderer.calls).toHaveLength(3);
    expect(pass.getDiagnostics().renderCalls).toBe(3);
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
