# GitHub Pages Landing

Last updated: 2026-08-25

## Summary

The Pages artifact is assembled from three independent Vite builds: the AIND Drawn landing at the
site root, Projection Studio under `projection-studio/`, and Paper Circuit under `doodle-racing/`.
The landing's active visual direction is paper-and-graphite, not the darker instrument-shell style.

## Details

- `scripts/assemble-pages.mjs` copies the three builds into `dist/pages` for the Pages workflow.
- The hero comparator renders deterministic character seed `4104` and vehicle seed `8417` through
  the public raster and inked-solid pipelines. It preserves identity while switching Graphite/Oil
  and Drawn 2D/Doodle 3D. Character motion uses the dance pose; the vehicle uses deterministic
  steering, wheel/suspension motion, and a cycle of door, hood, and cargo interactions.
- Normalize the `requestAnimationFrame` timestamp before accumulating the comparator clock. The
  in-app browser can invoke the callback without a finite timestamp, while the public motion
  samplers correctly reject non-finite sample times.
- Experiment-card previews are real product captures, not generated stand-ins. Paper Circuit uses
  the Oil Follow camera during a live race; Projection Studio uses seed `4104`, Graphite, Dance,
  Happy, and Turntable. Their responsive WebP variants live under
  `experiments/landing/public/assets/` and are derived from the PNG sources in `assets-source/`.
- The repository README leads with AIND Drawn's live products, current capabilities, and independent
  architecture. KinderGrimm remains credited in a compact research-provenance section near the end;
  do not let the reference study dominate the project's public framing again.
- The specimen canvases use low-power transparent WebGL renderers, three boil frames, capped pixel
  ratio, reduced-motion handling, disposal on `pagehide`, and a truthful renderer fallback.
- On Windows, do not start the preview server with `dist/pages` as its working directory: that locks
  the folder and makes `scripts/clean.mjs` fail with `EBUSY`. Use `python -m http.server --directory
  <absolute-dist-pages-path>` from the repository root.

## Reuse When

Use this note when changing the landing, Pages routes, public experiment packaging, or hero specimen
rendering.
