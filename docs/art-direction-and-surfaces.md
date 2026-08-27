# Art direction, drawing media, and semantic surfaces

## Decision

AIND Drawn keeps identity, drawing technique, art direction, represented substance, and physical
shading as separate axes. They meet only while a projection is compiled or a renderer resource is
resolved.

| Concept | Answers | Public contract | Must not own |
| --- | --- | --- | --- |
| Identity | Who or what is this asset? | Family identity recipe | Renderer style, lighting, material instances |
| Semantic part | What does this region do? | `semanticPartId` and manifest | Path-shape guesses or renderer node indices |
| Art role | What visual job does the part perform? | `SemanticPartArtBinding` | Family-specific renderer branches |
| Substance | What is the represented part understood to be made from? | `SurfaceSubstance` | Three.js parameters |
| Drawing intent | How light, dark, calm, or energetic is the authored region? | `DrawingIntent` | Hatch, stipple, or shader commands |
| Drawing application | How is pigment applied to this region? | `DrawingApplication` | Physical roughness or metalness |
| Medium | What drawing technique deposits the pigment? | `MediumId` | Composition, backdrop, physical substrate |
| Raster hand | Which scoped implementation produces raster marks? | `RasterHand` | Global renderer state or identity choices |
| Art direction | What coherent visual rules govern the asset and scene? | `ArtDirectionRecipe` and `AssetAppearance` | Identity mutation or topology changes |
| Physical treatment | How should a smooth-solid renderer shade the surface? | `PhysicalSurfaceTreatment` | Doodle deposition policy |
| Inked-solid visualization | How is the completed drawn scene presented? | `InkedSolidVisualizationPolicy` | Medium deposition, semantic palette intent, geometry |

This separation is not taxonomy for its own sake. It allows the same identity to use Graphite in a
storybook direction on a fibrous matte surface, then switch to Ink or a cut-paper direction without
silently becoming another character. Folding those values into one `material` string would be
convenient for roughly eleven minutes.

Scene visualizations remain a final, scene-wide Inked Solid concern. The
`sepia-graphite` visualization can grade an already drawn composition without
pretending sepia is a drawing tool; `paper-collage` can add cut shadows and
fibrous projected boundaries without duplicating the semantic `cut-paper` art
direction. Use `cut-paper` when asset roles, palette response, paper, ground,
and lighting should change coherently. Use `paper-collage` when the completed
scene also needs the physical assembly cues of layered paper.

An Inked Solid projection may supply an `artDirection` override when the same
live `SolidRig` must be re-presented without rebuilding its geometry. The
projected blueprint keeps the exact wrapped solid required by the runtime, but
resolves semantic surfaces, roles, paper, and drawing policy through the
override appearance. This is the intended boundary for runtime style switching;
mutating or cloning the solid would break rig identity.

## The surface contract

`SemanticSurfaceSpec` contains three independent groups:

```ts
const hair = createSemanticSurface({
  id: 'hair',
  color: identity.palette.hair,
  substance: 'hair',
  drawing: {
    application: 'pigment',
    drawing: { value: 'dark', gesture: 'agitated' },
  },
  physical: {
    substrate: 'fiber',
    finish: 'flocked',
    roughness: 0.92,
    metalness: 0,
    clearcoat: 0,
  },
});
```

- `substance` is semantic. Hair remains hair in raster, Doodle 3D, smooth solid, export, and a
  future renderer.
- `drawing.application` and `drawing.drawing` are renderer-neutral drawn intent. A medium provider
  decides whether that becomes hatch, stipple, bristle pickup, a wash, or no explicit mark.
- `physical` is consumed only by smooth-solid rendering. `substrate` selects the carrier response;
  `finish` selects its treatment. Wood plus gloss is different from ceramic plus gloss, which is
  precisely why one overloaded finish enum was the wrong model.

Family blueprints publish `surfaces`, and parts reference them through `surfaceId`. Families never
construct Three.js materials. `SolidSurfaceResourceCache` resolves immutable physical materials at
the scene boundary and reference-counts them across rigs. Equal resolved surfaces share material
and procedural texture resources; the last lease releases the material, while the scene owner
releases cached texture profiles.

