# Solid and Doodle 3D authoring

Read this reference when adding a real-volume representation or projecting it
as a hand-drawn 3D view. Also read `docs/3d-stroke-rendering.md`,
`src/assets/solid-types.ts`, `src/assets/inked-solid/blueprint.ts`,
`src/runtime/solid-rig.ts`, `src/runtime/inked-solid-pass.ts`, and
`src/runtime/inked-solid-stroke-rig.ts`.

## Preserve the representation boundary

`SolidAssetBlueprint` owns semantic volume, nodes, parts, materials, bounds,
colliders, sockets, and interactions. `createInkedSolidBlueprint` wraps that
exact blueprint by reference and adds drawing policy only.

Never:

- copy or reroll solid geometry for Doodle 3D;
- project the raster sprite onto the mesh;
- make the smooth physical surface visible beneath the doodle;
- introduce a second 3D-only medium taxonomy;
- branch in the renderer on asset kind, part ID, or family name.

The mesh is an invisible carrier for depth, occlusion, normals, semantic
material colour, material membership, and part ownership.

## Build the solid first

Choose geometry from topology rather than convenience:

- smooth analytic hosts use superellipsoids and shared surface evaluation;
- hard planar objects use boxes or deliberately faceted meshes;
- shallow profile volumes use extruded profiles;
- arbitrary volumes use mesh specifications with explicit smoothing intent;
- wraps and shells require real circumferential geometry;
- articulated features own nodes at their physical pivots.

Use stable node and part IDs. Feature placement derives from the same analytic
or modelled surface that created the host. `surfaceFrame` supplies a tangent
basis for surface-mounted parts; adapter-local camera guesses do not.

`SolidRig` owns the Three.js geometries and materials created from serialisable
specifications. It also owns their disposal.

## Share medium and tone intent

Pass an explicit `MediumId` to `createInkedSolidBlueprint`, normally the same
medium used by the raster preview of that identity. Graphite, ink, watercolor,
oil, chalk, and marker are shared drawing media.

`SolidFinishId` affects only smooth-solid rendering. Skin, glass, ceramic,
rubber, and metal are physical finishes, not drawing media. Changing finish
must not alter inked deposition or semantic strokes.

Semantic material RGB is the exact pigment source. Do not pre-darken, lighten,
fog, or mix it with paper, contour ink, or scene lighting. When seeded tonal
hierarchy must converge with raster output, derive it beside identity and set
`SolidMaterialSpec.drawing.tone`; material role is only the generic fallback.

## Understand the four drawing systems

### Pigment bed

Every visible carrier region starts as opaque drawing paper. The medium
deposits an irregular bed using semantic pigment colour. Continuous mesh albedo
and PBR lighting never enter the final doodle.

Derive that bed and its visible gestures from the raster operation, not from a
generic notion of shading. Watercolour is layered translucent coverage, Ink is
coverage plus its restrained density-gated hatch, and Oil is an opaque bed plus
broken pigment daubs. Preserve those distinctions centrally for every family.

### View-synthesised marks

The shared medium compiler maps material role or authored tone to hatch,
crosshatch, scribble, stipple, wash, bristle, marker, or solid marks. Fields are
view-oriented, translated by the projected origin of their owning semantic
part, and clipped by material membership. Animation therefore carries marks
without turning them into UV textures.

These marks are the medium's visible fill vocabulary, not optional lighting.
Keep them enabled in product views. `viewMarks: false` is an authoring diagnostic
for isolating the pigment bed, not a user-facing Doodle style.

### Contours

The camera pass derives silhouettes and selected creases from depth and
normals. Static wander, pressure variation, broken pickup, echoes, and optional
quantised boil make precise carrier edges read as drawn without corrupting
geometry or colliders. Independent random noise every frame is shimmer, not
line boil.

### Semantic spatial strokes

Family adapters author marks with real spatial meaning: mouths, eyelids,
whiskers, seams, wires, scars, cornices, and lifted paths. Each
`InkedSolidStrokeDefinition` names its owner part and uses either:

- `superellipsoid-surface` directions plus lift for an analytic host;
- `part-local` points for boxes, profiles, meshes, or paths leaving a surface.

Use stable local points, small radii relative to the host, explicit closure,
and restrained deterministic wobble. These strokes supplement generic medium
deposition; they do not simulate an entire fill.

## Surface-flow invariants

Doodle 3D synthesises a fresh 2D drawing for the current camera, but adjacent
hard planes still need visual separation.

- Superellipsoids and `mesh.smooth: true` retain one view-oriented field at
  light-invariant deposited density. Their normals control occlusion, never
  turn filler into shadow or bend, rescale, or rephase the stroke path.
- Boxes, extruded profiles, and `mesh.smooth: false` are faceted carriers.
  Their visible plane normal may rotate and foreshorten directional marks.
- A geometric crease belongs in authored topology/smoothing, not in a
  screen-space curvature threshold. This keeps classification stable across
  camera distance, zoom, and viewport resolution.
- Two hard planes separated by a small angle may use different mark flow; a
  smoothly shaded sphere must never reveal its triangulation.
- Keep field frequency and phase invariant inside one carrier region. On a
  faceted carrier, drawing light may change pressure or opacity, or reveal
  another fixed-frequency pass. Per-pixel scale changes create visible seams at
  quantised tone boundaries. Smooth carriers ignore drawing light for filler.
- Name this policy as plane separation (`planeSeparationStrength` and
  `planeSeparationSteps`), never shading. It articulates authored hard faces and
  must not imply a shadow system in the drawing medium.
- Vary pencil pickup continuously along the path. Do not impose periodic masks
  that split one line into aligned dashes and apparent kinks.

Paper grain alone stays stationary in screen space. View marks follow projected
parts but do not participate in line boil.

## Author a family's inked representation

1. Complete and test the solid identity, layout, and blueprint.
2. Add `src/assets/solid-<family>/ink-strokes.ts` only when semantic spatial
   marks are needed.
3. Locate owners by stable part ID and verify compatible geometry before
   creating a path.
4. Call `createInkedSolidBlueprint(solid, { medium, strokes })`.
5. Instantiate one generic `InkedSolidPass` and, when strokes exist, one
   `InkedSolidStrokeRig` around the exact same `SolidRig`.
6. On replacement, update pass policy without mutating solid identity.
7. Dispose `InkedSolidStrokeRig`, then `SolidRig`, and dispose the shared pass
   when the view is torn down.

## Verification matrix

Test that:

- wrapping retains `inked.solid === solid`;
- every stroke owner exists and path validation rejects incompatible geometry;
- all public media compile deterministic, distinct policy;
- raster and inked previews use the same medium and semantic pigment colours;
- physical finish changes do not change inked policy;
- authored tone overrides material-role fallback;
- representative light, hatch, scribble, and black tones preserve their
  relative density;
- one renderer works on at least one organic smooth asset and one architectural
  faceted asset without family branches.

In the browser inspect front, oblique, profile, close-up, and animated views.
Look specifically for sliding fill, colour flicker, triangulation seams,
topographic rings, periodic broken strokes, hair/eye occlusion, and loss of
plane separation. Compare the same identity and medium with raster output.
