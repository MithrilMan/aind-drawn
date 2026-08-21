import type {
  ExtrudedProfileGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../solid-types.js';
import { moveOnSurface, type Point3, type SurfaceAnchor } from '../../core/geometry3.js';
import type { Point } from '../../core/geometry.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import { createCharacterDrawingStyle } from '../character-identity/drawing-style.js';
import type {
  CharacterEyeStyle,
  CharacterIdentityRecipe,
} from '../character-identity/recipe.js';
import { createCharacterHairProfile } from '../character-identity/hair-profile.js';
import { createCharacterEyeProfile } from '../character-identity/eye-profile.js';
import { createCharacterTearProfile } from '../character-identity/tear-profile.js';
import { CHARACTER_EXPRESSIONS } from '../character-identity/expression-profile.js';
import { createCharacterMouthProfile } from '../character-identity/mouth-profile.js';
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
  createHairShellGeometry,
  createHairTuftGeometry,
  createHairWrapGeometry,
} from './hair-geometry.js';
import {
  type SolidFaceRecipe,
} from './recipe.js';
import { solidFaceMotionCapability } from './capabilities.js';

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

function rectangle(width: number, height: number): readonly Point[] {
  return Object.freeze([
    [-width, -height], [width, -height], [width, height], [-width, height],
  ] as const);
}

function strokePlate(points: readonly Point[], width: number): readonly Point[] {
  if (points.length < 2) throw new RangeError('Mouth stroke requires at least two points');
  const start = points[0] as Point;
  const end = points[points.length - 1] as Point;
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) return rectangle(width, width);
  const nx = -dy / length * width;
  const ny = dx / length * width;
  return Object.freeze([
    [start[0] + nx, start[1] + ny],
    [end[0] + nx, end[1] + ny],
    [end[0] - nx, end[1] - ny],
    [start[0] - nx, start[1] - ny],
  ] as const);
}

function placement(anchor: SurfaceAnchor, proud = 0) {
  const resolved = moveOnSurface(anchor, [0, 0], proud);
  return Object.freeze({ position: resolved.point, surface: resolved });
}

function solidPlacement(position: Point3) {
  return Object.freeze({ position });
}

function materialSpecs(recipe: SolidFaceSourceRecipe): readonly SolidMaterialSpec[] {
  const drawing = createCharacterDrawingStyle(recipe.identity);
  const draw = (
    application: SolidMaterialSpec['drawing']['application'],
    tone: typeof drawing.headTone,
  ) => Object.freeze({ application, tone });
  return Object.freeze([
    Object.freeze({
      id: 'skin', color: recipe.identity.palette.skin, finish: recipe.style.finish,
      drawing: draw('tint', drawing.headTone),
    }),
    Object.freeze({
      id: 'ink', color: recipe.identity.palette.ink, finish: 'rubber',
      drawing: draw('ink', 'black'),
    }),
    Object.freeze({
      id: 'sclera', color: recipe.identity.palette.sclera, finish: 'ceramic',
      drawing: draw('paper', 'light'),
    }),
    Object.freeze({
      id: 'accent', color: recipe.identity.palette.accent, finish: 'glossy',
      drawing: draw('flat', drawing.bodyTone),
    }),
    Object.freeze({
      id: 'hair', color: recipe.identity.palette.hair, finish: 'matte',
      drawing: draw('pigment', drawing.hairTone),
    }),
    Object.freeze({
      id: 'tear', color: recipe.identity.palette.tear, finish: 'glossy',
      drawing: draw('wash', 'light'),
      roughness: 0.22, clearcoat: 0.35,
    }),
  ]);
}

