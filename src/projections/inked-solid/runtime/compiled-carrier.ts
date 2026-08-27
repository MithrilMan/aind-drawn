import * as THREE from 'three';

import {
  resolveSemanticSurface,
} from '../../../appearance/art-direction.js';
import type { AssetInstanceId } from '../../../contracts/asset-instance.js';
import type { SolidPartDefinition } from '../../../contracts/solid-asset.js';
import { hashString } from '../../../core/random.js';
import type { SolidRig } from '../../../runtime/solid-rig.js';
import type { InkedSolidBlueprint } from '../blueprint.js';
import type { InkedSolidStrokeSpec, InkedSolidViewMarkPolicy } from '../contracts.js';
import { InkedSolidCarrierOwnerKeys } from './carrier-owner-keys.js';
import {
  inkedSolidCollageMaterialClass,
  packInkedSolidMarkScale,
  type InkedSolidCollageMaterialClass,
} from './collage-material-class.js';
import { normalizedInkedSolidSeed } from './policy-texture.js';
import type { InkedSolidCarrierScenes } from './registered-carrier.js';
import { InkedSolidStrokeRig } from './stroke-rig.js';
import { inkedSolidSurfaceFlow } from './surface-flow.js';

export const INKED_SOLID_CARRIER_COMPILER_VERSION = 3 as const;

const MARK_STYLE_MODE = Object.freeze({
  none: 0,
  hatch: 1,
  crosshatch: 2,
  scribble: 3,
  stipple: 4,
  wash: 5,
  bristle: 6,
  marker: 7,
  solid: 8,
} as const);

const MARK_STYLE_DIVISOR = 9;
// Keep the hidden transform invertible: the shader derives a normal matrix from
// every bone, including bones whose vertices are clipped outside the viewport.
const HIDDEN_MATRIX = new THREE.Matrix4().makeTranslation(1e6, 1e6, 1e6);

type CarrierValues = Readonly<{
  albedo: readonly [number, number, number, number];
  mark: readonly [number, number, number, number];
  owner: number;
  flow: number;
  reveal: (localProgress: number) => number;
}>;

type GeometrySource = Readonly<{
  geometry: THREE.BufferGeometry;
  localMatrix: THREE.Matrix4;
  bonePartId: string;
  values: CarrierValues;
}>;

export type CompiledInkedSolidCarrierArtifact = Readonly<{
  compilerVersion: typeof INKED_SOLID_CARRIER_COMPILER_VERSION;
  fingerprint: string;
  geometry: THREE.BufferGeometry;
  bonePartIds: readonly string[];
  carrierParts: number;
  semanticStrokeMeshes: number;
  sourceMeshes: number;
  vertices: number;
  triangles: number;
  byteSize: number;
}>;

export type InkedSolidCarrierCompilationDiagnostics = Readonly<{
  artifacts: number;
  cacheHits: number;
  cacheMisses: number;
  compiledBytes: number;
  sourceMeshes: number;
  compiledMeshes: number;
}>;

type CompiledArtifactRecord = {
  artifact: CompiledInkedSolidCarrierArtifact;
  leases: number;
};

type CompiledArtifactLease = Readonly<{
  artifact: CompiledInkedSolidCarrierArtifact;
  release: () => void;
}>;

function visibleInHierarchy(object: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (!current.visible) return false;
    current = current.parent;
  }
  return true;
}

function colorFromRgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

function encodedMark(
  mark: InkedSolidViewMarkPolicy,
  materialClass: InkedSolidCollageMaterialClass,
): readonly [number, number, number, number] {
  const style = MARK_STYLE_MODE[mark.style];
  const packedStrengthAndWidth = (
    Math.min(63, Math.floor(mark.strength * 63))
    + Math.min(0.99, mark.lineWidth)
  ) / 64;
  return Object.freeze([
    (style + normalizedInkedSolidSeed(mark.seed) * 0.45) / MARK_STYLE_DIVISOR,
    packedStrengthAndWidth,
    mark.coverage,
    packInkedSolidMarkScale(mark.scale, materialClass),
  ] as const);
}

