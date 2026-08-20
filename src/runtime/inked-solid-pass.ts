import * as THREE from 'three';

import type { InkedSolidBlueprint } from '../assets/inked-solid/blueprint.js';
import type { RgbColor } from '../core/sketch.js';

type InkedUniforms = {
  beautyTexture: { value: THREE.Texture };
  normalTexture: { value: THREE.Texture };
  positionTexture: { value: THREE.Texture };
  depthTexture: { value: THREE.DepthTexture };
  resolution: { value: THREE.Vector2 };
  projectionInverse: { value: THREE.Matrix4 };
  contourColor: { value: THREE.Color };
  contourWidth: { value: number };
  contourOpacity: { value: number };
  depthThreshold: { value: number };
  normalThreshold: { value: number };
  contourJitter: { value: number };
  contourFrame: { value: number };
  contourSeed: { value: number };
  hatchColor: { value: THREE.Color };
  hatchScale: { value: number };
  hatchStrength: { value: number };
  hatchShadowStart: { value: number };
  crossHatchStart: { value: number };
  hatchLineWidth: { value: number };
  hatchJitter: { value: number };
  hatchFrame: { value: number };
  hatchSeed: { value: number };
  paperColor: { value: THREE.Color };
  paperTint: { value: number };
  paperGrain: { value: number };
  paperSeed: { value: number };
};

