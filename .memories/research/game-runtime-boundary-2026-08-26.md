# Game runtime boundary — 2026-08-26

## Decision

The repository now contains a sibling workspace package,
`@mithrilman/aind-game-runtime`, for renderer-neutral input and simulation
primitives. It is not part of the drawing library and does not depend on it.

The stable dependency direction is:

```text
game-runtime state -> experiment adapter -> aind-drawn public capabilities
```

The reverse dependency is forbidden. Core simulation must not inspect a
`SpriteRig`, `SolidRig`, Three.js scene, texture, mesh, or asset-family internal.

## Extracted primitives

- application-owned control schemas and provenance-preserving snapshots;
- data-driven standard gamepad mapping;
- a disposable browser controller behind the explicit `/browser` entry point;
- a bounded deterministic fixed-step accumulator with interpolation alpha and
  reported dropped time;
- immutable arcade vehicle state and stepping;
- structural capsule/circle collision clearance and swept resolution.

Paper Circuit consumes those APIs directly. Its vehicle collision profile
adapter remains local because it translates `VehicleIdentityRecipe` proportions
to a generic runtime contract.

## Product-owned behavior

Race flow, drift score, boost design, drafting rules, near misses, jumps, course
progress, AI intent, cameras, HUD, audio, menus, and content selection remain in
Paper Circuit. They are cohesive game design, not reusable engine primitives.
Promote only a smaller contract proven by another consumer.

## Fixed-step constraint

Do not switch a visible simulation loop to fixed-step until the consumer stores
previous/current state and interpolates presentation. Otherwise stable physics
creates visible judder. The clock is available now without forcing an unsafe
half-migration.

## Performance and verification

The collision path retains broad-phase AABB rejection before swept sampling.
Core source has architecture coverage forbidding renderer, DOM, experiment, and
drawing-library dependencies. `benchmarks/game-runtime.bench.ts` exercises 12
vehicles over 120 fixed steps against 24 obstacles. On the implementation host,
Vitest measured 959.95 workloads/second with a 1.0417 ms mean and ±1.99% RME.
This is a local regression baseline, not a cross-device frame budget; the field
mostly exercises the intended broad-phase rejection path.

Local browser QA loaded Paper Circuit through Vite, started a five-lap race,
and sent `P` to the focusable race canvas. The browser adapter toggled the live
control between `PAUSE`, `RESUME`, and `PAUSE` with no console warnings or
errors. Standard gamepad behavior remains covered by deterministic unit tests.

## Browser keyboard identity invariant

Bind gameplay controls by physical `KeyboardEvent.code`, never by
modifier-sensitive `KeyboardEvent.key`. Tracking `key` caused a reproducible
stuck-input failure: `KeyW` entered as `w`, Shift changed later events to `W`,
and key-up removed only the uppercase entry. The vehicle then kept moving or
steering until window blur cleared the controller. The browser adapter now
tracks held physical codes, reconstructs active logical controls from them, and
releases all input on both window blur and `document.visibilitychange` when the
page becomes hidden. Regression tests preserve the Shift/case sequence and the
hidden-page cleanup behavior.

## Workspace installation pitfall

Do not use `pnpm install --force` merely to bypass the non-TTY modules-purge
prompt. It removed a healthy `node_modules`, while repeated installs from the
managed terminal stalled during package materialization. Running
`pnpm install --no-frozen-lockfile` once from the native user terminal restored
the two-package workspace immediately. Prefer the ordinary command or an
interactive terminal and reserve `--force` for an actual corrupt install.
