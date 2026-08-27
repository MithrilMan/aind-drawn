import type { RgbColor } from '../../core/sketch.js';
import type { Point3 } from '../../core/geometry3.js';
import { SeedTree } from '../../core/random.js';
import type { MediumId } from '../../materials/medium.js';
import type { SolidAssetBlueprint } from '../../contracts/solid-asset.js';
import type { AssetBlueprintHeader } from '../../contracts/asset-envelope.js';
import {
  artDirectionDetailScale,
  artRolesForPart,
  createAssetAppearance,
  resolveSemanticSurface,
  type ArtDirectionSource,
} from '../../appearance/art-direction.js';
import { inkedSolidMediumDefaults } from './medium-projection.js';
import {
  INKED_SOLID_MARK_STYLES,
  type InkedSolidContourPolicy,
  type InkedSolidDepositionPolicy,
  type InkedSolidPaperPolicy,
  type InkedSolidStrokeDefinition,
  type InkedSolidStrokePath,
  type InkedSolidStrokeSpec,
  type InkedSolidStrokeRevealSequence,
  type InkedSolidViewMarkOverrides,
  type InkedSolidViewMarkPolicy,
} from './contracts.js';

export type InkedSolidBlueprint<TFamily extends string = string> = AssetBlueprintHeader<
  TFamily,
  'inked-solid'
> & Readonly<{
  medium: MediumId;
  solid: SolidAssetBlueprint<TFamily>;
  /**
   * Parts that participate in the opaque G-buffer carrier. Physically
   * transparent parts remain available to semantic strokes but cannot be
   * flattened into the single opaque depth/normal layer without hiding the
   * surfaces behind them.
   */
  carrierPartIds: readonly string[];
  contour: InkedSolidContourPolicy;
  deposition: InkedSolidDepositionPolicy;
  viewMarks: readonly InkedSolidViewMarkPolicy[];
  paper: InkedSolidPaperPolicy;
  strokes: readonly InkedSolidStrokeSpec[];
}>;

export type InkedSolidBlueprintOptions = Readonly<{
  medium: MediumId;
  artDirection?: ArtDirectionSource;
  contour?: Partial<Omit<InkedSolidContourPolicy, 'seed'>>;
  deposition?: Partial<Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>>;
  viewMarks?: false | InkedSolidViewMarkOverrides;
  paper?: Partial<Omit<InkedSolidPaperPolicy, 'seed'>>;
  strokes?: readonly InkedSolidStrokeDefinition[];
  strokeReveal?: InkedSolidStrokeRevealSequence;
}>;

