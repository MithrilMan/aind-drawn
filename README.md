# aind-drawn

`aind-drawn` is a TypeScript library for deterministic procedural assets. A
recipe may currently become a layered hand-drawn sprite or a semantic 3D solid;
the intended consumer may be an editor, a 2D game, a 2.5D scene, or a fully 3D
Three.js world. Semantic generation, layout, representation, and runtime
rendering remain separate boundaries.

The first consumer lives in [`experiments/playground`](experiments/playground):
a procedural asset playground and the foundation of a level editor.
External research sources are reconstructed according to
[`references/README.md`](references/README.md); their checkouts are intentionally
not committed.

## Commands

```bash
pnpm install
pnpm verify
pnpm dev
```

The atelier is then available at `http://127.0.0.1:4173/`; the focused 3D
contract test lives at `http://127.0.0.1:4173/solid-face.html`. Their controls and
scene-document boundary are documented in
[`experiments/playground/README.md`](experiments/playground/README.md).

The project pins the package-manager version in `package.json`. On Codex
Desktop, use the bundled `pnpm` runtime if the machine-wide npm installation is
unavailable.

## Library boundaries

- `src/core` — deterministic randomness, 2D/3D geometry, canvas surfaces, and
  the hand-drawn mark vocabulary.
- `src/materials` — raster media and declarative physical finishes.
- `src/assets` — recipes and procedural blueprints for characters, multipart
  plants, props, buildings, and semantic solids.
- `src/runtime` — Three.js adapters for sprite baking, solid geometry,
  materials, rigs, and animation.
- `experiments` — applications that consume only the public library API.

See [`docs/architecture.md`](docs/architecture.md) for invariants and extension
points.

The asset extension process, including why a car is a dedicated `vehicle`
family rather than a single-layer prop, is documented in
[`docs/asset-authoring.md`](docs/asset-authoring.md). A repository-local Codex
skill under [`.codex/skills/aind-asset-authoring`](.codex/skills/aind-asset-authoring)
applies the same contracts while implementing new asset classes.

The technical study of the reference implementation and the exact image
generation pipeline live in
[`docs/kindergrimm-study.md`](docs/kindergrimm-study.md).

## Shared character identity

```ts
import {
  CharacterAnimator,
  SolidCharacterAnimator,
  SolidRig,
  SpriteRig,
  createCharacterIdentity,
  createRasterCharacterBlueprint,
  createSolidCharacterBlueprint,
} from '@mithrilman/aind-drawn';

const identity = createCharacterIdentity(4107, {
  species: 'human',
});
const rasterBlueprint = createRasterCharacterBlueprint(identity, {
  medium: 'graphite',
});
const solidBlueprint = createSolidCharacterBlueprint(identity, {
  finish: 'ceramic',
});

const drawing = new SpriteRig(rasterBlueprint, { boilFrames: 3 });
const drawingAnimator = new CharacterAnimator(drawing);
const solid = new SolidRig(solidBlueprint);
const solidAnimator = new SolidCharacterAnimator(solid);

scene.add(drawing.root, solid.root);
drawingAnimator.update(deltaSeconds, { pose: 'idle' });
solidAnimator.update(deltaSeconds);

// Game state drives authored poses. Walk and run share one gait phase and
// every transition crossfades over the autonomic breath, blink, gaze, and sway.
drawingAnimator.update(deltaSeconds, { locomotion: 'run', speed: 0.9, facing: -1 });
solidAnimator.update(deltaSeconds, { locomotion: 'run', speed: 0.9, facing: -1 });

// The owner of the Three.js scene must release GPU resources.
drawing.dispose();
solid.dispose();
```

`CharacterIdentityRecipe` is the serialisable source of truth for species,
proportions, palette, face, hair, outfit, and appendages. Raster medium and
physical finish belong to separate representation recipes. The compatibility
factories `createCharacterRecipe` and `createSolidFaceRecipe` remain available
when only the focused raster or face representation is needed. The complete
solid blueprint exposes articulated body nodes, face parts, outfit, tail,
colliders, and sockets without importing Three.js into asset code.

Convergence is geometric rather than cosmetic: both representations evaluate
the same radial head field, half-width eye spacing, head-relative hairstyle
silhouette, mouth placement, and expression profiles. `CharacterAnimator` and
`SolidCharacterAnimator` both expose `setExpression`; the solid runtime switches
between authored mouth geometries instead of stretching one neutral plate.

Raster blueprints contain draw callbacks and are rebuilt from recipes. Solid
blueprints contain serialisable geometry specifications.
