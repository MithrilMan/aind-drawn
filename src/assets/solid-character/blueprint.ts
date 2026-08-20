import type { Point } from '../../core/geometry.js';
import type { Point3 } from '../../core/geometry3.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import type { CharacterIdentityRecipe } from '../character-identity/recipe.js';
import { createSolidFaceBlueprint } from '../solid-face/blueprint.js';
import type {
  ExtrudedProfileGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../solid-types.js';
import { buildSolidCharacterLayout } from './layout.js';
import {
  createSolidCharacterRecipe,
  type SolidCharacterRecipe,
  type SolidCharacterRecipeOptions,
} from './recipe.js';

function solidPlacement(position: Point3, rotation?: Point3) {
  return Object.freeze({
    position,
    ...(rotation === undefined ? {} : { rotation }),
  });
}

function ellipsoid(
  radii: Point3,
  exponent = 2.5,
  segments: readonly [width: number, height: number] = [24, 16],
) {
  return Object.freeze({
    type: 'superellipsoid' as const,
    radii,
    exponent,
    widthSegments: segments[0],
    heightSegments: segments[1],
  });
}

function plate(
  outline: readonly Point[],
  depth: number,
  bevel: number,
): ExtrudedProfileGeometrySpec {
  return Object.freeze({
    type: 'extruded-profile', outline, depth, bevel, curveSegments: 3,
  });
}

function rectangle(width: number, height: number): readonly Point[] {
  return Object.freeze([
    [-width, -height], [width, -height], [width, height], [-width, height],
  ] as const);
}

function star(radius: number): readonly Point[] {
  return Object.freeze(Array.from({ length: 10 }, (_, index): Point => {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const pointRadius = index % 2 === 0 ? radius : radius * 0.43;
    return [Math.cos(angle) * pointRadius, Math.sin(angle) * pointRadius];
  }));
}

function addOutfitParts(
  add: (part: SolidPartDefinition) => void,
  recipe: SolidCharacterRecipe,
  torsoDepth: number,
): void {
  const identity = recipe.identity;
  if (identity.species === 'cat' || identity.outfit.style === 'plain') return;
  const width = identity.body.width * 0.34 * identity.outfit.scale;
  const centerY = identity.body.height * 0.52;
  const front = torsoDepth * 1.04;
  const addPlate = (id: string, outline: readonly Point[], y: number): void => {
    add({
      id, node: 'torso', order: 8,
      geometry: plate(outline, torsoDepth * 0.12, torsoDepth * 0.035),
      materialId: 'accent', placement: solidPlacement([0, y, front]),
      motion: Object.freeze({ role: 'fixed' }), castShadow: false, receiveShadow: false,
    });
  };
  if (identity.outfit.style === 'stripe') {
    for (const [index, offset] of [-1, 1].entries()) {
      addPlate(
        `outfit:stripe:${index}`,
        rectangle(width, identity.body.height * 0.025),
        centerY + offset * identity.body.height * 0.13,
      );
    }
    return;
  }
  if (identity.outfit.style === 'star') {
    addPlate('outfit:star', star(identity.body.height * 0.17 * identity.outfit.scale), centerY);
    return;
  }
  for (const [index, offset] of [-1, 0, 1].entries()) {
    const radius = identity.body.width * 0.045;
    add({
      id: `outfit:button:${index}`, node: 'torso', order: 8,
      geometry: ellipsoid([radius, radius, radius * 0.52] as const, 2.2, [16, 10]),
      materialId: 'accent',
      placement: solidPlacement([0, centerY + offset * identity.body.height * 0.18, front]),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: false,
    });
  }
}

function addTailParts(
  add: (part: SolidPartDefinition) => void,
  recipe: SolidCharacterRecipe,
): void {
  if (!recipe.identity.tail.present) return;
  const segments = 6;
  const segmentLength = recipe.identity.tail.length / segments;
  let x = 0;
  let y = 0;
  for (let index = 0; index < segments; index += 1) {
    const amount = index / Math.max(1, segments - 1);
    const angle = -0.1 + recipe.identity.tail.curl * (0.22 + amount * 0.92);
    const centerX = x + Math.cos(angle) * segmentLength * 0.5;
    const centerY = y + Math.sin(angle) * segmentLength * 0.5;
    const radius = Math.max(0.035, recipe.identity.body.width * (0.075 - amount * 0.025));
    add({
      id: `tail:${index}`, node: 'tail', order: -4 + index,
      geometry: ellipsoid(
        [radius, segmentLength * 0.58, radius] as const,
        2.2,
        [16, 10],
      ),
      materialId: 'skin',
      placement: solidPlacement(
        [centerX, centerY, 0] as const,
        [0, 0, angle - Math.PI / 2] as const,
      ),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
    x += Math.cos(angle) * segmentLength;
    y += Math.sin(angle) * segmentLength;
  }
}

function buildSolidCharacterBlueprint(recipe: SolidCharacterRecipe): SolidAssetBlueprint {
  const layout = buildSolidCharacterLayout(recipe);
  const identity = recipe.identity;
  const face = createSolidFaceBlueprint(recipe);
  const parts: SolidPartDefinition[] = [];
  const add = (part: SolidPartDefinition): void => { parts.push(Object.freeze(part)); };
  const bodyMaterial = identity.species === 'cat' ? 'skin' : 'cloth';
  const limbMaterial = identity.species === 'cat' ? 'skin' : 'cloth';
  const torsoRadii: Point3 = [
    layout.torso.width * 0.5,
    layout.torso.height * 0.5,
    layout.torso.depth,
  ];

  add({
    id: 'body:torso', node: 'torso', order: 0,
    geometry: ellipsoid(torsoRadii, identity.species === 'robot' ? 4.8 : 2.6, [32, 22]),
    materialId: bodyMaterial,
    placement: solidPlacement([0, layout.torso.height * 0.5, 0] as const),
    motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
  });

  for (const side of [-1, 1] as const) {
    const sideId = side < 0 ? 'left' : 'right';
    add({
      id: `arm:${sideId}`, node: `arm:${sideId}`, order: 2,
      geometry: ellipsoid([
        layout.limbs.armRadius,
        layout.limbs.armLength * 0.44,
        layout.limbs.armRadius,
      ] as const, 2.2, [18, 12]),
      materialId: limbMaterial,
      placement: solidPlacement([0, -layout.limbs.armLength * 0.44, 0] as const),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
    const handRadius = layout.limbs.armRadius * (identity.species === 'cat' ? 1.45 : 1.28);
    add({
      id: `hand:${sideId}`, node: `arm:${sideId}`, order: 3,
      geometry: ellipsoid([
        handRadius,
        handRadius * (identity.species === 'cat' ? 0.72 : 0.9),
        handRadius * 0.82,
      ] as const, 2.2, [16, 10]),
      materialId: 'skin',
      placement: solidPlacement([0, -layout.limbs.armLength * 0.9, handRadius * 0.18] as const),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });

    add({
      id: `leg:${sideId}`, node: `leg:${sideId}`, order: -2,
      geometry: ellipsoid([
        layout.limbs.legRadius,
        layout.limbs.legLength * 0.4,
        layout.limbs.legRadius,
      ] as const, 2.3, [18, 12]),
      materialId: limbMaterial,
      placement: solidPlacement([0, -layout.limbs.legLength * 0.43, 0] as const),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
    const footRadius = layout.limbs.legRadius * 1.34;
    add({
      id: `foot:${sideId}`, node: `leg:${sideId}`, order: -1,
      geometry: ellipsoid([
        footRadius,
        footRadius * 0.62,
        footRadius * 1.48,
      ] as const, 2.4, [18, 12]),
      materialId: identity.species === 'cat' ? 'skin' : 'accent',
      placement: solidPlacement([
        0,
        -layout.limbs.legLength * 0.88,
        footRadius * 0.48,
      ] as const),
      motion: Object.freeze({ role: 'fixed' }), castShadow: true, receiveShadow: true,
    });
  }

  addOutfitParts(add, recipe, layout.torso.depth);
  addTailParts(add, recipe);
  for (const part of face.parts) add(part);

  const clothMaterial: SolidMaterialSpec = Object.freeze({
    id: 'cloth', role: 'clothing', color: identity.palette.cloth,
    finish: identity.species === 'robot' ? 'metal' : 'matte',
  });
  const materials = Object.freeze([...face.materials, clothMaterial]);
  const bodyTop = layout.limbs.legLength + layout.torso.height;
  const headMinimum = layout.face.surfaceBounds.minimum;
  const headMaximum = layout.face.surfaceBounds.maximum;

  return Object.freeze({
    representation: 'solid',
    id: `solid-character:${identity.seed}`,
    kind: 'solid-character',
    seed: identity.seed,
    bounds: layout.bounds,
    nodes: layout.nodes,
    parts: Object.freeze(parts),
    materials,
    colliders: Object.freeze([
      Object.freeze({
        id: 'body', kind: 'solid', shape: 'box',
        center: [0, bodyTop * 0.5, 0] as const,
        size: [layout.torso.width, bodyTop, layout.torso.depth * 2] as const,
      }),
      Object.freeze({
        id: 'head', kind: 'solid', shape: 'box',
        center: [
          layout.headCenter[0] + (headMinimum[0] + headMaximum[0]) * 0.5,
          layout.headCenter[1] + (headMinimum[1] + headMaximum[1]) * 0.5,
          layout.headCenter[2] + (headMinimum[2] + headMaximum[2]) * 0.5,
        ] as const,
        size: [
          headMaximum[0] - headMinimum[0],
          headMaximum[1] - headMinimum[1],
          headMaximum[2] - headMinimum[2],
        ] as const,
      }),
    ]),
    sockets: layout.sockets,
  });
}

export function createSolidCharacterBlueprint(
  recipe: SolidCharacterRecipe,
): SolidAssetBlueprint;
export function createSolidCharacterBlueprint(
  identity: CharacterIdentityRecipe,
  options?: SolidCharacterRecipeOptions,
): SolidAssetBlueprint;
export function createSolidCharacterBlueprint(
  source: SolidCharacterRecipe | CharacterIdentityRecipe,
  options: SolidCharacterRecipeOptions = {},
): SolidAssetBlueprint {
  const recipe = source.kind === 'character-identity'
    ? createSolidCharacterRecipe(source, options)
    : source;
  return buildSolidCharacterBlueprint(recipe);
}
