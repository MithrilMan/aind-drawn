# Game runtime boundary

`@mithrilman/aind-game-runtime` is the renderer-neutral simulation and input
package shared by games and experiments in this repository. It lives beside
`@mithrilman/aind-drawn`; neither package is a layer inside the other.

## Dependency direction

```text
@mithrilman/aind-game-runtime core
  controls, gamepad mapping, fixed-step clock, arcade motion, collision math
              ^
              |
product rules and adapters in experiments/
  race flow, scoring, track rules, asset-to-collider mapping, cameras, audio
       |                                      |
       v                                      v
@mithrilman/aind-drawn public API          Three.js / browser UI
```

The core package does not import Three.js, browser globals, or the asset
library. Browser event handling is available only from the explicit
`@mithrilman/aind-game-runtime/browser` entry point.

This direction matters. A vehicle identity may define dimensions and wheel
placement, but generic collision code must accept a structural
`VehicleCollisionProfile`. Paper Circuit owns the adapter between those two
contracts. Likewise, gameplay may issue an interaction request through a public
asset capability; the simulation must not inspect a `SolidRig`, texture, mesh,
or scene graph.

## Public slices

- Control schemas keep axis and action IDs application-owned. Snapshots preserve
  device, analogue/digital provenance, and continuous/delta time semantics.
- Standard gamepad mapping is data-driven. A game supplies bindings rather than
  forking the controller.
- `BrowserInputController` adapts keyboard, touch controls, pointer gestures,
  wheel input, and standard gamepads to one schema. It owns listeners and must
  be disposed. Keyboard bindings use physical `KeyboardEvent.code` values so
  modifiers and keyboard layout cannot change a held control's identity. All
  held browser state is released on window blur or when the document is hidden.
- `FixedStepClock` bounds catch-up work, reports discarded time, and exposes an
  interpolation alpha. It does not own rendering or simulation state.
- Arcade vehicle motion and swept obstacle collision are immutable pure
  functions over structural data. They allocate no renderer resources and read
  no asset internals.

## What stays in the product

Race flow, scoring, boosts, jumps, course progress, AI intent, camera behavior,
HUD, audio, menus, and semantic asset selection remain in Paper Circuit until a
second real consumer proves a smaller reusable contract. Moving product rules
into a package does not make them generic; it merely gives their assumptions a
more impressive address.

The fixed-step clock is available for simulations that own interpolation of
previous and current state. Existing variable-step loops should not be switched
without adding that presentation boundary, because fixed simulation with
non-interpolated rendering trades numerical stability for visible judder.

## Performance contract

Hot-path APIs use numbers, readonly structural records, and caller-owned arrays.
Broad-phase collision rejection runs before swept narrow-phase sampling. Core
modules must remain free of renderer allocations, DOM queries, and asset
construction.

Use `pnpm benchmark:game-runtime` to measure a repeatable multi-vehicle motion
and collision workload. The benchmark is a regression signal, not a universal
frame budget; consumers must still profile their complete scene on target
hardware.

## Adding a reusable primitive

1. Prove that the concept is independent of one game's rules and vocabulary.
2. Put pure data and algorithms in the root entry point. Put browser APIs only
   in the browser entry point.
3. Keep asset-derived conversion in the consuming experiment or a dedicated
   integration package.
4. Add deterministic tests, invalid-input coverage where the API has invariants,
   and a benchmark when the code runs per entity or per simulation step.
5. Run `pnpm verify` and the relevant runtime benchmark.
