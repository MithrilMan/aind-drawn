import type { RgbColor } from '../../core/sketch.js';
import type { Point3 } from '../../core/geometry3.js';
import { SeedTree } from '../../core/random.js';
import type { MediumId } from '../../materials/medium.js';
import type { SolidAssetBlueprint } from '../solid-types.js';
import { inkedSolidMediumDefaults } from './medium-projection.js';

export type InkedSolidContourPolicy = Readonly<{
  color: RgbColor;
  width: number;
  opacity: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidHatchPolicy = Readonly<{
  color: RgbColor;
  scale: number;
  strength: number;
  shadowStart: number;
  crossHatchStart: number;
  lineWidth: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidPaperPolicy = Readonly<{
  color: RgbColor;
  tintStrength: number;
  grainStrength: number;
  seed: number;
}>;

export type InkedSolidFillPolicy = Readonly<{
  texture: MediumId;
  pigmentStrength: number;
  shadeStrength: number;
  shadeSteps: number;
  variationStrength: number;
  variationScale: number;
  seed: number;
}>;

export type InkedSolidStrokePath =
  | Readonly<{
    type: 'part-local';
    points: readonly Point3[];
  }>
  | Readonly<{
    type: 'superellipsoid-surface';
    directions: readonly Point3[];
    lift: number;
  }>;

export type InkedSolidStrokeDefinition = Readonly<{
  id: string;
  partId: string;
  path: InkedSolidStrokePath;
  radius: number;
  color?: RgbColor;
  opacity?: number;
  closed?: boolean;
  wobble?: number;
}>;

export type InkedSolidStrokeSpec = Readonly<{
  id: string;
  partId: string;
  path: InkedSolidStrokePath;
  radius: number;
  color: RgbColor;
  opacity: number;
  closed: boolean;
  wobble: number;
  seed: number;
}>;

export type InkedSolidBlueprint = Readonly<{
  representation: 'inked-solid';
  id: string;
  kind: string;
  seed: SolidAssetBlueprint['seed'];
  medium: MediumId;
  solid: SolidAssetBlueprint;
  contour: InkedSolidContourPolicy;
  fill: InkedSolidFillPolicy;
  hatching: InkedSolidHatchPolicy | null;
  paper: InkedSolidPaperPolicy;
  strokes: readonly InkedSolidStrokeSpec[];
}>;

export type InkedSolidBlueprintOptions = Readonly<{
  medium: MediumId;
  contour?: Partial<Omit<InkedSolidContourPolicy, 'seed'>>;
  fill?: Partial<Omit<InkedSolidFillPolicy, 'seed' | 'texture'>>;
  hatching?: Partial<Omit<InkedSolidHatchPolicy, 'seed'>> | null;
  paper?: Partial<Omit<InkedSolidPaperPolicy, 'seed'>>;
  strokes?: readonly InkedSolidStrokeDefinition[];
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
export function createInkedSolidBlueprint(
  solid: SolidAssetBlueprint,
  options: InkedSolidBlueprintOptions,
): InkedSolidBlueprint {
  const tree = new SeedTree(solid.seed);
  const defaults = inkedSolidMediumDefaults(options.medium);
  const contour = { ...defaults.contour, ...options.contour };
  const fill = { ...defaults.fill, ...options.fill };
  const paper = { ...defaults.paper, ...options.paper };
  const fallbackHatch = inkedSolidMediumDefaults('graphite').hatching;
  if (fallbackHatch === null) throw new Error('Graphite medium requires a hatch policy');
  const hatch = options.hatching === null
    ? null
    : options.hatching === undefined
      ? defaults.hatching
      : { ...(defaults.hatching ?? fallbackHatch), ...options.hatching };

  if (hatch !== null && hatch.crossHatchStart < hatch.shadowStart) {
    throw new RangeError('hatching.crossHatchStart must not be lower than hatching.shadowStart');
  }
  const strokeIds = new Set<string>();
  const strokeScale = contour.width / defaults.contour.width;
  const strokes = Object.freeze((options.strokes ?? []).map((stroke) => {
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
    });
  }));

  return Object.freeze({
    representation: 'inked-solid',
    id: `inked:${options.medium}:${solid.id}`,
    kind: solid.kind,
    seed: solid.seed,
    medium: options.medium,
    solid,
    contour: Object.freeze({
      color: color('contour.color', contour.color),
      width: positive('contour.width', contour.width),
      opacity: unit('contour.opacity', contour.opacity),
      depthThreshold: positive('contour.depthThreshold', contour.depthThreshold),
      normalThreshold: unit('contour.normalThreshold', contour.normalThreshold),
      jitter: nonNegative('contour.jitter', contour.jitter),
      boilFramesPerSecond: nonNegative(
        'contour.boilFramesPerSecond',
        contour.boilFramesPerSecond,
      ),
      seed: tree.seed('inked-solid:contour'),
    }),
    fill: Object.freeze({
      texture: options.medium,
      pigmentStrength: unit('fill.pigmentStrength', fill.pigmentStrength),
      shadeStrength: unit('fill.shadeStrength', fill.shadeStrength),
      shadeSteps: integer('fill.shadeSteps', fill.shadeSteps, 2, 8),
      variationStrength: unit('fill.variationStrength', fill.variationStrength),
      variationScale: positive('fill.variationScale', fill.variationScale),
      seed: tree.seed('inked-solid:fill'),
    }),
    hatching: hatch === null ? null : Object.freeze({
      color: color('hatching.color', hatch.color),
      scale: positive('hatching.scale', hatch.scale),
      strength: unit('hatching.strength', hatch.strength),
      shadowStart: unit('hatching.shadowStart', hatch.shadowStart),
      crossHatchStart: unit('hatching.crossHatchStart', hatch.crossHatchStart),
      lineWidth: unit('hatching.lineWidth', hatch.lineWidth),
      jitter: nonNegative('hatching.jitter', hatch.jitter),
      boilFramesPerSecond: nonNegative(
        'hatching.boilFramesPerSecond',
        hatch.boilFramesPerSecond,
      ),
      seed: tree.seed('inked-solid:hatching'),
    }),
    paper: Object.freeze({
      color: color('paper.color', paper.color),
      tintStrength: unit('paper.tintStrength', paper.tintStrength),
      grainStrength: unit('paper.grainStrength', paper.grainStrength),
      seed: tree.seed('inked-solid:paper'),
    }),
    strokes,
  });
}
