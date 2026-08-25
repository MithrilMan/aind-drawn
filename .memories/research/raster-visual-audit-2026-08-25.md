# Raster visual audit

Date: 2026-08-25

## Decision

- Runtime texture baking and authoring audits use the same `bakeRasterLayerFrame`
  path. Do not add a second diagnostic renderer.
- `auditRasterBoil` compares three deterministic frames by default, downsamples
  them to 16-by-16 grids, and composites transparency over `PAPER_RGB` before
  measuring pairwise structural drift.
- The default structural threshold is `0.08`. It is a diagnostic tolerance, not
  a cross-browser pixel-equivalence guarantee.
- Automated checks should audit all declared states. Projection Studio uses only
  initial states to keep the interactive contact sheet responsive.

## Calibration evidence

- Representative character, building, and vehicle identities were inspected in
  all six public raster media through Projection Studio.
- All 18 projections passed. Maximum observed drift was `0.052`; normal results
  ranged from `0.010` to `0.052`, leaving useful margin below `0.08`.
- A synthetic structural-mass shift fails the threshold, while small local noise
  remains below it.

## Reuse rule

When adding or substantially changing a raster family, layer state, medium, or
drawing operation, run the all-state audit and inspect the deterministic
multi-medium contact sheet for one exact identity. Fix structural movement at
the drawing/layout boundary instead of loosening the global threshold.