## Art direction

An `ArtDirectionRecipe` contains:

- palette transformation and base ink;
- drawing contour, spacing, pigment, and detail budgets;
- rules keyed by generic `ArtRole` values;
- physical shading modifiers;
- paper, backdrop, ground, and lighting direction for a consuming scene.

Each family owns one explicit semantic-part-to-role table. `character`, `building`, `vehicle`, and
`tree` IDs never occur in the generic resolver. A focal eye and a focal headlight can therefore
share a visual rule without pretending they are the same family concept. Unknown geometry is not
classified by its path size, taper, or position.

The built-in directions are `authored`, `storybook`, and `cut-paper`. They are deliberately recipes,
not new media:

```ts
const raster = createRasterCharacterBlueprint(identity, {
  medium: 'graphite',
  artDirection: 'storybook',
});

const solid = createSolidCharacterBlueprint(identity, {
  artDirection: 'storybook',
  physical: { substrate: 'ceramic', finish: 'satin' },
});

const doodle = createInkedSolidBlueprint(solid, {
  medium: 'graphite',
  strokes: createSolidCharacterInkStrokes(solid),
});
```

Every blueprint carries an immutable `AssetAppearance` with the resolved recipe, explicit part
bindings, and an `appearanceFingerprint`. `assetId`, identity, manifest, semantic topology, sockets,
colliders, and interaction contracts remain unchanged when direction changes. The appearance
fingerprint lets render caches distinguish visual compilation without contaminating content
identity.

### Projection behaviour

- Raster applies directed ink, paper, colour, contour width, and mark-spacing rules when a layer is
  baked. A custom `RasterHand` may explicitly override ink or paper and remains scoped to its rig,
  cache, bake, or audit.
- Doodle 3D resolves each `(semanticPartId, surfaceId)` pair, then compiles directed drawing intent,
  contour, detail budget, deposition, paper, and semantic strokes. Physical substrate and finish do
  not enter pigment synthesis.
- Smooth solid resolves the same part and surface through palette and physical direction rules,
  then acquires the result from the scene cache.
- Projection Studio applies the selected direction to all three views and uses its scene paper,
  backdrop, ground, and lighting values. Substrate and finish remain separate controls.

## Identity-preservation invariants

Art direction may change palette response, mark economy, contour weight, paper, lighting, and
physical response. It must not change:

- identity fields or `assetId`;
- semantic part ownership, topology, or articulation;
- geometry, sockets, colliders, or interaction state vocabulary;
- which decoration belongs to which semantic part;
- stable composition decisions between boil frames.

If a direction eventually needs a collage cut, substitution, or silhouette change, that decision
must be resolved as immutable semantic appearance data before rendering. It must not be inferred
inside a draw callback or shader from an arbitrary path.

## Performance rules

- Direction is resolved while blueprints, frames, or renderer resources are compiled, never through
  family branches in the steady-state frame loop.
- `RasterFrameCache` keys immutable baked frames by exact blueprint/layer/state/frame ownership.
- `SolidSurfaceResourceCache` is scene-scoped; a process-global cache would retain unbounded seeds.
- Doodle stroke reveal stores normalized progress once in geometry and advances one shared shader
  uniform through `setStrokeReveal`. It does not rebuild tubes per frame.
- Worker raster baking sends a serialisable identity payload and reconstructs the blueprint inside
  the worker. Draw callbacks never cross structured clone.

`pnpm benchmark:solid-runtime` measures sixteen character rigs. The 2026-08-25 development-machine
run averaged 244.74 ms with independent physical resources, 153.92 ms with one concurrent scene
cache, and 147.90 ms when the scene already retained those resources: a 1.65x construction gain for
the resident-cache case. Geometry construction still dominates, so the cache is useful rather than
magical. It also reduces live GPU material and texture duplication, which this CPU-only benchmark
does not price.

The contracts are intentionally renderer-agnostic. A future Pixi, WebGPU, CanvasKit, or export
adapter should consume the same blueprint, appearance, and semantic surfaces, then own its resource
mapping and lifecycle.