function partValues(
  blueprint: InkedSolidBlueprint,
  part: SolidPartDefinition,
  mark: InkedSolidViewMarkPolicy,
  ownerKey: number,
): CarrierValues {
  const surface = blueprint.solid.surfaces.find(({ id }) => id === part.surfaceId);
  if (surface === undefined) throw new Error(`Missing semantic surface ${part.surfaceId}`);
  const resolved = resolveSemanticSurface(surface, blueprint.appearance, part.semanticPartId);
  const color = colorFromRgb(resolved.color);
  return Object.freeze({
    albedo: Object.freeze([color.r, color.g, color.b, resolved.physical.opacity ?? 1] as const),
    mark: encodedMark(
      mark,
      inkedSolidCollageMaterialClass(
        blueprint.appearance,
        part.semanticPartId,
        surface.substance,
      ),
    ),
    owner: surface.drawing.application === 'ink' ? -ownerKey : ownerKey,
    flow: inkedSolidSurfaceFlow(part.geometry) === 'faceted' ? 1 : 0,
    reveal: () => -1,
  });
}

function strokeValues(stroke: InkedSolidStrokeSpec): CarrierValues {
  const color = colorFromRgb(stroke.color);
  return Object.freeze({
    albedo: Object.freeze([color.r, color.g, color.b, stroke.opacity] as const),
    mark: Object.freeze([0, 0, 0, 0] as const),
    owner: -2,
    flow: 0,
    reveal: (localProgress) => (
      stroke.reveal.start + localProgress * (stroke.reveal.end - stroke.reveal.start)
    ),
  });
}

function compilationPolicy(blueprint: InkedSolidBlueprint): string {
  return JSON.stringify({
    compilerVersion: INKED_SOLID_CARRIER_COMPILER_VERSION,
    appearance: blueprint.appearance,
    medium: blueprint.medium,
    solid: {
      parts: blueprint.solid.parts,
      surfaces: blueprint.solid.surfaces,
    },
    carrierPartIds: blueprint.carrierPartIds,
    viewMarks: blueprint.viewMarks,
    strokes: blueprint.strokes,
  });
}

function compilationKey(blueprint: InkedSolidBlueprint, detail: number): string {
  return JSON.stringify([detail, compilationPolicy(blueprint)]);
}

function compilationFingerprint(blueprint: InkedSolidBlueprint, detail: number): string {
  const policyHash = hashString(compilationPolicy(blueprint)).toString(16).padStart(8, '0');
  return [
    `v${INKED_SOLID_CARRIER_COMPILER_VERSION}`,
    blueprint.assetId,
    detail.toFixed(4),
    policyHash,
  ].join(':');
}

function collectSources(
  blueprint: InkedSolidBlueprint,
  rig: SolidRig,
): Readonly<{ sources: readonly GeometrySource[]; strokeMeshes: number }> {
  const ownerKeys = new InkedSolidCarrierOwnerKeys();
  const marks = new Map(blueprint.viewMarks.map((mark) => [
    `${mark.semanticPartId}:${mark.surfaceId}`,
    mark,
  ]));
  const carrierPartIds = new Set(blueprint.carrierPartIds);
  const sources: GeometrySource[] = [];
  for (const part of blueprint.solid.parts) {
    if (!carrierPartIds.has(part.id)) continue;
    const source = rig.getPart(part.id);
    const mark = marks.get(`${part.semanticPartId}:${part.surfaceId}`);
    if (source === null || mark === undefined) {
      throw new Error(`Cannot compile incomplete inked-solid part ${part.id}`);
    }
    sources.push(Object.freeze({
      geometry: source.geometry,
      localMatrix: new THREE.Matrix4(),
      bonePartId: part.id,
      values: partValues(
        blueprint,
        part,
        mark,
        ownerKeys.allocate(hashString(`${blueprint.deposition.seed}:${part.id}`)),
      ),
    }));
  }

  let strokeMeshes = 0;
  const strokeRig = new InkedSolidStrokeRig(blueprint, rig);
  try {
    strokeRig.forEachRuntimeStroke((stroke, meshes) => {
      for (const mesh of meshes) {
        mesh.updateMatrix();
        sources.push(Object.freeze({
          geometry: mesh.geometry,
          localMatrix: mesh.matrix.clone(),
          bonePartId: stroke.partId,
          values: strokeValues(stroke),
        }));
        strokeMeshes += 1;
      }
    });
  } finally {
    strokeRig.dispose();
  }
  return Object.freeze({ sources: Object.freeze(sources), strokeMeshes });
}

