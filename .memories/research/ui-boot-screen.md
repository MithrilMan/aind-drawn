# Experiment Boot Screen

Last updated: 2026-08-25

## Summary

Vite experiment pages import their full stylesheet from the TypeScript entry module, so development
cold loads can paint raw HTML before the module graph and CSS are ready. Paper Circuit and Projection
Studio now use a critical inline boot screen that owns the first paint.

## Details

- Each experiment `index.html` starts with `html.is-app-loading`, hides its `main`, and renders a
  dependency-free `data-app-loader` status surface from critical inline CSS.
- `experiments/shared/app-boot.ts` removes `aria-busy`, clears the loading class, and removes the
  faded loader after initialization.
- Call `revealApplication(...)` from a second `requestAnimationFrame` scheduled after the app's own
  first frame, so a styled and initialized application exists beneath the loader.
- Keep loader typography and animation independent from remote fonts, generated CSS, WebGL, and the
  application module graph. Respect `prefers-reduced-motion`.

## Reuse When

Use this note when adding or revising an experiment entry page whose styles or renderer initialize
through a Vite module.
