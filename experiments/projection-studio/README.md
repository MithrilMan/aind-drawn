# Projection Studio

Projection Studio is a desktop experiment for comparing one procedural asset
identity across raster, Doodle 3D, and physically shaded Solid 3D projections.
The 3D style switch reuses the same rig, camera, interaction, and animation
state; it changes only how the volumetric blueprint is rendered.

The experiment intentionally consumes only the public library API. Character,
building, and vehicle customization is described by family authoring schemas.
Playback, expressions, steering, and articulated-part interactions are declared
by the family catalog, while the workbench, variant picker, controls, and
focused previews remain family-agnostic.

The Compare workspace builds a deterministic contact sheet for every public
raster medium from the currently selected identity. Each preview uses the same
public blueprint and `SpriteRig` pipeline as the main raster stage. A boil audit
compares three deterministic frames for every layer's initial state and reports
the maximum structural drift; the complete public API can audit all declared
states for automated authoring checks.

## Run locally

```sh
pnpm dev:projection-studio
```

## Build for static hosting

```sh
pnpm build:projection-studio
```

The output is written to `dist/experiments/projection-studio` with relative
asset URLs, so the directory can be published below a GitHub Pages project
path without rebuilding.

Pushes to the default branch deploy this directory through
`.github/workflows/pages.yml`. The expected project URL is
`https://mithrilman.github.io/aind-drawn/projection-studio/` once GitHub Pages is enabled for the
repository.
