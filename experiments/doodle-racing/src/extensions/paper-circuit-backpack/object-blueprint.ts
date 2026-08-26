import {
  createAssetAppearance,
  createSemanticSurface,
  validateSolidAssetBlueprint,
  type ArtDirectionSource,
  type AssetSemanticManifest,
  type Point3,
  type SemanticPartArtBinding,
  type SolidAssetBlueprint,
  type SolidPartDefinition,
} from '../../../../../src/index.js';
import {
  PAPER_CIRCUIT_BACKPACK_FAMILY,
  type PaperCircuitBackpackIdentity,
} from './identity.js';

const MANIFEST: AssetSemanticManifest<typeof PAPER_CIRCUIT_BACKPACK_FAMILY> = Object.freeze({
  family: PAPER_CIRCUIT_BACKPACK_FAMILY,
  parts: Object.freeze([
    Object.freeze({ id: 'body', spatial: 'volume' }),
    Object.freeze({ id: 'pocket', parentId: 'body', spatial: 'volume' }),
    Object.freeze({ id: 'flap', parentId: 'body', spatial: 'articulated' }),
    Object.freeze({ id: 'straps', parentId: 'body', spatial: 'wrap' }),
    Object.freeze({ id: 'hardware', parentId: 'body', spatial: 'volume' }),
  ]),
  socketIds: Object.freeze(['mount', 'helmet-storage']),
  colliderIds: Object.freeze([]),
  interactions: Object.freeze([]),
});

const ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  Object.freeze({ semanticPartId: 'body', roles: Object.freeze(['primary-form'] as const) }),
  Object.freeze({ semanticPartId: 'pocket', roles: Object.freeze(['secondary-form'] as const) }),
  Object.freeze({ semanticPartId: 'flap', roles: Object.freeze(['secondary-form', 'accent'] as const) }),
  Object.freeze({ semanticPartId: 'straps', roles: Object.freeze(['line-detail'] as const) }),
  Object.freeze({ semanticPartId: 'hardware', roles: Object.freeze(['accent'] as const) }),
]);

export type PaperCircuitBackpackBlueprintOptions = Readonly<{
  artDirection?: ArtDirectionSource;
}>;

function pose(position: Point3) {
  return Object.freeze({ position, rotation: Object.freeze([0, 0, 0, 1] as const) });
}

function placement(position: Point3, rotation?: Point3) {
  return Object.freeze({ position, ...(rotation === undefined ? {} : { rotation }) });
}

