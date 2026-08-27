import * as THREE from 'three';

import type { AssetInstanceId } from '../../../contracts/asset-instance.js';
import { hashString } from '../../../core/random.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';
import type { InkedSolidBlueprint } from '../blueprint.js';
import { InkedSolidStrokeRig } from './stroke-rig.js';
import {
  InkedSolidCarrierMaterialCache,
  type InkedSolidPartMaterials,
  type InkedSolidStrokeMaterials,
} from './carrier-materials.js';
import { InkedSolidCarrierOwnerKeys } from './carrier-owner-keys.js';

type PartRecord = Readonly<{
  source: THREE.Mesh;
  proxy: THREE.Mesh;
  materials: InkedSolidPartMaterials;
}>;

type StrokeRecord = Readonly<{
  source: THREE.Mesh;
  visibilityOwner: THREE.Mesh;
  proxy: THREE.Mesh;
  materials: InkedSolidStrokeMaterials;
}>;

export class InkedSolidCarrierScenes {
  public readonly carrier = new THREE.Scene();

  public setBackground(background: THREE.Scene['background']): void {
    this.carrier.background = background;
  }

  public clear(): void {
    this.carrier.clear();
  }
}

function visibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function syncProxy(source: THREE.Mesh, proxy: THREE.Mesh, visible: boolean): void {
  proxy.visible = visible;
  proxy.matrix.copy(source.matrixWorld);
  proxy.matrixWorld.copy(source.matrixWorld);
}

export class RegisteredInkedSolidCarrier {
  public readonly compiled = false;
  public readonly partCount: number;
  public readonly strokeMeshCount: number;

  private readonly materialCache: InkedSolidCarrierMaterialCache;
  private readonly strokeRig: InkedSolidStrokeRig;
  private readonly parts: PartRecord[] = [];
  private readonly strokes: StrokeRecord[] = [];
  private readonly proxies: THREE.Mesh[] = [];
  private readonly localBounds: THREE.Box3;
  private readonly worldBounds = new THREE.Box3();
  private proxiesVisible = true;
  private visibleLastSync = true;
  private disposed = false;

  public constructor(
    public readonly instanceId: AssetInstanceId,
    public readonly blueprint: InkedSolidBlueprint,
    public readonly rig: SolidRig,
    private readonly scenes: InkedSolidCarrierScenes,
    policySlot: number,
  ) {
    const bounds = blueprint.solid.bounds;
    this.localBounds = new THREE.Box3(
      new THREE.Vector3(...bounds.minimum),
      new THREE.Vector3(...bounds.maximum),
    );
    const extent = this.localBounds.getSize(new THREE.Vector3());
    const animationMargin = Math.max(extent.x, extent.y, extent.z) * 0.18;
    this.localBounds.expandByScalar(animationMargin);
    this.strokeRig = new InkedSolidStrokeRig(blueprint, rig);
    this.materialCache = new InkedSolidCarrierMaterialCache(policySlot, blueprint.appearance);
    this.strokeRig.visible = false;
    try {
      const ownerKeys = new InkedSolidCarrierOwnerKeys();
      const surfaces = new Map(blueprint.solid.surfaces.map((surface) => [surface.id, surface]));
      const marks = new Map(blueprint.viewMarks.map((mark) => [
        `${mark.semanticPartId}:${mark.surfaceId}`,
        mark,
      ]));
      const carrierPartIds = new Set(blueprint.carrierPartIds);
      for (const part of blueprint.solid.parts) {
        if (!carrierPartIds.has(part.id)) continue;
        const source = rig.getPart(part.id);
        const surface = surfaces.get(part.surfaceId);
        const mark = marks.get(`${part.semanticPartId}:${part.surfaceId}`);
        if (source === null || surface === undefined || mark === undefined) {
          throw new Error(`Cannot register incomplete inked-solid part ${part.id}`);
        }
        const stageMaterials = this.materialCache.part(
          part,
          surface,
          mark,
          ownerKeys.allocate(hashString(
            `${instanceId}:${blueprint.deposition.seed}:${part.id}`,
          )),
        );
        this.parts.push(Object.freeze({
          source,
          proxy: this.addProxy(source, stageMaterials.material),
          materials: stageMaterials,
        }));
      }
      this.strokeRig.forEachRuntimeStroke((stroke, meshes) => {
        const visibilityOwner = rig.getPart(stroke.partId);
        if (visibilityOwner === null) {
          throw new Error(`Cannot register stroke with missing owner ${stroke.partId}`);
        }
        const stageMaterials = this.materialCache.stroke(stroke);
        for (const source of meshes) {
          this.strokes.push(Object.freeze({
            source,
            visibilityOwner,
            proxy: this.addProxy(source, stageMaterials.material),
            materials: stageMaterials,
          }));
        }
      });
      this.partCount = this.parts.length;
      this.strokeMeshCount = this.strokes.length;
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  public get materialCount(): number {
    return this.materialCache.size;
  }

  public get proxyMeshCount(): number {
    return this.proxies.length;
  }

  public get submittedProxyMeshCount(): number {
    return this.proxies.reduce((count, proxy) => count + (proxy.visible ? 1 : 0), 0);
  }

  public get wasVisibleLastSync(): boolean {
    return this.visibleLastSync;
  }

  public setStrokeReveal(progress: number): void {
    this.assertAlive();
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError('Stroke reveal progress must be between zero and one');
    }
    for (const record of this.strokes) record.materials.revealProgress.value = progress;
  }

  public sync(_camera: THREE.Camera, frustum: THREE.Frustum): void {
    this.assertAlive();
    if (!visibleInHierarchy(this.rig.root)) {
      this.hideProxies();
      return;
    }
    this.rig.root.updateWorldMatrix(true, false);
    this.worldBounds.copy(this.localBounds).applyMatrix4(this.rig.root.matrixWorld);
    if (!frustum.intersectsBox(this.worldBounds)) {
      this.hideProxies();
      return;
    }
    this.visibleLastSync = true;
    this.proxiesVisible = true;
    this.rig.root.updateWorldMatrix(false, true);
    for (const record of this.parts) {
      const visible = visibleInHierarchy(record.source);
      syncProxy(record.source, record.proxy, visible);
    }
    for (const record of this.strokes) {
      syncProxy(
        record.source,
        record.proxy,
        visibleInHierarchy(record.visibilityOwner),
      );
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const proxy of this.proxies) proxy.removeFromParent();
    this.proxies.length = 0;
    this.parts.length = 0;
    this.strokes.length = 0;
    this.materialCache.dispose();
    this.strokeRig.dispose();
  }

  private addProxy(source: THREE.Mesh, material: THREE.Material): THREE.Mesh {
    const proxy = new THREE.Mesh(source.geometry, material);
    proxy.name = `inked-proxy:${this.instanceId}:${source.name}`;
    proxy.matrixAutoUpdate = false;
    proxy.frustumCulled = true;
    proxy.renderOrder = source.renderOrder;
    this.scenes.carrier.add(proxy);
    this.proxies.push(proxy);
    return proxy;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Registered inked-solid carrier has been disposed');
  }

  private hideProxies(): void {
    this.visibleLastSync = false;
    if (!this.proxiesVisible) return;
    for (const record of this.parts) syncProxy(record.source, record.proxy, false);
    for (const record of this.strokes) syncProxy(record.source, record.proxy, false);
    this.proxiesVisible = false;
  }
}