function finite(name: string, value: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be finite`);
  return value;
}

function positive(name: string, value: number): number {
  if (finite(name, value) <= 0) throw new RangeError(`${name} must be greater than zero`);
  return value;
}

function unit(name: string, value: number): number {
  if (finite(name, value) < 0 || value > 1) {
    throw new RangeError(`${name} must be between zero and one`);
  }
  return value;
}

function nonNegative(name: string, value: number): number {
  if (finite(name, value) < 0) throw new RangeError(`${name} must not be negative`);
  return value;
}

function integer(name: string, value: number, minimum: number, maximum: number): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function color(name: string, value: RgbColor): RgbColor {
  if (value.some((channel) => (
    !Number.isFinite(channel) || channel < 0 || channel > 255
  ))) {
    throw new RangeError(`${name} must contain three channels between zero and 255`);
  }
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function point(name: string, value: Point3): Point3 {
  if (value.some((coordinate) => !Number.isFinite(coordinate))) {
    throw new RangeError(`${name} must contain finite coordinates`);
  }
  return Object.freeze([value[0], value[1], value[2]] as const);
}

function strokePath(
  solid: SolidAssetBlueprint,
  stroke: InkedSolidStrokeDefinition,
): InkedSolidStrokePath {
  if (stroke.path.type === 'part-local') {
    if (stroke.path.points.length < 2) {
      throw new RangeError(`stroke ${stroke.id} requires at least two path points`);
    }
    return Object.freeze({
      type: 'part-local',
      points: Object.freeze(stroke.path.points.map((value, index) => (
        point(`stroke ${stroke.id} point ${index}`, value)
      ))),
    });
  }
  const owner = solid.parts.find(({ id }) => id === stroke.partId);
  if (owner?.geometry.type !== 'superellipsoid') {
    throw new RangeError(
      `stroke ${stroke.id} requires superellipsoid part ${stroke.partId}`,
    );
  }
  if (stroke.path.directions.length < 2) {
    throw new RangeError(`stroke ${stroke.id} requires at least two surface directions`);
  }
  const directions = Object.freeze(stroke.path.directions.map((value, index) => {
    const direction = point(`stroke ${stroke.id} direction ${index}`, value);
    if (Math.hypot(...direction) === 0) {
      throw new RangeError(`stroke ${stroke.id} directions must not be zero`);
    }
    return direction;
  }));
  return Object.freeze({
    type: 'superellipsoid-surface',
    directions,
    lift: nonNegative(`stroke ${stroke.id} lift`, stroke.path.lift),
  });
}

/**
 * Adds deterministic hand-drawn rendering policy to an existing solid asset.
 * The wrapped solid blueprint remains the sole owner of semantic geometry,
 * nodes, interactions, sockets, and colliders.
 */
export function createInkedSolidBlueprint<TFamily extends string>(
  solid: SolidAssetBlueprint<TFamily>,
  options: InkedSolidBlueprintOptions,
): InkedSolidBlueprint<TFamily> {
  const tree = new SeedTree(solid.seed);
  const appearance = options.artDirection === undefined
    ? solid.appearance
    : createAssetAppearance(options.artDirection, solid.appearance.parts);
  const defaults = inkedSolidMediumDefaults(options.medium);
  const contour = { ...defaults.contour, ...options.contour };
  const deposition = { ...defaults.deposition, ...options.deposition };
  const paper = { ...defaults.paper, ...options.paper };
  if (options.viewMarks !== undefined && options.viewMarks !== false) {
    for (const surfaceId of Object.keys(options.viewMarks.surfaces ?? {})) {
      if (!solid.surfaces.some(({ id }) => id === surfaceId)) {
        throw new RangeError(`viewMarks references unknown surface ${surfaceId}`);
      }
    }
    for (const semanticPartId of Object.keys(options.viewMarks.semanticParts ?? {})) {
      if (!solid.manifest.parts.some(({ id }) => id === semanticPartId)) {
        throw new RangeError(`viewMarks references unknown semantic part ${semanticPartId}`);
      }
    }
  }
  const surfaces = new Map(solid.surfaces.map((surface) => [surface.id, surface]));
  const carrierPartIds = Object.freeze(solid.parts
    .filter((part) => (surfaces.get(part.surfaceId)?.physical.opacity ?? 1) >= 1)
    .map(({ id }) => id));
  const markOwners = new Map<string, { surfaceId: string; semanticPartId: string }>();
  for (const part of solid.parts) {
    markOwners.set(`${part.semanticPartId}:${part.surfaceId}`, {
      surfaceId: part.surfaceId,
      semanticPartId: part.semanticPartId,
    });
  }
  const direction = appearance.artDirection;
  const viewMarks = Object.freeze([...markOwners.values()].map(({ surfaceId, semanticPartId }) => {
    const authored = surfaces.get(surfaceId);
    if (authored === undefined) throw new Error(`Missing semantic surface ${surfaceId}`);
    const surface = resolveSemanticSurface(authored, appearance, semanticPartId);
    const projected = defaults.viewMark(surface.drawing);
    const override = options.viewMarks === false
      ? { style: 'none' as const, strength: 0 }
      : {
        ...options.viewMarks?.surfaces?.[surfaceId],
        ...options.viewMarks?.semanticParts?.[semanticPartId],
      };
    const mark = { ...projected, ...override };
    if (!INKED_SOLID_MARK_STYLES.includes(mark.style)) {
      throw new RangeError(`viewMarks.${semanticPartId}.style is not supported`);
    }
    const roles = artRolesForPart(appearance, semanticPartId);
    const detailScale = artDirectionDetailScale(direction, roles);
    return Object.freeze({
      surfaceId,
      semanticPartId,
      application: surface.drawing.application,
      drawing: surface.drawing.drawing,
      style: mark.style,
      scale: positive(`viewMarks.${semanticPartId}.scale`, mark.scale / direction.drawing.markSpacingScale),
      strength: unit(`viewMarks.${semanticPartId}.strength`, Math.min(1, mark.strength * detailScale)),
      coverage: unit(`viewMarks.${semanticPartId}.coverage`, mark.coverage),
      lineWidth: unit(`viewMarks.${semanticPartId}.lineWidth`, mark.lineWidth),
      seed: tree.seed(`inked-solid:view-mark:${semanticPartId}:${surfaceId}`),
    });
  }));
  const strokeIds = new Set<string>();
  contour.width *= direction.drawing.contourScale;
  contour.color = direction.palette.ink;
  deposition.pigmentStrength = Math.min(
    1,
    deposition.pigmentStrength * direction.drawing.pigmentStrength,
  );
  if (options.paper?.color === undefined) paper.color = direction.scene.paper;
  const strokeScale = contour.width / defaults.contour.width;
  const strokeDefinitions = options.strokes ?? [];
  const stagger = nonNegative('strokeReveal.stagger', options.strokeReveal?.stagger ?? 0.35);
  const duration = 1 / Math.max(1, 1 + stagger * Math.max(0, strokeDefinitions.length - 1));
  const strokes = Object.freeze(strokeDefinitions.map((stroke, strokeIndex) => {
    if (stroke.id.length === 0) throw new RangeError('stroke id must not be empty');
    if (strokeIds.has(stroke.id)) throw new RangeError(`duplicate stroke id: ${stroke.id}`);
    strokeIds.add(stroke.id);
    if (!solid.parts.some(({ id }) => id === stroke.partId)) {
      throw new RangeError(`stroke ${stroke.id} references unknown part ${stroke.partId}`);
    }
    const pathCount = stroke.path.type === 'part-local'
      ? stroke.path.points.length
      : stroke.path.directions.length;
    if (stroke.closed === true && pathCount < 3) {
      throw new RangeError(`closed stroke ${stroke.id} requires at least three path points`);
    }
    const authoredRadius = positive(`stroke ${stroke.id} radius`, stroke.radius);
    const radius = authoredRadius * strokeScale;
    return Object.freeze({
      id: stroke.id,
      partId: stroke.partId,
      path: strokePath(solid, stroke),
      radius,
      color: color(`stroke ${stroke.id} color`, stroke.color ?? contour.color),
      opacity: unit(`stroke ${stroke.id} opacity`, stroke.opacity ?? contour.opacity),
      closed: stroke.closed ?? false,
      wobble: nonNegative(
        `stroke ${stroke.id} wobble`,
        (stroke.wobble ?? authoredRadius * 0.3) * strokeScale,
      ),
      seed: tree.seed(`inked-solid:stroke:${stroke.id}`),
      reveal: Object.freeze({
        start: strokeIndex * stagger * duration,
        end: strokeIndex * stagger * duration + duration,
      }),
    });
  }));

  return Object.freeze({
    blueprintVersion: 1,
    family: solid.family,
    representation: 'inked-solid',
    assetId: solid.assetId,
    seed: solid.seed,
    appearance,
    medium: options.medium,
    solid,
    carrierPartIds,
    contour: Object.freeze({
      color: color('contour.color', contour.color),
      width: positive('contour.width', contour.width),
      opacity: unit('contour.opacity', contour.opacity),
      echoOpacity: unit('contour.echoOpacity', contour.echoOpacity),
      ghostOpacity: unit('contour.ghostOpacity', contour.ghostOpacity),
      ghostSpread: positive('contour.ghostSpread', contour.ghostSpread),
      granulation: unit('contour.granulation', contour.granulation),
      wander: nonNegative('contour.wander', contour.wander),
      depthThreshold: positive('contour.depthThreshold', contour.depthThreshold),
      normalThreshold: unit('contour.normalThreshold', contour.normalThreshold),
      jitter: nonNegative('contour.jitter', contour.jitter),
      boilFramesPerSecond: nonNegative(
        'contour.boilFramesPerSecond',
        contour.boilFramesPerSecond,
      ),
      seed: tree.seed('inked-solid:contour'),
    }),
    deposition: Object.freeze({
      texture: options.medium,
      pigmentStrength: unit('deposition.pigmentStrength', deposition.pigmentStrength),
      planeSeparationStrength: unit(
        'deposition.planeSeparationStrength',
        deposition.planeSeparationStrength,
      ),
      planeSeparationSteps: integer(
        'deposition.planeSeparationSteps',
        deposition.planeSeparationSteps,
        2,
        8,
      ),
      variationStrength: unit('deposition.variationStrength', deposition.variationStrength),
      variationScale: positive('deposition.variationScale', deposition.variationScale),
      seed: tree.seed('inked-solid:deposition'),
    }),
    viewMarks,
    paper: Object.freeze({
      color: color('paper.color', paper.color),
      grainStrength: unit('paper.grainStrength', paper.grainStrength),
      seed: tree.seed('inked-solid:paper'),
    }),
    strokes,
  });
}
