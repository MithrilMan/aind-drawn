# Three-dimensional stroke rendering

## Decision

The drawn and smooth-solid projections remain separate renderable
representations of one semantic asset identity. A third, **inked-solid**
representation can combine real volume with hand-authored marks, but it must
not be implemented by projecting the raster sprite onto a mesh.

The solid mesh is an invisible carrier, never a visible shaded surface. The
target look is built from four cooperating systems driven by the same
`MediumId` vocabulary used by raster assets:

1. medium-specific pigment synthesized for the current camera projection;
2. semantic spatial strokes attached to named parts;
3. view-dependent contours and creases;
4. material-aware masks that clip marks to projected semantic regions.

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
| Pigment deposition | View-oriented, part-anchored drawing space | Graphite pickup, wash, bristle marks, chalk grain, or marker passes | Follows the projected owner part; ignores PBR finish |
| Semantic stroke | Part-local surface coordinates | Mouth, eyelid, hair, seams, scars | Inherits the semantic node transform |
| Contour pass | Screen space from depth and normals | Silhouette and selected creases | Recomputed for the active camera |
| View-mark field | View-oriented, part-anchored drawing space plus generic drawing application | Graphite hatch, dense pigment, ink pooling, watercolor wash, oil bristles, chalk grain, marker bands | Follows articulation; never participates in line boil |

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
  echoOpacity: number;
  ghostOpacity: number;
  ghostSpread: number;
  granulation: number;
  wander: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

type InkedSolidBlueprint = Readonly<{
  blueprintVersion: 1;
  family: string;
  representation: 'inked-solid';
  assetId: string;
  seed: Seed;
  medium: MediumId;
  solid: SolidAssetBlueprint;
  contour: InkedSolidContourPolicy;
  deposition: InkedSolidDepositionPolicy;
  viewMarks: readonly InkedSolidViewMarkPolicy[];
  paper: InkedSolidPaperPolicy;
  strokes: readonly InkedSolidStrokeSpec[];
}>;
```

The policy is serialisable and contains no Three.js objects. Medium is required:
there is no second 3D-only drawing taxonomy and no implicit fallback hidden in
the runtime. `inkedSolidMediumDefaults(medium)` compiles the shared medium into
volumetric contour, coverage, drawing-application view marks, and paper policies.
`SolidMaterialSpec.drawing` explicitly supplies both the deposition application
and authored tonal hierarchy across raster and solid adapters. There is no
fallback from asset or material names. Explicit
options are authoring diagnostics, not alternate user-facing render styles.
Setting `viewMarks: false` may isolate the pigment bed while debugging, but a
truthful Doodle projection keeps the medium's gesture marks enabled. The runtime
consumer is `InkedSolidScenePass`, used unchanged by character, building, vehicle, and future
solid families.

```ts
const raster = createRasterCharacterBlueprint(identity, { medium: 'watercolor' });
const inked = createInkedSolidBlueprint(solid, {
  medium: 'watercolor',
  strokes: createSolidCharacterInkStrokes(solid),
});

