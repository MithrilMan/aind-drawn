import * as THREE from 'three';

import type { InkedSolidPaperPolicy } from '../contracts.js';
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
};

function colorFromRgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

function normalizedSeed(seed: number): number {
  return (seed % 65_521) / 65_521;
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
