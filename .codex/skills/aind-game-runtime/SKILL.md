---
name: aind-game-runtime
description: Design, implement, refactor, or review reusable game input, timing, simulation, motion, collision, and asset-integration boundaries in aind-drawn. Use for @mithrilman/aind-game-runtime, Paper Circuit gameplay extraction, browser controllers, fixed-step loops, performance-sensitive game primitives, or deciding whether behavior belongs in the runtime, product, or asset adapter.
---

# AIND game runtime

Build small renderer-neutral game primitives without turning Paper Circuit into
a framework wearing a fake moustache.

Read [`../../../docs/game-runtime.md`](../../../docs/game-runtime.md) before
changing package boundaries. When asset capabilities, colliders, sockets, or
interactions are involved, also use the `aind-asset-authoring` skill and preserve
its identity and representation invariants.

## Classify first

Assign every proposed concept to exactly one owner before implementation:

- **Runtime primitive:** reusable structural data or deterministic algorithm,
  independent of renderer, asset family, and one game's rules. Put it under
  `packages/game-runtime/src/`.
- **Platform adapter:** browser events or another host API translated into
  runtime contracts. Expose it from a platform-specific entry point such as
  `@mithrilman/aind-game-runtime/browser`.
- **Product rule:** race flow, scoring, AI strategy, track semantics, jumps,
  camera, audio, UI, or content selection. Keep it in the experiment until a
  second consumer proves a smaller contract.
- **Asset adapter:** conversion from public asset identity, manifests,
  colliders, sockets, or capabilities to generic game data. Keep it in the
  consumer or a dedicated integration package.

State the classification and concrete reason. Do not extract code merely
because it can be moved.

## Preserve dependency direction

- Keep the core package free of Three.js, DOM globals, aind-drawn imports,
  experiment imports, rigs, textures, and scene graphs.
- Put browser-only types and listeners behind the `/browser` entry point.
- Drive assets as `game state -> consumer adapter -> public asset capability`.
  Never make an asset package depend on game rules or make simulation inspect a
  renderer object.
- Accept structural readonly data. Let consumers translate authored identity to
  that data explicitly.
- Keep control axis and action IDs application-owned. Runtime code supplies
  schemas, samples, and mapping machinery, not a universal button vocabulary.
- Collapse keys, buttons, touch controls, sticks, and triggers into those abstract
  IDs before gameplay. Product logic consumes digital actions and normalized
  axes, never physical control identities. Device provenance is diagnostic or
  presentation metadata and must not select gameplay behavior; continuous versus
  delta axis behavior may differ because their time integration differs.
- Make menus and focus-based UI consume the same abstract snapshot. Use normalized
  axes with thresholded repeat for navigation and a digital action for activation;
  keep DOM focus and click behavior in the product. Never add a parallel
  gamepad-button path beside the schema.
- Make controller-driven DOM focus visually explicit with product-owned state;
  browser `:focus-visible` heuristics do not reliably cover programmatic focus.
  Keep focus distinct from checked/selected state: focus identifies what the
  next activation affects, while selection identifies the value already
  committed. Do not scan the DOM every frame to maintain this marker.
- Route global actions through an explicit product-owned game-state policy, then
  enforce destructive transitions again at the state owner. Disabled UI is
  feedback, not authorization. Driving input must never mutate the parked avatar.
- Bind physical keyboard controls with `KeyboardEvent.code`, never the
  modifier- and layout-sensitive `KeyboardEvent.key`. Track held codes
  idempotently and release all browser input on window blur or when the document
  becomes hidden.

## Design the hot path

- Prefer pure functions over hidden process state.
- Keep simulation deterministic for equal state, input, and timestep.
- Use a bounded fixed-step accumulator for simulations that need stable time;
  expose dropped time and interpolation alpha rather than concealing overload.
- Do not migrate a live loop to fixed-step without owning previous/current state
  interpolation at the presentation boundary.
- Run broad-phase rejection before swept collision work. Avoid renderer
  allocations, DOM access, and asset construction per entity or per tick.
- Add abstraction only for a demonstrated variation point. One product rule in
  a package is still one product rule, now with stationery.

## Implement and verify

1. Inspect current consumers, tests, package exports, and performance notes.
2. Define the smallest immutable public contract and explicit entry point.
3. Migrate at least one real consumer; delete the obsolete local implementation
   instead of leaving forwarding aliases in this greenfield repository.
4. Add deterministic behavior tests, boundary tests for forbidden imports, and
   lifecycle tests for platform adapters where practical.
5. Add or extend a benchmark for per-frame or per-entity work.
6. Update `docs/game-runtime.md`, architecture notes, and project memory when a
   reusable decision or measured baseline changes.
7. Run `pnpm verify` and the relevant benchmark. Report behavior preserved,
   measurements, remaining product-owned work, and any unverified browser path.
