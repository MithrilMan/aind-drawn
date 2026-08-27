# Compiled rendering

The procedural blueprint remains the canonical authored asset. Compilation is
a renderer-owned projection of that immutable blueprint, not a second asset
format and not a replacement for semantic identity.

## Why compile

An articulated procedural asset may contain dozens of useful semantic meshes.
Submitting each mesh once per G-buffer attachment multiplies driver work until
scene complexity is measured in draw calls rather than in visible content.
Serialising the same object graph would shorten construction while preserving
that cost. The inked-solid compiler instead changes the submission topology.

For every immutable scene registration it:

1. resolves opaque carrier parts and authored semantic strokes;
2. packs their indexed geometry and semantic attributes into one artifact;
3. assigns each source part a skeleton bone;
4. writes all G-buffer attachments in one MRT draw; and
5. composites the shared attachments once per scene.

Articulation, root motion, visibility, stroke reveal, and per-instance medium
policy remain live. Source world transforms are copied to bones immediately
before rendering. Vertex data is immutable after compilation.

## Identity and ownership

`InkedSolidCarrierCompilationCache` is owned by `InkedSolidScenePass`. Its exact
key contains the compiler version and complete geometry and projection policy;
the shorter fingerprint is diagnostic identity, not collision authority.
Artifacts are leased by registrations and disposed when their last lease is
released. Disposing the pass releases the remaining renderer resources.

`SolidSceneResourceCache` is a separate construction cache. It shares immutable
`BufferGeometry` and surface resources between equal `SolidRig` blueprints in
one scene. A rig owns only its lease and its instance state. The scene owner
must dispose registrations, then rigs, then the resource cache.

## Dynamic geometry

Changing object transforms, poses, visibility, or reveal is compatible with a
compiled carrier. A registration is dynamic only when code mutates its vertex
or index buffers after registration. Such callers must declare
`geometryUsage: 'dynamic'`; they keep live source proxies while still using the
single MRT geometry pass. This explicit exception prevents accidental fallback
of the entire scene.

## Storage boundary

The current compiler is an in-memory JIT because procedural seeds and product
configuration create assets at runtime. A future build-time container may
serialise the same versioned packed arrays when cold-start profiling justifies
it. That container must validate compiler version and content fingerprint and
must not expose Three.js objects as the durable format. It optimises loading;
the packed carrier and MRT path optimise frames.

## Verification

Use `pnpm benchmark:inked-solid` for carrier synchronisation and submission
regressions, `pnpm benchmark:solid-runtime` for construction-cache regressions,
and Paper Circuit's `?route-profile=1` mode for real renderer draw calls,
triangles, render CPU, visible instances, and submitted proxy meshes along the
whole route. Browser measurements must be taken with an active visible tab;
background-tab frame intervals are intentionally throttled and are not valid
FPS evidence.