function compileGeometry(
  blueprint: InkedSolidBlueprint,
  rig: SolidRig,
): CompiledInkedSolidCarrierArtifact {
  const { sources, strokeMeshes } = collectSources(blueprint, rig);
  const bonePartIds = [...new Set(sources.map(({ bonePartId }) => bonePartId))];
  const boneByPart = new Map(bonePartIds.map((partId, index) => [partId, index]));
  const vertices = sources.reduce(
    (total, { geometry }) => total + geometry.getAttribute('position').count,
    0,
  );
  const indexCount = sources.reduce((total, { geometry }) => (
    total + (geometry.getIndex()?.count ?? geometry.getAttribute('position').count)
  ), 0);
  const positions = new Float32Array(vertices * 3);
  const normals = new Float32Array(vertices * 3);
  const indices = vertices > 65_535
    ? new Uint32Array(indexCount)
    : new Uint16Array(indexCount);
  const skinIndices = new Uint16Array(vertices * 4);
  const skinWeights = new Float32Array(vertices * 4);
  const albedo = new Float32Array(vertices * 4);
  const marks = new Float32Array(vertices * 4);
  const owners = new Float32Array(vertices);
  const flows = new Float32Array(vertices);
  const reveals = new Float32Array(vertices);
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  let vertexOffset = 0;
  let indexOffset = 0;

  for (const source of sources) {
    if (!source.geometry.hasAttribute('position') || !source.geometry.hasAttribute('normal')) {
      throw new Error('Compiled inked-solid geometry requires position and normal attributes');
    }
    const positionAttribute = source.geometry.getAttribute('position');
    const normalAttribute = source.geometry.getAttribute('normal');
    const boneIndex = boneByPart.get(source.bonePartId);
    if (boneIndex === undefined) throw new Error(`Missing compiled bone ${source.bonePartId}`);
    const localReveal = source.geometry.hasAttribute('inkedStrokeProgress')
      ? source.geometry.getAttribute('inkedStrokeProgress')
      : null;
    normalMatrix.getNormalMatrix(source.localMatrix);
    for (let vertex = 0; vertex < positionAttribute.count; vertex += 1) {
      position.fromBufferAttribute(positionAttribute, vertex).applyMatrix4(source.localMatrix);
      normal.fromBufferAttribute(normalAttribute, vertex).applyMatrix3(normalMatrix).normalize();
      const targetVertex = vertexOffset + vertex;
      const vectorOffset = targetVertex * 3;
      positions[vectorOffset] = position.x;
      positions[vectorOffset + 1] = position.y;
      positions[vectorOffset + 2] = position.z;
      normals[vectorOffset] = normal.x;
      normals[vectorOffset + 1] = normal.y;
      normals[vectorOffset + 2] = normal.z;

      const skinOffset = targetVertex * 4;
      skinIndices[skinOffset] = boneIndex;
      skinWeights[skinOffset] = 1;
      albedo[skinOffset] = source.values.albedo[0];
      albedo[skinOffset + 1] = source.values.albedo[1];
      albedo[skinOffset + 2] = source.values.albedo[2];
      albedo[skinOffset + 3] = source.values.albedo[3];
      marks[skinOffset] = source.values.mark[0];
      marks[skinOffset + 1] = source.values.mark[1];
      marks[skinOffset + 2] = source.values.mark[2];
      marks[skinOffset + 3] = source.values.mark[3];

      owners[targetVertex] = source.values.owner;
      flows[targetVertex] = source.values.flow;
      reveals[targetVertex] = source.values.reveal(localReveal?.getX(vertex) ?? 0);
    }
    const sourceIndex = source.geometry.getIndex();
    if (sourceIndex === null) {
      for (let index = 0; index < positionAttribute.count; index += 1) {
        indices[indexOffset] = vertexOffset + index;
        indexOffset += 1;
      }
    } else {
      for (let index = 0; index < sourceIndex.count; index += 1) {
        indices[indexOffset] = vertexOffset + sourceIndex.getX(index);
        indexOffset += 1;
      }
    }
    vertexOffset += positionAttribute.count;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeights, 4));
  geometry.setAttribute('inkedAlbedo', new THREE.BufferAttribute(albedo, 4));
  geometry.setAttribute('inkedMark', new THREE.BufferAttribute(marks, 4));
  geometry.setAttribute('inkedOwner', new THREE.BufferAttribute(owners, 1));
  geometry.setAttribute('inkedFlow', new THREE.BufferAttribute(flows, 1));
  geometry.setAttribute('inkedRevealProgress', new THREE.BufferAttribute(reveals, 1));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const byteSize = Object.values(geometry.attributes).reduce(
    (total, attribute) => total + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0,
  );
  const fingerprint = compilationFingerprint(blueprint, rig.geometryDetail);
  geometry.name = `compiled:${fingerprint}`;
  return Object.freeze({
    compilerVersion: INKED_SOLID_CARRIER_COMPILER_VERSION,
    fingerprint,
    geometry,
    bonePartIds: Object.freeze(bonePartIds),
    carrierParts: blueprint.carrierPartIds.length,
    semanticStrokeMeshes: strokeMeshes,
    sourceMeshes: sources.length,
    vertices,
    triangles: indexCount / 3,
    byteSize,
  });
}

