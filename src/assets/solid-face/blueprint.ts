import type {
  ExtrudedProfileGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../solid-types.js';
import { moveOnSurface, type Point3, type SurfaceAnchor } from '../../core/geometry3.js';
import type { Point } from '../../core/geometry.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import type {
  CharacterEyeStyle,
  CharacterIdentityRecipe,
} from '../character-identity/recipe.js';
import {
  createSolidCharacterRecipe,
  type SolidCharacterRecipe,
  type SolidCharacterRecipeOptions,
} from '../solid-character/recipe.js';
import {
  buildSolidFaceLayout,
  type SolidFaceLayout,
  type SolidFaceSourceRecipe,
} from './layout.js';
import {
  type SolidFaceRecipe,
} from './recipe.js';

function ellipse(width: number, height: number, count = 24): readonly Point[] {
  return Object.freeze(Array.from({ length: count }, (_, index): Point => {
    const angle = index / count * Math.PI * 2;
    return [Math.cos(angle) * width, Math.sin(angle) * height];
  }));
}

function band(width: number, thickness: number, sag: number, count = 12): readonly Point[] {
  const edge = (index: number, sign: number): Point => {
    const x = -width + index / (count - 1) * width * 2;
    const normalized = x / width;
    const y = sag * (1 - normalized * normalized) + sign * thickness;
    return [x, y];
  };
  return Object.freeze([
    ...Array.from({ length: count }, (_, index) => edge(index, 1)),
    ...Array.from({ length: count }, (_, index) => edge(count - 1 - index, -1)),
  ]);
}

function triangle(width: number, height: number): readonly Point[] {
  return Object.freeze([
    [-width, -height * 0.5],
    [0, height * 0.5],
    [width, -height * 0.5],
  ] as const);
}

function star(radius: number, innerScale = 0.42): readonly Point[] {
  return Object.freeze(Array.from({ length: 10 }, (_, index): Point => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const pointRadius = index % 2 === 0 ? radius : radius * innerScale;
    return [Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius];
  }));
}

function plate(
  outline: readonly Point[],
  depth: number,
  bevel: number,
): ExtrudedProfileGeometrySpec {
  return Object.freeze({
    type: 'extruded-profile',
    outline,
    depth,
    bevel,
    curveSegments: 4,
  });
}

function placement(anchor: SurfaceAnchor, proud = 0) {
  const resolved = moveOnSurface(anchor, [0, 0], proud);
  return Object.freeze({ position: resolved.point, surface: resolved });
}

function solidPlacement(position: Point3) {
  return Object.freeze({ position });
}

function materialSpecs(recipe: SolidFaceSourceRecipe): readonly SolidMaterialSpec[] {
  return Object.freeze([
    Object.freeze({
      id: 'skin', role: 'body', color: recipe.identity.palette.skin, finish: recipe.style.finish,
    }),
    Object.freeze({
      id: 'ink', role: 'linework', color: recipe.identity.palette.ink, finish: 'rubber',
    }),
    Object.freeze({
      id: 'sclera', role: 'eye-white', color: recipe.identity.palette.sclera, finish: 'ceramic',
    }),
    Object.freeze({
      id: 'accent', role: 'accent', color: recipe.identity.palette.accent, finish: 'glossy',
    }),
    Object.freeze({
      id: 'hair', role: 'hair', color: recipe.identity.palette.hair, finish: 'matte',
    }),
  ]);
}

function eyeMotion(
  side: -1 | 1,
  radius: number,
  kind: 'field' | 'pupil' = 'field',
): SolidPartDefinition['motion'] {
  const travel = kind === 'pupil'
    ? [radius * 0.42, radius * 0.28] as const
    : [radius * 0.06, radius * 0.04] as const;
  return Object.freeze({
    role: 'eye',
    side,
    gazeTravel: travel,
    blink: Object.freeze({ kind: 'squash', minimumScaleY: kind === 'pupil' ? 0.03 : 0.06 }),
  });
}

function eyeStyleFor(recipe: SolidFaceSourceRecipe, index: number): CharacterEyeStyle {
  return index === 1
    ? recipe.identity.eyes.alternateStyle ?? recipe.identity.eyes.style
    : recipe.identity.eyes.style;
}

