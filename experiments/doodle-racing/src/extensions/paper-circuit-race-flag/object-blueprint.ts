import {
  createAssetAppearance,
  createSemanticSurface,
  validateSolidAssetBlueprint,
  type AssetSemanticManifest,
  type Point3,
  type SemanticPartArtBinding,
  type SolidAssetBlueprint,
  type SolidPartDefinition,
} from '../../../../../src/index.js';
import {
  PAPER_CIRCUIT_RACE_FLAG_FAMILY,
  type PaperCircuitRaceFlagIdentity,
} from './identity.js';

const MANIFEST: AssetSemanticManifest<typeof PAPER_CIRCUIT_RACE_FLAG_FAMILY> = Object.freeze({
  family: PAPER_CIRCUIT_RACE_FLAG_FAMILY,
  parts: Object.freeze([
    Object.freeze({ id: 'pole', spatial: 'volume' }),
    Object.freeze({ id: 'cloth', parentId: 'pole', spatial: 'articulated' }),
    Object.freeze({ id: 'mark', parentId: 'cloth', spatial: 'surface' }),
  ]),
  socketIds: Object.freeze(['mount']),
  colliderIds: Object.freeze([]),
  interactions: Object.freeze([]),
});

const ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  Object.freeze({ semanticPartId: 'pole', roles: Object.freeze(['secondary-form'] as const) }),
  Object.freeze({ semanticPartId: 'cloth', roles: Object.freeze(['primary-form'] as const) }),
  Object.freeze({ semanticPartId: 'mark', roles: Object.freeze(['accent'] as const) }),
]);

function pose(position: Point3) {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
}

export function createSolidPaperCircuitRaceFlagBlueprint(
  identity: PaperCircuitRaceFlagIdentity,
): SolidAssetBlueprint<typeof PAPER_CIRCUIT_RACE_FLAG_FAMILY> {
  const panels = 3;
  const panelWidth = 0.28;
  const parts: SolidPartDefinition[] = [Object.freeze({
    id: 'pole', semanticPartId: 'pole', node: 'root', order: 0,
    geometry: Object.freeze({ type: 'box' as const, size: Object.freeze([0.07, 1.72, 0.07] as Point3) }),
    surfaceId: 'pole', placement: Object.freeze({ position: Object.freeze([0, 0.48, 0] as Point3) }),
    castShadow: true, receiveShadow: true,
  })];
  for (let index = 0; index < panels; index += 1) {
    parts.push(Object.freeze({
      id: `cloth:${index}`,
      semanticPartId: index === 1 ? 'mark' : 'cloth',
      node: `cloth:${index}`,
      order: 1 + index,
      geometry: Object.freeze({
        type: 'box' as const,
        size: Object.freeze([panelWidth + 0.018, 0.58, 0.045] as Point3),
        segments: Object.freeze([2, 2, 1] as const),
      }),
      surfaceId: index === 1 ? 'mark' : 'cloth',
      placement: Object.freeze({ position: Object.freeze([panelWidth * 0.5, 0, 0] as Point3) }),
      castShadow: true,
      receiveShadow: true,
    }));
  }
  const blueprint: SolidAssetBlueprint<typeof PAPER_CIRCUIT_RACE_FLAG_FAMILY> = Object.freeze({
    blueprintVersion: 1,
    family: PAPER_CIRCUIT_RACE_FLAG_FAMILY,
    representation: 'solid',
    assetId: `${PAPER_CIRCUIT_RACE_FLAG_FAMILY}:${identity.seed}`,
    seed: identity.seed,
    appearance: createAssetAppearance('storybook', ART_BINDINGS),
    manifest: MANIFEST,
    bounds: Object.freeze({
      minimum: Object.freeze([-0.06, -0.4, -0.08] as Point3),
      maximum: Object.freeze([0.92, 1.38, 0.08] as Point3),
    }),
    nodes: Object.freeze([
      Object.freeze({ id: 'root', restPose: pose([0, 0, 0]) }),
      ...Array.from({ length: panels }, (_, index) => Object.freeze({
        id: `cloth:${index}`,
        parentNode: index === 0 ? 'root' : `cloth:${index - 1}`,
        restPose: pose(Object.freeze([
          index === 0 ? 0.035 : panelWidth,
          index === 0 ? 1.02 : 0,
          0,
        ] as Point3)),
      })),
    ]),
    parts: Object.freeze(parts),
    surfaces: Object.freeze([
      createSemanticSurface({
        id: 'cloth', color: identity.palette.cloth, substance: 'cloth',
        drawing: Object.freeze({ application: 'pigment', drawing: Object.freeze({ value: 'mid', gesture: 'agitated' }) }),
        physical: Object.freeze({ substrate: 'fiber', finish: 'matte', roughness: 0.94, metalness: 0 }),
      }),
      createSemanticSurface({
        id: 'mark', color: identity.palette.mark, substance: 'paper',
        drawing: Object.freeze({ application: 'paper', drawing: Object.freeze({ value: 'light', gesture: 'quiet' }) }),
        physical: Object.freeze({ substrate: 'fiber', finish: 'raw', roughness: 0.98, metalness: 0 }),
      }),
      createSemanticSurface({
        id: 'pole', color: identity.palette.pole, substance: 'wood',
        drawing: Object.freeze({ application: 'ink', drawing: Object.freeze({ value: 'dark', gesture: 'regular' }) }),
        physical: Object.freeze({ substrate: 'wood', finish: 'raw', roughness: 0.91, metalness: 0 }),
      }),
    ]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([Object.freeze({ id: 'mount', node: 'root', localPose: pose([0, 0, 0]) })]),
    interactionBindings: Object.freeze([]),
  });
  return validateSolidAssetBlueprint(blueprint);
}