/** Scene-owned cache for immutable, GPU-ready carrier artifacts. */
export class InkedSolidCarrierCompilationCache {
  private readonly artifacts = new Map<string, CompiledArtifactRecord>();
  private hits = 0;
  private misses = 0;

  public acquire(blueprint: InkedSolidBlueprint, rig: SolidRig): CompiledArtifactLease {
    const key = compilationKey(blueprint, rig.geometryDetail);
    let record = this.artifacts.get(key);
    if (record !== undefined) {
      this.hits += 1;
    } else {
      this.misses += 1;
      record = { artifact: compileGeometry(blueprint, rig), leases: 0 };
      this.artifacts.set(key, record);
    }
    record.leases += 1;
    let active = true;
    return Object.freeze({
      artifact: record.artifact,
      release: () => {
        if (!active) return;
        active = false;
        record.leases -= 1;
        if (record.leases !== 0) return;
        record.artifact.geometry.dispose();
        this.artifacts.delete(key);
      },
    });
  }

  public diagnostics(): InkedSolidCarrierCompilationDiagnostics {
    let compiledBytes = 0;
    let sourceMeshes = 0;
    for (const { artifact } of this.artifacts.values()) {
      compiledBytes += artifact.byteSize;
      sourceMeshes += artifact.sourceMeshes;
    }
    return Object.freeze({
      artifacts: this.artifacts.size,
      cacheHits: this.hits,
      cacheMisses: this.misses,
      compiledBytes,
      sourceMeshes,
      compiledMeshes: this.artifacts.size,
    });
  }

  public dispose(): void {
    for (const { artifact } of this.artifacts.values()) artifact.geometry.dispose();
    this.artifacts.clear();
    this.hits = 0;
    this.misses = 0;
  }
}

const COMPILED_VERTEX = /* glsl */`
  in vec4 inkedAlbedo;
  in vec4 inkedMark;
  in float inkedOwner;
  in float inkedFlow;
  in float inkedRevealProgress;

  flat out vec4 carrierAlbedo;
  flat out vec4 carrierMark;
  flat out float carrierOwner;
  flat out float carrierFlow;
  out float carrierReveal;
  out vec3 carrierMaterialPosition;
  out vec3 carrierViewNormal;

  #include <skinning_pars_vertex>

  void main() {
    mat4 boneMatrix = getBoneMatrix(skinIndex.x);
    vec4 worldPosition = boneMatrix * vec4(position, 1.0);
    mat3 viewNormalMatrix = transpose(inverse(mat3(viewMatrix * boneMatrix)));
    carrierAlbedo = inkedAlbedo;
    carrierMark = inkedMark;
    carrierOwner = inkedOwner;
    carrierFlow = inkedFlow;
    carrierReveal = inkedRevealProgress;
    carrierMaterialPosition = position;
    carrierViewNormal = normalize(viewNormalMatrix * normal);
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const COMPILED_FRAGMENT = /* glsl */`
  uniform float policySlot;
  uniform float revealProgress;
  flat in vec4 carrierAlbedo;
  flat in vec4 carrierMark;
  flat in float carrierOwner;
  flat in float carrierFlow;
  in float carrierReveal;
  in vec3 carrierMaterialPosition;
  in vec3 carrierViewNormal;

  layout(location = 0) out vec4 inkedAlbedoOutput;
  layout(location = 1) out vec4 inkedMarkOutput;
  layout(location = 2) out vec4 inkedSurfaceOutput;
  layout(location = 3) out vec4 inkedNormalOutput;

  void main() {
    if (carrierReveal >= 0.0 && carrierReveal > revealProgress) discard;
    inkedAlbedoOutput = carrierAlbedo;
    inkedMarkOutput = carrierMark;
    inkedSurfaceOutput = vec4(carrierMaterialPosition, carrierOwner);
    inkedNormalOutput = vec4(
      normalize(carrierViewNormal) * 0.5 + 0.5,
      (policySlot * 2.0 + carrierFlow) / 255.0
    );
  }