function addEyeParts(
  add: (part: SolidPartDefinition) => void,
  recipe: SolidFaceSourceRecipe,
  layout: SolidFaceLayout,
  anchor: SurfaceAnchor,
  index: number,
): void {
  const identity = recipe.identity;
  const side = index === 0 ? -1 : 1;
  const sideId = side < 0 ? 'left' : 'right';
  const style = eyeStyleFor(recipe, index);
  const radius = layout.eyeRadius * (style === 'dot' ? 0.52 : 1);
  const addGlint = (proud: number): void => {
    if (!identity.eyes.glint) return;
    const glintRadius = radius * (style === 'dot' ? 0.18 : 0.12);
    const glintAnchor = moveOnSurface(anchor, [-radius * 0.16, radius * 0.17], proud);
    add({
      id: `eye:${sideId}:glint`, node: 'head', order: 22,
      geometry: plate(ellipse(glintRadius, glintRadius), glintRadius * 0.42, glintRadius * 0.12),
      materialId: 'sclera', placement: placement(glintAnchor),
      motion: eyeMotion(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
    });
  };

  if (style === 'dot') {
    const pupilWidth = radius * (identity.species === 'cat' ? 0.28 : 0.72);
    add({
      id: `eye:${sideId}:pupil`, node: 'head', order: 21,
      geometry: plate(ellipse(pupilWidth, radius * 0.78), radius * 0.38, radius * 0.12),
      materialId: 'ink', placement: placement(anchor, radius * 0.1),
      motion: eyeMotion(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
    });
    addGlint(radius * 0.3);
    return;
  }

  if (style === 'star') {
    add({
      id: `eye:${sideId}:star`, node: 'head', order: 20,
      geometry: plate(star(radius), radius * 0.3, radius * 0.08),
      materialId: 'ink', placement: placement(anchor),
      motion: eyeMotion(side, radius), castShadow: false, receiveShadow: false,
    });
    addGlint(radius * 0.24);
    return;
  }

  if (style === 'void') {
    add({
      id: `eye:${sideId}:void`, node: 'head', order: 20,
      geometry: plate(ellipse(radius, radius * 1.02), radius * 0.34, radius * 0.11),
      materialId: 'ink', placement: placement(anchor),
      motion: eyeMotion(side, radius), castShadow: false, receiveShadow: false,
    });
    addGlint(radius * 0.3);
    return;
  }

  const eyeHeightFactor = style === 'sleepy' ? 0.54 : 1.08;
  add({
    id: `eye:${sideId}:white`, node: 'head', order: 20,
    geometry: plate(ellipse(radius, radius * eyeHeightFactor), radius * 0.3, radius * 0.1),
    materialId: 'sclera', placement: placement(anchor),
    motion: eyeMotion(side, radius), castShadow: false, receiveShadow: false,
  });
  const pupilRadius = radius * recipe.style.pupilScale;
  const pupilWidth = identity.species === 'cat' ? pupilRadius * 0.3 : pupilRadius;
  add({
    id: `eye:${sideId}:pupil`, node: 'head', order: 21,
    geometry: plate(
      ellipse(pupilWidth, pupilRadius),
      pupilRadius * 0.5,
      pupilRadius * 0.18,
    ),
    materialId: 'ink', placement: placement(anchor, radius * 0.17),
    motion: eyeMotion(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
  });
  addGlint(radius * 0.42);
}

function addHairParts(
  add: (part: SolidPartDefinition) => void,
  recipe: SolidFaceSourceRecipe,
  layout: SolidFaceLayout,
): void {
  const style = recipe.identity.hair.style;
  if (style === 'none') return;
  const [radiusX, radiusY, radiusZ] = layout.shape.radii;
  const density = 0.82 + recipe.identity.hair.height;
  const addLobe = (
    id: string,
    radii: Point3,
    position: Point3,
    order = 10,
  ): void => {
    add({
      id, node: 'head', order,
      geometry: Object.freeze({
        type: 'superellipsoid', radii, exponent: 2.5,
        widthSegments: 20, heightSegments: 14,
      }),
      materialId: 'hair', placement: solidPlacement(position),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
  };
  const addCap = (): void => {
    addLobe(
      'hair:cap',
      [radiusX * 0.82, radiusY * (0.29 + density * 0.06), radiusZ * 0.68] as const,
      [0, radiusY * 0.78, -radiusZ * 0.15] as const,
      10,
    );
  };

  if (style === 'cap') {
    addCap();
    return;
  }
  if (style === 'bob') {
    addCap();
    for (const side of [-1, 1] as const) {
      addLobe(
        `hair:bob:${side < 0 ? 'left' : 'right'}`,
        [radiusX * 0.23, radiusY * (0.55 + density * 0.08), radiusZ * 0.48] as const,
        [side * radiusX * 0.78, radiusY * 0.12, -radiusZ * 0.08] as const,
        16,
      );
    }
    return;
  }
  if (style === 'fringe') {
    addCap();
    for (const [index, x] of [-0.46, 0, 0.46].entries()) {
      addLobe(
        `hair:fringe:${index}`,
        [radiusX * 0.18, radiusY * (0.27 + index % 2 * 0.07), radiusZ * 0.14] as const,
        [x * radiusX, radiusY * 0.53, radiusZ * 0.82] as const,
        18 + index,
      );
    }
    return;
  }

  const count = style === 'tuft' ? 3 : style === 'crown' ? 5 : 7;
  const spread = style === 'tuft' ? radiusX * 0.52 : radiusX * 1.45;
  const spikeWidth = radiusX * (style === 'tuft' ? 0.16 : 0.13);
  for (let index = 0; index < count; index += 1) {
    const amount = index / (count - 1);
    const alternating = index % 2 === 0 ? 1 : 0.72;
    const spikeHeight = radiusY * (0.34 + density * 0.16) * alternating;
    add({
      id: `hair:${style}:${index}`, node: 'head', order: 10 + index,
      geometry: plate(triangle(spikeWidth, spikeHeight), spikeWidth * 0.5, spikeWidth * 0.12),
      materialId: 'hair',
      placement: solidPlacement([
        (amount - 0.5) * spread,
        radiusY * 0.93 + spikeHeight * 0.32,
        radiusZ * 0.1,
      ]),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
  }
}

export function createSolidFaceBlueprint(
  recipe: SolidFaceRecipe | SolidCharacterRecipe,
): SolidAssetBlueprint {
  const layout = buildSolidFaceLayout(recipe);
  const identity = recipe.identity;
  const parts: SolidPartDefinition[] = [];
  const add = (part: SolidPartDefinition): void => { parts.push(Object.freeze(part)); };
  if (identity.species === 'cat' || identity.species === 'nightmare'
    || identity.species === 'creature') {
    const radiusX = layout.shape.radii[0];
    const radiusY = layout.shape.radii[1];
    const earWidth = radiusX * (identity.species === 'cat' ? 0.28 : 0.2);
    const earHeight = radiusY * (identity.species === 'cat' ? 0.72 : 0.52);
    for (const side of [-1, 1] as const) {
      add({
        id: `ear:${side < 0 ? 'left' : 'right'}`, node: 'head', order: -2,
        geometry: plate(triangle(earWidth, earHeight), earWidth * 0.28, earWidth * 0.08),
        materialId: 'skin',
        placement: solidPlacement([
          side * radiusX * 0.58,
          radiusY * 0.74,
          -layout.shape.radii[2] * 0.08,
        ]),
        motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
      });
    }
  }
  add({
    id: 'head', node: 'head', order: 0,
    geometry: Object.freeze({
      type: 'superellipsoid',
      radii: layout.shape.radii,
      exponent: layout.shape.exponent,
      widthSegments: 48,
      heightSegments: 32,
    }),
    materialId: 'skin', placement: solidPlacement([0, 0, 0]),
    motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
  });

  layout.eyeAnchors.forEach((anchor, index) => {
    addEyeParts(add, recipe, layout, anchor, index);
  });

  if (identity.species === 'cat') {
    const cheekRadius = layout.eyeRadius * 0.78;
    for (const side of [-1, 1] as const) {
      const anchor = layout.at(side * 0.13, -0.12, cheekRadius * 0.18);
      add({
        id: `muzzle:${side < 0 ? 'left' : 'right'}`, node: 'head', order: 23,
        geometry: Object.freeze({
          type: 'superellipsoid',
          radii: [cheekRadius, cheekRadius * 0.72, cheekRadius * 0.45] as const,
          exponent: 2.4, widthSegments: 20, heightSegments: 14,
        }),
        materialId: 'skin', placement: solidPlacement(anchor.point),
        motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
      });
    }
  }

  if (recipe.identity.brows.present) {
    layout.browAnchors.forEach((anchor, index) => {
      const side = index === 0 ? -1 : 1;
      add({
        id: `brow:${side < 0 ? 'left' : 'right'}`, node: 'head', order: 24,
        geometry: plate(band(layout.eyeRadius * 0.74, layout.eyeRadius * 0.09, 0), layout.eyeRadius * 0.2, layout.eyeRadius * 0.06),
        materialId: 'hair', placement: placement(anchor),
        motion: Object.freeze({ role: 'brow', side }),
        castShadow: false, receiveShadow: false,
      });
    });
  }

  if (identity.nose.present || identity.species === 'cat') {
    const noseRadius = Math.min(layout.shape.radii[0], layout.shape.radii[1])
      * (identity.species === 'cat' ? 0.085 : identity.nose.size);
    const nosePosition = moveOnSurface(layout.noseAnchor, [0, 0], noseRadius * 0.45).point;
    add({
      id: 'nose', node: 'head', order: 26,
      geometry: Object.freeze({
        type: 'superellipsoid', radii: [noseRadius, noseRadius * 0.82, noseRadius] as const,
        exponent: 2.2, widthSegments: 20, heightSegments: 14,
      }),
      materialId: identity.species === 'robot' ? 'accent'
        : identity.species === 'cat' ? 'ink' : 'skin',
      placement: solidPlacement(nosePosition), motion: Object.freeze({ role: 'fixed' }),
      castShadow: true, receiveShadow: true,
    });
  }

  const mouthWidth = layout.shape.radii[0] * recipe.identity.mouth.width;
  const mouthThickness = Math.max(0.012, mouthWidth * 0.052);
  const mouthOutline = recipe.identity.mouth.style === 'open'
    ? ellipse(mouthWidth * 0.62, mouthWidth * 0.4)
    : band(
      mouthWidth,
      mouthThickness,
      recipe.identity.mouth.style === 'smile' ? mouthWidth * 0.28
        : recipe.identity.mouth.style === 'frown' ? -mouthWidth * 0.24
          : recipe.identity.mouth.style === 'cat' ? mouthWidth * 0.18 : 0,
    );
  add({
    id: 'mouth', node: 'head', order: 28,
    geometry: plate(mouthOutline, mouthThickness * 1.8, mouthThickness * 0.48),
    materialId: 'ink', placement: placement(layout.mouthAnchor),
    motion: Object.freeze({ role: 'mouth' }), castShadow: false, receiveShadow: false,
  });

  addHairParts(add, recipe, layout);

  const [radiusX, radiusY, radiusZ] = layout.shape.radii;
  return Object.freeze({
    representation: 'solid',
    id: `solid-face:${recipe.identity.seed}`,
    kind: 'solid-face',
    seed: recipe.identity.seed,
    bounds: layout.bounds,
    nodes: Object.freeze([
      Object.freeze({ id: 'head', position: layout.center }),
    ]),
    parts: Object.freeze(parts),
    materials: materialSpecs(recipe),
    colliders: Object.freeze([
      Object.freeze({
        id: 'head', kind: 'solid', shape: 'box',
        center: layout.center,
        size: [radiusX * 2, radiusY * 2, radiusZ * 2] as const,
      }),
    ]),
    sockets: layout.sockets,
  });
}

export function createSolidCharacterFaceBlueprint(
  identity: CharacterIdentityRecipe,
  options: SolidCharacterRecipeOptions = {},
): SolidAssetBlueprint {
  return createSolidFaceBlueprint(createSolidCharacterRecipe(identity, options));
}
