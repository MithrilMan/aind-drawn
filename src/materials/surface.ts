import type { RgbColor } from '../core/sketch.js';
import type { DrawingIntent } from './drawing.js';

export const DRAWING_APPLICATIONS = Object.freeze([
  'paper',
  'pigment',
  'tint',
  'flat',
  'ink',
  'wash',
  'glaze',
] as const);

export type DrawingApplication = typeof DRAWING_APPLICATIONS[number];

export type SurfaceDrawingIntent = Readonly<{
  application: DrawingApplication;
  drawing: DrawingIntent;
}>;

/** What the represented part is understood to be made from. */
export const SURFACE_SUBSTANCES = Object.freeze([
  'generic',
  'skin',
  'hair',
  'cloth',
  'wood',
  'glass',
  'rubber',
  'ceramic',
  'resin',
  'metal',
  'paint',
  'paper',
  'stone',
  'foliage',
  'liquid',
] as const);

export type SurfaceSubstance = typeof SURFACE_SUBSTANCES[number];

/** Physical carrier used only by smooth-solid renderers. */
export const PHYSICAL_SUBSTRATES = Object.freeze([
  'generic',
  'skin',
  'fiber',
  'wood',
  'glass',
  'rubber',
  'ceramic',
  'resin',
  'metal',
  'painted-metal',
  'stone',
  'paper',
] as const);

export type PhysicalSubstrateId = typeof PHYSICAL_SUBSTRATES[number];

/** Surface treatment applied to a physical substrate; never a drawing medium. */
export const PHYSICAL_FINISHES = Object.freeze([
  'raw',
  'matte',
  'satin',
  'gloss',
  'polished',
  'flocked',
  'crazed',
  'iridescent',
] as const);

export type PhysicalFinishId = typeof PHYSICAL_FINISHES[number];

export type PhysicalSurfaceTreatment = Readonly<{
  substrate: PhysicalSubstrateId;
  finish: PhysicalFinishId;
  roughness?: number;
  metalness?: number;
  clearcoat?: number;
  /** Physical coverage; values below one reveal surfaces behind this one. */
  opacity?: number;
}>;

export type PhysicalSurfaceTreatmentOverride = Readonly<Partial<PhysicalSurfaceTreatment>>;

/**
 * Renderer-neutral surface intent. `substance` belongs to the represented
 * part, `drawing` belongs to drawn projections, and `physical` is consumed
 * only by smooth-solid renderers.
 */
export type SemanticSurfaceSpec = Readonly<{
  id: string;
  color: RgbColor;
  substance: SurfaceSubstance;
  drawing: SurfaceDrawingIntent;
  physical: PhysicalSurfaceTreatment;
}>;

export type SemanticSurfaceDefinition = Omit<SemanticSurfaceSpec, 'physical'> & Readonly<{
  physical?: PhysicalSurfaceTreatmentOverride;
}>;

export function defaultPhysicalTreatment(
  substance: SurfaceSubstance,
): PhysicalSurfaceTreatment {
  const substrate: Readonly<Record<SurfaceSubstance, PhysicalSubstrateId>> = {
    generic: 'generic', skin: 'skin', hair: 'fiber', cloth: 'fiber', wood: 'wood',
    glass: 'glass', rubber: 'rubber', ceramic: 'ceramic', resin: 'resin', metal: 'metal',
    paint: 'painted-metal', paper: 'paper', stone: 'stone', foliage: 'generic',
    liquid: 'glass',
  };
  const roughness: Readonly<Record<SurfaceSubstance, number>> = {
    generic: 0.82, skin: 0.62, hair: 0.95, cloth: 0.95, wood: 0.72,
    glass: 0.18, rubber: 0.9, ceramic: 0.3, resin: 0.55, metal: 0.3,
    paint: 0.3, paper: 1, stone: 0.94, foliage: 0.9, liquid: 0.2,
  };
  const isMetal = substance === 'metal';
  const isGloss = substance === 'glass' || substance === 'ceramic' || substance === 'liquid';
  return Object.freeze({
    substrate: substrate[substance],
    finish: isGloss ? 'gloss' : 'matte',
    roughness: roughness[substance],
    metalness: isMetal ? 0.82 : 0,
    clearcoat: isGloss ? 0.8 : substance === 'paint' ? 0.5 : 0,
  });
}

export function createSemanticSurface(
  definition: SemanticSurfaceDefinition,
): SemanticSurfaceSpec {
  return Object.freeze({
    id: definition.id,
    color: Object.freeze([...definition.color] as [number, number, number]),
    substance: definition.substance,
    drawing: Object.freeze({
      application: definition.drawing.application,
      drawing: Object.freeze({ ...definition.drawing.drawing }),
    }),
    physical: mergePhysicalSurfaceTreatment(
      defaultPhysicalTreatment(definition.substance),
      definition.physical,
    ),
  });
}

export function mergePhysicalSurfaceTreatment(
  base: PhysicalSurfaceTreatment,
  override: PhysicalSurfaceTreatmentOverride | undefined,
): PhysicalSurfaceTreatment {
  if (override === undefined) return base;
  return Object.freeze({ ...base, ...override });
}
