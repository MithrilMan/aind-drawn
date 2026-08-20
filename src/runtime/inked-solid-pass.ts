import * as THREE from 'three';

import type { InkedSolidBlueprint } from '../assets/inked-solid/blueprint.js';
import { hashString } from '../core/random.js';
import type { RgbColor } from '../core/sketch.js';
import type { MediumId } from '../materials/medium.js';
import { inkedSolidSurfaceFlow } from './inked-solid-surface-flow.js';

type InkedUniforms = {
  albedoTexture: { value: THREE.Texture };
  normalTexture: { value: THREE.Texture };
  markTexture: { value: THREE.Texture };
  anchorTexture: { value: THREE.Texture };
  depthTexture: { value: THREE.DepthTexture };
  resolution: { value: THREE.Vector2 };
  displayScale: { value: number };
  projectionInverse: { value: THREE.Matrix4 };
  contourColor: { value: THREE.Color };
  contourWidth: { value: number };
  contourOpacity: { value: number };
  contourEchoOpacity: { value: number };
  contourGhostOpacity: { value: number };
  contourGhostSpread: { value: number };
  contourGranulation: { value: number };
  contourWander: { value: number };
  depthThreshold: { value: number };
  normalThreshold: { value: number };
  contourJitter: { value: number };
  contourFrame: { value: number };
  contourSeed: { value: number };
  fillPigmentStrength: { value: number };
  fillShadeStrength: { value: number };
  fillShadeSteps: { value: number };
  fillVariationStrength: { value: number };
  fillVariationScale: { value: number };
  fillTextureMode: { value: number };
  fillSeed: { value: number };
  paperColor: { value: THREE.Color };
  paperGrain: { value: number };
  paperSeed: { value: number };
};

type MaterialOwner = {
  material: THREE.Material | THREE.Material[];
};

type MaterialSwap = Readonly<{
  mesh: MaterialOwner;
  material: THREE.Material | THREE.Material[];
}>;

const FILL_TEXTURE_MODE: Readonly<Record<MediumId, number>> = Object.freeze({
  graphite: 0,
  ink: 1,
  watercolor: 2,
  oil: 3,
  chalk: 4,
  marker: 5,
});

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