const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 inkedUv;

  void main() {
    inkedUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const LOCAL_POSITION_VERTEX = /* glsl */`
  varying vec3 inkedLocalPosition;

  void main() {
    inkedLocalPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const LOCAL_POSITION_FRAGMENT = /* glsl */`
  varying vec3 inkedLocalPosition;

  void main() {
    gl_FragColor = vec4(inkedLocalPosition, 1.0);
  }
`;

const COMPOSITE_FRAGMENT = /* glsl */`
  uniform sampler2D beautyTexture;
  uniform sampler2D normalTexture;
  uniform sampler2D positionTexture;
  uniform sampler2D depthTexture;
  uniform vec2 resolution;
  uniform mat4 projectionInverse;
  uniform vec3 contourColor;
  uniform float contourWidth;
  uniform float contourOpacity;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform float contourJitter;
  uniform float contourFrame;
  uniform float contourSeed;
  uniform vec3 hatchColor;
  uniform float hatchScale;
  uniform float hatchStrength;
  uniform float hatchShadowStart;
  uniform float crossHatchStart;
  uniform float hatchLineWidth;
  uniform float hatchJitter;
  uniform float hatchFrame;
  uniform float hatchSeed;
  uniform vec3 paperColor;
  uniform float paperTint;
  uniform float paperGrain;
  uniform float paperSeed;
  varying vec2 inkedUv;

  float hash21(vec2 point) {
    vec3 value = fract(vec3(point.xyx) * 0.1031);
    value += dot(value, value.yzx + 33.33);
    return fract((value.x + value.y) * value.z);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 fraction = fract(point);
    fraction = fraction * fraction * (3.0 - 2.0 * fraction);
    float bottom = mix(hash21(cell), hash21(cell + vec2(1.0, 0.0)), fraction.x);
    float top = mix(
      hash21(cell + vec2(0.0, 1.0)),
      hash21(cell + vec2(1.0, 1.0)),
      fraction.x
    );
    return mix(bottom, top, fraction.y);
  }

  float sampledDepth(vec2 uv) {
    float depth = texture2D(depthTexture, clamp(uv, vec2(0.0), vec2(1.0))).x;
    if (depth >= 0.999999) return 1.0e6;
    vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    vec4 view = projectionInverse * clip;
    return max(0.0001, -view.z / view.w);
  }

  vec3 sampledNormal(vec2 uv) {
    return normalize(texture2D(normalTexture, clamp(uv, vec2(0.0), vec2(1.0))).xyz * 2.0 - 1.0);
  }

  float hatchLine(vec2 point, float angle, float phase) {
    vec2 direction = vec2(cos(angle), sin(angle));
    float pencilWander = (valueNoise(point * 0.19 + vec2(phase, angle * 3.1)) - 0.5) * 0.18;
    float coordinate = dot(point, direction) + phase + pencilWander;
    float distanceToLine = abs(fract(coordinate) - 0.5);
    float antialias = max(fwidth(coordinate) * 0.8, 0.006);
    return 1.0 - smoothstep(
      hatchLineWidth - antialias,
      hatchLineWidth + antialias,
      distanceToLine
    );
  }

  float triplanarHatch(vec3 localPosition, vec3 localNormal, float angle, float phase) {
    vec3 weight = pow(abs(localNormal), vec3(4.0));
    weight /= max(weight.x + weight.y + weight.z, 0.0001);
    vec3 point = localPosition * hatchScale;
    return hatchLine(point.yz, angle, phase) * weight.x
      + hatchLine(point.xz, angle, phase + 0.31) * weight.y
      + hatchLine(point.xy, angle, phase + 0.67) * weight.z;
  }

  void main() {
    vec2 pixel = 1.0 / resolution;
    vec2 boilCell = inkedUv * resolution / 18.0;
    vec2 boilOffset = vec2(
      valueNoise(boilCell + vec2(contourFrame * 1.71, contourSeed * 13.0)),
      valueNoise(boilCell + vec2(contourSeed * 17.0, contourFrame * 1.37))
    ) - 0.5;
    vec2 sampleUv = inkedUv + boilOffset * pixel * contourJitter;
    vec2 edgeStep = pixel * contourWidth;

    float centerDepth = sampledDepth(sampleUv);
    float depthDifference = 0.0;
    float normalDifference = 0.0;
    vec3 centerNormal = sampledNormal(sampleUv);
    vec2 offsets[4];
    offsets[0] = vec2(edgeStep.x, 0.0);
    offsets[1] = vec2(-edgeStep.x, 0.0);
    offsets[2] = vec2(0.0, edgeStep.y);
    offsets[3] = vec2(0.0, -edgeStep.y);
    for (int index = 0; index < 4; index += 1) {
      float neighbourDepth = sampledDepth(sampleUv + offsets[index]);
      float relativeDifference = abs(centerDepth - neighbourDepth)
        / max(min(centerDepth, neighbourDepth), 0.0001);
      depthDifference = max(depthDifference, relativeDifference);
      if (centerDepth < 9.0e5 && neighbourDepth < 9.0e5) {
        normalDifference = max(
          normalDifference,
          1.0 - dot(centerNormal, sampledNormal(sampleUv + offsets[index]))
        );
      }
    }

    float depthEdge = smoothstep(depthThreshold, depthThreshold * 2.4, depthDifference);
    float normalEdge = smoothstep(
      normalThreshold,
      max(normalThreshold + 0.0001, min(1.0, normalThreshold * 2.2)),
      normalDifference
    );
    float contour = max(depthEdge, normalEdge) * contourOpacity;

    vec4 beauty = texture2D(beautyTexture, inkedUv);
    float surface = step(centerDepth, 9.0e5);
    vec3 localPosition = texture2D(positionTexture, sampleUv).xyz;
    vec3 localNormal = normalize(cross(dFdx(localPosition), dFdy(localPosition)));
    float hatchBoil = valueNoise(
      localPosition.xy * 0.73 + vec2(hatchFrame * 1.17, hatchSeed * 19.0)
    ) - 0.5;
    float hatchPhase = hatchSeed * 23.0 + hatchBoil * hatchJitter * hatchScale;
    float luminance = dot(beauty.rgb, vec3(0.2126, 0.7152, 0.0722));
    float darkness = 1.0 - luminance;
    float firstFamily = triplanarHatch(localPosition, localNormal, 0.72, hatchPhase);
    float secondFamily = triplanarHatch(localPosition, localNormal, -0.76, hatchPhase + 0.43);
    float firstAmount = smoothstep(hatchShadowStart, max(1.0, hatchShadowStart + 0.0001), darkness);
    float secondAmount = smoothstep(crossHatchStart, max(1.0, crossHatchStart + 0.0001), darkness);
    float hatch = clamp(firstFamily * firstAmount + secondFamily * secondAmount, 0.0, 1.0)
      * hatchStrength * surface;

    vec3 color = mix(beauty.rgb, paperColor, paperTint * surface);
    float grain = hash21(gl_FragCoord.xy + vec2(paperSeed * 97.0, paperSeed * 53.0)) - 0.5;
    color = clamp(color + grain * paperGrain * surface, 0.0, 1.0);
    color = mix(color, hatchColor, hatch);
    color = mix(color, contourColor, contour);
    float alpha = max(beauty.a, contour);
    gl_FragColor = vec4(color, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function colorFromRgb(color: RgbColor): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255).convertSRGBToLinear();
}

function normalizedSeed(seed: number): number {
  return (seed % 65_521) / 65_521;
}

function createTarget(
  width: number,
  height: number,
  options: THREE.RenderTargetOptions = {},
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    ...options,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

/**
 * Camera-aware hand-drawn renderer for any Three.js scene built from a solid
 * blueprint. It combines depth/normal contours with object-local hatching, so
 * marks stay attached while semantic nodes animate or the asset rotates.
 */
export class InkedSolidPass {
  private readonly beautyTarget: THREE.WebGLRenderTarget;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly positionTarget: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial({
    blending: THREE.NoBlending,
  });
  private readonly positionMaterial = new THREE.ShaderMaterial({
    vertexShader: LOCAL_POSITION_VERTEX,
    fragmentShader: LOCAL_POSITION_FRAGMENT,
    blending: THREE.NoBlending,
    toneMapped: false,
  });
  private readonly uniforms: InkedUniforms;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly compositeGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.Camera();
  private blueprint: InkedSolidBlueprint;
  private disposed = false;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    blueprint: InkedSolidBlueprint,
  ) {
    this.blueprint = blueprint;
    this.beautyTarget = createTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.beautyTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.beautyTarget.depthTexture.format = THREE.DepthFormat;
    this.normalTarget = createTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
    this.positionTarget = createTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    this.uniforms = {
      beautyTexture: { value: this.beautyTarget.texture },
      normalTexture: { value: this.normalTarget.texture },
      positionTexture: { value: this.positionTarget.texture },
      depthTexture: { value: this.beautyTarget.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) },
      projectionInverse: { value: new THREE.Matrix4() },
      contourColor: { value: new THREE.Color() },
      contourWidth: { value: 1 },
      contourOpacity: { value: 1 },
      depthThreshold: { value: 0.01 },
      normalThreshold: { value: 0.2 },
      contourJitter: { value: 0 },
      contourFrame: { value: 0 },
      contourSeed: { value: 0 },
      hatchColor: { value: new THREE.Color() },
      hatchScale: { value: 1 },
      hatchStrength: { value: 0 },
      hatchShadowStart: { value: 0.4 },
      crossHatchStart: { value: 0.7 },
      hatchLineWidth: { value: 0.08 },
      hatchJitter: { value: 0 },
      hatchFrame: { value: 0 },
      hatchSeed: { value: 0 },
      paperColor: { value: new THREE.Color() },
      paperTint: { value: 0 },
      paperGrain: { value: 0 },
      paperSeed: { value: 0 },
    };
    this.compositeMaterial = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: COMPOSITE_FRAGMENT,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
      toneMapped: true,
    });
    const quad = new THREE.Mesh(this.compositeGeometry, this.compositeMaterial);
    quad.frustumCulled = false;
    this.compositeScene.add(quad);
    this.setBlueprint(blueprint);
  }

  public setBlueprint(blueprint: InkedSolidBlueprint): void {
    this.assertAlive();
    this.blueprint = blueprint;
    const { contour, hatching, paper } = blueprint;
    this.uniforms.contourColor.value.copy(colorFromRgb(contour.color));
    this.uniforms.contourWidth.value = contour.width;
    this.uniforms.contourOpacity.value = contour.opacity;
    this.uniforms.depthThreshold.value = contour.depthThreshold;
    this.uniforms.normalThreshold.value = contour.normalThreshold;
    this.uniforms.contourJitter.value = contour.jitter;
    this.uniforms.contourSeed.value = normalizedSeed(contour.seed);
    this.uniforms.hatchColor.value.copy(colorFromRgb(hatching?.color ?? contour.color));
    this.uniforms.hatchScale.value = hatching?.scale ?? 1;
    this.uniforms.hatchStrength.value = hatching?.strength ?? 0;
    this.uniforms.hatchShadowStart.value = hatching?.shadowStart ?? 1;
    this.uniforms.crossHatchStart.value = hatching?.crossHatchStart ?? 1;
    this.uniforms.hatchLineWidth.value = hatching?.lineWidth ?? 0;
    this.uniforms.hatchJitter.value = hatching?.jitter ?? 0;
    this.uniforms.hatchSeed.value = normalizedSeed(hatching?.seed ?? contour.seed);
    this.uniforms.paperColor.value.copy(colorFromRgb(paper.color));
    this.uniforms.paperTint.value = paper.tintStrength;
    this.uniforms.paperGrain.value = paper.grainStrength;
    this.uniforms.paperSeed.value = normalizedSeed(paper.seed);
  }

  public setSize(width: number, height: number, pixelRatio = 1): void {
    this.assertAlive();
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    this.beautyTarget.setSize(targetWidth, targetHeight);
    this.normalTarget.setSize(targetWidth, targetHeight);
    this.positionTarget.setSize(targetWidth, targetHeight);
    this.uniforms.resolution.value.set(targetWidth, targetHeight);
  }

  public render(scene: THREE.Scene, camera: THREE.Camera, elapsedSeconds: number): void {
    this.assertAlive();
    const previousTarget = this.renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousAutoClear = this.renderer.autoClear;
    const previousXrEnabled = this.renderer.xr.enabled;
    const previousShadowAutoUpdate = this.renderer.shadowMap.autoUpdate;
    const hatching = this.blueprint.hatching;
    this.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.uniforms.contourFrame.value = Math.floor(
      elapsedSeconds * this.blueprint.contour.boilFramesPerSecond,
    );
    this.uniforms.hatchFrame.value = Math.floor(
      elapsedSeconds * (hatching?.boilFramesPerSecond ?? 0),
    );

    try {
      this.renderer.xr.enabled = false;
      this.renderer.autoClear = true;
      scene.overrideMaterial = null;
      this.renderer.setRenderTarget(this.beautyTarget);
      this.renderer.render(scene, camera);

      this.renderer.shadowMap.autoUpdate = false;
      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = this.normalMaterial;
      this.renderer.setRenderTarget(this.normalTarget);
      this.renderer.render(scene, camera);

      scene.overrideMaterial = this.positionMaterial;
      this.renderer.setRenderTarget(this.positionTarget);
      this.renderer.render(scene, camera);

      this.renderer.setRenderTarget(previousTarget);
      this.renderer.render(this.compositeScene, this.compositeCamera);
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

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.beautyTarget.dispose();
    this.normalTarget.dispose();
    this.positionTarget.dispose();
    this.normalMaterial.dispose();
    this.positionMaterial.dispose();
    this.compositeGeometry.dispose();
    this.compositeMaterial.dispose();
    this.compositeScene.clear();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('InkedSolidPass has been disposed');
  }
}
