# Compiled inked-solid rendering

Date: 2026-08-27

## Decision

Treat procedural blueprints as canonical authored assets and compile immutable
inked-solid registrations into renderer-owned packed carriers. Do not confuse
object-graph serialisation with frame-time optimisation: a stored graph would
still reproduce the old submission topology.

## Runtime shape

- `InkedSolidScenePass` owns an exact-keyed, versioned compilation cache.
- One registration becomes one indexed `SkinnedMesh`; source solid parts map to
  bones, so articulation and visibility remain live without per-part proxies.
- One WebGL2 MRT geometry pass writes albedo, marks, owner/flow, normals, and
  shared depth; one composite pass produces the drawing.
- Semantic stroke geometry is packed with the carrier. Reveal is one shared
  uniform over immutable per-vertex progress windows.
- Vertex-mutating effects must opt into `geometryUsage: 'dynamic'`. Transform
  animation is compatible with the compiled path.
- `SolidSceneResourceCache` separately shares exact immutable geometry and
  physical surfaces across scene rigs. Dispose registrations, rigs, then cache.
- Mobile Paper Circuit uses lower render-detail geometry. Gameplay shapes and
  semantic blueprint identity remain unchanged.
- The menu no longer constructs the race stage or vehicle preview renderers.
  Race/Explore construct on demand; returning to menu releases them.

## Measurements

The old 390x844 route profile reached 4,148 draw calls, 1.73 million triangles,
and 36.29 ms render CPU in the grandstand segment. A post-change mobile browser
route sample reported 4-10 real draw calls across route bins, roughly 89,805
mean triangles, five mean submitted proxies, and 5.31 ms mean render CPU. Its
tab was requestAnimationFrame-throttled, so frame interval and FPS from that run
are invalid; retain only submission and CPU timings as directional evidence.

The repeatable mock-renderer benchmark for 48 animated instances reports 2
render calls and about 0.262 ms mean synchronisation. The repeated-rig benchmark
reports approximately 242 ms with independent resources versus 12.4 ms with
compiled geometry and scene-shared surfaces (about 19.6x faster on that host).
The typed two-pass packer registered a complete 67-instance mobile stage in
about 225 ms. The authored-detail desktop stage took about 381 ms, down from a
roughly 546 ms sample taken before typed preallocation.

## Pitfalls

- Cache keys must use full exact policy/geometry data. A short fingerprint is
  diagnostic identity only and cannot be collision authority.
- Hidden bone transforms must stay invertible because the vertex shader derives
  a normal matrix even for geometry translated outside the viewport.
- Keep dynamic geometry fallback narrow. Accidentally labelling transform-only
  assets dynamic restores proxy pressure for no benefit.
- Build-time packed storage may later reduce cold-start cost, but only after
  target-device evidence. It must be versioned renderer-neutral arrays, not
  serialised Three.js objects.

## Verification

- `pnpm verify`: 22 files, 262 tests, library API snapshot, and all experiment
  builds passed.
- `pnpm benchmark:inked-solid` and `pnpm benchmark:solid-runtime` passed.
- Desktop and 390x844 browser QA rendered menu and race without WebGL warnings.
