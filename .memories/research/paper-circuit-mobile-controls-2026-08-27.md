# Paper Circuit mobile controls

Date: 2026-08-27

## Decision

- Use a two-thumb race layout: adjacent left/right steering controls at the lower left; accelerator at the lower right; brake directly above it; drift immediately left of the accelerator.
- The race-only touch `drift-drive` binding combines full throttle with the semantic `primary` action. This lets the right thumb initiate and hold a drift while the left thumb steers, without requiring a third simultaneous contact.
- Keep keyboard and standard-gamepad mappings unchanged. The combined binding is a product-owned touch adapter over the existing abstract throttle axis and primary action.
- Hide touch controls while a gamepad is the active input device.

## HUD policy

- On narrow or short/coarse viewports, keep only position, lap, time, flow, speed, minimap, and pause visible.
- Hide the normal route-validity panel and running order; surface route validity only when invalid.
- Respect viewport safe-area insets and keep frequent controls comfortably above the 44 CSS-pixel minimum target size.

## Evidence

- Apple game-control guidance places movement on the left, frequent actions on the right, recommends visible press feedback, and explicitly recommends combining functions when simultaneous inputs would otherwise be awkward.
- GRID Autosport's touch presets corroborate the split: steering on the left and acceleration/braking on the right, with an auto-accelerate alternative for simpler play.
- Android guidance supports changing the visible control layer according to the active input device.
- WCAG 2.2 target-size guidance provides a 24 CSS-pixel conformance floor; Paper Circuit deliberately exceeds it for high-frequency gameplay controls.

## Verification baseline

- Browser QA passed at 390x667, 320x568, and 844x390.
- At 320x568 the smallest frequent steering target is 61x76 CSS pixels; brake is 78x58 CSS pixels.
- `eslint`, TypeScript `--noEmit`, targeted input tests, and the Doodle Racing production build passed.
