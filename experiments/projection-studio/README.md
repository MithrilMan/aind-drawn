# Projection Studio

Projection Studio is a desktop experiment for comparing one procedural asset
identity across raster, Doodle 3D, and physically shaded Solid 3D projections.
The 3D style switch reuses the same rig, camera, interaction, and animation
state; it changes only how the volumetric blueprint is rendered.

The experiment intentionally consumes only the public library API. Character
and building customization is described by family authoring schemas, while the
workbench, variant picker, and focused previews remain family-agnostic.

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