export function createSolidPaperCircuitBackpackBlueprint(
  identity: PaperCircuitBackpackIdentity,
  options: PaperCircuitBackpackBlueprintOptions = {},
): SolidAssetBlueprint<typeof PAPER_CIRCUIT_BACKPACK_FAMILY> {
  const [radiusX, radiusY, radiusZ] = identity.dimensions.radii;
  const flapHeight = identity.style === 'courier' ? radiusY * 0.72 : radiusY * 0.54;
  const flapWidth = radiusX * (identity.style === 'roll-top' ? 1.72 : 1.82);
  const bodyZ = radiusZ * 0.78;
  const frontZ = bodyZ + radiusZ * 0.92;
  const parts: SolidPartDefinition[] = [
    Object.freeze({
      id: 'body', semanticPartId: 'body', node: 'root', order: 0,
      geometry: Object.freeze({
        type: 'superellipsoid' as const,
        radii: identity.dimensions.radii,
        exponent: identity.dimensions.exponent,
        deformation: Object.freeze({
          verticalTaper: identity.style === 'roll-top' ? -0.08 : 0.04,
          equatorBulge: identity.style === 'rally-pack' ? 0.05 : 0.02,
          lobeAmplitude: 0.012,
          lobeCount: 5,
          lobePhase: identity.seed * 0.013,
        }),
        widthSegments: 18,
        heightSegments: 12,
      }),
      surfaceId: 'fabric', placement: placement([0, 0, bodyZ]),
      castShadow: true, receiveShadow: true,
    }),
    Object.freeze({
      id: 'back-panel', semanticPartId: 'body', node: 'root', order: 1,
      geometry: Object.freeze({ type: 'superellipsoid' as const, radii: Object.freeze([
        radiusX * 0.9, radiusY * 0.86, radiusZ * 0.12,
      ] as Point3), exponent: 4.8, widthSegments: 16, heightSegments: 10 }),
      surfaceId: 'strap', placement: placement([0, -radiusY * 0.02, -radiusZ * 0.04]),
      castShadow: true, receiveShadow: true,
    }),
    Object.freeze({
      id: 'base', semanticPartId: 'body', node: 'root', order: 1,
      geometry: Object.freeze({ type: 'superellipsoid' as const, radii: Object.freeze([
        radiusX * 0.88, radiusY * 0.14, radiusZ * 0.88,
      ] as Point3), exponent: 3.1, widthSegments: 16, heightSegments: 8 }),
      surfaceId: 'accent', placement: placement([0, -radiusY * 0.88, bodyZ + radiusZ * 0.02]),
      castShadow: true, receiveShadow: true,
    }),
    Object.freeze({
      id: 'flap', semanticPartId: 'flap', node: 'flap', order: 3,
      geometry: Object.freeze({ type: 'box' as const, size: Object.freeze([
        flapWidth, flapHeight, 0.055,
      ] as Point3) }),
      surfaceId: 'accent', placement: placement([0, -flapHeight * 0.5, 0], [-0.08, 0, 0]),
      castShadow: true, receiveShadow: true,
    }),
    ...([-1, 1] as const).map((side): SolidPartDefinition => Object.freeze({
      id: `strap:${side < 0 ? 'left' : 'right'}`,
      semanticPartId: 'straps', node: 'root', order: 1,
      geometry: Object.freeze({ type: 'box' as const, size: Object.freeze([
        radiusX * 0.22, radiusY * 1.42, 0.045,
      ] as Point3) }),
      surfaceId: 'strap', placement: placement([
        side * radiusX * 0.56, -radiusY * 0.02, -radiusZ * 0.18,
      ], [0, 0, side * -0.08]),
      castShadow: true, receiveShadow: true,
    })),
  ];
  if (identity.pocket.present) {
    parts.push(Object.freeze({
      id: 'pocket', semanticPartId: 'pocket', node: 'root', order: 2,
      geometry: Object.freeze({
        type: 'superellipsoid' as const,
        radii: Object.freeze([
          radiusX * identity.pocket.widthRatio,
          radiusY * identity.pocket.heightRatio,
          radiusZ * 0.42,
        ] as Point3),
        exponent: 4.2,
        widthSegments: 14,
        heightSegments: 8,
      }),
      surfaceId: 'accent', placement: placement([
        0, -radiusY * 0.42, frontZ + radiusZ * 0.16,
      ]),
      castShadow: true, receiveShadow: true,
    }));
  }
  if (identity.style === 'rally-pack') {
    for (const side of [-1, 1] as const) {
      parts.push(Object.freeze({
        id: `side-pocket:${side < 0 ? 'left' : 'right'}`,
        semanticPartId: 'pocket', node: 'root', order: 2,
        geometry: Object.freeze({ type: 'superellipsoid' as const, radii: Object.freeze([
          radiusX * 0.18, radiusY * 0.25, radiusZ * 0.48,
        ] as Point3), exponent: 3.6, widthSegments: 10, heightSegments: 8 }),
        surfaceId: 'accent', placement: placement([
          side * radiusX * 0.96, -radiusY * 0.36, bodyZ + radiusZ * 0.1,
        ]),
        castShadow: true, receiveShadow: true,
      }));
    }
  }
  if (identity.style === 'roll-top') {
    parts.push(Object.freeze({
      id: 'roll', semanticPartId: 'flap', node: 'root', order: 2,
      geometry: Object.freeze({
        type: 'superellipsoid' as const,
        radii: Object.freeze([radiusX * 0.88, radiusY * 0.16, radiusZ * 0.82] as Point3),
        exponent: 2.8, widthSegments: 14, heightSegments: 8,
      }),
      surfaceId: 'accent', placement: placement([0, radiusY * 0.84, bodyZ]),
      castShadow: true, receiveShadow: true,
    }));
  }
  const buckleXs = identity.hardware.buckleCount === 1
    ? [0]
    : [-radiusX * 0.38, radiusX * 0.38];
  for (const [index, x] of buckleXs.entries()) {
    parts.push(Object.freeze({
      id: `buckle:${index}`, semanticPartId: 'hardware', node: 'root', order: 4,
      geometry: Object.freeze({ type: 'box' as const, size: Object.freeze([
        0.105, 0.085, 0.045,
      ] as Point3) }),
      surfaceId: 'hardware', placement: placement([
        x, -radiusY * 0.18, frontZ + radiusZ * 0.12,
      ]),
      castShadow: true, receiveShadow: true,
    }));
  }
  if (identity.hardware.handle) {
    parts.push(Object.freeze({
      id: 'handle', semanticPartId: 'hardware', node: 'root', order: 1,
      geometry: Object.freeze({ type: 'box' as const, size: Object.freeze([
        radiusX * 0.7, 0.07, 0.07,
      ] as Point3) }),
      surfaceId: 'hardware', placement: placement([0, radiusY * 1.06, bodyZ * 0.7]),
      castShadow: true, receiveShadow: true,
    }));
  }
  const fabric = createSemanticSurface({
    id: 'fabric', color: identity.palette.fabric, substance: 'cloth',
    drawing: Object.freeze({ application: 'pigment', drawing: Object.freeze({ value: 'mid', gesture: 'regular' }) }),
    physical: Object.freeze({ substrate: 'fiber', finish: 'matte', roughness: 0.94, metalness: 0 }),
  });
  const accent = createSemanticSurface({
    id: 'accent', color: identity.palette.accent, substance: 'cloth',
    drawing: Object.freeze({ application: 'pigment', drawing: Object.freeze({ value: 'dark', gesture: 'agitated' }) }),
    physical: Object.freeze({ substrate: 'fiber', finish: 'matte', roughness: 0.9, metalness: 0 }),
  });
  const strap = createSemanticSurface({
    id: 'strap', color: identity.palette.hardware, substance: 'cloth',
    drawing: Object.freeze({ application: 'ink', drawing: Object.freeze({ value: 'dark', gesture: 'regular' }) }),
    physical: Object.freeze({ substrate: 'fiber', finish: 'raw', roughness: 0.96, metalness: 0 }),
  });
  const hardware = createSemanticSurface({
    id: 'hardware', color: identity.palette.hardware, substance: 'metal',
    drawing: Object.freeze({ application: 'ink', drawing: Object.freeze({ value: 'dark', gesture: 'regular' }) }),
    physical: Object.freeze({ substrate: 'metal', finish: 'satin', roughness: 0.48, metalness: 0.72 }),
  });
  const blueprint: SolidAssetBlueprint<typeof PAPER_CIRCUIT_BACKPACK_FAMILY> = Object.freeze({
    blueprintVersion: 1,
    family: PAPER_CIRCUIT_BACKPACK_FAMILY,
    representation: 'solid',
    assetId: `${PAPER_CIRCUIT_BACKPACK_FAMILY}:${identity.seed}:${identity.style}`,
    seed: identity.seed,
    appearance: createAssetAppearance(options.artDirection ?? 'storybook', ART_BINDINGS),
    manifest: MANIFEST,
    bounds: Object.freeze({
      minimum: Object.freeze([-radiusX * 1.18, -radiusY * 1.1, -radiusZ * 0.2] as Point3),
      maximum: Object.freeze([radiusX * 1.18, radiusY * 1.18, bodyZ + radiusZ * 1.52] as Point3),
    }),
    nodes: Object.freeze([
      Object.freeze({ id: 'root', restPose: pose([0, 0, 0]) }),
      Object.freeze({
        id: 'flap', parentNode: 'root',
        restPose: pose([0, radiusY * 0.78, frontZ]),
      }),
    ]),
    parts: Object.freeze(parts),
    surfaces: Object.freeze([fabric, accent, strap, hardware]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([
      Object.freeze({ id: 'mount', node: 'root', localPose: pose([0, 0, 0]) }),
      Object.freeze({
        id: 'helmet-storage', node: 'root',
        localPose: pose([0, radiusY * 0.34, bodyZ + radiusZ * 0.22]),
      }),
    ]),
    interactionBindings: Object.freeze([]),
  });
  return validateSolidAssetBlueprint(blueprint);
}
