import {
  closePath,
  compileSolidSuperellipsoidContainment,
  createAssetExtensionRegistry,
  defineAssetExtension,
  mediumById,
  type CharacterIdentityRecipe,
  type LayerDefinition,
  type Point,
  type Point3,
  type SolidNodeDefinition,
} from '../../../../../src/index.js';
import {
  fitPaperCircuitHelmetScale,
  paperCircuitFaceOpeningHalfWidthAt,
} from './geometry.js';
import {
  PAPER_CIRCUIT_HELMET_EXTENSION_ID,
  readPaperCircuitHelmetIdentity,
  type PaperCircuitHelmetIdentity,
} from './identity.js';
import { createSolidPaperCircuitHelmetBlueprint } from './object-blueprint.js';

function restPosition(
  nodes: readonly SolidNodeDefinition[],
  id: string,
): Point3 {
  const node = nodes.find((candidate) => candidate.id === id);
  if (node === undefined) throw new RangeError(`Missing solid node ${id}`);
  if (node.parentNode === undefined) return node.restPose.position;
  const parent = restPosition(nodes, node.parentNode);
  return Object.freeze([
    parent[0] + node.restPose.position[0],
    parent[1] + node.restPose.position[1],
    parent[2] + node.restPose.position[2],
  ] as const);
}

function helmetLayer(
  id: string,
  semanticPartId: string,
  bone: string,
  template: LayerDefinition,
  order: number,
  pivot: readonly [number, number],
  draw: LayerDefinition['draw'],
): LayerDefinition {
  return Object.freeze({
    id,
    semanticPartId,
    bone,
    order,
    depth: template.depth + 0.8,
    canvas: template.canvas,
    world: template.world,
    pivot,
    states: Object.freeze(['idle']),
    draw,
  });
}

type RasterHelmetProfile = Readonly<{
  shell: readonly Point[];
  opening: readonly Point[];
  visor: readonly Point[];
  hingeY: number;
}>;

function rasterHelmetProfile(
  width: number,
  height: number,
  identity: PaperCircuitHelmetIdentity,
): RasterHelmetProfile {
  const data = identity.data;
  const centerX = width * 0.5;
  const centerY = height * 0.5;
  const radiusX = width * 0.33 * (1 + data.fitClearance);
  const helmetAspect = data.item.shell.radii[1] / data.item.shell.radii[0];
  const radiusY = radiusX * helmetAspect;
  const openingSpec = data.item.shell.faceOpening;
  const start = Math.PI * (1 + openingSpec.bottomY * 0.42);
  const end = Math.PI * (2 - openingSpec.bottomY * 0.42);
  const shell = Object.freeze([
    ...Array.from({ length: 24 }, (_, index): Point => {
      const angle = start + index / 23 * (end - start);
      return [centerX + Math.cos(angle) * radiusX, centerY + Math.sin(angle) * radiusY];
    }),
    [centerX + radiusX, centerY + radiusY * 0.2] as Point,
    [centerX - radiusX, centerY + radiusY * 0.2] as Point,
  ]);
  const aperture = (overlap: number): readonly Point[] => {
    const topY = openingSpec.topY + overlap;
    const bottomY = openingSpec.bottomY - overlap;
    const verticalScale = radiusY * 1.02;
    const apertureCenterY = centerY + radiusY * 0.06;
    const rows = Array.from({ length: 14 }, (_, index) => (
      topY + index / 13 * (bottomY - topY)
    ));
    return Object.freeze([
      ...rows.map((y): Point => [
        centerX + paperCircuitFaceOpeningHalfWidthAt(data.item, y, overlap) * radiusX,
        apertureCenterY - y * verticalScale,
      ]),
      ...[...rows].reverse().map((y): Point => [
        centerX - paperCircuitFaceOpeningHalfWidthAt(data.item, y, overlap) * radiusX,
        apertureCenterY - y * verticalScale,
      ]),
    ]);
  };
  return Object.freeze({
    shell,
    opening: aperture(0),
    visor: aperture(data.item.visor.edgeOverlap),
    hingeY: centerY + radiusY * 0.06
      - (openingSpec.topY + data.item.visor.edgeOverlap) * radiusY * 1.02,
  });
}

