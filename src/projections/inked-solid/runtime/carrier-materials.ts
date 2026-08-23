import * as THREE from 'three';

import type { SolidMaterialSpec } from '../../../materials/finish.js';
import type { SolidPartDefinition } from '../../../contracts/solid-asset.js';
import type {
  InkedSolidStrokeSpec,
  InkedSolidViewMarkPolicy,
} from '../contracts.js';
import { inkedSolidSurfaceFlow } from './surface-flow.js';
import { normalizedInkedSolidSeed } from './policy-texture.js';

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

const CARRIER_VERTEX = /* glsl */`
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const MARK_FRAGMENT = /* glsl */`
  uniform vec4 markData;

  void main() {
    gl_FragColor = markData;
  }
`;

const ANCHOR_FRAGMENT = /* glsl */`
  uniform vec4 anchorData;

  void main() {
    gl_FragColor = anchorData;
  }
`;

const NORMAL_VERTEX = /* glsl */`
  varying vec3 inkedViewNormal;

  void main() {
    inkedViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const NORMAL_FRAGMENT = /* glsl */`
  uniform float packedPolicyAndFlow;
  varying vec3 inkedViewNormal;

  void main() {
    gl_FragColor = vec4(
      normalize(inkedViewNormal) * 0.5 + 0.5,
      packedPolicyAndFlow
    );
  }
`;

export type InkedSolidPartMaterials = Readonly<{
  albedo: THREE.Material;
  mark: THREE.Material;
  anchor: THREE.ShaderMaterial;
  normal: THREE.Material;
  anchorData: THREE.Vector4;
}>;

export type InkedSolidStrokeMaterials = Readonly<{
  albedo: THREE.Material;
  mark: THREE.Material;
  anchor: THREE.Material;
  normal: THREE.Material;
}>;

function colorFromRgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

export class InkedSolidCarrierMaterialCache {
  private readonly owned = new Set<THREE.Material>();
  private readonly albedo = new Map<string, THREE.MeshBasicMaterial>();
  private readonly marks = new Map<string, THREE.ShaderMaterial>();
  private readonly normals = new Map<'faceted' | 'view-oriented', THREE.ShaderMaterial>();
  private readonly strokeAlbedo = new Map<string, THREE.MeshBasicMaterial>();
  private readonly emptyMark: THREE.ShaderMaterial;
  private readonly strokeAnchor: THREE.ShaderMaterial;

  public constructor(private readonly policySlot: number) {
    this.emptyMark = this.track(this.dataMaterial('markData', new THREE.Vector4(0, 0, 0, 0)));
    this.strokeAnchor = this.track(this.dataMaterial(
      'anchorData',
      new THREE.Vector4(0, 0, 0, 0.5),
      ANCHOR_FRAGMENT,
    ));
  }

  public get size(): number {
    return this.owned.size;
  }

  public part(
    part: SolidPartDefinition,
    material: SolidMaterialSpec,
    mark: InkedSolidViewMarkPolicy,
  ): InkedSolidPartMaterials {
    const anchorData = new THREE.Vector4();
    const anchor = this.track(this.dataMaterial('anchorData', anchorData, ANCHOR_FRAGMENT));
    return Object.freeze({
      albedo: this.albedoMaterial(material),
      mark: this.markMaterial(mark),
      anchor,
      normal: this.normalMaterial(inkedSolidSurfaceFlow(part.geometry)),
      anchorData,
    });
  }

  public stroke(stroke: InkedSolidStrokeSpec): InkedSolidStrokeMaterials {
    let albedo = this.strokeAlbedo.get(stroke.id);
    if (albedo === undefined) {
      albedo = this.track(new THREE.MeshBasicMaterial({
        color: colorFromRgb(stroke.color),
        opacity: stroke.opacity,
        transparent: stroke.opacity < 1,
        toneMapped: false,
        fog: false,
      }));
      this.strokeAlbedo.set(stroke.id, albedo);
    }
    return Object.freeze({
      albedo,
      mark: this.emptyMark,
      anchor: this.strokeAnchor,
      normal: this.normalMaterial('view-oriented'),
    });
  }

  public dispose(): void {
    for (const material of this.owned) material.dispose();
    this.owned.clear();
    this.albedo.clear();
    this.marks.clear();
    this.normals.clear();
    this.strokeAlbedo.clear();
  }

  private albedoMaterial(spec: SolidMaterialSpec): THREE.MeshBasicMaterial {
    const cached = this.albedo.get(spec.id);
    if (cached !== undefined) return cached;
    const material = this.track(new THREE.MeshBasicMaterial({
      color: colorFromRgb(spec.color),
      fog: false,
      toneMapped: false,
    }));
    this.albedo.set(spec.id, material);
    return material;
  }

  private markMaterial(mark: InkedSolidViewMarkPolicy): THREE.ShaderMaterial {
    const cached = this.marks.get(mark.materialId);
    if (cached !== undefined) return cached;
    const style = MARK_STYLE_MODE[mark.style];
    const packedStrengthAndWidth = (
      Math.min(63, Math.floor(mark.strength * 63))
      + Math.min(0.99, mark.lineWidth)
    ) / 64;
    const material = this.track(this.dataMaterial('markData', new THREE.Vector4(
      (style + normalizedInkedSolidSeed(mark.seed) * 0.45) / MARK_STYLE_DIVISOR,
      packedStrengthAndWidth,
      mark.coverage,
      0.5 + Math.min(0.49, mark.scale / 48),
    )));
    this.marks.set(mark.materialId, material);
    return material;
  }

  private normalMaterial(flow: 'faceted' | 'view-oriented'): THREE.ShaderMaterial {
    const cached = this.normals.get(flow);
    if (cached !== undefined) return cached;
    const packedPolicyAndFlow = (this.policySlot * 2 + (flow === 'faceted' ? 1 : 0)) / 255;
    const material = this.track(new THREE.ShaderMaterial({
      uniforms: { packedPolicyAndFlow: { value: packedPolicyAndFlow } },
      vertexShader: NORMAL_VERTEX,
      fragmentShader: NORMAL_FRAGMENT,
      blending: THREE.NoBlending,
      toneMapped: false,
    }));
    this.normals.set(flow, material);
    return material;
  }

  private dataMaterial(
    uniform: 'markData' | 'anchorData',
    value: THREE.Vector4,
    fragmentShader = MARK_FRAGMENT,
  ): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: CARRIER_VERTEX,
      fragmentShader,
      uniforms: { [uniform]: { value } },
      blending: THREE.NoBlending,
      toneMapped: false,
    });
  }

  private track<TMaterial extends THREE.Material>(material: TMaterial): TMaterial {
    this.owned.add(material);
    return material;
  }
}
