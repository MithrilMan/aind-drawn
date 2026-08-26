import * as THREE from 'three';

import {
  resolveSemanticSurface,
  type AssetAppearance,
} from '../../../appearance/art-direction.js';
import type { SemanticSurfaceSpec } from '../../../materials/surface.js';
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

const STROKE_VERTEX = /* glsl */`
  attribute float inkedStrokeProgress;
  varying float inkedRevealPosition;
  varying vec3 inkedViewNormal;

  void main() {
    inkedRevealPosition = inkedStrokeProgress;
    inkedViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const REVEAL_GUARD = /* glsl */`
  uniform float revealProgress;
  uniform float revealStart;
  uniform float revealEnd;
  varying float inkedRevealPosition;

  void guardReveal() {
    float localProgress = clamp(
      (revealProgress - revealStart) / max(0.000001, revealEnd - revealStart),
      0.0,
      1.0
    );
    if (inkedRevealPosition > localProgress) discard;
  }
`;

const STROKE_ALBEDO_FRAGMENT = /* glsl */`
  ${REVEAL_GUARD}
  uniform vec3 strokeColor;
  uniform float strokeOpacity;

  void main() {
    guardReveal();
    gl_FragColor = vec4(strokeColor, strokeOpacity);
  }
`;

const STROKE_EMPTY_FRAGMENT = /* glsl */`
  ${REVEAL_GUARD}
  void main() {
    guardReveal();
    gl_FragColor = vec4(0.0);
  }
`;

const STROKE_ANCHOR_FRAGMENT = /* glsl */`
  ${REVEAL_GUARD}
  void main() {
    guardReveal();
    gl_FragColor = vec4(0.0, 0.0, 0.0, 0.5);
  }
`;

const STROKE_NORMAL_FRAGMENT = /* glsl */`
  ${REVEAL_GUARD}
  uniform float packedPolicyAndFlow;
  varying vec3 inkedViewNormal;

  void main() {
    guardReveal();
    gl_FragColor = vec4(normalize(inkedViewNormal) * 0.5 + 0.5, packedPolicyAndFlow);
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
  revealProgress: THREE.IUniform<number>;
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

  public constructor(
    private readonly policySlot: number,
    private readonly appearance: AssetAppearance,
  ) {}

  public get size(): number {
    return this.owned.size;
  }

  public part(
    part: SolidPartDefinition,
    surface: SemanticSurfaceSpec,
    mark: InkedSolidViewMarkPolicy,
  ): InkedSolidPartMaterials {
    const anchorData = new THREE.Vector4();
    const anchor = this.track(this.dataMaterial('anchorData', anchorData, ANCHOR_FRAGMENT));
    return Object.freeze({
      albedo: this.albedoMaterial(resolveSemanticSurface(
        surface,
        this.appearance,
        part.semanticPartId,
      ), part.semanticPartId),
      mark: this.markMaterial(mark),
      anchor,
      normal: this.normalMaterial(inkedSolidSurfaceFlow(part.geometry)),
      anchorData,
    });
  }

  public stroke(stroke: InkedSolidStrokeSpec): InkedSolidStrokeMaterials {
    const revealProgress: THREE.IUniform<number> = { value: 1 };
    const baseUniforms = {
      revealProgress,
      revealStart: { value: stroke.reveal.start },
      revealEnd: { value: stroke.reveal.end },
    };
    const shader = (
      fragmentShader: string,
      uniforms: Record<string, THREE.IUniform> = {},
    ): THREE.ShaderMaterial => this.track(new THREE.ShaderMaterial({
      vertexShader: STROKE_VERTEX,
      fragmentShader,
      uniforms: { ...baseUniforms, ...uniforms },
      blending: THREE.NoBlending,
      toneMapped: false,
    }));
    return Object.freeze({
      albedo: shader(STROKE_ALBEDO_FRAGMENT, {
        strokeColor: { value: colorFromRgb(stroke.color) },
        strokeOpacity: { value: stroke.opacity },
      }),
      mark: shader(STROKE_EMPTY_FRAGMENT),
      anchor: shader(STROKE_ANCHOR_FRAGMENT),
      normal: shader(STROKE_NORMAL_FRAGMENT, {
        packedPolicyAndFlow: { value: (this.policySlot * 2) / 255 },
      }),
      revealProgress,
    });
  }

  public dispose(): void {
    for (const material of this.owned) material.dispose();
    this.owned.clear();
    this.albedo.clear();
    this.marks.clear();
    this.normals.clear();
  }

  private albedoMaterial(spec: SemanticSurfaceSpec, semanticPartId: string): THREE.MeshBasicMaterial {
    const key = `${semanticPartId}:${spec.id}`;
    const cached = this.albedo.get(key);
    if (cached !== undefined) return cached;
    const opacity = spec.physical.opacity ?? 1;
    const material = this.track(new THREE.MeshBasicMaterial({
      color: colorFromRgb(spec.color),
      opacity,
      transparent: opacity < 1,
      depthWrite: opacity >= 1,
      fog: false,
      toneMapped: false,
    }));
    this.albedo.set(key, material);
    return material;
  }

  private markMaterial(mark: InkedSolidViewMarkPolicy): THREE.ShaderMaterial {
    const key = `${mark.semanticPartId}:${mark.surfaceId}`;
    const cached = this.marks.get(key);
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
    this.marks.set(key, material);
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
