import type {
  ExtrudedProfileGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../solid-types.js';
import { moveOnSurface, type Point3, type SurfaceAnchor } from '../../core/geometry3.js';
import type { Point } from '../../core/geometry.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import type { CharacterIdentityRecipe } from '../character-identity/recipe.js';
import { buildSolidFaceLayout } from './layout.js';
import {
  createSolidCharacterRecipe,
  type SolidCharacterRecipeOptions,
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

function materialSpecs(recipe: SolidFaceRecipe): readonly SolidMaterialSpec[] {
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

export function createSolidFaceBlueprint(recipe: SolidFaceRecipe): SolidAssetBlueprint {
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

  const eyeHeightFactor = recipe.identity.eyes.style === 'sleepy'
    ? 0.54
    : recipe.identity.eyes.style === 'saucer' ? 1.08 : 0.92;
  layout.eyeAnchors.forEach((anchor, index) => {
    const side = index === 0 ? -1 : 1;
    const sideId = side < 0 ? 'left' : 'right';
    const radius = layout.eyeRadius * (identity.eyes.style === 'dot' ? 0.52 : 1);
    const whiteMaterial = identity.eyes.style === 'void' || identity.eyes.style === 'star'
      || identity.eyes.style === 'dot' ? 'ink' : 'sclera';
    const eyeOutline = identity.eyes.style === 'star'
      ? star(radius)
      : ellipse(radius, radius * eyeHeightFactor);
    add({
      id: `eye:${sideId}:white`, node: 'head', order: 20,
      geometry: plate(eyeOutline, radius * 0.3, radius * 0.1),
      materialId: whiteMaterial, placement: placement(anchor),
      motion: Object.freeze({
        role: 'eye', side,
        gazeTravel: [radius * 0.06, radius * 0.04] as const,
        blink: Object.freeze({ kind: 'squash', minimumScaleY: 0.06 }),
      }),
      castShadow: false, receiveShadow: false,
    });
    const pupilRadius = radius * recipe.style.pupilScale;
    add({
      id: `eye:${sideId}:pupil`, node: 'head', order: 21,
      geometry: plate(ellipse(pupilRadius, pupilRadius), pupilRadius * 0.5, pupilRadius * 0.18),
      materialId: identity.eyes.style === 'void' || identity.eyes.style === 'star'
        ? 'accent' : 'ink',
      placement: placement(anchor, radius * 0.17),
      motion: Object.freeze({
        role: 'eye', side,
        gazeTravel: [radius * 0.42, radius * 0.28] as const,
        blink: Object.freeze({ kind: 'squash', minimumScaleY: 0.03 }),
      }),
      castShadow: false, receiveShadow: false,
    });
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
  const mouthThickness = Math.max(0.035, mouthWidth * 0.1);
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

  if (recipe.identity.hair.style !== 'none') {
    const radius = layout.shape.radii[0] * 0.25 * (0.8 + recipe.identity.hair.height);
    const count = recipe.identity.hair.style === 'crown'
      || recipe.identity.hair.style === 'spikes' ? 5 : 3;
    for (let index = 0; index < count; index += 1) {
      const offset = (index - (count - 1) / 2) * radius * 0.72;
      const height = layout.shape.radii[1] * 0.9 + (index % 2) * radius * 0.18;
      add({
        id: `hair:${index}`, node: 'head', order: 10 + index,
        geometry: Object.freeze({
          type: 'superellipsoid', radii: [radius, radius * 0.72, radius * 0.82] as const,
          exponent: 2.4, widthSegments: 20, heightSegments: 14,
        }),
        materialId: 'hair', placement: solidPlacement([offset, height, -radius * 0.18]),
        motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
      });
    }
  }

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
