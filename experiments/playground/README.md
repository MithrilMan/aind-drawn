# Procedural asset playground

The playground is the first real consumer of the public `src/index.ts` API and
the foundation for a level editor. It does not import drawing internals.

Run `pnpm dev` and open `http://127.0.0.1:4173/`. The focused Three.js consumer
at `http://127.0.0.1:4173/solid-face.html` projects one shared character identity
into a live hand-drawn raster preview and a complete smooth-solid character.
It exposes generated and explicit eye/hair variants, full-character and face
framing, articulated nodes, emitted semantic parts, and one shared motion
vocabulary. Pose, gait intensity, facing, playback, and restart drive both the
solid rig and a live graphite `SpriteRig`; scene lighting and drag controls
remain experiment code.

## Available operations

- add characters, buildings, platforms, multipart plants, and props from the catalog;
- select through the canvas or scene outliner;
- choose an exact drawing layer or move the selection forward/backward in the painter stack;
- drag, resize from eight handles, and rotate from the top handle;
- edit seed, medium, position, dimensions, and rotation;
- author a building roof, door style, balconies, chimney, and open/closed door state through live library-rendered previews;
- regenerate, duplicate, delete, undo, and redo;
- pan with `Alt` + drag, zoom with the wheel, and optionally snap to the grid;
- export and import a validated versioned JSON document.

Keyboard shortcuts:

| Action | Shortcut |
| --- | --- |
| Undo / redo | `Ctrl+Z` / `Ctrl+Y` |
| Duplicate | `Ctrl+D` |
| Delete | `Delete` or `Backspace` |
| Nudge | Arrow keys |
| Grid-sized nudge | `Shift` + arrow keys |
| Deselect | `Escape` |
| Rotation snap | Hold `Shift` while dragging the rotation handle |

## Document boundary

The JSON document stores only stable editor data: object kind, identity, seed,
medium, transform, dimensions, and explicit building feature
overrides. Canvas surfaces, blueprints, Three.js objects, and texture state are
reconstructed by the catalog. A `null` building feature remains controlled by
the seed; an explicit value pins the authored choice.

`objects` is the canonical back-to-front painter stack: index `0` is drawn at
the back and the last item is drawn at the front. Reordering the scene list is
therefore serialized without introducing a second depth value that could drift
out of sync.

Character animation is intentionally not serialized as an editor property.
Characters remain alive through the animator's autonomic layer; games drive
the public `CharacterAnimator` pose and locomotion inputs from actual gameplay
state instead of baking a demo dropdown into level data.

Buildings and platforms use semantic resizing. During a pointer drag the
current rig is scaled for immediate feedback; on release its recipe and
blueprint are regenerated at the requested dimensions. Props and characters
use transform scaling because their internal topology does not currently vary
with size.

Editable building features are independent semantic layers (`roof`, `chimney`,
`balconies`, `door`, and `shell`). Inspector thumbnails filter the same public
blueprint used by the scene and frame only the selected feature; they are not a
parallel collection of hand-maintained artwork.