const pass = new InkedSolidScenePass(renderer);
const registration = pass.register({
  instanceId: rig.instanceId,
  blueprint: inked,
  rig,
});
```

Registration compiles part, material, topology, owner-anchor, and semantic-stroke lookups once.
Multiple instances of one solid blueprint and different media may share one pass; paper remains a
single scene-level policy and never depends on registration order. Dispose the registration
before its borrowed `SolidRig`, and dispose the pass when the drawing surface is torn down.

## Rendering pipeline

### 1. Invisible carrier and view synthesis

The pass renders semantic albedo with depth, normals, and material membership
from the real meshes, but uses those buffers only to decide occlusion,
contours, projected regions, discrete tone, and pigment colour. Every visible
carrier region begins as opaque drawing paper, not as transparent-clear black
and not as smooth albedo. The medium then deposits an irregular semantic-colour
pigment bed, gesture marks, and finally contour ink. Continuous carrier albedo
is never composited into the result.

The smooth solid's roughness, metalness, clearcoat, specular response, and even
its unlit continuous colour are therefore absent from Doodle 3D. Semantic
material RGB is the exact pigment source used by authored or procedural marks.
It is never pre-mixed with contour ink or paper and is never multiplied by
normal lighting. Smooth carriers keep light-invariant deposited density. Only
authored faceted carriers may use quantized plane separation to change pressure
or mark density across adjacent hard planes, never hue; paper, pigment, and
contour remain separate composite layers. Paper-space coverage, paper response,
and coherent grain modulate that synthesis. Graphite, ink, watercolor, oil, chalk, and
marker compile to distinct view fields. The same asset can remain ceramic in
`Smooth solid` and become a watercolor drawing with real occlusion and volume
in `Doodle 3D` without changing identity or rebuilding geometry.

### 2. Semantic marks

`InkedSolidStrokeSpec` has a stable ID and named owner part. A path is either
explicit part-local points or superellipsoid surface directions plus a lift.
The latter survives proportion and head-shape changes because the runtime
resolves it against the owner's analytic surface. `InkedSolidStrokeRig` builds
thin five-sided tubes and parents them directly to the owner mesh. These are
deliberately real ink volumes: whiskers can leave a face, a hair strand follows
an animated head, and a door inset follows its hinge. Closed paths require at
least three points, all owners are validated, and seeded wobble is stable.

### 3. Contours

`InkedSolidScenePass` renders every registered carrier into shared albedo/depth, material-mark,
owner-anchor, and normal/topology buffers. The composite
shader detects relative view-depth discontinuities and normal creases. Line
width is screen-space and therefore remains legible as the camera moves.
Authored ink geometry and semantic stroke volumes own their visible line and
are excluded from the generic contour detector; outlining them again would
produce a second boundary whose displaced copies become halos or detached
spikes. Carrier silhouettes and creases use the principal contour, combined
with a displaced echo and a wider, faint ghost pass. Those secondary passes are
gated by the principal guide, so they may roughen a line but cannot introduce a
new disconnected one. Seeded granulation breaks uniform digital coverage. Static
low-frequency `wander` displaces the projected guide and modulates pressure, so
precise carrier edges read as authored strokes without corrupting geometry,
colliders, or interaction anchors. Animated `jitter` is a separate displacement
quantised by the configured boil frame rate; independent noise every frame
would be shimmer, not pencil.

### 4. Camera-conditioned doodle synthesis

The pass renders a material-mark buffer. Each solid material's authored drawing
tone, or its role when no tone is authored, compiles to a renderer-neutral mark
style and coverage. Graphite hair can therefore retain the exact seeded
`black`, `hatch`, or `scribble` hierarchy selected by the shared drawing style;
generic skin and facades receive broken hatch, and clothing receives crosshatch.
Each medium then preserves its raster deposition operation: Watercolour uses
layered translucent coverage without directional bands, Ink reveals one fine
hatch only at the same tone densities as raster, and Oil combines an opaque bed
with broken bristle daubs. The composite shader generates those fields in normalized paper space
and clips them by the material membership visible from the active camera.
Graphite tone density is calibrated to the raster medium's relative spacing and
alpha: `light` remains an unhatched pigment bed, ordinary hatch retains its
authored interval, and `black` uses a materially denser multi-pass field. This
keeps tone hierarchy comparable without pretending pixels and projected surface
marks are numerically identical units.

This is intentionally not a texture wrapped around a mesh. Rotating the asset
changes projection, occlusion, and contours continuously, like drawing the
current view again, but it does not reroll a random field at arbitrary angular
thresholds. The pigment and gesture coordinates are translated by the projected
origin of the semantic part visible at each pixel. On explicitly faceted
carrier topology, the visible surface normal rotates and foreshortens
directional marks while discrete drawing light changes their density and
pressure. Adjacent wall or roof planes therefore separate through hatch flow
and tone even when they share one material. Smooth meshes and superellipsoids
retain one view-oriented 2D field at light-invariant deposited density. Their
geometry controls occlusion but never bends marks into topographic rings or
reinterprets filler as shadow. This classification is authored in
geometry smoothing rather than inferred from screen-space derivatives, so zoom
cannot change it. Pencil pickup varies continuously along each path. Each
projected pencil line receives a stable seeded lateral offset plus low-frequency
curvature, avoiding the mechanically regular spacing of a periodic hatch while
keeping the mark continuous. Paper abrasion may thin a stroke but does not split it into periodic, misaligned
dashes. On faceted carriers, drawing light may change deposited opacity or add a
fixed-frequency secondary pass, but it never changes a field's scale or phase per pixel; doing
so would restart strokes at every tone boundary. Limbs, tears, doors, and other
articulated parts still carry coherent marks through animation without becoming
UV textures. Stationary screen-space grain belongs to the paper, while
line-boil timing remains independent and affects only contour lookup.

## 2.5D variant

The same semantic stroke data also supports a cheaper 2.5D projection. Raster
layers can be placed on shallow depth planes while selected face and body marks
are lifted into ribbons. This preserves most of the graphite drawing and adds
parallax, but it cannot provide a convincing rear or profile view. It is a
distinct camera-limited representation, not a low-quality substitute for the
inked solid.

## Delivery state

1. **Shipped:** one generic registered Three.js scene pass consuming any
   `SolidAssetBlueprint` through `InkedSolidBlueprint`, including different per-instance media and
   contour policies on one scene paper.
2. **Shipped:** all six raster media projected into camera-conditioned paper
   fields, with role-aware masks and contour-only quantised boil timing.
3. **Shipped proof:** the same runtime on a complete animated character and an
   interactive building.
4. **Shipped:** an invisible geometric carrier with physical-finish-independent
   paper, pigment-bed, gesture, and contour deposition; continuous mesh albedo
   is never shown.
5. **Shipped:** semantic surface strokes on character face/body and building
   facade/roof/door, including cat whiskers and articulated ownership.
6. **Shipped:** semantic vehicle strokes, including wheel detail and articulated hood and cargo
   panel seams.
7. **Next:** author intentional faceted vehicle body topology, then extend semantic authoring to
   props and plants as those solid families are introduced.

The runtime is already generic. New families add stroke recipes, not shader
branches or renderer subclasses.