function eyeCapabilities(
  side: -1 | 1,
  radius: number,
  kind: 'field' | 'pupil' = 'field',
): NonNullable<SolidPartDefinition['capabilities']> {
  const travel = kind === 'pupil'
    ? [radius * 0.42, radius * 0.28] as const
    : [radius * 0.06, radius * 0.04] as const;
  return Object.freeze([solidFaceMotionCapability({
    kind: 'eye',
    side,
    gazeTravel: travel,
    blink: Object.freeze({ minimumScaleY: kind === 'pupil' ? 0.03 : 0.06 }),
  })]);
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
  const radius = layout.eyeRadius;
  const profile = createCharacterEyeProfile(identity, style);
  const addGlint = (ownerAnchor: SurfaceAnchor, proud: number): void => {
    if (!identity.eyes.glint) return;
    const glintRadius = radius * profile.glintRadius;
    const glintAnchor = moveOnSurface(ownerAnchor, [
      radius * profile.glintOffset[0], radius * profile.glintOffset[1],
    ], proud);
    add({
      id: `eye:${sideId}:glint`, node: 'head', order: 22,
      geometry: plate(ellipse(glintRadius, glintRadius), glintRadius * 0.42, glintRadius * 0.12),
      materialId: 'sclera', placement: placement(glintAnchor),
      capabilities: eyeCapabilities(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
    });
  };

  if (profile.field === 'none') {
    const pupilAnchor = moveOnSurface(anchor, [0, radius * profile.pupilOffsetY], 0);
    add({
      id: `eye:${sideId}:pupil`, node: 'head', order: 21,
      geometry: plate(
        ellipse(radius * profile.pupilWidth, radius * profile.pupilRadius),
        radius * 0.38, radius * 0.12,
      ),
      materialId: 'ink', placement: placement(pupilAnchor, radius * 0.1),
      capabilities: eyeCapabilities(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
    });
    for (const stroke of profile.strokes) {
      const lidAnchor = moveOnSurface(anchor, [0, radius * 0.32], radius * 0.04);
      add({
        id: `eye:${sideId}:${stroke.id}`, node: 'head', order: 22,
        geometry: plate(
          band(radius, radius * stroke.width, radius * 0.08),
          radius * 0.12, radius * 0.04,
        ),
        materialId: 'ink', placement: placement(lidAnchor),
        capabilities: eyeCapabilities(side, radius), castShadow: false, receiveShadow: false,
      });
    }
    addGlint(pupilAnchor, radius * 0.3);
    return;
  }

  if (profile.field === 'star') {
    add({
      id: `eye:${sideId}:star`, node: 'head', order: 20,
      geometry: plate(star(radius), radius * 0.3, radius * 0.08),
      materialId: 'ink', placement: placement(anchor),
      capabilities: eyeCapabilities(side, radius), castShadow: false, receiveShadow: false,
    });
    addGlint(anchor, radius * 0.24);
    return;
  }

  if (profile.field === 'ink') {
    add({
      id: `eye:${sideId}:void`, node: 'head', order: 20,
      geometry: plate(ellipse(radius, radius * 1.02), radius * 0.34, radius * 0.11),
      materialId: 'ink', placement: placement(anchor),
      capabilities: eyeCapabilities(side, radius), castShadow: false, receiveShadow: false,
    });
    addGlint(anchor, radius * 0.3);
    return;
  }

  add({
    id: `eye:${sideId}:white`, node: 'head', order: 20,
    geometry: plate(
      ellipse(radius * profile.fieldScale[0], radius * profile.fieldScale[1]),
      radius * 0.3, radius * 0.1,
    ),
    materialId: 'sclera', placement: placement(anchor),
    capabilities: eyeCapabilities(side, radius), castShadow: false, receiveShadow: false,
  });
  const pupilRadius = radius * profile.pupilRadius;
  const pupilAnchor = moveOnSurface(anchor, [0, radius * profile.pupilOffsetY], 0);
  add({
    id: `eye:${sideId}:pupil`, node: 'head', order: 21,
    geometry: plate(
      ellipse(radius * profile.pupilWidth, pupilRadius),
      pupilRadius * 0.5,
      pupilRadius * 0.18,
    ),
    materialId: 'ink', placement: placement(pupilAnchor, radius * 0.17),
    capabilities: eyeCapabilities(side, radius, 'pupil'), castShadow: false, receiveShadow: false,
  });
  addGlint(pupilAnchor, radius * 0.42);
}


function addHairParts(
  add: (part: SolidPartDefinition) => void,
  recipe: SolidFaceSourceRecipe,
  layout: SolidFaceLayout,
): void {
  const profile = createCharacterHairProfile(recipe.identity);
  if (profile === null) return;
  const addGeometry = (
    id: string,
    order: number,
    geometry: SolidPartDefinition['geometry'],
  ): void => {
    add({
      id, node: 'head', order, geometry,
      materialId: 'hair', placement: solidPlacement([0, 0, 0]),
      castShadow: true, receiveShadow: true,
    });
  };

  if (profile.spatial.kind === 'surface-cluster') {
    addGeometry(
      `hair:${profile.style}`,
      11,
      createHairTuftGeometry(layout.shape, profile.spatial.tufts, profile.spatial.radialClearance, 0),
    );
    return;
  }
  if (profile.spatial.kind === 'head-shell') {
    addGeometry(`hair:${profile.style}`, 10, createHairShellGeometry(layout.shape, profile.spatial));
    if (profile.spatial.tufts !== null) {
      addGeometry(
        `hair:${profile.style}:tufts`,
        11,
        createHairTuftGeometry(
          layout.shape,
          profile.spatial.tufts,
          profile.spatial.radialClearance,
          profile.spatial.thickness,
        ),
      );
    }
    return;
  }
  addGeometry(`hair:${profile.style}`, 10, createHairWrapGeometry(layout.shape, profile.spatial));
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
        castShadow: true, receiveShadow: true,
      });
    }
  }
  add({
    id: 'head', node: 'head', order: 0,
    geometry: Object.freeze({
      type: 'superellipsoid',
      radii: layout.shape.radii,
      exponent: layout.shape.exponent,
      ...(layout.shape.deformation === undefined ? {} : { deformation: layout.shape.deformation }),
      widthSegments: 48,
      heightSegments: 32,
    }),
    materialId: 'skin', placement: solidPlacement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
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
        castShadow: true, receiveShadow: true,
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
        capabilities: Object.freeze([solidFaceMotionCapability({ kind: 'brow', side })]),
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
      placement: solidPlacement(nosePosition),
      castShadow: true, receiveShadow: true,
    });
  }

  const [headRadiusX, headRadiusY] = layout.shape.radii;
  const tearProfile = createCharacterTearProfile(identity);
  const tearAnchorOffset = layout.eyeRadius
    * (1 + tearProfile.attachmentClearanceInEyeRadii);
  layout.eyeAnchors.forEach((eyeAnchor, index) => {
    const side = index === 0 ? -1 : 1;
    const sideId = side < 0 ? 'left' : 'right';
    tearProfile.components.forEach((component, componentIndex) => {
      const tearAnchor = moveOnSurface(
        eyeAnchor,
        [
          side * component.offset[0] * headRadiusX,
          -tearAnchorOffset + component.offset[1] * headRadiusY,
        ],
        layout.eyeRadius * (component.id === 'stream' ? 0.18 : 0.24),
      );
      const scaledOutline = Object.freeze(component.outline.map(([x, y]) => Object.freeze([
          x * headRadiusX,
          y * headRadiusY,
        ] as const)));
      const halfWidth = Math.max(...scaledOutline.map(([x]) => Math.abs(x)));
      const halfHeight = Math.max(...scaledOutline.map(([, y]) => Math.abs(y)));
      const depth = Math.max(0.009, Math.min(halfWidth, halfHeight) * (
        component.id === 'stream' ? 0.42 : 0.82
      ));
      add({
        id: `tear:${sideId}:${component.id}`,
        node: 'head',
        order: 27 + componentIndex * 0.02,
        geometry: plate(scaledOutline, depth, depth * 0.46),
        materialId: 'tear',
        placement: placement(tearAnchor),
        capabilities: Object.freeze([solidFaceMotionCapability({
          kind: 'flow-effect',
          attachment: component.id === 'stream' ? 'source' : 'free',
          activationState: 'crying',
          phase: component.phase + (side < 0 ? 0 : 0.33),
          travel: Object.freeze([
            component.travel[0] === 0 ? 0 : side * component.travel[0] * headRadiusX,
            component.travel[1] * headRadiusY,
            0,
          ] as const),
          pulse: component.pulse,
        })]),
        visible: false,
        castShadow: false,
        receiveShadow: false,
      });
    });
  });
  for (const expression of CHARACTER_EXPRESSIONS) {
    const profile = createCharacterMouthProfile(identity.mouth, expression);
    const mouthThickness = Math.max(0.01, headRadiusY * 0.018);
    const expressionId = expression === 'idle' ? 'mouth' : `mouth:${expression}`;
    const addMouthPart = (
      id: string,
      outline: readonly Point[],
      materialId: string,
      index: number,
    ): void => {
      const scaled = Object.freeze(outline.map(([x, y]) => Object.freeze([
        x * headRadiusX,
        y * headRadiusY,
      ] as const)));
      add({
        id,
        node: 'head', order: 28 + index * 0.02,
        geometry: plate(scaled, mouthThickness * 1.8, mouthThickness * 0.42),
        materialId,
        placement: placement(layout.mouthAnchor, mouthThickness * index * 0.5),
        capabilities: Object.freeze([solidFaceMotionCapability({ kind: 'mouth', expression })]),
        visible: expression === 'idle',
        castShadow: false, receiveShadow: false,
      });
    };
    profile.layers.forEach((mouthLayer, index) => {
      const materialId = mouthLayer.role === 'tooth' ? 'sclera'
        : mouthLayer.role === 'tongue' ? 'accent' : 'ink';
      addMouthPart(
        index === 0 ? expressionId : `${expressionId}:${mouthLayer.id}`,
        mouthLayer.outline,
        materialId,
        index,
      );
    });
    profile.strokes.forEach((mouthStroke, index) => {
      addMouthPart(
        `${expressionId}:${mouthStroke.id}`,
        strokePlate(mouthStroke.points, identity.mouth.width * 0.012),
        'ink',
        profile.layers.length + index,
      );
    });
  }

  addHairParts(add, recipe, layout);

  const headMinimum = layout.surfaceBounds.minimum;
  const headMaximum = layout.surfaceBounds.maximum;
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
        center: [
          layout.center[0] + (headMinimum[0] + headMaximum[0]) * 0.5,
          layout.center[1] + (headMinimum[1] + headMaximum[1]) * 0.5,
          layout.center[2] + (headMinimum[2] + headMaximum[2]) * 0.5,
        ] as const,
        size: [
          headMaximum[0] - headMinimum[0],
          headMaximum[1] - headMinimum[1],
          headMaximum[2] - headMinimum[2],
        ] as const,
      }),
    ]),
    sockets: layout.sockets,
    interactions: Object.freeze([]),
  });
}

export function createSolidCharacterFaceBlueprint(
  identity: CharacterIdentityRecipe,
  options: SolidCharacterRecipeOptions = {},
): SolidAssetBlueprint {
  return createSolidFaceBlueprint(createSolidCharacterRecipe(identity, options));
}
