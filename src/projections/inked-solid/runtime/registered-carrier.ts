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

type StageMaterials = Readonly<{
  albedo: THREE.Material;
  mark: THREE.Material;
  anchor: THREE.Material;
  normal: THREE.Material;
}>;

type ProxySet = Readonly<{
  albedo: THREE.Mesh;
  mark: THREE.Mesh;
  anchor: THREE.Mesh;
  normal: THREE.Mesh;
}>;

type PartRecord = Readonly<{
  source: THREE.Mesh;
  proxies: ProxySet;
  materials: InkedSolidPartMaterials;
}>;

type StrokeRecord = Readonly<{
  source: THREE.Mesh;
  visibilityOwner: THREE.Mesh;
  proxies: ProxySet;
  materials: InkedSolidStrokeMaterials;
}>;

export class InkedSolidCarrierScenes {
  public readonly albedo = new THREE.Scene();
  public readonly mark = new THREE.Scene();
  public readonly anchor = new THREE.Scene();
  public readonly normal = new THREE.Scene();

  public setAlbedoBackground(background: THREE.Scene['background']): void {
    this.albedo.background = background;
  }

  public clear(): void {
    this.albedo.clear();
    this.mark.clear();
    this.anchor.clear();
    this.normal.clear();
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

function syncProxySet(source: THREE.Mesh, proxies: ProxySet, visible: boolean): void {
  syncProxy(source, proxies.albedo, visible);
  syncProxy(source, proxies.mark, visible);
  syncProxy(source, proxies.anchor, visible);
  syncProxy(source, proxies.normal, visible);
}

export class RegisteredInkedSolidCarrier {
  public readonly partCount: number;
  public readonly strokeMeshCount: number;

  private readonly materialCache: InkedSolidCarrierMaterialCache;
  private readonly strokeRig: InkedSolidStrokeRig;
  private readonly parts: PartRecord[] = [];
  private readonly strokes: StrokeRecord[] = [];
  private readonly projectedAnchor = new THREE.Vector3();
  private readonly proxies: THREE.Mesh[] = [];
  private proxiesVisible = true;
  private disposed = false;

  public constructor(
    public readonly instanceId: AssetInstanceId,
    public readonly blueprint: InkedSolidBlueprint,
    public readonly rig: SolidRig,
    private readonly scenes: InkedSolidCarrierScenes,
    policySlot: number,
  ) {
    this.strokeRig = new InkedSolidStrokeRig(blueprint, rig);
    this.materialCache = new InkedSolidCarrierMaterialCache(policySlot);
    this.strokeRig.visible = false;
    try {
      const ownerKeys = new InkedSolidCarrierOwnerKeys();
      const materials = new Map(blueprint.solid.materials.map((material) => [material.id, material]));
      const marks = new Map(blueprint.viewMarks.map((mark) => [mark.materialId, mark]));
      for (const part of blueprint.solid.parts) {
        const source = rig.getPart(part.id);
        const material = materials.get(part.materialId);
        const mark = marks.get(part.materialId);
        if (source === null || material === undefined || mark === undefined) {
          throw new Error(`Cannot register incomplete inked-solid part ${part.id}`);
        }
        const stageMaterials = this.materialCache.part(part, material, mark);
        const contourOwner = material.drawing.application === 'ink' ? 0.5 : 1;
        stageMaterials.anchorData.set(
          0,
          0,
          ownerKeys.allocate(hashString(
            `${instanceId}:${blueprint.deposition.seed}:${part.id}`,
          )),
          contourOwner,
        );
        this.parts.push(Object.freeze({
          source,
          proxies: this.addProxies(source, stageMaterials),
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
            proxies: this.addProxies(source, stageMaterials),
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

  public sync(camera: THREE.Camera): void {
    this.assertAlive();
    if (!this.rig.root.visible) {
      if (this.proxiesVisible) {
        for (const record of this.parts) syncProxySet(record.source, record.proxies, false);
        for (const record of this.strokes) syncProxySet(record.source, record.proxies, false);
        this.proxiesVisible = false;
      }
      return;
    }
    this.proxiesVisible = true;
    this.rig.root.updateWorldMatrix(true, true);
    for (const record of this.parts) {
      const visible = visibleInHierarchy(record.source);
      syncProxySet(record.source, record.proxies, visible);
      this.projectedAnchor.setFromMatrixPosition(record.source.matrixWorld).project(camera);
      record.materials.anchorData.x = this.projectedAnchor.x * 0.5 + 0.5;
      record.materials.anchorData.y = this.projectedAnchor.y * 0.5 + 0.5;
    }
    for (const record of this.strokes) {
      syncProxySet(
        record.source,
        record.proxies,
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

  private addProxies(source: THREE.Mesh, materials: StageMaterials): ProxySet {
    const create = (material: THREE.Material, scene: THREE.Scene): THREE.Mesh => {
      const proxy = new THREE.Mesh(source.geometry, material);
      proxy.name = `inked-proxy:${this.instanceId}:${source.name}`;
      proxy.matrixAutoUpdate = false;
      proxy.frustumCulled = false;
      proxy.renderOrder = source.renderOrder;
      scene.add(proxy);
      this.proxies.push(proxy);
      return proxy;
    };
    return Object.freeze({
      albedo: create(materials.albedo, this.scenes.albedo),
      mark: create(materials.mark, this.scenes.mark),
      anchor: create(materials.anchor, this.scenes.anchor),
      normal: create(materials.normal, this.scenes.normal),
    });
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Registered inked-solid carrier has been disposed');
  }
}
