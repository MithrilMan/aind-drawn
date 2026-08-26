import {
  createAssetAppearance,
  createSemanticSurface,
  validateSolidAssetBlueprint,
  type ArtDirectionSource,
  type AssetSemanticManifest,
  type Bounds3,
  type Point3,
  type SemanticPartArtBinding,
  type SolidAssetBlueprint,
} from '../../../../../src/index.js';
import {
  createPaperCircuitHelmetShellGeometry,
  createPaperCircuitVisorGeometry,
} from './geometry.js';
import {
  PAPER_CIRCUIT_HELMET_FAMILY,
  type PaperCircuitHelmetItemIdentity,
} from './identity.js';

export const PAPER_CIRCUIT_HELMET_MANIFEST: AssetSemanticManifest<
  typeof PAPER_CIRCUIT_HELMET_FAMILY
> = Object.freeze({
  family: PAPER_CIRCUIT_HELMET_FAMILY,
  parts: Object.freeze([
    Object.freeze({ id: 'helmet', spatial: 'shell' }),
    Object.freeze({ id: 'visor', parentId: 'helmet', spatial: 'articulated' }),
  ]),
  socketIds: Object.freeze([]),
  colliderIds: Object.freeze([]),
  interactions: Object.freeze([]),
});

export const PAPER_CIRCUIT_HELMET_ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  Object.freeze({
    semanticPartId: 'helmet',
    roles: Object.freeze(['primary-form', 'accent'] as const),
  }),
  Object.freeze({
    semanticPartId: 'visor',
    roles: Object.freeze(['transparent', 'interactive'] as const),
  }),
]);

function rotateX(point: Point3, angle: number): Point3 {
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  return Object.freeze([
    point[0],
    point[1] * cosine - point[2] * sine,
    point[1] * sine + point[2] * cosine,
  ] as const);
}

function modelBounds(
  shell: readonly Point3[],
  visor: readonly Point3[],
  hinge: Point3,
  openAngle: number,
): Bounds3 {
  const points = [
    ...shell,
    ...visor.map((point): Point3 => Object.freeze([
      point[0] + hinge[0], point[1] + hinge[1], point[2] + hinge[2],
    ])),
    ...visor.map((point): Point3 => {
      const open = rotateX(point, -openAngle);
      return Object.freeze([open[0] + hinge[0], open[1] + hinge[1], open[2] + hinge[2]]);
    }),
  ];
  const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
  const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const point of points) {
    minimum[0] = Math.min(minimum[0], point[0]);
    minimum[1] = Math.min(minimum[1], point[1]);
    minimum[2] = Math.min(minimum[2], point[2]);
    maximum[0] = Math.max(maximum[0], point[0]);
    maximum[1] = Math.max(maximum[1], point[1]);
    maximum[2] = Math.max(maximum[2], point[2]);
  }
  return Object.freeze({ minimum: Object.freeze(minimum), maximum: Object.freeze(maximum) });
}

export type PaperCircuitHelmetBlueprintOptions = Readonly<{
  artDirection?: ArtDirectionSource;
}>;

/** Standalone equipment blueprint. The character extension mounts this exact authored object. */
export function createSolidPaperCircuitHelmetBlueprint(
  identity: PaperCircuitHelmetItemIdentity,
  options: PaperCircuitHelmetBlueprintOptions = {},
): SolidAssetBlueprint<typeof PAPER_CIRCUIT_HELMET_FAMILY> {
  const shell = createPaperCircuitHelmetShellGeometry(identity);
  const visor = createPaperCircuitVisorGeometry(identity);
  const helmetSurface = createSemanticSurface({
    id: 'helmet',
    color: identity.palette.shell,
    substance: 'paint',
    drawing: Object.freeze({
      application: 'pigment',
      drawing: Object.freeze({ value: 'mid', gesture: 'regular' }),
    }),
    physical: Object.freeze({
      substrate: 'resin', finish: 'satin', roughness: 0.58,
      metalness: 0, clearcoat: 0.34,
    }),
  });
  const visorSurface = createSemanticSurface({
    id: 'visor',
    color: identity.palette.visor,
    substance: 'glass',
    drawing: Object.freeze({
      application: 'glaze',
      drawing: Object.freeze({ value: 'light', gesture: 'regular' }),
    }),
    physical: Object.freeze({
      substrate: 'glass', finish: 'gloss', roughness: 0.14,
      metalness: 0, clearcoat: 0.92, opacity: 0.34,
    }),
  });
  const blueprint: SolidAssetBlueprint<typeof PAPER_CIRCUIT_HELMET_FAMILY> = Object.freeze({
    blueprintVersion: 1 as const,
    family: PAPER_CIRCUIT_HELMET_FAMILY,
    representation: 'solid' as const,
    assetId: `${PAPER_CIRCUIT_HELMET_FAMILY}:${identity.seed}`,
    seed: identity.seed,
    appearance: createAssetAppearance(options.artDirection, PAPER_CIRCUIT_HELMET_ART_BINDINGS),
    manifest: PAPER_CIRCUIT_HELMET_MANIFEST,
    bounds: modelBounds(shell.vertices, visor.geometry.vertices, visor.hinge, identity.visor.openAngle),
    nodes: Object.freeze([
      Object.freeze({
        id: 'helmet',
        restPose: Object.freeze({
          position: Object.freeze([0, 0, 0] as const),
          rotation: Object.freeze([0, 0, 0, 1] as const),
        }),
      }),
      Object.freeze({
        id: 'visor',
        parentNode: 'helmet',
        restPose: Object.freeze({
          position: visor.hinge,
          rotation: Object.freeze([0, 0, 0, 1] as const),
        }),
      }),
    ]),
    parts: Object.freeze([
      Object.freeze({
        id: 'shell', semanticPartId: 'helmet', node: 'helmet', order: 0,
        geometry: shell, surfaceId: 'helmet',
        placement: Object.freeze({ position: Object.freeze([0, 0, 0] as const) }),
        castShadow: true, receiveShadow: true,
      }),
      Object.freeze({
        id: 'visor', semanticPartId: 'visor', node: 'visor', order: 1,
        geometry: visor.geometry, surfaceId: 'visor',
        placement: Object.freeze({ position: Object.freeze([0, 0, 0] as const) }),
        castShadow: false, receiveShadow: false,
      }),
      ...([-1, 1] as const).map((side) => Object.freeze({
        id: `hinge:${side < 0 ? 'left' : 'right'}`,
        semanticPartId: 'helmet', node: 'helmet', order: 2,
        geometry: Object.freeze({
          type: 'superellipsoid' as const,
          radii: Object.freeze([0.065, 0.08, 0.07] as const),
          exponent: 3.2,
          widthSegments: 16,
          heightSegments: 10,
        }),
        surfaceId: 'helmet',
        placement: Object.freeze({ position: Object.freeze([
          side * identity.shell.radii[0] * 0.99,
          identity.shell.radii[1]
            * (identity.shell.faceOpening.topY + identity.visor.edgeOverlap),
          0,
        ] as const) }),
        castShadow: true,
        receiveShadow: true,
      })),
    ]),
    surfaces: Object.freeze([helmetSurface, visorSurface]),
    colliders: Object.freeze([]),
    sockets: Object.freeze([]),
    interactionBindings: Object.freeze([]),
  });
  return validateSolidAssetBlueprint(blueprint);
}
