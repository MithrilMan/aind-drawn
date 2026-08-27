import * as THREE from 'three';

import type { AssetInstanceId } from '../../../contracts/asset-instance.js';
import { hashString } from '../../../core/random.js';
import { PAPER_RGB } from '../../../core/sketch.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';
import type { InkedSolidBlueprint } from '../blueprint.js';
import type { InkedSolidPaperPolicy } from '../contracts.js';
import {
  inkedSolidVisualizationById,
  type InkedSolidVisualizationId,
  type InkedSolidVisualizationPolicy,
} from '../visualization.js';
import { InkedSolidCompositor } from './compositor.js';
import {
  InkedSolidCarrierScenes,
  RegisteredInkedSolidCarrier,
} from './registered-carrier.js';
import {
  INKED_SOLID_POLICY_CAPACITY,
  InkedSolidPolicyTexture,
} from './policy-texture.js';
import { InkedSolidRenderTargets } from './render-targets.js';

export type InkedSolidUnregisteredOcclusion = 'exclude' | 'depth-only';

export type InkedSolidScenePassOptions = Readonly<{
  paper?: InkedSolidPaperPolicy;
  visualization?: InkedSolidVisualizationId;
  unregisteredOcclusion?: InkedSolidUnregisteredOcclusion;
}>;

export type InkedSolidSceneRegistrationOptions = Readonly<{
  instanceId: AssetInstanceId;
  blueprint: InkedSolidBlueprint;
  rig: SolidRig;
}>;

export type InkedSolidSceneRegistration = Readonly<{
  instanceId: AssetInstanceId;
  setStrokeReveal: (progress: number) => void;
  dispose: () => void;
}>;

export type InkedSolidSceneDiagnostics = Readonly<{
  registeredInstances: number;
  visibleInstances: number;
  carrierParts: number;
  semanticStrokeMeshes: number;
  proxyMeshes: number;
  submittedProxyMeshes: number;
  passMaterials: number;
  renderTargets: 4;
  renderCalls: number;
  steadyStatePerMeshAllocations: 0;
}>;

export const DEFAULT_INKED_SOLID_SCENE_PAPER: InkedSolidPaperPolicy = Object.freeze({
  color: Object.freeze([...PAPER_RGB] as [number, number, number]),
  grainStrength: 0.025,
  seed: hashString('inked-solid:scene-paper'),
});

type RegistrationRecord = Readonly<{
  slot: number;
  carrier: RegisteredInkedSolidCarrier;
  handle: RegistrationHandle;
}>;

class RegistrationHandle implements InkedSolidSceneRegistration {
  private active = true;

  public constructor(
    public readonly instanceId: AssetInstanceId,
    public readonly setStrokeReveal: (progress: number) => void,
    private readonly release: () => void,
  ) {}

  public dispose = (): void => {
    if (!this.active) return;
    this.active = false;
    this.release();
  };

  public invalidate(): void {
    this.active = false;
  }
}

function resolvePaper(policy: InkedSolidPaperPolicy | undefined): InkedSolidPaperPolicy {
  const paper = policy ?? DEFAULT_INKED_SOLID_SCENE_PAPER;
  if (paper.color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) {
    throw new RangeError('Scene paper color channels must be between zero and 255');
  }
  if (!Number.isFinite(paper.grainStrength)
    || paper.grainStrength < 0
    || paper.grainStrength > 1) {
    throw new RangeError('Scene paper grain strength must be between zero and one');
  }
  if (!Number.isFinite(paper.seed)) throw new RangeError('Scene paper seed must be finite');
  return Object.freeze({
    color: Object.freeze([...paper.color] as [number, number, number]),
    grainStrength: paper.grainStrength,
    seed: paper.seed,
  });
}

/**
 * Scene-level Doodle 3D service. Registration compiles immutable blueprints
 * into reusable carrier metadata and pass materials; rendering only updates
 * world matrices and preallocated uniforms before drawing the shared G-buffer.
 */
export class InkedSolidScenePass {
  public readonly paper: InkedSolidPaperPolicy;
  public readonly visualization: InkedSolidVisualizationPolicy;
  public readonly unregisteredOcclusion: InkedSolidUnregisteredOcclusion;

