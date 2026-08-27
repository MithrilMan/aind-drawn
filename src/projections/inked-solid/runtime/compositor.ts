import * as THREE from 'three';

import type { InkedSolidPaperPolicy } from '../contracts.js';
import type { InkedSolidVisualizationPolicy } from '../visualization.js';
import type { InkedSolidPolicyTexture } from './policy-texture.js';
import type { InkedSolidRenderTargets } from './render-targets.js';
import { COMPOSITE_FRAGMENT, FULLSCREEN_VERTEX } from './composite-shaders.js';

type InkedSolidCompositeUniforms = {
  albedoTexture: { value: THREE.Texture };
  normalTexture: { value: THREE.Texture };
  markTexture: { value: THREE.Texture };
  anchorTexture: { value: THREE.Texture };
  depthTexture: { value: THREE.DepthTexture };
  policyTexture: { value: THREE.Texture };
  resolution: { value: THREE.Vector2 };
  displayScale: { value: number };
  elapsedSeconds: { value: number };
  projectionInverse: { value: THREE.Matrix4 };
  paperColor: { value: THREE.Color };
  paperGrain: { value: number };
  paperSeed: { value: number };
  visualizationMode: { value: number };
  visualizationColorStrength: { value: number };
  visualizationContourBoost: { value: number };
  visualizationPosterizeSteps: { value: number };
  visualizationTornEdgeStrength: { value: number };
  visualizationTornEdgeScale: { value: number };
  visualizationCutShadow: { value: THREE.Vector3 };
  visualizationSeed: { value: number };
};

function colorFromRgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

function normalizedSeed(seed: number): number {
  return (seed % 65_521) / 65_521;
}

function visualizationMode(policy: InkedSolidVisualizationPolicy): number {
  if (policy.colorModel === 'sepia') return 1;
  if (policy.colorModel === 'collage') return 2;
  return 0;
}

export class InkedSolidCompositor {
  private readonly uniforms: InkedSolidCompositeUniforms;
  private readonly material: THREE.ShaderMaterial;
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.Camera();

  public constructor(
    targets: InkedSolidRenderTargets,
    policies: InkedSolidPolicyTexture,
    paper: InkedSolidPaperPolicy,
    visualization: InkedSolidVisualizationPolicy,
  ) {
    this.uniforms = {
      albedoTexture: { value: targets.albedo.texture },
      normalTexture: { value: targets.normal.texture },
      markTexture: { value: targets.mark.texture },
      anchorTexture: { value: targets.anchor.texture },
      depthTexture: { value: targets.depth },
      policyTexture: { value: policies.texture },
      resolution: { value: new THREE.Vector2(1, 1) },
      displayScale: { value: 1 },
      elapsedSeconds: { value: 0 },
      projectionInverse: { value: new THREE.Matrix4() },
      paperColor: { value: colorFromRgb(paper.color) },
      paperGrain: { value: paper.grainStrength },
      paperSeed: { value: normalizedSeed(paper.seed) },
      visualizationMode: { value: visualizationMode(visualization) },
      visualizationColorStrength: { value: visualization.colorStrength },
      visualizationContourBoost: { value: visualization.contourBoost },
      visualizationPosterizeSteps: { value: visualization.posterizeSteps },
      visualizationTornEdgeStrength: { value: visualization.tornEdgeStrength },
      visualizationTornEdgeScale: { value: visualization.tornEdgeScale },
      visualizationCutShadow: { value: new THREE.Vector3(
        visualization.cutShadowStrength,
        visualization.cutShadowOffset[0],
        visualization.cutShadowOffset[1],
      ) },
      visualizationSeed: { value: normalizedSeed(visualization.seed) },
    };
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    const quad = new THREE.Mesh(this.geometry, this.material);
    quad.frustumCulled = false;
    this.scene.add(quad);
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    this.uniforms.resolution.value.set(
      Math.max(1, Math.round(width * pixelRatio)),
      Math.max(1, Math.round(height * pixelRatio)),
    );
    this.uniforms.displayScale.value = pixelRatio;
  }

  public render(
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    elapsedSeconds: number,
  ): void {
    this.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.uniforms.elapsedSeconds.value = elapsedSeconds;
    renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.scene.clear();
  }
}
