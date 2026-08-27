import * as THREE from 'three';

import {
  resolveSemanticSurface,
  type AssetAppearance,
} from '../../../appearance/art-direction.js';
import type { SolidPartDefinition } from '../../../contracts/solid-asset.js';
import type { SemanticSurfaceSpec } from '../../../materials/surface.js';
import type {
  InkedSolidStrokeSpec,
  InkedSolidViewMarkPolicy,
} from '../contracts.js';
import { normalizedInkedSolidSeed } from './policy-texture.js';
import { inkedSolidSurfaceFlow } from './surface-flow.js';
import {
  inkedSolidCollageMaterialClass,
  packInkedSolidMarkScale,
  type InkedSolidCollageMaterialClass,
} from './collage-material-class.js';

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
  out vec3 inkedViewNormal;

  void main() {
    inkedViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const CARRIER_FRAGMENT = /* glsl */`
  uniform vec4 albedoData;
  uniform vec4 markData;
  uniform vec4 anchorData;
  uniform float packedPolicyAndFlow;
  in vec3 inkedViewNormal;

  layout(location = 0) out vec4 inkedAlbedo;
  layout(location = 1) out vec4 inkedMark;
  layout(location = 2) out vec4 inkedAnchor;
  layout(location = 3) out vec4 inkedNormal;

  void main() {
    inkedAlbedo = albedoData;
    inkedMark = markData;
    inkedAnchor = anchorData;
    inkedNormal = vec4(normalize(inkedViewNormal) * 0.5 + 0.5, packedPolicyAndFlow);
  }
`;

const STROKE_VERTEX = /* glsl */`
  in float inkedStrokeProgress;
  out float inkedRevealPosition;
  out vec3 inkedViewNormal;

  void main() {
    inkedRevealPosition = inkedStrokeProgress;
    inkedViewNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const STROKE_FRAGMENT = /* glsl */`
  uniform float revealProgress;
  uniform float revealStart;
  uniform float revealEnd;
  uniform vec4 albedoData;
  uniform float packedPolicyAndFlow;
  in float inkedRevealPosition;
  in vec3 inkedViewNormal;

  layout(location = 0) out vec4 inkedAlbedo;
  layout(location = 1) out vec4 inkedMark;
  layout(location = 2) out vec4 inkedAnchor;
  layout(location = 3) out vec4 inkedNormal;

  void main() {
    float localProgress = clamp(
      (revealProgress - revealStart) / max(0.000001, revealEnd - revealStart),
      0.0,
      1.0
    );
    if (inkedRevealPosition > localProgress) discard;
    inkedAlbedo = albedoData;
    inkedMark = vec4(0.0);
    inkedAnchor = vec4(0.0, 0.0, 0.0, 0.5);
    inkedNormal = vec4(normalize(inkedViewNormal) * 0.5 + 0.5, packedPolicyAndFlow);
  }
`;

export type InkedSolidPartMaterials = Readonly<{
  material: THREE.ShaderMaterial;
  anchorData: THREE.Vector4;
}>;

export type InkedSolidStrokeMaterials = Readonly<{
  material: THREE.ShaderMaterial;
  revealProgress: THREE.IUniform<number>;
}>;

function colorFromRgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

function markData(
  mark: InkedSolidViewMarkPolicy,
  materialClass: InkedSolidCollageMaterialClass,
): THREE.Vector4 {
  const style = MARK_STYLE_MODE[mark.style];
  const packedStrengthAndWidth = (
    Math.min(63, Math.floor(mark.strength * 63))
    + Math.min(0.99, mark.lineWidth)
  ) / 64;
  return new THREE.Vector4(
    (style + normalizedInkedSolidSeed(mark.seed) * 0.45) / MARK_STYLE_DIVISOR,
    packedStrengthAndWidth,
    mark.coverage,
    packInkedSolidMarkScale(mark.scale, materialClass),
  );
}

/**
 * Creates one WebGL2 MRT material per submitted carrier mesh. The previous
 * implementation created four materials and four proxies for every source
 * mesh; this cache writes the complete semantic G-buffer in one draw instead.
 */
export class InkedSolidCarrierMaterialCache {
  private readonly owned = new Set<THREE.Material>();

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
    const resolved = resolveSemanticSurface(surface, this.appearance, part.semanticPartId);
    const opacity = resolved.physical.opacity ?? 1;
    const anchorData = new THREE.Vector4();
    const color = colorFromRgb(resolved.color);
    const material = this.track(new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: CARRIER_VERTEX,
      fragmentShader: CARRIER_FRAGMENT,
      uniforms: {
        albedoData: { value: new THREE.Vector4(color.r, color.g, color.b, opacity) },
        markData: { value: markData(
          mark,
          inkedSolidCollageMaterialClass(
            this.appearance,
            part.semanticPartId,
            surface.substance,
          ),
        ) },
        anchorData: { value: anchorData },
        packedPolicyAndFlow: {
          value: (
            this.policySlot * 2
            + (inkedSolidSurfaceFlow(part.geometry) === 'faceted' ? 1 : 0)
          ) / 255,
        },
      },
      blending: THREE.NoBlending,
      depthWrite: opacity >= 1,
      toneMapped: false,
    }));
    return Object.freeze({ material, anchorData });
  }

  public stroke(stroke: InkedSolidStrokeSpec): InkedSolidStrokeMaterials {
    const revealProgress: THREE.IUniform<number> = { value: 1 };
    const color = colorFromRgb(stroke.color);
    const material = this.track(new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: STROKE_VERTEX,
      fragmentShader: STROKE_FRAGMENT,
      uniforms: {
        revealProgress,
        revealStart: { value: stroke.reveal.start },
        revealEnd: { value: stroke.reveal.end },
        albedoData: { value: new THREE.Vector4(color.r, color.g, color.b, stroke.opacity) },
        packedPolicyAndFlow: { value: (this.policySlot * 2) / 255 },
      },
      blending: THREE.NoBlending,
      toneMapped: false,
    }));
    return Object.freeze({ material, revealProgress });
  }

  public dispose(): void {
    for (const material of this.owned) material.dispose();
    this.owned.clear();
  }

  private track<TMaterial extends THREE.Material>(material: TMaterial): TMaterial {
    this.owned.add(material);
    return material;
  }
}
