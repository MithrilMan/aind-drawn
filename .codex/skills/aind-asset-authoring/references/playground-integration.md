# Experiment and editor integration

Read this reference only when the requested asset must appear in Projection
Studio or another example UI. The library remains the source of truth; an
experiment is a consumer and authoring surface.

## Register the serialisable scene kind when one exists

If the target consumer owns a serialisable scene document:

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

For Projection Studio, update `experiments/projection-studio/src/family-catalog.ts`:

- add an English label, description, framing, and default finish;
- map authoring values explicitly to public typed identity options;
- provide one projection factory returning raster, solid, and semantic strokes;
- declare family controls, defaults, and a runtime-motion adapter;
- import everything through `src/index.ts`.

The Studio shell renders this contract. Do not add family-specific markup,
visibility selectors, or hard-coded control handlers.

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

### Publish a generic authoring schema

When more than one consumer must expose the same identity choices, put a public
`authoring.ts` beside the shared family identity. Declare an
`AssetFamilyAuthoringSchema` with:

- one stable parameter ID per safe recipe override;
- an honest user-facing label and optional explanation;
- a validated default value;
- choices, numeric bounds, or toggle labels as appropriate;
- semantic raster layer IDs and optional layer states for focused previews.

The schema is not blueprint reflection. A generated blueprint describes output;
it cannot say which constructor options are safe, mutually compatible, or useful
to an author. Keep one explicit family adapter that maps schema values to typed
recipe options, then let the editor shell generate navigation, choices, defaults,
and focused previews from the schema. Adding a family should register an adapter;
it should not require new UI branches for its individual parameters.

Use `createDefaultAssetAuthoringValues` rather than duplicating defaults in an
experiment. Validate schemas at module load and cover invalid duplicates,
defaults, and ranges with tests.

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
- Resolve focused bounds from the selected semantic layers. Preserve ancestor
  bones as invisible anchors when a selected character part is nested; do not
  reveal the whole head just to position an eye or hair preview.

Use representative seeded examples so rerenders remain comparable. A
side-by-side convergence lab must share the exact identity and `MediumId`.

## Preserve consumer behaviour

When the consumer is a scene editor, adding an asset must not break:

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

Run `pnpm verify`, start Projection Studio, and use
the in-app browser. Desktop QA is sufficient while the experiments explicitly
remain desktop-only.

Check:

- family-picker insertion and generated preview;
- selection, transform handles, and semantic resize behaviour;
- inspector labels and clipping/overflow;
- layer movement before/after neighbouring objects;
- undo/redo and document round-trip;
- interaction states and animation pause/restart when applicable;
- disposal/rebuild after repeated seed or option changes.

Do not expand the consumer merely to showcase every public capability. Add the
minimum experiment surface needed to author and verify the requested asset.
