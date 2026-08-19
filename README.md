# aind-drawn

`aind-drawn` is a TypeScript library for deterministic procedural drawings and
layered, animatable sprites. It keeps semantic generation, layout, drawing
technique, rasterization, and runtime rendering behind separate boundaries.

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

The playground is then available at `http://127.0.0.1:4173/`. Its controls and
scene-document boundary are documented in
[`experiments/playground/README.md`](experiments/playground/README.md).

The project pins the package-manager version in `package.json`. On Codex
Desktop, use the bundled `pnpm` runtime if the machine-wide npm installation is
unavailable.

## Library boundaries

- `src/core` — deterministic randomness, geometry, canvas surfaces, and the
  hand-drawn mark vocabulary.
- `src/materials` — media strategies such as graphite, ink, and watercolour.
- `src/assets` — recipes and procedural blueprints for characters, props, and
  buildings.
- `src/runtime` — Three.js baking, caching, sprite rigs, and animation.
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

## Minimal usage

```ts
import {
  CharacterAnimator,
  SpriteRig,
  createCharacterBlueprint,
  createCharacterRecipe,
} from '@mithrilman/aind-drawn';

const recipe = createCharacterRecipe(4107, {
  species: 'human',
  medium: 'graphite',
});
const blueprint = createCharacterBlueprint(recipe);
const rig = new SpriteRig(blueprint, { boilFrames: 3 });
const animator = new CharacterAnimator(rig);

scene.add(rig.root);
animator.update(deltaSeconds, { pose: 'idle' });

// Game state drives authored poses. Walk and run share one gait phase and
// every transition crossfades over the autonomic breath, blink, gaze, and sway.
animator.update(deltaSeconds, { locomotion: 'run', speed: 0.9, facing: -1 });

// The owner of the Three.js scene must release GPU resources.
rig.dispose();
```

Recipes are plain versioned data and may be serialized. Blueprints contain draw
callbacks and are rebuilt from recipes rather than serialized.
