import type { Point3 } from '../../../core/geometry3.js';
import { createAssetAppearance } from '../../../appearance/art-direction.js';
import { DRAWING_INTENTS } from '../../../materials/drawing.js';
import { mergePhysicalSurfaceTreatment, type SemanticSurfaceSpec } from '../../../materials/surface.js';
import { TREE_ART_BINDINGS } from '../appearance/roles.js';
import type {
  MeshGeometrySpec,
  SolidAssetBlueprint,
  SolidPartDefinition,
} from '../../../contracts/solid-asset.js';
import { cross3, normalize3 } from '../../../core/geometry3.js';
import { createTreeSemanticManifest, treeSemanticPartId } from '../identity/semantics.js';
import type { TreeIdentityRecipe } from '../identity/recipe.js';
import { buildSolidTreeLayout } from './layout.js';
import {
  createSolidTreeRecipe,
  type SolidTreeRecipe,
  type SolidTreeRecipeOptions,
} from './recipe.js';

function placement(position: Point3) {
  return Object.freeze({ position });
}

function spatialPose(position: Point3) {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
}

function addPoint(left: Point3, right: Point3): Point3 {
  return Object.freeze([left[0] + right[0], left[1] + right[1], left[2] + right[2]] as const);
}

function scalePoint(value: Point3, amount: number): Point3 {
  return Object.freeze([value[0] * amount, value[1] * amount, value[2] * amount] as const);
}

function taperedBranch(
  start: Point3,
  end: Point3,
  startRadius: number,
  endRadius: number,
  sides = 7,
): MeshGeometrySpec {
  const direction = normalize3([end[0] - start[0], end[1] - start[1], end[2] - start[2]]);
  const reference: Point3 = Math.abs(direction[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize3(cross3(direction, reference));
  const forward = normalize3(cross3(right, direction));
  const vertices: Point3[] = [];
  for (let ring = 0; ring < 2; ring += 1) {
    const centre = ring === 0 ? start : end;
    const radius = ring === 0 ? startRadius : endRadius;
    for (let index = 0; index < sides; index += 1) {
      const angle = index / sides * Math.PI * 2;
      vertices.push(addPoint(
        centre,
        addPoint(
          scalePoint(right, Math.cos(angle) * radius),
          scalePoint(forward, Math.sin(angle) * radius),
        ),
      ));
    }
  }
  const startFace = Object.freeze(Array.from({ length: sides }, (_, index) => sides - 1 - index));
  const endFace = Object.freeze(Array.from({ length: sides }, (_, index) => sides + index));
  const faces: (readonly number[])[] = [startFace, endFace];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push(Object.freeze([index, next, sides + next, sides + index]));
  }
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices),
    faces: Object.freeze(faces),
    smooth: false,
  });
}

function surfaceSpecs(recipe: SolidTreeRecipe): readonly SemanticSurfaceSpec[] {
  const { palette } = recipe.identity;
  const physical = (treatment: SemanticSurfaceSpec['physical']) => (
    mergePhysicalSurfaceTreatment(treatment, recipe.style.physical)
  );
  return Object.freeze([
    Object.freeze({
      id: 'bark', color: palette.bark, substance: 'wood',
      drawing: Object.freeze({ application: 'pigment', drawing: DRAWING_INTENTS.mid }),
      physical: physical(Object.freeze({
        substrate: 'wood', finish: 'raw', roughness: 0.96, metalness: 0, clearcoat: 0,
      })),
    }),
    Object.freeze({
      id: 'foliage', color: palette.foliage, substance: 'foliage',
      drawing: Object.freeze({ application: 'pigment', drawing: DRAWING_INTENTS.agitated }),
      physical: physical(Object.freeze({
        substrate: 'generic', finish: 'matte', roughness: 0.92, metalness: 0, clearcoat: 0,
      })),
    }),
    Object.freeze({
      id: 'foliage:accent', color: palette.foliageAccent, substance: 'foliage',
      drawing: Object.freeze({ application: 'glaze', drawing: DRAWING_INTENTS.granular }),
      physical: physical(Object.freeze({
        substrate: 'generic', finish: 'matte', roughness: 0.9, metalness: 0, clearcoat: 0,
      })),
    }),
  ]);
}

