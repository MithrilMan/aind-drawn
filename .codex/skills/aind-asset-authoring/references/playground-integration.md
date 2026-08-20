# Playground and editor integration

Read this reference only when the requested asset must appear in
`experiments/playground/` or another example UI. The library remains the source
of truth; the experiment is a consumer and authoring surface.

## Register the serialisable scene kind

Update the applicable contracts in `experiments/playground/src/document.ts`:

- add the literal to `ASSET_KINDS` and therefore `AssetKind`;
- add a default scene size and English label;
- add a typed settings object only for authored semantic parameters;
- initialise those settings in `createSceneObject`;
- validate them in `parseSceneDocument`;
- update document tests for valid round-trip and invalid values.

Scene transforms (`x`, `y`, `width`, `height`, `rotation`) stay consumer state.
Do not duplicate generated recipe fields into the document unless the editor
must explicitly author and persist them. A null setting may mean “generate from
seed” when that distinction is useful and validated.

The object array is the canonical back-to-front stack. Reordering the array
reassigns contiguous draw ranks. Do not add a second numeric depth property that
can disagree with it.

## Register the catalog entry

Update `experiments/playground/src/catalog.ts`:

- add an English label and appropriate category;
- choose minimum dimensions that keep handles usable;
- set `semanticResize` only when width/height should regenerate meaningful
  asset proportions rather than merely scale the rendered object;
- map `SceneObjectData` to public recipe and blueprint factories;
- import everything through `src/index.ts`.

If a new category is genuinely needed, update the category type and UI grouping
coherently. Do not create a category for one novelty asset when an existing
domain category is honest.

## Build controls around recipes

Inspector controls edit document or recipe options; they never reach into baked
canvas pixels, Three.js materials, or runtime mesh internals.

- Offer “Generated from seed” where a nullable override is supported.
- Regenerate identity after semantic changes.
- Apply transient states through rig or animator APIs.
- Keep physical finish controls disabled or irrelevant in Doodle 3D rather than
  leaking them into medium policy.
- Expose only parameters a user can understand and meaningfully author.

All UI labels, messages, accessibility text, sample values, and exported example
content must be English.

## Render real previews

Every preview, thumbnail, part selector, and comparison view uses the public
library pipeline. Do not maintain SVG, bitmap, or CSS stand-ins that can drift
from generated output.

- Raster thumbnails call the public recipe and blueprint factories and bake
  through the raster runtime.
- Solid thumbnails use `SolidRig`.
- Doodle 3D thumbnails wrap the real solid blueprint and use the generic inked
  runtime.
- A selector for a roof, door, balcony, or other component renders that
  component or a focused public blueprint view; it must not show an unrelated
  full building merely because that was easier to screenshot.

Use representative seeded examples so rerenders remain comparable. A
side-by-side convergence lab must share the exact identity and `MediumId`.

## Preserve editor behaviour

Adding an asset must not break:

- selection by pointer;
- resize and rotation handles;
- undo/redo snapshots;
- canonical layer reordering;
- document export/import;
- runtime disposal when an object is rebuilt or removed.

When an asset has interactions, provide an inspector state control and useful
visual preview. When it has animation, expose only domain-relevant motion and a
pause/restart mechanism needed for inspection.

## Verify in the browser

Run `pnpm verify`, start the existing playground development process, and use
the in-app browser. Desktop QA is sufficient while the experiments explicitly
remain desktop-only.

Check:

- catalog insertion and generated preview;
- selection, transform handles, and semantic resize behaviour;
- inspector labels and clipping/overflow;
- layer movement before/after neighbouring objects;
- undo/redo and document round-trip;
- interaction states and animation pause/restart when applicable;
- disposal/rebuild after repeated seed or option changes.

Do not expand the consumer merely to showcase every public capability. Add the
minimum experiment surface needed to author and verify the requested asset.
