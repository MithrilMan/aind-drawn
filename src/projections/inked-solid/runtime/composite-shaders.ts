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
  uniform sampler2D surfaceTexture;
  uniform sampler2D depthTexture;
  uniform sampler2D policyTexture;
  uniform vec2 resolution;
  uniform float displayScale;
  uniform float elapsedSeconds;
  uniform mat4 projectionInverse;
  uniform vec3 paperColor;
  uniform float paperGrain;
  uniform float paperSeed;
  uniform float visualizationMode;
  uniform float visualizationColorStrength;
  uniform float visualizationContourBoost;
  uniform vec4 visualizationContourProfile;
  uniform float visualizationPosterizeSteps;
  uniform vec2 visualizationPaperProfile;
  uniform float visualizationTornEdgeStrength;
  uniform float visualizationTornEdgeScale;
  uniform vec4 visualizationCutShadow;
  uniform float visualizationSeed;
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

  vec3 materialCoordinates(vec3 position) {
    // Reconstruct the geometric normal in part-local space and select the
    // dominant sheet plane. One 2D sample per field is considerably cheaper
    // than triplanar noise on mobile, while the selected coordinates remain
    // rigidly attached to the mesh under camera and object motion.
    vec3 localNormal = abs(cross(dFdx(position), dFdy(position)));
    if (localNormal.x > localNormal.y && localNormal.x > localNormal.z) {
      return vec3(position.yz, 0.0);
    }
    if (localNormal.y > localNormal.z) return vec3(position.xz, 1.0);
    return vec3(position.xy, 2.0);
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

  float sampledFacetedResponse(vec2 uv) {
    float packed = floor(
      texture2D(normalTexture, clamp(uv, vec2(0.0), vec2(1.0))).a * 255.0 + 0.5
    );
    return mod(packed, 2.0);
  }

  float sampledPolicySlot(vec2 uv) {
    float packed = floor(
      texture2D(normalTexture, clamp(uv, vec2(0.0), vec2(1.0))).a * 255.0 + 0.5
    );
    return floor(packed * 0.5);
  }

  float sampledPackedOwner(vec2 uv) {
    return texture2D(surfaceTexture, clamp(uv, vec2(0.0), vec2(1.0))).a;
  }

  float sampledCarrierOwner(vec2 uv) {
    float packedOwner = sampledPackedOwner(uv);
    return packedOwner < -1.5 ? 0.0 : abs(packedOwner);
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
    float owner = sampledPackedOwner(uv);
    if (owner < 0.0) return 2.0;
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

  vec3 sceneEdges(
    vec2 uv,
    vec2 pixel,
    float width,
    float policyDepthThreshold,
    float policyNormalThreshold
  ) {
    vec2 stepSize = pixel * width;
    float centerDepth = sampledDepth(uv);
    vec3 centerNormal = sampledNormal(uv);
    float centerFacetedResponse = sampledFacetedResponse(uv);
    float centerPolicySlot = sampledPolicySlot(uv);
    float centerCarrierOwner = sampledCarrierOwner(uv);
    float depthDifference = 0.0;
    float normalDifference = 0.0;
    float carrierBoundary = 0.0;
    float surfaceBoundary = 0.0;
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
      surfaceBoundary = max(
        surfaceBoundary,
        abs(step(centerDepth, 9.0e5) - step(neighbourDepth, 9.0e5))
      );
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
        float policyDifference = step(
          0.5,
          abs(centerPolicySlot - sampledPolicySlot(neighbourUv))
        );
        // Owner keys are quantised to exact 1/1024 intervals before entering
        // the half-float anchor target. A change therefore identifies a real
        // carrier-part boundary, while variation inside one smooth mesh does
        // not reintroduce screen-space topographic bands.
        float ownerDifference = step(
          0.00024,
          abs(centerCarrierOwner - sampledCarrierOwner(neighbourUv))
        );
        carrierBoundary = max(
          carrierBoundary,
          max(policyDifference, ownerDifference) * pairWeight
        );
        float topologyWeight = max(
          centerFacetedResponse,
          sampledFacetedResponse(neighbourUv)
        );
        normalDifference = max(
          normalDifference,
          (1.0 - dot(centerNormal, sampledNormal(neighbourUv)))
            * pairWeight
            * topologyWeight
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
    return vec3(max(depthEdge, surfaceBoundary), normalEdge, carrierBoundary);
  }

  float resolveSceneEdge(
    vec3 edges,
    float creaseStrength,
    float ownerStrength
  ) {
    return max(edges.x, max(edges.y * creaseStrength, edges.z * ownerStrength));
  }

  float frontPaperBoundary(vec2 uv, vec2 pixel, float width) {
    float centerDepth = sampledDepth(uv);
    if (centerDepth >= 9.0e5) return 0.0;
    if (contourSurfaceKind(uv, centerDepth) < 2.5) return 0.0;
    float centerOwner = sampledCarrierOwner(uv);
    float centerPolicySlot = sampledPolicySlot(uv);
    vec2 stepSize = pixel * max(1.0, width);
    float boundary = 0.0;
    vec2 offsets[4];
    offsets[0] = vec2(stepSize.x, 0.0);
    offsets[1] = vec2(-stepSize.x, 0.0);
    offsets[2] = vec2(0.0, stepSize.y);
    offsets[3] = vec2(0.0, -stepSize.y);
    for (int index = 0; index < 4; index += 1) {
      vec2 neighbourUv = uv + offsets[index];
      float neighbourDepth = sampledDepth(neighbourUv);
      float openEdge = step(9.0e5, neighbourDepth);
      float ownerDifference = max(
        step(0.00024, abs(centerOwner - sampledCarrierOwner(neighbourUv))),
        step(0.5, abs(centerPolicySlot - sampledPolicySlot(neighbourUv)))
      );
      float relativeStep = (neighbourDepth - centerDepth) / max(centerDepth, 0.0001);
      boundary = max(
        boundary,
        max(openEdge, step(0.0016, relativeStep) * ownerDifference)
      );
    }
    return boundary;
  }

  float paperOccluder(
    float centerDepth,
    float centerOwner,
    float centerPolicySlot,
    vec2 sampleUv
  ) {
    float occluderDepth = sampledDepth(sampleUv);
    if (contourSurfaceKind(sampleUv, occluderDepth) < 2.5) return 0.0;
    float ownerDifference = max(
      step(0.00024, abs(centerOwner - sampledCarrierOwner(sampleUv))),
      step(0.5, abs(centerPolicySlot - sampledPolicySlot(sampleUv)))
    );
    float relativeStep = (centerDepth - occluderDepth) / max(centerDepth, 0.0001);
    return step(0.0016, relativeStep) * ownerDifference;
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
    float collageProfile = step(1.5, visualizationMode);
    float agedDioramaProfile = step(2.5, visualizationMode);
    float contourWidthScale = mix(1.0, visualizationContourProfile.x, collageProfile);
    float creaseContourStrength = mix(1.0, visualizationContourProfile.y, collageProfile);
    float ownerContourStrength = mix(1.0, visualizationContourProfile.z, collageProfile);
    float secondaryContourStrength = mix(1.0, visualizationContourProfile.w, collageProfile);
    float contourMotionScale = mix(1.0, 0.28, collageProfile);
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
      + wanderOffset * pixel * contourWander * displayScale * contourMotionScale
      + boilOffset * pixel * contourJitter * displayScale * contourMotionScale;
    float effectiveContourWidth = contourWidth * contourWidthScale;
    float mainEdge = resolveSceneEdge(sceneEdges(
      sampleUv,
      pixel,
      effectiveContourWidth * displayScale,
      depthThreshold,
      normalThreshold
    ), creaseContourStrength, ownerContourStrength);
    vec2 echoOffset = vec2(
      valueNoise(boilCell * 0.71 + contourSeed * 31.0),
      valueNoise(boilCell * 0.83 + contourSeed * 47.0)
    ) - 0.5;
    float echoEdge = resolveSceneEdge(sceneEdges(
      sampleUv + echoOffset * pixel * 1.35 * displayScale,
      pixel,
      effectiveContourWidth * 0.88 * displayScale,
      depthThreshold,
      normalThreshold
    ), creaseContourStrength, ownerContourStrength);
    float ghostEdge = resolveSceneEdge(sceneEdges(
      inkedUv - echoOffset * pixel * 1.8 * displayScale,
      pixel,
      effectiveContourWidth * contourGhostSpread * displayScale,
      depthThreshold,
      normalThreshold
    ), creaseContourStrength, ownerContourStrength);
    float graphitePickup = mix(
      1.0,
      smoothstep(0.08, 0.72, hash21(gl_FragCoord.xy * 0.63 + contourSeed * 101.0)),
      contourGranulation
    );
    // Cut-paper silhouettes are inked with a continuous edge. Reusing the
    // graphite pickup mask here punched bright, single-pixel holes through the
    // contour; those holes shimmered as the object crossed the pixel grid.
    graphitePickup = mix(graphitePickup, 1.0, collageProfile);
    float pressureWander = mix(
      0.72,
      1.08,
      valueNoise(paperPoint / 31.0 + contourSeed * 53.0)
    );
    pressureWander = mix(pressureWander, 1.0, collageProfile);
    float contour = mainEdge * contourOpacity * graphitePickup * pressureWander;
    // Secondary graphite passes may roughen an existing guide, but must never
    // become detached screen-space antennae around a small feature.
    float secondaryGuide = smoothstep(0.02, 0.62, mainEdge);
    contour += echoEdge
      * contourEchoOpacity
      * secondaryContourStrength
      * secondaryGuide
      * (1.0 - mainEdge * 0.55);
    contour += ghostEdge
      * contourGhostOpacity
      * secondaryContourStrength
      * secondaryGuide
      * (1.0 - mainEdge * 0.72)
      * (1.0 - echoEdge * 0.4);
    contour = clamp(contour, 0.0, 1.0) * surface;

    vec4 albedo = texture2D(albedoTexture, inkedUv);
    vec2 viewPosition = (gl_FragCoord.xy - resolution * 0.5) / resolution.y;
    vec4 surfaceData = texture2D(surfaceTexture, inkedUv);
    float carrierOwner = sampledCarrierOwner(inkedUv);
    float paperCarrier = step(2.5, contourSurfaceKind(inkedUv, stableDepth));
    // Drawing media live in the view: moving the camera exposes a fresh field,
    // which preserves graphite redraw. Material treatments below use the
    // part-local position stored by the carrier instead.
    vec2 depositedPosition = viewPosition;
    float partPhase = carrierOwner * 19.0;
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
    float collageMaterialClass = floor(markData.a + 0.0001);
    float markScale = max(0.1, (fract(markData.a) - 0.5) * 48.0);
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

    float assetSurface = step(0.49, fract(markData.a)) * surface;
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

    // Scene visualizations are uniform branches. The default path performs no
    // additional sampling or noise work; expensive torn-paper synthesis is
    // paid only by the collage treatment that asks for it.
    if (visualizationMode > 0.5 && visualizationMode < 1.5) {
      float luminance = dot(color, vec3(0.2126, 0.7152, 0.0722));
      float graphiteValue = smoothstep(0.015, 0.96, pow(luminance, 0.86));
      vec3 sepiaInk = vec3(0.026, 0.023, 0.018);
      vec3 ivory = mix(paperColor, vec3(0.92, 0.79, 0.56), 0.12);
      vec3 sepia = mix(sepiaInk, ivory, graphiteValue);
      float sepiaTooth = grain * 0.045
        + (hash21(gl_FragCoord.xy * 0.53 + visualizationSeed * 67.0) - 0.5) * 0.018;
      sepia *= 1.0 + sepiaTooth;
      color = mix(color, sepia, visualizationColorStrength);
    } else if (visualizationMode > 1.5) {
      // Collage starts from authored semantic pigment rather than the already
      // synthesized medium bed. That keeps the source hue while avoiding the
      // low-frequency fill marks becoming terrain-sized digital blobs.
      vec3 displayPigment = pow(clamp(albedo.rgb, 0.0, 1.0), vec3(1.0 / 2.2));
      float collageLuminance = dot(displayPigment, vec3(0.2126, 0.7152, 0.0722));
      vec3 muted = mix(
        vec3(collageLuminance),
        displayPigment,
        mix(0.82, 0.68, agedDioramaProfile)
      );
      vec3 warmNeutral = vec3(
        collageLuminance * 1.025,
        collageLuminance,
        collageLuminance * 0.91
      );
      muted = mix(muted, warmNeutral, mix(0.08, 0.18, agedDioramaProfile));
      muted = pow(
        clamp(muted, 0.0, 1.0),
        vec3(mix(1.08, 1.16, agedDioramaProfile))
      );
      float rawChroma = max(displayPigment.r, max(displayPigment.g, displayPigment.b))
        - min(displayPigment.r, min(displayPigment.g, displayPigment.b));
      float chromaticRoadCandidate = (1.0 - smoothstep(
        mix(0.08, 0.15, agedDioramaProfile),
        mix(0.17, 0.29, agedDioramaProfile),
        rawChroma
      )) * (1.0 - smoothstep(0.52, 0.68, collageLuminance));
      float secondaryPaper = 1.0 - step(
        0.5,
        abs(collageMaterialClass - 5.0)
      );
      float agedRoadCandidate = secondaryPaper
        * (1.0 - smoothstep(0.55, 0.72, collageLuminance));
      float roadSheet = mix(chromaticRoadCandidate, agedRoadCandidate, agedDioramaProfile);
      muted = mix(
        muted,
        mix(vec3(0.18, 0.17, 0.15), vec3(0.24, 0.235, 0.22), agedDioramaProfile),
        roadSheet * mix(0.82, 0.96, agedDioramaProfile)
      );
      float agedGroundSheet = 1.0 - step(
        0.5,
        abs(collageMaterialClass - 1.0)
      );
      muted = mix(
        muted,
        vec3(0.36, 0.36, 0.25),
        agedGroundSheet * agedDioramaProfile * 0.96
      );
      float steps = max(2.0, visualizationPosterizeSteps);
      vec3 posterPigment = floor(muted * steps + 0.5) / steps;
      posterPigment = pow(posterPigment, vec3(2.2));
      // Collage pigment is a cut sheet, not a wash. Keep the semantic colour
      // opaque and let only fine paper tooth perturb it; low-frequency medium
      // noise reads as giant airbrushed stains once the camera pulls back.
      vec3 localMaterial = materialCoordinates(surfaceData.rgb);
      vec2 materialPoint = localMaterial.xy * 18.0 + vec2(
        partPhase * 0.73 + policySlot * 2.17 + localMaterial.z * 13.0,
        partPhase * 1.11 + policySlot * 1.37 + localMaterial.z * 19.0
      );
      float fiberBand = sin(
        dot(materialPoint, vec2(1.37, 0.31))
          + valueNoise(materialPoint / 29.0 + visualizationSeed * 37.0) * 4.2
      ) * 0.5 + 0.5;
      float crossFiber = valueNoise(
        materialPoint * vec2(0.075, 0.54) + visualizationSeed * 91.0
      ) - 0.5;
      float materialGrain = valueNoise(
        materialPoint / 3.2 + vec2(paperSeed * 97.0, paperSeed * 53.0)
      ) - 0.5;
      float paperFiber = (
        materialGrain * 0.22
          + (hash21(
            materialPoint * 0.41 + visualizationSeed * 113.0
          ) - 0.5) * 0.16
          + (fiberBand - 0.5) * mix(0.2, 0.055, agedDioramaProfile)
          + crossFiber * mix(0.24, 0.16, agedDioramaProfile)
      ) * visualizationPaperProfile.x;
      vec3 collagePigment = clamp(posterPigment * (1.0 + paperFiber), 0.0, 1.0);
      if (agedDioramaProfile > 0.5) {
        // The generated target reads as old stock because its variation is
        // broad and softly abraded, never salt-and-pepper noise. Anchor the
        // field to each semantic part so cars carry their paper in motion.
        float broadPatina = valueNoise(
          materialPoint / 76.0
            + vec2(visualizationSeed * 47.0, visualizationSeed * 19.0)
        );
        float compressedPatina = smoothstep(0.14, 0.88, broadPatina);
        collagePigment *= mix(0.88, 1.045, compressedPatina);
      }
      float cutPlaneTone = mix(0.78, 1.04, steppedPlaneTone);
      collagePigment *= mix(
        1.0,
        cutPlaneTone,
        facetedResponse * visualizationPaperProfile.y
      );
      vec3 collagePaper = clamp(paperColor * (1.0 + paperFiber * 0.42), 0.0, 1.0);
      vec3 collageDeposit = mix(collagePaper, collagePigment, assetSurface);
      color = mix(color, collageDeposit, visualizationColorStrength);

      vec2 shadowOffset = visualizationCutShadow.yz * pixel * displayScale;
      vec2 shadowNormal = normalize(vec2(-shadowOffset.y, shadowOffset.x) + vec2(0.000001));
      vec2 penumbra = shadowNormal
        * pixel
        * displayScale
        * visualizationCutShadow.w;
      float cutShadow = 0.0;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 0.72
      ) * 0.24;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 1.35
      ) * 0.23;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 2.15
      ) * 0.18;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 1.2 + penumbra
      ) * 0.13;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 1.2 - penumbra
      ) * 0.13;
      cutShadow += paperOccluder(
        stableDepth,
        carrierOwner,
        policySlot,
        inkedUv - shadowOffset * 3.1
      ) * 0.09;
      cutShadow *= (1.0 - mainEdge * 0.46)
        * visualizationCutShadow.x
        * paperCarrier
        * surface;
      color *= 1.0 - cutShadow;

      float tornNoise = valueNoise(
        materialPoint / max(0.25, visualizationTornEdgeScale)
          + vec2(visualizationSeed * 79.0, visualizationSeed * 43.0)
      );
      // Keep the cut subtly irregular without revealing a bright dashed core.
      // A continuous low-frequency value survives motion much better than a
      // thresholded screen-space mask.
      float tornPickup = mix(0.68, 1.0, tornNoise);
      float cutBoundary = frontPaperBoundary(
        inkedUv,
        pixel,
        max(1.0, effectiveContourWidth * displayScale)
      );
      float tornRim = cutBoundary * surface * tornPickup * visualizationTornEdgeStrength;
      float cutFiber = clamp(tornRim * 1.45, 0.0, 0.34);
      vec3 cutFiberColor = mix(color * 0.82, vec3(0.18, 0.15, 0.11), 0.18);
      float groundPaper = 1.0 - step(0.5, abs(collageMaterialClass - 1.0));
      groundPaper = max(groundPaper, roadSheet);
      cutFiberColor = mix(
        cutFiberColor,
        vec3(0.5, 0.4, 0.27),
        groundPaper * agedDioramaProfile * 0.72
      );
      color = mix(color, cutFiberColor, cutFiber);
    }

    float resolvedContour = clamp(
      contour * (1.0 + visualizationContourBoost),
      0.0,
      1.0
    );
    color = mix(color, contourColor, resolvedContour);
    // The albedo pass contains the carrier opacity even where its RGB is
    // deliberately replaced by paper/background. Using background alpha on
    // carrier pixels made a correctly synthesized pigment bed transparent.
    float alpha = albedo.a;
    alpha = max(alpha, max(depositedPigment, resolvedContour));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;