`;

export class CompiledInkedSolidCarrier {
  public readonly compiled = true;
  public readonly materialCount = 1;
  public readonly proxyMeshCount = 1;
  public readonly partCount: number;
  public readonly strokeMeshCount: number;
  public readonly artifact: CompiledInkedSolidCarrierArtifact;

  private readonly bones: readonly THREE.Bone[];
  private readonly sources: readonly THREE.Mesh[];
  private readonly skeleton: THREE.Skeleton;
  private readonly artifactLease: CompiledArtifactLease;
  private readonly material: THREE.ShaderMaterial;
  private readonly mesh: THREE.SkinnedMesh;
  private readonly localBounds: THREE.Box3;
  private readonly worldBounds = new THREE.Box3();
  private visibleLastSync = true;
  private disposed = false;

  public constructor(
    public readonly instanceId: AssetInstanceId,
    public readonly blueprint: InkedSolidBlueprint,
    public readonly rig: SolidRig,
    scenes: InkedSolidCarrierScenes,
    policySlot: number,
    cache: InkedSolidCarrierCompilationCache,
  ) {
    this.artifactLease = cache.acquire(blueprint, rig);
    this.artifact = this.artifactLease.artifact;
    this.partCount = this.artifact.carrierParts;
    this.strokeMeshCount = this.artifact.semanticStrokeMeshes;
    this.sources = Object.freeze(this.artifact.bonePartIds.map((partId) => {
      const source = rig.getPart(partId);
      if (source === null) throw new Error(`Missing compiled carrier source ${partId}`);
      return source;
    }));
    this.bones = Object.freeze(this.sources.map((_, index) => {
      const bone = new THREE.Bone();
      bone.name = `inked-compiled-bone:${index}`;
      bone.matrixAutoUpdate = false;
      return bone;
    }));
    this.skeleton = new THREE.Skeleton(
      [...this.bones],
      this.bones.map(() => new THREE.Matrix4()),
    );
    this.material = new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: COMPILED_VERTEX,
      fragmentShader: COMPILED_FRAGMENT,
      uniforms: {
        policySlot: { value: policySlot },
        revealProgress: { value: 1 },
      },
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.mesh = new THREE.SkinnedMesh(this.artifact.geometry, this.material);
    this.mesh.name = `inked-compiled:${instanceId}`;
    this.mesh.bindMode = THREE.DetachedBindMode;
    this.mesh.bind(this.skeleton, new THREE.Matrix4());
    this.mesh.matrixAutoUpdate = false;
    this.mesh.frustumCulled = false;
    scenes.carrier.add(this.mesh);

    const bounds = blueprint.solid.bounds;
    this.localBounds = new THREE.Box3(
      new THREE.Vector3(...bounds.minimum),
      new THREE.Vector3(...bounds.maximum),
    );
    const extent = this.localBounds.getSize(new THREE.Vector3());
    this.localBounds.expandByScalar(Math.max(extent.x, extent.y, extent.z) * 0.18);
  }

  public get submittedProxyMeshCount(): number {
    return this.mesh.visible ? 1 : 0;
  }

  public get wasVisibleLastSync(): boolean {
    return this.visibleLastSync;
  }

  public setStrokeReveal(progress: number): void {
    this.assertAlive();
    if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
      throw new RangeError('Stroke reveal progress must be between zero and one');
    }
    const uniform = this.material.uniforms.revealProgress;
    if (uniform !== undefined) uniform.value = progress;
  }

  public sync(_camera: THREE.Camera, frustum: THREE.Frustum): void {
    this.assertAlive();
    if (!visibleInHierarchy(this.rig.root)) {
      this.visibleLastSync = false;
      this.mesh.visible = false;
      return;
    }
    this.rig.root.updateWorldMatrix(true, false);
    this.worldBounds.copy(this.localBounds).applyMatrix4(this.rig.root.matrixWorld);
    if (!frustum.intersectsBox(this.worldBounds)) {
      this.visibleLastSync = false;
      this.mesh.visible = false;
      return;
    }
    this.rig.root.updateWorldMatrix(false, true);
    for (let index = 0; index < this.bones.length; index += 1) {
      const bone = this.bones[index];
      const source = this.sources[index];
      if (bone === undefined || source === undefined) continue;
      bone.matrixWorld.copy(visibleInHierarchy(source) ? source.matrixWorld : HIDDEN_MATRIX);
    }
    this.skeleton.update();
    this.visibleLastSync = true;
    this.mesh.visible = true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mesh.removeFromParent();
    this.skeleton.dispose();
    this.material.dispose();
    this.artifactLease.release();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Compiled inked-solid carrier has been disposed');
  }
}
