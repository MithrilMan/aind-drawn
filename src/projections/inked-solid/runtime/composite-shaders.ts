/* Shader source is isolated from scene ownership and resource lifecycle. */
export const FULLSCREEN_VERTEX = /* glsl */`
  varying vec2 inkedUv;

  void main() {
    inkedUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const COMPOSITE_FRAGMENT = /* glsl */`
  uniform sampler2D albedoTexture;
  uniform sampler2D normalTexture;
  uniform sampler2D markTexture;
  uniform sampler2D anchorTexture;
  uniform sampler2D depthTexture;
  uniform sampler2D policyTexture;
  uniform vec2 resolution;
  uniform float displayScale;
  uniform float elapsedSeconds;
  uniform mat4 projectionInverse;
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

  vec4 policyTexel(float policySlot, float texel) {
    return texture2D(policyTexture, vec2(
      (texel + 0.5) / 6.0,
      (policySlot + 0.5) / 128.0
    ));
  }

  float pencilLine(
    vec2 point,
    float angle,
    float phase,
    float lineWidth,
    float waviness,
    float irregularity
  ) {
    vec2 direction = vec2(cos(angle), sin(angle));
    vec2 tangent = vec2(-direction.y, direction.x);
    float along = dot(point, tangent);
    float baseCoordinate = dot(point, direction) + phase;
    float lineIndex = floor(baseCoordinate);
    // A pencil field is a family of related gestures, not graph paper. Give
    // each line a stable lateral offset, then bend it continuously along its
    // own path. The discontinuity between line cells stays in the empty gap,
    // so spacing varies without cutting a visible stroke into segments.
    float lineOffset = (
      hash21(vec2(lineIndex + phase * 7.1, phase * 13.7)) - 0.5
    ) * irregularity;
    float slowWander = valueNoise(vec2(
      along * 0.075 + phase * 0.41,
      lineIndex * 0.37 + phase * 1.73
    )) - 0.5;
    float fineWander = valueNoise(vec2(
      along * 0.29 + phase * 1.17,
      lineIndex * 0.83 + phase * 2.31
    )) - 0.5;
    float pencilWander = lineOffset;
    pencilWander += slowWander * irregularity * 0.72;
    pencilWander += fineWander * irregularity * 0.28;
    pencilWander += sin(along * 1.7 + phase * 4.1) * waviness;
    float coordinate = baseCoordinate + pencilWander;
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
      lineIndex * 0.73 + phase * 1.19
    ));
    float pressure = mix(0.48, 1.0, smoothstep(0.12, 0.82, pickup));
    float abrasion = smoothstep(
      0.08,
      0.3,
      valueNoise(vec2(along * 0.83, lineIndex * 1.37) + phase * 2.1)
    );
    return line * pressure * mix(0.58, 1.0, abrasion);
  }

  float viewPencil(
    vec2 viewPosition,
    float scale,
    float angle,
    float phase,
    float lineWidth,
    float waviness,
    float irregularity
  ) {
    return pencilLine(
      viewPosition * scale * 4.2,
      angle,
      phase,
      lineWidth,
      waviness,
      irregularity
    );
  }

  float viewNoise(vec2 viewPosition, float scale, float phase) {
    return valueNoise(viewPosition * scale + vec2(phase, phase * 1.37));
  }

  float brushBands(vec2 point, float phase) {
    // A loaded oil brush leaves short, fat daubs. Continuous parallel bands
    // read as hatching and belong to neither the raster oil vocabulary nor the
    // physical gesture of a brush lifting from the paper.
    vec2 direction = normalize(vec2(0.68, 0.74));
    vec2 acrossDirection = vec2(-direction.y, direction.x);
    float along = dot(point, direction);
    float across = dot(point, acrossDirection);
    const vec2 cellSize = vec2(2.35, 0.94);
    float row = floor(across / cellSize.y);
    along += mod(row, 2.0) * cellSize.x * 0.46;
    vec2 cell = floor(vec2(along, across) / cellSize);
    vec2 local = fract(vec2(along, across) / cellSize) - 0.5;
    float jitter = valueNoise(cell * 0.73 + vec2(phase, phase * 1.41));
    local.x += (jitter - 0.5) * 0.24;
    local.y += (valueNoise(cell * 1.17 + phase * 2.1) - 0.5) * 0.16;
    float halfLength = mix(0.3, 0.49, jitter);
    float halfWidth = mix(0.22, 0.36, valueNoise(cell * 0.91 + phase * 3.7));
    float ellipse = (local.x * local.x) / (halfLength * halfLength)
      + (local.y * local.y) / (halfWidth * halfWidth);
    float daub = 1.0 - smoothstep(0.72, 1.08, ellipse);
    float pickup = mix(0.68, 1.0, valueNoise(cell * 1.83 + phase * 4.3));
    return daub * pickup;
  }

  float viewBrush(vec2 viewPosition, float scale, float phase) {
    return brushBands(viewPosition * scale, phase);
  }

  float viewMarker(vec2 viewPosition, float scale, float phase) {
    // Marker fills are broad translucent passes with narrow seams where the
    // nib overlaps. They are not pencil families with a different colour.
    vec2 point = viewPosition * scale;
    vec2 direction = normalize(vec2(0.96, 0.28));
    vec2 acrossDirection = vec2(-direction.y, direction.x);
    float along = dot(point, direction);
    float across = dot(point, acrossDirection);
    float wander = (valueNoise(vec2(along * 0.13, floor(across)) + phase) - 0.5) * 0.08;
    float lane = fract(across + wander + phase * 0.07);
    float distanceToCentre = abs(lane - 0.5);
    float pass = 1.0 - smoothstep(0.37, 0.49, distanceToCentre);
    float load = mix(0.72, 1.0, valueNoise(vec2(floor(across), along * 0.08) + phase));
    return pass * load;
  }

  float viewSpeckle(vec2 viewPosition, float scale, float phase) {
    return valueNoise(viewPosition * scale * 7.2 + vec2(phase, phase * 1.91));
  }

  float contourSurfaceKind(vec2 uv, float depth) {
    if (depth >= 9.0e5) return 0.0;
    float owner = texture2D(anchorTexture, clamp(uv, vec2(0.0), vec2(1.0))).a;
    if (owner < 0.25) return 1.0;
    if (owner < 0.75) return 2.0;
    return 3.0;
  }

  float contourPairWeight(
    vec2 centerUv,
    vec2 neighbourUv,
    float centerDepth,
    float neighbourDepth
  ) {
    float centerKind = contourSurfaceKind(centerUv, centerDepth);
    float neighbourKind = contourSurfaceKind(neighbourUv, neighbourDepth);
    // Semantic stroke volumes and authored ink shapes already own their
    // visible boundary. Feeding them back through the contour detector draws
    // a second outline, then displaced echo/ghost copies turn it into spikes.
    if (centerKind > 0.5 && centerKind < 2.5) return 0.0;
    if (neighbourKind > 0.5 && neighbourKind < 2.5) return 0.0;
    return 1.0;
  }

  float sceneEdge(
    vec2 uv,
    vec2 pixel,
    float width,
    float policyDepthThreshold,
    float policyNormalThreshold
  ) {
    vec2 stepSize = pixel * width;
    float centerDepth = sampledDepth(uv);
    vec3 centerNormal = sampledNormal(uv);
    float depthDifference = 0.0;
    float normalDifference = 0.0;
    vec2 offsets[8];
    offsets[0] = vec2(stepSize.x, 0.0);
    offsets[1] = vec2(-stepSize.x, 0.0);
    offsets[2] = vec2(0.0, stepSize.y);
    offsets[3] = vec2(0.0, -stepSize.y);
    offsets[4] = vec2(stepSize.x, stepSize.y) * 0.70710678;
    offsets[5] = vec2(-stepSize.x, stepSize.y) * 0.70710678;
    offsets[6] = vec2(stepSize.x, -stepSize.y) * 0.70710678;
    offsets[7] = vec2(-stepSize.x, -stepSize.y) * 0.70710678;
    for (int index = 0; index < 8; index += 1) {
      vec2 neighbourUv = uv + offsets[index];
      float neighbourDepth = sampledDepth(neighbourUv);
      float pairWeight = contourPairWeight(
        uv,
        neighbourUv,
        centerDepth,
        neighbourDepth
      );
      float relativeDifference = abs(centerDepth - neighbourDepth)
        / max(min(centerDepth, neighbourDepth), 0.0001);
      depthDifference = max(depthDifference, relativeDifference * pairWeight);
      if (centerDepth < 9.0e5 && neighbourDepth < 9.0e5) {
        normalDifference = max(
          normalDifference,
          (1.0 - dot(centerNormal, sampledNormal(neighbourUv))) * pairWeight
        );
      }
    }
    float depthEdge = smoothstep(
      policyDepthThreshold,
      policyDepthThreshold * 2.4,
      depthDifference
    );
    float normalEdge = smoothstep(
      policyNormalThreshold,
      max(
        policyNormalThreshold + 0.0001,
        min(1.0, policyNormalThreshold * 2.2)
      ),
      normalDifference
    );
    return max(depthEdge, normalEdge);
  }

  void main() {
    vec2 pixel = 1.0 / resolution;
    float stableDepth = sampledDepth(inkedUv);
    float surface = step(stableDepth, 9.0e5);
    vec4 stableNormalData = texture2D(normalTexture, inkedUv);
    vec3 stableNormal = normalize(stableNormalData.xyz * 2.0 - 1.0);
    float packedPolicyAndFlow = floor(stableNormalData.a * 255.0 + 0.5);
    float policySlot = floor(packedPolicyAndFlow * 0.5);
    vec4 policy0 = policyTexel(policySlot, 0.0);
    vec4 policy1 = policyTexel(policySlot, 1.0);
    vec4 policy2 = policyTexel(policySlot, 2.0);
    vec4 policy3 = policyTexel(policySlot, 3.0);
    vec4 policy4 = policyTexel(policySlot, 4.0);
    vec4 policy5 = policyTexel(policySlot, 5.0);
    vec3 contourColor = policy0.rgb;
    float contourWidth = policy0.a;
    float contourOpacity = policy1.r;
    float contourEchoOpacity = policy1.g;
    float contourGhostOpacity = policy1.b;
    float contourGhostSpread = policy1.a;
    float contourGranulation = policy2.r;
    float contourWander = policy2.g;
    float depthThreshold = policy2.b;
    float normalThreshold = policy2.a;
    float contourJitter = policy3.r;
    float contourFrame = floor(elapsedSeconds * policy3.g);
    float contourSeed = policy3.b;
    float fillPigmentStrength = policy3.a;
    float planeSeparationStrength = policy4.r;
    float planeSeparationSteps = policy4.g;
    float fillVariationStrength = policy4.b;
    float fillVariationScale = policy4.a;
    float fillTextureMode = policy5.r;
    float fillSeed = policy5.g;
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
    float mainEdge = sceneEdge(
      sampleUv,
      pixel,
      contourWidth * displayScale,
      depthThreshold,
      normalThreshold
    );
    vec2 echoOffset = vec2(
      valueNoise(boilCell * 0.71 + contourSeed * 31.0),
      valueNoise(boilCell * 0.83 + contourSeed * 47.0)
    ) - 0.5;
    float echoEdge = sceneEdge(
      sampleUv + echoOffset * pixel * 1.35 * displayScale,
      pixel,
      contourWidth * 0.88 * displayScale,
      depthThreshold,
      normalThreshold
    );
    float ghostEdge = sceneEdge(
      inkedUv - echoOffset * pixel * 1.8 * displayScale,
      pixel,
      contourWidth * contourGhostSpread * displayScale,
      depthThreshold,
      normalThreshold
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
    // Secondary graphite passes may roughen an existing guide, but must never
    // become detached screen-space antennae around a small feature.
    float secondaryGuide = smoothstep(0.02, 0.62, mainEdge);
    contour += echoEdge * contourEchoOpacity * secondaryGuide * (1.0 - mainEdge * 0.55);
    contour += ghostEdge
      * contourGhostOpacity
      * secondaryGuide
      * (1.0 - mainEdge * 0.72)
      * (1.0 - echoEdge * 0.4);
    contour = clamp(contour, 0.0, 1.0) * surface;

    vec4 albedo = texture2D(albedoTexture, inkedUv);
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
    float planeLevels = max(1.0, planeSeparationSteps - 1.0);
    float steppedPlaneTone = floor(diffuse * planeLevels + 0.5) / planeLevels;

    // The owner anchor keeps marks attached during animation. Authored carrier
    // topology decides whether the visible normal may turn the drawing field:
    // smooth carriers stay view-oriented, while faceted carriers use one
    // coherent direction per plane. This avoids both spherical topography and
    // screen-space curvature thresholds that change with zoom.
    float surfaceYaw = atan(stableNormal.x, max(0.16, abs(stableNormal.z)));
    float surfacePitch = asin(clamp(stableNormal.y, -1.0, 1.0));
    float facetedResponse = mod(packedPolicyAndFlow, 2.0);
    float surfaceTurn = clamp(
      (surfaceYaw * 0.62 - surfacePitch * 0.34) * facetedResponse,
      -1.12,
      1.12
    );
    vec2 surfacePosition = rotateDrawingField(depositedPosition, surfaceTurn);
    float grazing = smoothstep(0.18, 0.92, 1.0 - abs(stableNormal.z));
    surfacePosition.x *= mix(1.0, 1.34, grazing * facetedResponse);

    // Pigment and gesture marks are deposited filler on smooth carriers, not
    // fake illumination. Only authored faceted topology may use drawing light
    // to separate adjacent planes; even there the authored RGB stays intact.
    float opposedToDrawingLight = 1.0 - steppedPlaneTone;
    float planeSeparation = opposedToDrawingLight * facetedResponse;
    float pigmentShapeDensity = mix(
      1.0,
      1.0 + planeSeparation * 0.18,
      planeSeparationStrength
    );
    float markShapeDensity = mix(
      1.0,
      1.0 + planeSeparation * 0.86,
      planeSeparationStrength
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
    float markerPass = viewMarker(
      surfacePosition,
      fillVariationScale * 0.72,
      fillSeed * 29.0 + partPhase * 0.83
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
      mediumVariation = (markerPass - 0.5) * 0.42 + (fillNoise - 0.5) * 0.18;
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
    float graphiteGesture = 1.0 - step(0.5, fillTextureMode);
    float pencilIrregularity = mix(0.12, 0.46, graphiteGesture);
    float firstFamily = viewPencil(
      surfacePosition,
      markScale,
      0.22,
      surfacePhase,
      markLineWidth,
      mix(0.025, 0.082, graphiteGesture),
      pencilIrregularity
    );
    float secondFamily = viewPencil(
      surfacePosition,
      markScale * 0.93,
      -0.82,
      surfacePhase + 0.43,
      markLineWidth,
      mix(0.035, 0.098, graphiteGesture),
      pencilIrregularity
    );
    float scribble = viewPencil(
      surfacePosition,
      markScale,
      1.48,
      surfacePhase + 0.17,
      markLineWidth * 1.15,
      0.24,
      max(0.24, pencilIrregularity)
    );
    scribble += viewPencil(
      surfacePosition,
      markScale * 1.12,
      1.22,
      surfacePhase + 0.61,
      markLineWidth * 0.72,
      0.2,
      max(0.2, pencilIrregularity)
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
    float bristlePickup = smoothstep(
      0.3,
      0.72,
      viewNoise(
        depositedPosition * vec2(0.31, 0.11),
        markScale,
        markPhase + 1.37
      )
    );
    bristleMark *= mix(0.14, 1.0, bristlePickup);
    float markerMark = viewMarker(surfacePosition, markScale, surfacePhase);
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
    else if (markStyle < 7.5) viewMark = markerMark;
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
      pigmentBed *= mix(0.96, 1.0, brush);
    } else if (fillTextureMode < 4.5) {
      pigmentBed *= mix(0.55, 1.0, smoothstep(0.16, 0.82, speckle));
    } else {
      pigmentBed *= mix(0.76, 1.0, markerPass);
    }
    if (markStyle > 7.5) {
      // Opaque-ink applications must read as authored linework rather than as
      // half-empty shading fields.
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
      vec3 loaded = pigment * mix(0.72, 1.0, bristleTone);
      vec3 dry = clamp(pigment * mix(0.9, 1.14, bristleTone), 0.0, 1.0);
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
