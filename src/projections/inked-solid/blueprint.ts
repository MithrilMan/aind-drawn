import type { RgbColor } from '../../core/sketch.js';
import type { Point3 } from '../../core/geometry3.js';
import { SeedTree } from '../../core/random.js';
import type { SolidMaterialSpec } from '../../materials/finish.js';
import type { MediumId } from '../../materials/medium.js';
import type { SolidAssetBlueprint } from '../../contracts/solid-asset.js';
import { inkedSolidMediumDefaults } from './medium-projection.js';

export type InkedSolidContourPolicy = Readonly<{
  color: RgbColor;
  width: number;
  opacity: number;
  echoOpacity: number;
  ghostOpacity: number;
  ghostSpread: number;
  granulation: number;
  /** Static low-frequency contour displacement in device pixels. */
  wander: number;
  depthThreshold: number;
  normalThreshold: number;
  jitter: number;
  boilFramesPerSecond: number;
  seed: number;
}>;

export type InkedSolidMarkStyle =
  | 'none'
  | 'hatch'
  | 'crosshatch'
  | 'scribble'
  | 'stipple'
  | 'wash'
  | 'bristle'
  | 'marker'
  | 'solid';

export const INKED_SOLID_MARK_STYLES: readonly InkedSolidMarkStyle[] = Object.freeze([
  'none', 'hatch', 'crosshatch', 'scribble', 'stipple', 'wash', 'bristle', 'marker', 'solid',
]);

export type InkedSolidViewMarkPolicy = Readonly<{
  materialId: string;
  application: SolidMaterialSpec['drawing']['application'];
  tone: SolidMaterialSpec['drawing']['tone'];
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
  seed: number;
}>;

export type InkedSolidViewMarkOverride = Partial<Readonly<{
  style: InkedSolidMarkStyle;
  scale: number;
  strength: number;
  coverage: number;
  lineWidth: number;
}>>;

export type InkedSolidPaperPolicy = Readonly<{
  color: RgbColor;
  grainStrength: number;
  seed: number;
}>;

export type InkedSolidDepositionPolicy = Readonly<{
  texture: MediumId;
  pigmentStrength: number;
  /** Extra mark pressure used only to separate authored faceted planes. */
  planeSeparationStrength: number;
  /** Quantized plane-pressure levels; smooth carriers ignore them. */
  planeSeparationSteps: number;
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
  deposition: InkedSolidDepositionPolicy;
  viewMarks: readonly InkedSolidViewMarkPolicy[];
  paper: InkedSolidPaperPolicy;
  strokes: readonly InkedSolidStrokeSpec[];
}>;

export type InkedSolidBlueprintOptions = Readonly<{
  medium: MediumId;
  contour?: Partial<Omit<InkedSolidContourPolicy, 'seed'>>;
  deposition?: Partial<Omit<InkedSolidDepositionPolicy, 'seed' | 'texture'>>;
  viewMarks?: false | Readonly<Record<string, InkedSolidViewMarkOverride>>;
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
  const deposition = { ...defaults.deposition, ...options.deposition };
  const paper = { ...defaults.paper, ...options.paper };
  if (options.viewMarks !== undefined && options.viewMarks !== false) {
    for (const materialId of Object.keys(options.viewMarks)) {
      if (!solid.materials.some(({ id }) => id === materialId)) {
        throw new RangeError(`viewMarks references unknown material ${materialId}`);
      }
    }
  }
  const viewMarks = Object.freeze(solid.materials.map((material) => {
    const projected = defaults.viewMark(material.drawing);
    const override = options.viewMarks === false
      ? { style: 'none' as const, strength: 0 }
      : options.viewMarks?.[material.id];
    const mark = { ...projected, ...override };
    if (!INKED_SOLID_MARK_STYLES.includes(mark.style)) {
      throw new RangeError(`viewMarks.${material.id}.style is not supported`);
    }
    return Object.freeze({
      materialId: material.id,
      application: material.drawing.application,
      tone: material.drawing.tone,
      style: mark.style,
      scale: positive(`viewMarks.${material.id}.scale`, mark.scale),
      strength: unit(`viewMarks.${material.id}.strength`, mark.strength),
      coverage: unit(`viewMarks.${material.id}.coverage`, mark.coverage),
      lineWidth: unit(`viewMarks.${material.id}.lineWidth`, mark.lineWidth),
      seed: tree.seed(`inked-solid:view-mark:${material.id}`),
    });
  }));
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
