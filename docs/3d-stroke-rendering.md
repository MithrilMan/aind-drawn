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

## Proposed contract

The first implementation should extend the solid projection with an optional
stroke blueprint rather than changing character identity or gameplay recipes.
The exact TypeScript API should be introduced only with the first runtime
consumer, but the data boundary is:

```ts
type SurfaceStrokeSpec = Readonly<{
  id: string;
  nodeId: string;
  path: readonly SurfaceCoordinate[];
  width: number;
  lift: number;
  materialId: string;
  seed: number;
  geometry: 'ribbon' | 'tube';
}>;

type InkedSolidBlueprint = Readonly<{
  solid: SolidAssetBlueprint;
  strokes: readonly SurfaceStrokeSpec[];
  contour: ContourPolicy;
  hatching: HatchPolicy | null;
}>;
```

`SurfaceCoordinate` must identify a stable location on an authored primitive
or mesh, not a Three.js world-space point. For a superellipsoid this can be a
pair of surface parameters plus an offset; for a mesh it can be a triangle id
and barycentric coordinates. The runtime resolves those coordinates to lifted
ribbons or tubes and parents the result to `nodeId`.

## Rendering pipeline

### 1. Semantic marks

Generate narrow ribbon geometry slightly above the surface. Ribbons are the
default because their width can remain approximately constant on screen;
tubes are useful only when a stroke must read as physical wire or thick paint.
Each mark has a stable seed, named owner, and local coordinates. Facial
expressions switch semantic stroke variants exactly as the current solid mouth
parts do.

### 2. Contours

Render solid depth and normals into off-screen buffers, then detect silhouette
and selected normal discontinuities in a post-process pass. Line width belongs
in screen space. Seeded low-frequency displacement can roughen the result, but
the noise must be temporally coherent; independent noise every frame becomes
shimmer, not pencil.

### 3. Graphite surface

Use object-space or triplanar hatch fields modulated by lighting. Several
sparse line families are preferable to one dark texture. Keep the hatch seed
stable per material and quantise the boil to a low frame rate so it relates to
the raster adapter's line boil without crawling over the geometry.

## 2.5D variant

The same semantic stroke data also supports a cheaper 2.5D projection. Raster
layers can be placed on shallow depth planes while selected face and body marks
are lifted into ribbons. This preserves most of the graphite drawing and adds
parallax, but it cannot provide a convincing rear or profile view. It is a
distinct camera-limited representation, not a low-quality substitute for the
inked solid.

## Delivery sequence

1. Add one Three.js contour pass that consumes any `SolidAssetBlueprint`.
2. Prove semantic strokes on a character face and a building facade.
3. Add stable graphite hatching and shared boil timing.
4. Extend authoring to props and plants after organic and architectural assets
   prove the coordinate model.

The fourth step is deliberately last. Generalising before those two proofs
would produce a handsome type system for geometry nobody has successfully
drawn yet.
