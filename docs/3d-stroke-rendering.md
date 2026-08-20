# Three-dimensional stroke rendering

## Decision

The drawn and smooth-solid projections remain separate renderable
representations of one semantic asset identity. A third, **inked-solid**
representation can combine real volume with hand-authored marks, but it must
not be implemented by projecting the raster sprite onto a mesh.

The target look is built from three cooperating systems:

1. semantic surface strokes attached to named parts;
2. view-dependent contours and creases;
3. seeded surface hatching with restrained temporal boil.

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
| Semantic stroke | Part-local surface coordinates | Mouth, eyelid, hair, seams, scars | Inherits the semantic node transform |
| Contour pass | Screen space from depth and normals | Silhouette and selected creases | Recomputed for the active camera |
| Hatch field | UV or triplanar object space | Graphite shading and material grain | Stable on the surface; seed controls boil |

The generic contour and hatching systems are now implemented. Semantic surface
strokes remain the next layer; they require an honest surface-coordinate model
and must not be faked with triangulation edges.

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
  solid: SolidAssetBlueprint;
  contour: InkedSolidContourPolicy;
  hatching: InkedSolidHatchPolicy | null;
  paper: InkedSolidPaperPolicy;
}>;
```

The policy is serialisable and contains no Three.js objects. Setting
`hatching: null` disables graphite without changing the source solid. The
runtime consumer is `InkedSolidPass`, used unchanged by both the character and
building labs.

## Rendering pipeline

### 1. Semantic marks — next extension

The planned `SurfaceStrokeSpec` must identify a stable location on an authored
primitive or mesh, not a Three.js world-space point. For a superellipsoid this
can be a pair of surface parameters plus an offset; for a mesh it can be a
triangle id and barycentric coordinates. The runtime will resolve narrow ribbon
geometry slightly above the surface. Ribbons are the
default because their width can remain approximately constant on screen;
tubes are useful only when a stroke must read as physical wire or thick paint.
Each mark has a stable seed, named owner, and local coordinates. Facial
expressions switch semantic stroke variants exactly as the current solid mouth
parts do.

### 2. Contours

`InkedSolidPass` renders beauty with depth, then a normal buffer. The composite
shader detects relative view-depth discontinuities and normal creases. Line
width is screen-space and therefore remains legible as the camera moves.
Seeded low-frequency displacement is quantised by the configured boil frame
rate; independent noise every frame would be shimmer, not pencil.

### 3. Graphite surface

The pass renders an additional half-float object-local position buffer. The
composite shader derives the local surface normal from position derivatives and
builds triplanar hatch families modulated by beauty luminance. This extra buffer
is deliberate: screen- or world-space hatching would swim over a rotating limb
or hinged door. Seeded wander breaks the mechanical grid, while the quantised
boil remains stable between ticks.

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
2. **Shipped:** stable object-local graphite hatching and quantised boil timing.
3. **Shipped proof:** the same runtime on a complete animated character and an
   interactive building.
4. **Next:** semantic surface strokes on a character face and building facade.
5. **Then:** extend stroke authoring to props and plants after those two proofs
   validate the coordinate model.

The fifth step is deliberately last. Generalising stroke coordinates before those two proofs
would produce a handsome type system for geometry nobody has successfully
drawn yet.
