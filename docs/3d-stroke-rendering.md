# Three-dimensional stroke rendering

## Decision

The drawn and smooth-solid projections remain separate renderable
representations of one semantic asset identity. A third, **inked-solid**
representation can combine real volume with hand-authored marks, but it must
not be implemented by projecting the raster sprite onto a mesh.

The target look is built from four cooperating systems driven by the same
`MediumId` vocabulary used by raster assets:

1. physical-finish-independent doodle pigment;
2. semantic surface strokes attached to named parts;
3. view-dependent contours and creases;
4. medium-specific seeded surface texture with restrained temporal boil.

This keeps an eye line attached to the eye socket, a sleeve seam attached to
the arm, a cornice attached to a facade, and a mouth expression attached to the
animated face while the camera moves around the asset.

## Why a hybrid is necessary

A line in a drawing can describe different things. Some lines belong to the
object, such as a mouth, hair strand, panel seam, or crack. Others describe the
current view, such as the outer silhouette. Treating both as `EdgesGeometry`
loses authored identity and produces every triangulation edge; baking both into
a texture makes line weight and silhouettes fail as the camera moves.

The inked-solid projection therefore separates the responsibilities:

| Stroke source | Coordinate space | Typical use | Animation behaviour |
| --- | --- | --- | --- |
| Doodle fill | Part-local position and view normal | Graphite pickup, wash, bristle marks, chalk grain, or marker passes | Ignores PBR finish; follows the rendered surface |
| Semantic stroke | Part-local surface coordinates | Mouth, eyelid, hair, seams, scars | Inherits the semantic node transform |
| Contour pass | Screen space from depth and normals | Silhouette and selected creases | Recomputed for the active camera |
| Medium field | Triplanar object space | Graphite hatch, ink pooling, watercolor wash, oil bristles, chalk grain, marker bands | Stable on the surface; seed controls boil |

All four systems are implemented. Family adapters author semantic marks while
the runtime remains asset-agnostic; marks are never inferred from triangulation
edges.

## Implemented contract

`createInkedSolidBlueprint` retains the exact source solid by reference and
adds immutable renderer-neutral policy:

```ts
type InkedSolidContourPolicy = Readonly<{
  color: RgbColor;
  width: number;
  opacity: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

type InkedSolidBlueprint = Readonly<{
  representation: 'inked-solid';
  id: string;
  kind: string;
  seed: Seed;
  medium: MediumId;
  solid: SolidAssetBlueprint;
  contour: InkedSolidContourPolicy;
  fill: InkedSolidFillPolicy;
  hatching: InkedSolidHatchPolicy | null;
  paper: InkedSolidPaperPolicy;
  strokes: readonly InkedSolidStrokeSpec[];
}>;
```

The policy is serialisable and contains no Three.js objects. Medium is required:
there is no second 3D-only drawing taxonomy and no implicit fallback hidden in
the runtime. `inkedSolidMediumDefaults(medium)` compiles the shared medium into
volumetric contour, coverage, surface, and paper policies; explicit options are
advanced overrides. Setting `hatching: null` disables hatch families without
changing the rest of the medium or the source solid. The runtime consumer is
`InkedSolidPass`, used unchanged by both the character and building labs.

```ts
const raster = createRasterCharacterBlueprint(identity, { medium: 'watercolor' });
const inked = createInkedSolidBlueprint(solid, {
  medium: 'watercolor',
  strokes: createSolidCharacterInkStrokes(solid),
});
```

## Rendering pipeline

### 1. Doodle pigment

The pass temporarily replaces scene mesh materials with unlit albedo adapters
that preserve semantic color, opacity, maps, and sidedness. It never renders
the smooth solid's roughness, metalness, clearcoat, or specular response.
Discrete normal-based volume shading, object-local medium coverage, paper tint,
and coherent grain are then composed in the final shader. Graphite, ink,
watercolor, oil, charcoal, and marker compile to distinct coverage functions.
The same asset can therefore remain ceramic in `Smooth solid` and become a
watercolor volume in `Doodle 3D` without changing identity or rebuilding geometry.

### 2. Semantic marks

`InkedSolidStrokeSpec` has a stable ID and named owner part. A path is either
explicit part-local points or superellipsoid surface directions plus a lift.
The latter survives proportion and head-shape changes because the runtime
resolves it against the owner's analytic surface. `InkedSolidStrokeRig` builds
thin five-sided tubes and parents them directly to the owner mesh. These are
deliberately real ink volumes: whiskers can leave a face, a collar seam follows
an animated torso, and a door inset follows its hinge. Closed paths require at
least three points, all owners are validated, and seeded wobble is stable.

### 3. Contours

`InkedSolidPass` renders beauty with depth, then a normal buffer. The composite
shader detects relative view-depth discontinuities and normal creases. Line
width is screen-space and therefore remains legible as the camera moves.
Seeded low-frequency displacement is quantised by the configured boil frame
rate; independent noise every frame would be shimmer, not pencil.

### 4. Medium surface

The pass renders an additional half-float object-local position buffer. The
composite shader derives the local surface normal from position derivatives and
builds the selected medium field. Graphite and ink may add broken hatch
families; watercolor uses broad low-frequency washes; oil and marker use
directional bands; chalk uses coarse granular pickup. This extra buffer is
deliberate: screen- or world-space marks would swim over a rotating limb or
hinged door. Seeded wander breaks mechanical repetition, while quantised boil
remains stable between ticks. Line-boil displacement applies only to contour
lookup; albedo, surface membership, and local position remain stable. Moving the
fill lookup would tear paper-colored gaps around overlapping semantic parts.

## 2.5D variant

The same semantic stroke data also supports a cheaper 2.5D projection. Raster
layers can be placed on shallow depth planes while selected face and body marks
are lifted into ribbons. This preserves most of the graphite drawing and adds
parallax, but it cannot provide a convincing rear or profile view. It is a
distinct camera-limited representation, not a low-quality substitute for the
inked solid.

## Delivery state

1. **Shipped:** one generic Three.js contour pass consuming any
   `SolidAssetBlueprint` through `InkedSolidBlueprint`.
2. **Shipped:** all six raster media projected into stable object-local fields,
   with quantised boil timing.
3. **Shipped proof:** the same runtime on a complete animated character and an
   interactive building.
4. **Shipped:** physical-finish-independent doodle pigment.
5. **Shipped:** semantic surface strokes on character face/body and building
   facade/roof/door, including cat whiskers and articulated ownership.
6. **Next:** extend semantic authoring to vehicles, props, and plants as those
   solid families are introduced.

The runtime is already generic. New families add stroke recipes, not shader
branches or renderer subclasses.