function buildSolidTreeBlueprint(recipe: SolidTreeRecipe): SolidAssetBlueprint<'tree'> {
  const layout = buildSolidTreeLayout(recipe);
  const parts: SolidPartDefinition[] = [];
  const add = (part: Omit<SolidPartDefinition, 'semanticPartId'>): void => {
    parts.push(Object.freeze({ ...part, semanticPartId: treeSemanticPartId(part.id) }));
  };

  add({
    id: 'trunk', node: 'root', order: 0,
    geometry: taperedBranch(
      [0, 0, 0],
      [0, layout.trunkHeight, 0],
      layout.trunkBaseRadius,
      layout.trunkTopRadius,
    ),
    surfaceId: 'bark', placement: placement([0, 0, 0]),
    castShadow: true, receiveShadow: true,
  });
  for (const branch of layout.branches) {
    add({
      id: branch.id, node: 'root', order: 1,
      geometry: taperedBranch(branch.start, branch.end, branch.startRadius, branch.endRadius, 6),
      surfaceId: 'bark', placement: placement([0, 0, 0]),
      castShadow: true, receiveShadow: true,
    });
  }
  for (const [index, cluster] of layout.canopy.entries()) {
    add({
      id: cluster.id, node: 'root', order: 2,
      geometry: Object.freeze({
        type: 'superellipsoid',
        radii: cluster.radii,
        exponent: recipe.identity.archetype === 'pine' ? 1.65 : 2.35,
        deformation: Object.freeze({
          verticalTaper: recipe.identity.archetype === 'pine' ? 0.22 : 0.03,
          equatorBulge: 0.04,
          lobeAmplitude: cluster.lobeAmplitude,
          lobeCount: cluster.lobeCount,
          lobePhase: cluster.lobePhase,
        }),
        widthSegments: 12,
        heightSegments: 8,
      }),
      surfaceId: index % 3 === 0 ? 'foliage:accent' : 'foliage',
      placement: placement(cluster.centre),
      castShadow: true, receiveShadow: true,
    });
  }

  return Object.freeze({
    blueprintVersion: 1,
    family: 'tree',
    representation: 'solid',
    assetId: `tree:${recipe.identity.seed}`,
    seed: recipe.identity.seed,
    appearance: createAssetAppearance(recipe.style.artDirection, TREE_ART_BINDINGS),
    manifest: createTreeSemanticManifest(recipe.identity),
    bounds: layout.bounds,
    nodes: layout.nodes,
    parts: Object.freeze(parts),
    surfaces: surfaceSpecs(recipe),
    colliders: Object.freeze([Object.freeze({
      id: 'trunk', kind: 'solid', shape: 'capsule', node: 'root',
      localPose: spatialPose([0, layout.trunkHeight * 0.5, 0]),
      radius: layout.trunkBaseRadius,
      length: Math.max(0.01, layout.trunkHeight - layout.trunkBaseRadius * 2),
      axis: 'y',
    })]),
    sockets: layout.sockets,
    interactionBindings: Object.freeze([]),
  });
}

export function createSolidTreeBlueprint(recipe: SolidTreeRecipe): SolidAssetBlueprint<'tree'>;
export function createSolidTreeBlueprint(
  identity: TreeIdentityRecipe,
  options?: SolidTreeRecipeOptions,
): SolidAssetBlueprint<'tree'>;
export function createSolidTreeBlueprint(
  source: SolidTreeRecipe | TreeIdentityRecipe,
  options: SolidTreeRecipeOptions = {},
): SolidAssetBlueprint<'tree'> {
  return buildSolidTreeBlueprint(
    'representation' in source ? source : createSolidTreeRecipe(source, options),
  );
}