const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 inkedUv;

  void main() {
    inkedUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const MARK_VERTEX = /* glsl */`
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

const COMPOSITE_FRAGMENT = /* glsl */`
  uniform sampler2D albedoTexture;
  uniform sampler2D normalTexture;
  uniform sampler2D markTexture;
  uniform sampler2D anchorTexture;
  uniform sampler2D depthTexture;
  uniform vec2 resolution;
  uniform float displayScale;
  uniform mat4 projectionInverse;
  uniform vec3 contourColor;
  uniform float contourWidth;
  uniform float contourOpacity;
  uniform float contourEchoOpacity;
  uniform float contourGhostOpacity;
  uniform float contourGhostSpread;
  uniform float contourGranulation;
  uniform float contourWander;
  uniform float depthThreshold;
  uniform float normalThreshold;
  uniform float contourJitter;
  uniform float contourFrame;
  uniform float contourSeed;
  uniform float fillPigmentStrength;
  uniform float fillShadeStrength;
  uniform float fillShadeSteps;
  uniform float fillVariationStrength;
  uniform float fillVariationScale;
  uniform float fillTextureMode;
  uniform float fillSeed;
  uniform vec3 paperColor;
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

  vec2 rotateDrawingField(vec2 point, float angle) {
    float cosine = cos(angle);
    float sine = sin(angle);
    return mat2(cosine, -sine, sine, cosine) * point;
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

  float pencilLine(
    vec2 point,
    float angle,
    float phase,
    float lineWidth,
    float waviness
  ) {
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-direction.y, direction.x);
    float along = dot(point, tangent);
    float pencilWander = (valueNoise(point * 0.19 + vec2(phase, angle * 3.1)) - 0.5) * 0.2;
    pencilWander += sin(along * 1.7 + phase * 4.1) * waviness;
    float coordinate = dot(point, direction) + phase + pencilWander;
    float distanceToLine = abs(fract(coordinate) - 0.5);
    float antialias = max(fwidth(coordinate) * 0.8, 0.006);
    float line = 1.0 - smoothstep(
      lineWidth - antialias,
      lineWidth + antialias,
      distanceToLine
    );
    // Pencil pressure varies continuously along one path. The old periodic
    // segment mask cut every hatch into aligned dashes; wander then made the
    // two exposed endpoints look like a geometric kink. Paper tooth still
    // supplies small broken pickup without changing the line trajectory.
    float pickup = valueNoise(vec2(
      along * 0.21 + phase * 0.43,
      floor(coordinate) * 0.73 + phase * 1.19
    ));
    float pressure = mix(0.48, 1.0, smoothstep(0.12, 0.82, pickup));
    float abrasion = smoothstep(
      0.08,
      0.3,
      valueNoise(vec2(along * 0.83, floor(coordinate) * 1.37) + phase * 2.1)
    );
    return line * pressure * mix(0.58, 1.0, abrasion);
  }

  float viewPencil(
    vec2 viewPosition,
    float scale,
    float angle,
    float phase,
    float lineWidth,
    float waviness
  ) {
    return pencilLine(viewPosition * scale * 4.2, angle, phase, lineWidth, waviness);
  }

  float viewNoise(vec2 viewPosition, float scale, float phase) {
    return valueNoise(viewPosition * scale + vec2(phase, phase * 1.37));
  }

  float brushBands(vec2 point, float phase) {
    vec2 direction = normalize(vec2(0.72, 0.7));
    vec2 acrossDirection = vec2(-direction.y, direction.x);
    float along = dot(point, direction);
    float across = dot(point, acrossDirection);
    float wander = (valueNoise(vec2(along * 0.17, across * 0.11) + phase) - 0.5) * 0.24;
    float coordinate = across + wander + phase * 0.07;
    float distanceToCenter = abs(fract(coordinate) - 0.5);
    float band = 1.0 - smoothstep(0.18, 0.48, distanceToCenter);
    float brokenPass = smoothstep(
      0.18,
      0.78,
      valueNoise(vec2(along * 0.34, floor(coordinate)) + phase * 1.7)
    );
    float bristle = mix(
      0.64,
      1.0,
      valueNoise(vec2(along * 0.82, floor(coordinate) * 0.37) + phase * 2.3)
    );
    return band * mix(0.5, 1.0, brokenPass) * bristle;
  }

  float viewBrush(vec2 viewPosition, float scale, float phase) {
    return brushBands(viewPosition * scale, phase);
  }

  float viewSpeckle(vec2 viewPosition, float scale, float phase) {
    return valueNoise(viewPosition * scale * 7.2 + vec2(phase, phase * 1.91));
  }

  float sceneEdge(vec2 uv, vec2 pixel, float width) {
    vec2 stepSize = pixel * width;
    float centerDepth = sampledDepth(uv);
    vec3 centerNormal = sampledNormal(uv);
    float depthDifference = 0.0;
    float normalDifference = 0.0;
    vec2 offsets[4];
    offsets[0] = vec2(stepSize.x, 0.0);
    offsets[1] = vec2(-stepSize.x, 0.0);
    offsets[2] = vec2(0.0, stepSize.y);
    offsets[3] = vec2(0.0, -stepSize.y);
    for (int index = 0; index < 4; index += 1) {
      float neighbourDepth = sampledDepth(uv + offsets[index]);
      float relativeDifference = abs(centerDepth - neighbourDepth)
        / max(min(centerDepth, neighbourDepth), 0.0001);
      depthDifference = max(depthDifference, relativeDifference);
      if (centerDepth < 9.0e5 && neighbourDepth < 9.0e5) {
        normalDifference = max(
          normalDifference,
          1.0 - dot(centerNormal, sampledNormal(uv + offsets[index]))
        );
      }
    }
    float depthEdge = smoothstep(depthThreshold, depthThreshold * 2.4, depthDifference);
    float normalEdge = smoothstep(
      normalThreshold,
      max(normalThreshold + 0.0001, min(1.0, normalThreshold * 2.2)),
      normalDifference
    );
    return max(depthEdge, normalEdge);
  }

  void main() {
    vec2 pixel = 1.0 / resolution;
    vec2 boilCell = inkedUv * resolution / 18.0;
    vec2 boilOffset = vec2(
      valueNoise(boilCell + vec2(contourFrame * 1.71, contourSeed * 13.0)),
      valueNoise(boilCell + vec2(contourSeed * 17.0, contourFrame * 1.37))
    ) - 0.5;
    vec2 paperPoint = inkedUv * resolution;
    vec2 wanderOffset = vec2(
      valueNoise(paperPoint / 46.0 + vec2(contourSeed * 19.0, contourSeed * 7.0)),
      valueNoise(paperPoint / 39.0 + vec2(contourSeed * 11.0, contourSeed * 23.0))
    ) - 0.5;
    wanderOffset += (vec2(
      valueNoise(paperPoint / 17.0 + vec2(contourSeed * 31.0, 4.0)),
      valueNoise(paperPoint / 21.0 + vec2(9.0, contourSeed * 37.0))
    ) - 0.5) * 0.32;
    vec2 sampleUv = inkedUv
      + wanderOffset * pixel * contourWander * displayScale
      + boilOffset * pixel * contourJitter * displayScale;
    float stableDepth = sampledDepth(inkedUv);
    vec4 stableNormalData = texture2D(normalTexture, inkedUv);
    vec3 stableNormal = normalize(stableNormalData.xyz * 2.0 - 1.0);
    float mainEdge = sceneEdge(sampleUv, pixel, contourWidth * displayScale);
    vec2 echoOffset = vec2(
      valueNoise(boilCell * 0.71 + contourSeed * 31.0),
      valueNoise(boilCell * 0.83 + contourSeed * 47.0)
    ) - 0.5;
    float echoEdge = sceneEdge(
      sampleUv + echoOffset * pixel * 1.35 * displayScale,
      pixel,
      contourWidth * 0.88 * displayScale
    );
    float ghostEdge = sceneEdge(
      inkedUv - echoOffset * pixel * 1.8 * displayScale,
      pixel,
      contourWidth * contourGhostSpread * displayScale
    );
    float graphitePickup = mix(
      1.0,
      smoothstep(0.08, 0.72, hash21(gl_FragCoord.xy * 0.63 + contourSeed * 101.0)),
      contourGranulation
    );
    float pressureWander = mix(
      0.72,
      1.08,
      valueNoise(paperPoint / 31.0 + contourSeed * 53.0)
    );
    float contour = mainEdge * contourOpacity * graphitePickup * pressureWander;
    contour += echoEdge * contourEchoOpacity * (1.0 - mainEdge * 0.45);
    contour += ghostEdge * contourGhostOpacity * (1.0 - mainEdge) * (1.0 - echoEdge * 0.4);
    contour = clamp(contour, 0.0, 1.0);

    vec4 albedo = texture2D(albedoTexture, inkedUv);
    float surface = step(stableDepth, 9.0e5);
    vec2 viewPosition = (gl_FragCoord.xy - resolution * 0.5) / resolution.y;
    vec4 anchorData = texture2D(anchorTexture, inkedUv);
    vec2 anchorNdc = anchorData.xy * 2.0 - 1.0;
    vec2 anchorPosition = vec2(
      anchorNdc.x * resolution.x / resolution.y,
      anchorNdc.y
    ) * 0.5;
    // The paper stays fixed, but pigment is deposited in a field translated
    // with the semantic part currently visible at this pixel. Articulated
    // meshes therefore carry their drawing instead of sliding over it.
    vec2 depositedPosition = viewPosition - anchorPosition;
    float partPhase = anchorData.b * 19.0;
    vec3 doodleLight = normalize(vec3(-0.38, 0.58, 0.72));
    float diffuse = clamp(dot(stableNormal, doodleLight), 0.0, 1.0);
    float shadeLevels = max(1.0, fillShadeSteps - 1.0);
    float steppedDiffuse = floor(diffuse * shadeLevels + 0.5) / shadeLevels;

    // The owner anchor keeps marks attached during animation. Authored carrier
    // topology decides whether the visible normal may turn the drawing field:
    // smooth carriers stay view-oriented, while faceted carriers use one
    // coherent direction per plane. This avoids both spherical topography and
    // screen-space curvature thresholds that change with zoom.
    float surfaceYaw = atan(stableNormal.x, max(0.16, abs(stableNormal.z)));
    float surfacePitch = asin(clamp(stableNormal.y, -1.0, 1.0));
    float facetedResponse = step(0.5, stableNormalData.a);
    float surfaceTurn = clamp(
      (surfaceYaw * 0.62 - surfacePitch * 0.34) * facetedResponse,
      -1.12,
      1.12
    );
    vec2 surfacePosition = rotateDrawingField(depositedPosition, surfaceTurn);
    float grazing = smoothstep(0.18, 0.92, 1.0 - abs(stableNormal.z));
    surfacePosition.x *= mix(1.0, 1.34, grazing * facetedResponse);

    // Volume changes deposition density and stroke pressure, never the authored
    // pigment RGB. Pigment beds remain restrained while visible gesture marks
    // carry most of the light-versus-shadow separation.
    float shadowAmount = 1.0 - steppedDiffuse;
    float pigmentShapeDensity = mix(
      1.0,
      1.0 + shadowAmount * 0.18,
      fillShadeStrength
    );
    float markShapeDensity = mix(
      1.0,
      1.0 + shadowAmount * 0.86,
      fillShadeStrength
    );
    float fillNoise = viewNoise(
      depositedPosition,
      fillVariationScale,
      fillSeed * 31.0 + partPhase
    );
    float fineNoise = viewNoise(
      depositedPosition,
      fillVariationScale * 4.3,
      fillSeed * 47.0 + partPhase * 1.31 + 0.31
    );
    float brush = viewBrush(
      surfacePosition,
      fillVariationScale,
      fillSeed * 17.0 + partPhase * 0.73
    );
    float speckle = viewSpeckle(
      depositedPosition,
      fillVariationScale,
      fillSeed * 83.0 + partPhase * 1.73
    );
    float mediumVariation = fillNoise - 0.5;
    if (fillTextureMode < 0.5) {
      // Graphite: porous coverage and visible paper tooth.
      mediumVariation = (fillNoise - 0.5) * 0.45 + (fineNoise - 0.5) * 0.8;
    } else if (fillTextureMode < 1.5) {
      // Ink: mostly continuous fill with small pooling irregularities.
      mediumVariation = (fillNoise - 0.5) * 0.35 + (fineNoise - 0.5) * 0.2;
    } else if (fillTextureMode < 2.5) {
      // Watercolour: broad overlapping washes, not pencil hatching.
      float wash = viewNoise(
        depositedPosition,
        fillVariationScale * 0.52,
        fillSeed * 61.0 + partPhase * 0.91 + 0.73
      );
      mediumVariation = (fillNoise - 0.5) * 0.82 + (wash - 0.5) * 1.18;
    } else if (fillTextureMode < 3.5) {
      // Oil: dense pigment with directional bristle marks.
      mediumVariation = (brush - 0.5) * 0.7 + (fillNoise - 0.5) * 0.28;
    } else if (fillTextureMode < 4.5) {
      // Chalk: coarse granular pickup with frequent paper gaps.
      mediumVariation = (fineNoise - 0.5) * 0.38
        + (fillNoise - 0.5) * 0.2
        + (speckle - 0.5) * 0.84;
    } else {
      // Marker: translucent parallel passes and overlap bands.
      mediumVariation = (brush - 0.5) * 0.42 + (fillNoise - 0.5) * 0.18;
    }
    float pigmentCoverage = clamp(
      fillPigmentStrength + mediumVariation * fillVariationStrength,
      0.0,
      1.0
    );
    vec3 pigment = albedo.rgb;
    vec4 markData = texture2D(markTexture, inkedUv);
    float encodedMark = markData.r * 9.0;
    float markStyle = floor(encodedMark + 0.001);
    float packedStrengthAndWidth = markData.g * 64.0;
    float markStrength = floor(packedStrengthAndWidth + 0.001) / 63.0;
    float markLineWidth = max(0.008, fract(packedStrengthAndWidth));
    float markCoverage = markData.b;
    float markScale = max(0.1, (markData.a - 0.5) * 48.0);
    float markPhase = fillSeed * 23.0 + fract(encodedMark) * 17.0 + partPhase;
    float surfacePhase = markPhase + surfaceTurn * 0.37;
    float firstFamily = viewPencil(
      surfacePosition,
      markScale,
      0.22,
      surfacePhase,
      markLineWidth,
      0.025
    );
    float secondFamily = viewPencil(
      surfacePosition,
      markScale * 0.93,
      -0.82,
      surfacePhase + 0.43,
      markLineWidth,
      0.035
    );
    float scribble = viewPencil(
      surfacePosition,
      markScale,
      1.48,
      surfacePhase + 0.17,
      markLineWidth * 1.15,
      0.24
    );
    scribble += viewPencil(
      surfacePosition,
      markScale * 1.12,
      1.22,
      surfacePhase + 0.61,
      markLineWidth * 0.72,
      0.2
    ) * 0.52;
    float stippleMark = smoothstep(
      0.7,
      0.86,
      viewSpeckle(depositedPosition, markScale * 0.9, markPhase)
    );
    float washMark = smoothstep(
      0.52,
      0.78,
      viewNoise(depositedPosition, markScale * 0.34, markPhase)
    );
    float bristleMark = smoothstep(
      0.12,
      0.76,
      viewBrush(surfacePosition, markScale, surfacePhase)
    );
    float solidMark = mix(
      0.72,
      1.0,
      viewNoise(depositedPosition, markScale * 1.7, markPhase + 0.83)
    );
    float viewMark = 0.0;
    if (markStyle < 0.5) viewMark = 0.0;
    else if (markStyle < 1.5) viewMark = firstFamily;
    else if (markStyle < 2.5) viewMark = clamp(firstFamily + secondFamily * 0.78, 0.0, 1.0);
    else if (markStyle < 3.5) viewMark = clamp(scribble, 0.0, 1.0);
    else if (markStyle < 4.5) viewMark = stippleMark;
    else if (markStyle < 5.5) viewMark = washMark;
    else if (markStyle < 6.5) viewMark = bristleMark;
    else if (markStyle < 7.5) viewMark = firstFamily * 0.62 + bristleMark * 0.38;
    else if (markStyle > 7.5) viewMark = solidMark;
    viewMark *= markStrength * markShapeDensity * surface;

    float assetSurface = step(0.49, markData.a) * surface;
    // Authored carrier surfaces begin as opaque drawing paper. Sampling the
    // hidden-carrier background here would import transparent-clear black and
    // turn light graphite coverage into a muddy solid mass.
    vec3 color = mix(albedo.rgb, paperColor, assetSurface);
    float grain = valueNoise(
      gl_FragCoord.xy / 3.2 + vec2(paperSeed * 97.0, paperSeed * 53.0)
    ) - 0.5;
    float pigmentBed = markCoverage * assetSurface;
    if (fillTextureMode < 0.5) {
      // Match the raster graphite base opacity; paper tooth modulates it around
      // the authored value instead of halving it or replacing its hue.
      float tooth = smoothstep(0.08, 0.86, fineNoise + grain * 0.34);
      pigmentBed *= mix(0.82, 1.08, tooth) * mix(0.9, 1.1, pigmentCoverage);
    } else if (fillTextureMode < 1.5) {
      pigmentBed *= mix(0.9, 1.0, fillNoise);
    } else if (fillTextureMode < 2.5) {
      // Watercolour is a broad translucent stain, not a sparse binary patch.
      pigmentBed *= mix(0.64, 1.0, fillNoise) * mix(0.82, 1.0, pigmentCoverage);
    } else if (fillTextureMode < 3.5) {
      pigmentBed *= mix(0.88, 1.0, brush);
    } else if (fillTextureMode < 4.5) {
      pigmentBed *= mix(0.55, 1.0, smoothstep(0.16, 0.82, speckle));
    } else {
      pigmentBed *= mix(0.76, 1.0, brush);
    }
    if (markStyle > 7.5) {
      // Linework, pupils, and mouth interiors must read as authored ink rather
      // than as half-empty shading fields.
      pigmentBed = max(
        pigmentBed,
        max(0.985, markCoverage) * mix(0.98, 1.0, fineNoise) * assetSurface
      );
    }
    pigmentBed *= pigmentShapeDensity;
    pigmentBed *= clamp(1.0 + grain * paperGrain * 3.2, 0.0, 1.0);
    color = mix(color, pigment, clamp(pigmentBed, 0.0, 1.0));

    float depositedPigment = viewMark;
    depositedPigment *= clamp(1.0 + grain * paperGrain * 5.0, 0.0, 1.0);
    vec3 gesturePigment = pigment;
    if (fillTextureMode > 2.5 && fillTextureMode < 3.5) {
      // Oil daubs remain visible over an opaque pigment bed because each pass
      // carries a slightly different pigment load, as in the raster medium.
      float bristleTone = viewNoise(
        surfacePosition,
        markScale * 0.46,
        surfacePhase + 0.57
      );
      vec3 loaded = pigment * mix(0.48, 0.88, bristleTone);
      vec3 dry = mix(pigment, paperColor, mix(0.08, 0.3, bristleTone));
      gesturePigment = mix(loaded, dry, bristleTone);
    }
    color = mix(color, gesturePigment, clamp(depositedPigment, 0.0, 1.0));
    color = mix(color, contourColor, contour);
    // The albedo pass contains the carrier opacity even where its RGB is
    // deliberately replaced by paper/background. Using background alpha on
    // carrier pixels made a correctly synthesized pigment bed transparent.
    float alpha = albedo.a;
    alpha = max(alpha, max(depositedPigment, contour));
    gl_FragColor = vec4(color, alpha);
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
 * Camera-conditioned hand-drawn renderer for any Three.js scene built from a
 * solid blueprint. Geometry supplies depth, normals, and semantic masks; the
 * composite pass synthesizes a fresh two-dimensional drawing for the current
 * projection instead of revealing or texturing the carrier meshes.
 */
export class InkedSolidPass {
  private readonly albedoTarget: THREE.WebGLRenderTarget;
  private readonly normalTarget: THREE.WebGLRenderTarget;
  private readonly markTarget: THREE.WebGLRenderTarget;
  private readonly anchorTarget: THREE.WebGLRenderTarget;
  private readonly viewNormalMaterial = new THREE.MeshNormalMaterial({
    blending: THREE.NoBlending,
    opacity: 0,
    transparent: true,
  });
  private readonly facetedNormalMaterial = new THREE.MeshNormalMaterial({
    blending: THREE.NoBlending,
    opacity: 1,
    transparent: true,
  });
  private readonly emptyAnchorMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false,
    depthWrite: false,
  });
  private readonly uniforms: InkedUniforms;
  private readonly compositeMaterial: THREE.ShaderMaterial;
  private readonly compositeGeometry = new THREE.PlaneGeometry(2, 2);
  private readonly compositeScene = new THREE.Scene();
  private readonly compositeCamera = new THREE.Camera();
  private readonly albedoMaterials = new Map<THREE.Material, THREE.MeshBasicMaterial>();
  private readonly markMaterials = new Map<string, THREE.ShaderMaterial>();
  private readonly anchorMaterials = new Map<string, THREE.ShaderMaterial>();
  private readonly projectedAnchor = new THREE.Vector3();
  private blueprint: InkedSolidBlueprint;
  private disposed = false;

  public constructor(
    private readonly renderer: THREE.WebGLRenderer,
    blueprint: InkedSolidBlueprint,
  ) {
    this.blueprint = blueprint;
    this.albedoTarget = createTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    this.albedoTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    this.albedoTarget.depthTexture.format = THREE.DepthFormat;
    this.normalTarget = createTarget(1, 1, { depthBuffer: true, stencilBuffer: false });
    this.markTarget = createTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    this.anchorTarget = createTarget(1, 1, {
      depthBuffer: true,
      stencilBuffer: false,
      type: THREE.HalfFloatType,
    });
    this.uniforms = {
      albedoTexture: { value: this.albedoTarget.texture },
      normalTexture: { value: this.normalTarget.texture },
      markTexture: { value: this.markTarget.texture },
      anchorTexture: { value: this.anchorTarget.texture },
      depthTexture: { value: this.albedoTarget.depthTexture },
      resolution: { value: new THREE.Vector2(1, 1) },
      displayScale: { value: 1 },
      projectionInverse: { value: new THREE.Matrix4() },
      contourColor: { value: new THREE.Color() },
      contourWidth: { value: 1 },
      contourOpacity: { value: 1 },
      contourEchoOpacity: { value: 0 },
      contourGhostOpacity: { value: 0 },
      contourGhostSpread: { value: 2 },
      contourGranulation: { value: 0 },
      contourWander: { value: 0 },
      depthThreshold: { value: 0.01 },
      normalThreshold: { value: 0.2 },
      contourJitter: { value: 0 },
      contourFrame: { value: 0 },
      contourSeed: { value: 0 },
      fillPigmentStrength: { value: 0.84 },
      fillShadeStrength: { value: 0.24 },
      fillShadeSteps: { value: 4 },
      fillVariationStrength: { value: 0.14 },
      fillVariationScale: { value: 3.6 },
      fillTextureMode: { value: 0 },
      fillSeed: { value: 0 },
      paperColor: { value: new THREE.Color() },
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
      toneMapped: false,
    });
    const quad = new THREE.Mesh(this.compositeGeometry, this.compositeMaterial);
    quad.frustumCulled = false;
    this.compositeScene.add(quad);
    this.setBlueprint(blueprint);
  }

  public setBlueprint(blueprint: InkedSolidBlueprint): void {
    this.assertAlive();
    this.blueprint = blueprint;
    const { contour, deposition, paper } = blueprint;
    this.disposeAlbedoMaterials();
    this.disposeMarkMaterials();
    this.disposeAnchorMaterials();
    this.uniforms.contourColor.value.copy(colorFromRgb(contour.color));
    this.uniforms.contourWidth.value = contour.width;
    this.uniforms.contourOpacity.value = contour.opacity;
    this.uniforms.contourEchoOpacity.value = contour.echoOpacity;
    this.uniforms.contourGhostOpacity.value = contour.ghostOpacity;
    this.uniforms.contourGhostSpread.value = contour.ghostSpread;
    this.uniforms.contourGranulation.value = contour.granulation;
    this.uniforms.contourWander.value = contour.wander;
    this.uniforms.depthThreshold.value = contour.depthThreshold;
    this.uniforms.normalThreshold.value = contour.normalThreshold;
    this.uniforms.contourJitter.value = contour.jitter;
    this.uniforms.contourSeed.value = normalizedSeed(contour.seed);
    this.uniforms.fillPigmentStrength.value = deposition.pigmentStrength;
    this.uniforms.fillShadeStrength.value = deposition.shadeStrength;
    this.uniforms.fillShadeSteps.value = deposition.shadeSteps;
    this.uniforms.fillVariationStrength.value = deposition.variationStrength;
    this.uniforms.fillVariationScale.value = deposition.variationScale;
    this.uniforms.fillTextureMode.value = FILL_TEXTURE_MODE[deposition.texture];
    this.uniforms.fillSeed.value = normalizedSeed(deposition.seed);
    this.uniforms.paperColor.value.copy(colorFromRgb(paper.color));
    this.uniforms.paperGrain.value = paper.grainStrength;
    this.uniforms.paperSeed.value = normalizedSeed(paper.seed);
  }

  public setSize(width: number, height: number, pixelRatio = 1): void {
    this.assertAlive();
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    this.albedoTarget.setSize(targetWidth, targetHeight);
    this.normalTarget.setSize(targetWidth, targetHeight);
    this.markTarget.setSize(targetWidth, targetHeight);
    this.anchorTarget.setSize(targetWidth, targetHeight);
    this.uniforms.resolution.value.set(targetWidth, targetHeight);
    this.uniforms.displayScale.value = pixelRatio;
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
    this.uniforms.projectionInverse.value.copy(camera.projectionMatrixInverse);
    this.uniforms.contourFrame.value = Math.floor(
      elapsedSeconds * this.blueprint.contour.boilFramesPerSecond,
    );

    try {
      this.renderer.xr.enabled = false;
      this.renderer.autoClear = true;
      this.renderer.shadowMap.autoUpdate = false;
      scene.overrideMaterial = null;
      const swaps = this.applyAlbedoMaterials(scene);
      try {
        this.renderer.setRenderTarget(this.albedoTarget);
        this.renderer.render(scene, camera);
      } finally {
        this.restoreMaterials(swaps);
      }

      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = null;
      const markSwaps = this.applyMarkMaterials(scene);
      try {
        this.renderer.setRenderTarget(this.markTarget);
        this.renderer.render(scene, camera);
      } finally {
        this.restoreMaterials(markSwaps);
      }

      const anchorSwaps = this.applyAnchorMaterials(scene, camera);
      try {
        this.renderer.setRenderTarget(this.anchorTarget);
        this.renderer.render(scene, camera);
      } finally {
        this.restoreMaterials(anchorSwaps);
      }

      const normalSwaps = this.applyNormalMaterials(scene);
      try {
        this.renderer.setRenderTarget(this.normalTarget);
        this.renderer.render(scene, camera);
      } finally {
        this.restoreMaterials(normalSwaps);
      }

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
    this.albedoTarget.dispose();
    this.normalTarget.dispose();
    this.markTarget.dispose();
    this.anchorTarget.dispose();
    this.viewNormalMaterial.dispose();
    this.facetedNormalMaterial.dispose();
    this.emptyAnchorMaterial.dispose();
    this.compositeGeometry.dispose();
    this.compositeMaterial.dispose();
    this.compositeScene.clear();
    this.disposeAlbedoMaterials();
    this.disposeMarkMaterials();
    this.disposeAnchorMaterials();
  }

  private applyAlbedoMaterials(
    scene: THREE.Scene,
  ): readonly MaterialSwap[] {
    const swaps: MaterialSwap[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as MaterialOwner;
      const material = mesh.material;
      swaps.push(Object.freeze({ mesh, material }));
      mesh.material = Array.isArray(material)
        ? material.map((entry) => this.albedoMaterial(entry))
        : this.albedoMaterial(material);
    });
    return swaps;
  }

  private restoreMaterials(
    swaps: readonly MaterialSwap[],
  ): void {
    for (const { mesh, material } of swaps) mesh.material = material;
  }

  private applyAnchorMaterials(
    scene: THREE.Scene,
    camera: THREE.Camera,
  ): readonly MaterialSwap[] {
    const swaps: MaterialSwap[] = [];
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh & MaterialOwner;
      const material = mesh.material;
      const belongsToCarrier = mesh.userData.solidAssetId === this.blueprint.solid.id;
      const partId = belongsToCarrier && typeof mesh.userData.partId === 'string'
        ? mesh.userData.partId
        : '';
      swaps.push(Object.freeze({ mesh, material }));
      if (partId.length === 0) {
        mesh.material = this.emptyAnchorMaterial;
        return;
      }
      this.projectedAnchor.setFromMatrixPosition(mesh.matrixWorld).project(camera);
      const anchorMaterial = this.anchorMaterial(partId);
      const anchorData = anchorMaterial.uniforms.anchorData?.value as THREE.Vector4;
      anchorData.set(
        this.projectedAnchor.x * 0.5 + 0.5,
        this.projectedAnchor.y * 0.5 + 0.5,
        normalizedSeed(hashString(`${this.blueprint.deposition.seed}:${partId}`)),
        1,
      );
      mesh.material = anchorMaterial;
    });
    return swaps;
  }

  private anchorMaterial(partId: string): THREE.ShaderMaterial {
    const cached = this.anchorMaterials.get(partId);
    if (cached !== undefined) return cached;
    const material = new THREE.ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: ANCHOR_FRAGMENT,
      uniforms: {
        anchorData: { value: new THREE.Vector4() },
      },
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.anchorMaterials.set(partId, material);
    return material;
  }

  private applyMarkMaterials(scene: THREE.Scene): readonly MaterialSwap[] {
    const swaps: MaterialSwap[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh & MaterialOwner;
      const material = mesh.material;
      const belongsToCarrier = mesh.userData.solidAssetId === this.blueprint.solid.id;
      const materialId = belongsToCarrier && typeof mesh.userData.materialId === 'string'
        ? mesh.userData.materialId
        : '';
      swaps.push(Object.freeze({ mesh, material }));
      mesh.material = this.markMaterial(materialId);
    });
    return swaps;
  }

  private applyNormalMaterials(scene: THREE.Scene): readonly MaterialSwap[] {
    const swaps: MaterialSwap[] = [];
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const mesh = object as THREE.Mesh & MaterialOwner;
      const material = mesh.material;
      const belongsToCarrier = mesh.userData.solidAssetId === this.blueprint.solid.id;
      const partId = belongsToCarrier && typeof mesh.userData.partId === 'string'
        ? mesh.userData.partId
        : '';
      const part = partId.length === 0
        ? undefined
        : this.blueprint.solid.parts.find(({ id }) => id === partId);
      const flow = part === undefined
        ? 'view-oriented'
        : inkedSolidSurfaceFlow(part.geometry);
      swaps.push(Object.freeze({ mesh, material }));
      mesh.material = flow === 'faceted'
        ? this.facetedNormalMaterial
        : this.viewNormalMaterial;
    });
    return swaps;
  }

  private markMaterial(materialId: string): THREE.ShaderMaterial {
    const cached = this.markMaterials.get(materialId);
    if (cached !== undefined) return cached;
    const mark = this.blueprint.viewMarks.find((candidate) => (
      candidate.materialId === materialId
    ));
    const style = mark === undefined ? MARK_STYLE_MODE.none : MARK_STYLE_MODE[mark.style];
    const packedStrengthAndWidth = mark === undefined
      ? 0
      : (
        Math.min(63, Math.floor(mark.strength * 63))
        + Math.min(0.99, mark.lineWidth)
      ) / 64;
    const material = new THREE.ShaderMaterial({
      vertexShader: MARK_VERTEX,
      fragmentShader: MARK_FRAGMENT,
      uniforms: {
        markData: {
          value: new THREE.Vector4(
            (style + normalizedSeed(mark?.seed ?? 0) * 0.45) / MARK_STYLE_DIVISOR,
            packedStrengthAndWidth,
            mark?.coverage ?? 0,
            mark === undefined ? 0 : 0.5 + Math.min(0.49, mark.scale / 48),
          ),
        },
      },
      blending: THREE.NoBlending,
      toneMapped: false,
    });
    this.markMaterials.set(materialId, material);
    return material;
  }

  private albedoMaterial(source: THREE.Material): THREE.MeshBasicMaterial {
    const cached = this.albedoMaterials.get(source);
    if (cached !== undefined) return cached;
    const surface = source as THREE.Material & Readonly<{
      color?: THREE.Color;
      map?: THREE.Texture | null;
      alphaMap?: THREE.Texture | null;
      vertexColors?: boolean;
    }>;
    const material = new THREE.MeshBasicMaterial({
      color: surface.color?.clone() ?? new THREE.Color(0xffffff),
      map: surface.map ?? null,
      alphaMap: surface.alphaMap ?? null,
      vertexColors: surface.vertexColors,
      // Semantic albedo is a G-buffer value. Scene fog belongs to the smooth
      // presentation and must not recolour the drawing pigment source.
      fog: false,
      opacity: source.opacity,
      transparent: source.transparent,
      alphaTest: source.alphaTest,
      side: source.side,
      depthTest: source.depthTest,
      depthWrite: source.depthWrite,
      visible: source.visible,
      toneMapped: false,
    });
    material.colorWrite = source.colorWrite;
    this.albedoMaterials.set(source, material);
    return material;
  }

  private disposeAlbedoMaterials(): void {
    for (const material of this.albedoMaterials.values()) material.dispose();
    this.albedoMaterials.clear();
  }

  private disposeMarkMaterials(): void {
    for (const material of this.markMaterials.values()) material.dispose();
    this.markMaterials.clear();
  }

  private disposeAnchorMaterials(): void {
    for (const material of this.anchorMaterials.values()) material.dispose();
    this.anchorMaterials.clear();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('InkedSolidPass has been disposed');
  }
}