export const PAPER_CIRCUIT_HELMET_EXTENSION = defineAssetExtension<
  CharacterIdentityRecipe,
  PaperCircuitHelmetIdentity
>({
  id: PAPER_CIRCUIT_HELMET_EXTENSION_ID,
  family: 'character',
  slotId: 'headwear',
  readIdentity: readPaperCircuitHelmetIdentity,
  semantics: ({ scope, slot }) => {
    const helmet = scope.id('helmet');
    const visor = scope.id('visor');
    return Object.freeze({
      parts: Object.freeze([
        Object.freeze({ id: helmet, parentId: slot.semanticParentId, spatial: 'shell' }),
        Object.freeze({ id: visor, parentId: helmet, spatial: 'articulated' }),
      ]),
      artBindings: Object.freeze([
        Object.freeze({ semanticPartId: helmet, roles: Object.freeze(['secondary-form', 'accent'] as const) }),
        Object.freeze({ semanticPartId: visor, roles: Object.freeze(['transparent', 'interactive'] as const) }),
      ]),
    });
  },
  raster: ({ identity, extension, scope, slot, blueprint }) => {
    const headLayer = blueprint.layers.find((layer) => layer.id === 'head');
    const ownerBone = slot.raster?.ownerBone;
    if (headLayer === undefined || ownerBone === undefined || slot.raster === undefined) {
      throw new RangeError('Character headwear slot is missing its raster anchor');
    }
    const helmetId = scope.id('helmet');
    const visorId = scope.id('visor');
    const profile = rasterHelmetProfile(
      headLayer.canvas.width,
      headLayer.canvas.height,
      extension,
    );
    const medium = mediumById(blueprint.medium);
    const margin = Math.max(
      identity.head.width,
      identity.head.height,
    ) * (extension.data.fitClearance + 0.12) * 0.65;
    return Object.freeze({
      bounds: Object.freeze({
        x: blueprint.bounds.x - margin,
        y: blueprint.bounds.y,
        width: blueprint.bounds.width + margin * 2,
        height: blueprint.bounds.height + margin,
      }),
      bones: Object.freeze([
        Object.freeze({
          id: helmetId,
          parentBone: ownerBone,
          restPose: Object.freeze({
            position: Object.freeze({ x: 0, y: 0 }),
            rotation: 0,
          }),
        }),
        Object.freeze({
          id: visorId,
          parentBone: helmetId,
          restPose: Object.freeze({
            position: Object.freeze({ x: 0, y: 0 }),
            rotation: 0,
          }),
        }),
      ]),
      layers: Object.freeze([
        helmetLayer(
          scope.id('layer:helmet'),
          helmetId,
          helmetId,
          headLayer,
          slot.raster.baseOrder,
          [0.5, 0.5],
          ({ sketch }) => {
            medium.tone(sketch, profile.shell, {
              drawing: Object.freeze({ value: 'mid', gesture: 'regular' }),
              color: extension.data.item.palette.shell,
            });
            sketch.context.save();
            sketch.polygon(profile.opening);
            sketch.context.clip();
            sketch.context.clearRect(0, 0, sketch.width, sketch.height);
            sketch.context.restore();
            medium.edge(sketch, profile.shell.slice(0, 24), 3.2, { amplitude: 0.55 });
            medium.edge(sketch, closePath(profile.opening), 2.7, {
              alpha: 0.78,
              amplitude: 0.28,
            });
          },
        ),
        helmetLayer(
          scope.id('layer:visor'),
          visorId,
          visorId,
          headLayer,
          slot.raster.baseOrder + 1,
          [0.5, profile.hingeY / headLayer.canvas.height],
          ({ sketch }) => {
            medium.glaze(sketch, profile.visor, {
              color: extension.data.item.palette.visor,
              opacity: 0.2,
              gap: 14,
              angle: 0.78,
            });
            medium.edge(sketch, closePath(profile.visor), 2.1, {
              alpha: 0.76,
              amplitude: 0.3,
            });
          },
        ),
      ]),
    });
  },
  solid: ({ extension, scope, slot, blueprint }) => {
    const head = blueprint.parts.find((part) => part.id === 'head');
    if (head?.geometry.type !== 'superellipsoid' || slot.solid === undefined) {
      throw new RangeError('Character headwear requires a superellipsoid head and solid slot');
    }
    const solidSlot = slot.solid;
    const item = createSolidPaperCircuitHelmetBlueprint(extension.data.item, {
      artDirection: blueprint.appearance.artDirection,
    });
    const fitScale = fitPaperCircuitHelmetScale(
      head.geometry,
      extension.data.item,
      extension.data.fitClearance,
    );
    const headPosition = restPosition(blueprint.nodes, solidSlot.ownerNode);
    const helmetId = scope.id('helmet');
    const visorId = scope.id('visor');
    const nodeId = (id: string): string => id === 'helmet' ? helmetId : scope.id(id);
    const semanticPartId = (id: string): string => id === 'helmet' ? helmetId : visorId;
    const partId = (id: string): string => scope.id(`part:${id === 'shell' ? 'helmet' : id}`);
    const surfaceId = (id: string): string => scope.id(`surface:${id}`);
    const containableSemanticPartIds = Object.freeze(
      ['hair', 'ears', 'eyewear'].filter((semanticPartId) => (
        blueprint.parts.some((part) => part.semanticPartId === semanticPartId)
      )),
    );
    const containment = containableSemanticPartIds.length === 0
      ? null
      : compileSolidSuperellipsoidContainment(blueprint, {
        id: scope.id('containment:helmet'),
        ownerNode: solidSlot.ownerNode,
        semanticPartIds: containableSemanticPartIds,
        volume: Object.freeze({
          type: 'superellipsoid',
          radii: Object.freeze(extension.data.item.shell.radii.map((radius) => (
            (radius - extension.data.item.shell.thickness) * fitScale
          )) as unknown as Point3),
          exponent: extension.data.item.shell.exponent,
          widthSegments: 32,
          heightSegments: 20,
        }),
        containedPartId: (sourcePartId) => scope.id(`contained:${sourcePartId}`),
      });
    return Object.freeze({
      bounds: Object.freeze({
        minimum: Object.freeze([
          item.bounds.minimum[0] * fitScale + headPosition[0],
          item.bounds.minimum[1] * fitScale + headPosition[1],
          item.bounds.minimum[2] * fitScale + headPosition[2],
        ] as const),
        maximum: Object.freeze([
          item.bounds.maximum[0] * fitScale + headPosition[0],
          item.bounds.maximum[1] * fitScale + headPosition[1],
          item.bounds.maximum[2] * fitScale + headPosition[2],
        ] as const),
      }),
      nodes: Object.freeze(item.nodes.map((node): SolidNodeDefinition => node.id === 'helmet'
        ? Object.freeze({
          ...node,
          id: helmetId,
          parentNode: solidSlot.ownerNode,
          restScale: Object.freeze([fitScale, fitScale, fitScale] as const),
        })
        : Object.freeze({
          ...node,
          id: nodeId(node.id),
          parentNode: nodeId(node.parentNode ?? 'helmet'),
        }))),
      parts: Object.freeze([
        ...(containment?.parts ?? []),
        ...item.parts.map((part) => Object.freeze({
          ...part,
          id: partId(part.id),
          semanticPartId: semanticPartId(part.semanticPartId),
          node: nodeId(part.node),
          order: solidSlot.baseOrder + part.order,
          surfaceId: surfaceId(part.surfaceId),
        })),
      ]),
      surfaces: Object.freeze(item.surfaces.map((surface) => Object.freeze({
        ...surface,
        id: surfaceId(surface.id),
      }))),
      ...(containment === null ? {} : {
        containments: Object.freeze([containment.definition]),
      }),
    });
  },
});

export const PAPER_CIRCUIT_EXTENSION_REGISTRY = createAssetExtensionRegistry([
  PAPER_CIRCUIT_HELMET_EXTENSION,
]);

export function isPaperCircuitHelmetCompatible(identity: CharacterIdentityRecipe): boolean {
  return identity.species === 'human';
}