  private readonly targets = new InkedSolidRenderTargets();
  private readonly policies = new InkedSolidPolicyTexture();
  private readonly carrierScenes = new InkedSolidCarrierScenes();
  private readonly compositor: InkedSolidCompositor;
  private readonly registrations = new Map<AssetInstanceId, RegistrationRecord>();
  private readonly occupiedSlots = new Uint8Array(INKED_SOLID_POLICY_CAPACITY);
  private readonly viewProjection = new THREE.Matrix4();
  private readonly viewFrustum = new THREE.Frustum();
  private readonly depthOnlyMaterial = new THREE.MeshDepthMaterial({
    depthPacking: THREE.BasicDepthPacking,
  });
  private disposed = false;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    options: InkedSolidScenePassOptions = {},
  ) {
    this.paper = resolvePaper(options.paper);
    this.visualization = inkedSolidVisualizationById(options.visualization ?? 'natural');
    this.unregisteredOcclusion = options.unregisteredOcclusion ?? 'exclude';
    this.depthOnlyMaterial.colorWrite = false;
    this.compositor = new InkedSolidCompositor(
      this.targets,
      this.policies,
      this.paper,
      this.visualization,
    );
  }

  public register(options: InkedSolidSceneRegistrationOptions): InkedSolidSceneRegistration {
    this.assertAlive();
    const { instanceId, blueprint, rig } = options;
    if (instanceId !== rig.instanceId) {
      throw new Error('Inked-solid registration instanceId must match its SolidRig');
    }
    if (rig.blueprint !== blueprint.solid) {
      throw new Error('Inked-solid registration requires the exact wrapped solid blueprint');
    }
    if (this.registrations.has(instanceId)) {
      throw new Error(`Duplicate inked-solid instance registration: ${instanceId}`);
    }
    const slot = this.claimPolicySlot();
    this.policies.write(slot, blueprint);
    try {
      const carrier = new RegisteredInkedSolidCarrier(
        instanceId,
        blueprint,
        rig,
        this.carrierScenes,
        slot,
      );
      const handle = new RegistrationHandle(
        instanceId,
        (progress) => { carrier.setStrokeReveal(progress); },
        () => { this.unregister(instanceId); },
      );
      this.registrations.set(instanceId, Object.freeze({ slot, carrier, handle }));
      return handle;
    } catch (error) {
      this.releasePolicySlot(slot);
      throw error;
    }
  }

  public setSize(width: number, height: number, pixelRatio = 1): void {
    this.assertAlive();
    if (![width, height, pixelRatio].every((value) => Number.isFinite(value) && value > 0)) {
      throw new RangeError('Inked-solid pass size and pixel ratio must be positive finite numbers');
    }
    this.targets.setSize(width, height, pixelRatio);
    this.compositor.setSize(width, height, pixelRatio);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera, elapsedSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(elapsedSeconds)) throw new RangeError('elapsedSeconds must be finite');
    const previousTarget = this.renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousAutoClear = this.renderer.autoClear;
    const previousXrEnabled = this.renderer.xr.enabled;
    const previousShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;

    camera.updateMatrixWorld(true);
    this.viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection);
    for (const { carrier } of this.registrations.values()) {
      carrier.sync(camera, this.viewFrustum);
    }
    this.carrierScenes.setAlbedoBackground(previousBackground);

    try {
      this.renderer.xr.enabled = false;
      this.renderer.shadowMap.autoUpdate = false;
      this.renderGBuffer(scene, camera, this.carrierScenes.albedo, this.targets.albedo);
      this.renderGBuffer(scene, camera, this.carrierScenes.mark, this.targets.mark);
      this.renderGBuffer(scene, camera, this.carrierScenes.anchor, this.targets.anchor);
      this.renderGBuffer(scene, camera, this.carrierScenes.normal, this.targets.normal);
      this.renderer.autoClear = true;
      this.renderer.setRenderTarget(previousTarget);
      this.compositor.render(this.renderer, camera, elapsedSeconds);
    } finally {
      scene.overrideMaterial = previousOverride;
      scene.background = previousBackground;
      scene.fog = previousFog;
      this.renderer.autoClear = previousAutoClear;
      this.renderer.xr.enabled = previousXrEnabled;
      this.renderer.shadowMap.autoUpdate = previousShadowAutoUpdate;
      this.renderer.setRenderTarget(previousTarget);
    }
  }

  public getDiagnostics(): InkedSolidSceneDiagnostics {
    let carrierParts = 0;
    let semanticStrokeMeshes = 0;
    let proxyMeshes = 0;
    let visibleInstances = 0;
    let submittedProxyMeshes = 0;
    let passMaterials = 0;
    for (const { carrier } of this.registrations.values()) {
      carrierParts += carrier.partCount;
      semanticStrokeMeshes += carrier.strokeMeshCount;
      proxyMeshes += carrier.proxyMeshCount;
      if (carrier.wasVisibleLastSync) {
        visibleInstances += 1;
        submittedProxyMeshes += carrier.proxyMeshCount;
      }
      passMaterials += carrier.materialCount;
    }
    return Object.freeze({
      registeredInstances: this.registrations.size,
      visibleInstances,
      carrierParts,
      semanticStrokeMeshes,
      proxyMeshes,
      submittedProxyMeshes,
      passMaterials,
      renderTargets: 4,
      renderCalls: this.unregisteredOcclusion === 'depth-only' ? 9 : 5,
      steadyStatePerMeshAllocations: 0,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { carrier, handle } of this.registrations.values()) {
      handle.invalidate();
      carrier.dispose();
    }
    this.registrations.clear();
    this.carrierScenes.clear();
    this.targets.dispose();
    this.policies.dispose();
    this.compositor.dispose();
    this.depthOnlyMaterial.dispose();
    this.occupiedSlots.fill(0);
  }

  private renderGBuffer(
    sourceScene: THREE.Scene,
    camera: THREE.Camera,
    carrierScene: THREE.Scene,
    target: THREE.WebGLRenderTarget,
  ): void {
    this.renderer.setRenderTarget(target);
    this.renderer.autoClear = true;
    if (this.unregisteredOcclusion === 'depth-only') {
      sourceScene.overrideMaterial = this.depthOnlyMaterial;
      sourceScene.background = null;
      sourceScene.fog = null;
      this.renderer.render(sourceScene, camera);
      this.renderer.autoClear = false;
    }
    this.renderer.render(carrierScene, camera);
  }

  private unregister(instanceId: AssetInstanceId): void {
    const record = this.registrations.get(instanceId);
    if (record === undefined) return;
    this.registrations.delete(instanceId);
    record.carrier.dispose();
    this.releasePolicySlot(record.slot);
  }

  private claimPolicySlot(): number {
    for (let slot = 0; slot < this.occupiedSlots.length; slot += 1) {
      if (this.occupiedSlots[slot] === 0) {
        this.occupiedSlots[slot] = 1;
        return slot;
      }
    }
    throw new RangeError(
      `Inked-solid scene supports at most ${INKED_SOLID_POLICY_CAPACITY} registered instances`,
    );
  }

  private releasePolicySlot(slot: number): void {
    this.occupiedSlots[slot] = 0;
    this.policies.clear(slot);
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('InkedSolidScenePass has been disposed');
  }
}
