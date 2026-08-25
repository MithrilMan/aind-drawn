import { hashString } from '../core/random.js';
import type { RgbColor } from '../core/sketch.js';
import {
  DRAWING_GESTURES,
  DRAWING_VALUES,
  type DrawingGesture,
  type DrawingIntent,
  type DrawingValue,
} from '../materials/drawing.js';
import type {
  PhysicalFinishId,
  PhysicalSubstrateId,
  SemanticSurfaceSpec,
} from '../materials/surface.js';
import { PHYSICAL_FINISHES, PHYSICAL_SUBSTRATES } from '../materials/surface.js';

export const ART_ROLES = Object.freeze([
  'primary-form',
  'secondary-form',
  'focal-feature',
  'line-detail',
  'accent',
  'transparent',
  'interactive',
  'ground-contact',
  'foliage',
] as const);

export type ArtRole = typeof ART_ROLES[number];

export type ArtDirectionRoleRule = Readonly<{
  saturationScale?: number;
  contrastScale?: number;
  valueShift?: number;
  gesture?: DrawingGesture;
  detailScale?: number;
  physical?: Readonly<{
    substrate?: PhysicalSubstrateId;
    finish?: PhysicalFinishId;
    roughnessFloor?: number;
    metalnessScale?: number;
    clearcoatScale?: number;
  }>;
}>;

export type SceneDirectionRecipe = Readonly<{
  paper: RgbColor;
  backdrop: RgbColor;
  ground: RgbColor;
  lighting: Readonly<{
    key: RgbColor;
    fill: RgbColor;
    keyIntensity: number;
    fillIntensity: number;
    environmentIntensity: number;
  }>;
}>;

export type ArtDirectionRecipe = Readonly<{
  schemaVersion: 1;
  id: string;
  label: string;
  palette: Readonly<{
    ink: RgbColor;
    saturationScale: number;
    contrastScale: number;
    warmth: number;
  }>;
  drawing: Readonly<{
    contourScale: number;
    markSpacingScale: number;
    pigmentStrength: number;
    detailBudget: number;
    valueShift: number;
  }>;
  physical: Readonly<{
    roughnessFloor: number;
    metalnessScale: number;
    clearcoatScale: number;
  }>;
  roles: Readonly<Partial<Record<ArtRole, ArtDirectionRoleRule>>>;
  scene: SceneDirectionRecipe;
}>;

export type ArtDirectionId = 'authored' | 'storybook' | 'cut-paper';
export type ArtDirectionSource = ArtDirectionId | ArtDirectionRecipe;

export type SemanticPartArtBinding = Readonly<{
  semanticPartId: string;
  roles: readonly ArtRole[];
}>;

export type AssetAppearance = Readonly<{
  artDirection: ArtDirectionRecipe;
  appearanceFingerprint: string;
  parts: readonly SemanticPartArtBinding[];
}>;

const freezeColor = (color: RgbColor): RgbColor => Object.freeze([...color] as [number, number, number]);

const AUTHORED: ArtDirectionRecipe = Object.freeze({
  schemaVersion: 1,
  id: 'authored',
  label: 'Authored identity',
  palette: Object.freeze({
    ink: freezeColor([31, 29, 26]), saturationScale: 1, contrastScale: 1, warmth: 0,
  }),
  drawing: Object.freeze({
    contourScale: 1, markSpacingScale: 1, pigmentStrength: 1, detailBudget: 1, valueShift: 0,
  }),
  physical: Object.freeze({ roughnessFloor: 0, metalnessScale: 1, clearcoatScale: 1 }),
  roles: Object.freeze({}),
  scene: Object.freeze({
    paper: freezeColor([246, 241, 229]),
    backdrop: freezeColor([226, 221, 210]),
    ground: freezeColor([207, 201, 188]),
    lighting: Object.freeze({
      key: freezeColor([255, 246, 226]),
      fill: freezeColor([189, 205, 214]),
      keyIntensity: 3.1,
      fillIntensity: 1.35,
      environmentIntensity: 1,
    }),
  }),
});

const STORYBOOK: ArtDirectionRecipe = Object.freeze({
  schemaVersion: 1,
  id: 'storybook',
  label: 'Gestural storybook',
  palette: Object.freeze({
    ink: freezeColor([42, 34, 29]), saturationScale: 0.88, contrastScale: 1.08, warmth: 0.055,
  }),
  drawing: Object.freeze({
    contourScale: 1.12, markSpacingScale: 0.88, pigmentStrength: 1.06,
    detailBudget: 0.86, valueShift: 0,
  }),
  physical: Object.freeze({ roughnessFloor: 0.5, metalnessScale: 0.82, clearcoatScale: 0.72 }),
  roles: Object.freeze({
    'focal-feature': Object.freeze({ saturationScale: 1.13, contrastScale: 1.1, detailScale: 1.12 }),
    'line-detail': Object.freeze({ valueShift: 1, gesture: 'agitated', detailScale: 0.92 }),
    accent: Object.freeze({ saturationScale: 1.18, contrastScale: 1.08 }),
    transparent: Object.freeze({ valueShift: -1, gesture: 'quiet' }),
    foliage: Object.freeze({ gesture: 'agitated', detailScale: 0.82 }),
  }),
  scene: Object.freeze({
    paper: freezeColor([247, 238, 218]),
    backdrop: freezeColor([211, 198, 175]),
    ground: freezeColor([174, 164, 143]),
    lighting: Object.freeze({
      key: freezeColor([255, 231, 194]),
      fill: freezeColor([165, 187, 195]),
      keyIntensity: 3.35,
      fillIntensity: 1.05,
      environmentIntensity: 0.86,
    }),
  }),
});

const CUT_PAPER: ArtDirectionRecipe = Object.freeze({
  schemaVersion: 1,
  id: 'cut-paper',
  label: 'Cut-paper theatre',
  palette: Object.freeze({
    ink: freezeColor([37, 34, 31]), saturationScale: 0.74, contrastScale: 1.18, warmth: 0.025,
  }),
  drawing: Object.freeze({
    contourScale: 1.18, markSpacingScale: 1.28, pigmentStrength: 0.94,
    detailBudget: 0.62, valueShift: 0,
  }),
  physical: Object.freeze({ roughnessFloor: 0.74, metalnessScale: 0.35, clearcoatScale: 0.22 }),
  roles: Object.freeze({
    'primary-form': Object.freeze({ contrastScale: 1.08, physical: Object.freeze({ finish: 'matte' }) }),
    'secondary-form': Object.freeze({ valueShift: -1, detailScale: 0.72 }),
    'line-detail': Object.freeze({ valueShift: 1, gesture: 'quiet', detailScale: 0.45 }),
    accent: Object.freeze({ saturationScale: 1.34, contrastScale: 1.12 }),
    transparent: Object.freeze({
      valueShift: -1,
      gesture: 'quiet',
      physical: Object.freeze({ finish: 'satin', roughnessFloor: 0.34, clearcoatScale: 0.8 }),
    }),
    foliage: Object.freeze({ gesture: 'granular', detailScale: 0.56 }),
  }),
  scene: Object.freeze({
    paper: freezeColor([244, 236, 216]),
    backdrop: freezeColor([83, 78, 70]),
    ground: freezeColor([118, 109, 94]),
    lighting: Object.freeze({
      key: freezeColor([255, 238, 207]),
      fill: freezeColor([128, 151, 164]),
      keyIntensity: 3.8,
      fillIntensity: 0.72,
      environmentIntensity: 0.64,
    }),
  }),
});

export const ART_DIRECTION_CATALOG: Readonly<Record<ArtDirectionId, ArtDirectionRecipe>> =
  Object.freeze({ authored: AUTHORED, storybook: STORYBOOK, 'cut-paper': CUT_PAPER });

export const ART_DIRECTION_IDS: readonly ArtDirectionId[] = Object.freeze([
  'authored', 'storybook', 'cut-paper',
]);

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function artDirectionById(id: ArtDirectionId): ArtDirectionRecipe {
  const recipe = (ART_DIRECTION_CATALOG as Readonly<Record<string, ArtDirectionRecipe>>)[id];
  if (recipe === undefined) throw new RangeError(`Unknown art direction ${id}`);
  return recipe;
}

function finite(
  name: string,
  value: number,
  minimum = Number.NEGATIVE_INFINITY,
  maximum = Number.POSITIVE_INFINITY,
  exclusiveMinimum = false,
): number {
  if (!Number.isFinite(value)
      || (exclusiveMinimum ? value <= minimum : value < minimum)
      || value > maximum) {
    throw new RangeError(`${name} is outside its valid range`);
  }
  return value;
}

function recipeColor(name: string, color: RgbColor): RgbColor {
  return freezeColor(color.map((channel, index) => (
    finite(`${name}[${index}]`, channel, 0, 255)
  )) as unknown as RgbColor);
}

function normalizeArtDirection(recipe: ArtDirectionRecipe): ArtDirectionRecipe {
  const runtimeRecipe = recipe as unknown as Readonly<{
    schemaVersion: number;
    id: string;
    label: string;
    roles: Readonly<Record<string, ArtDirectionRoleRule | undefined>>;
  }>;
  if (runtimeRecipe.schemaVersion !== 1
      || runtimeRecipe.id.trim().length === 0
      || runtimeRecipe.label.trim().length === 0) {
    throw new RangeError('Art direction must have schemaVersion 1, an id, and a label');
  }
  const roles: Partial<Record<ArtRole, ArtDirectionRoleRule>> = {};
  for (const [role, sourceRule] of Object.entries(runtimeRecipe.roles)) {
    if (!ART_ROLES.includes(role as ArtRole)) throw new RangeError(`Unknown art role ${role}`);
    if (sourceRule === undefined) continue;
    const physical = sourceRule.physical;
    if (physical?.substrate !== undefined && !PHYSICAL_SUBSTRATES.includes(physical.substrate)) {
      throw new RangeError(`Unknown physical substrate ${physical.substrate}`);
    }
    if (physical?.finish !== undefined && !PHYSICAL_FINISHES.includes(physical.finish)) {
      throw new RangeError(`Unknown physical finish ${physical.finish}`);
    }
    roles[role as ArtRole] = Object.freeze({
      ...(sourceRule.saturationScale === undefined ? {} : {
        saturationScale: finite(`${role}.saturationScale`, sourceRule.saturationScale, 0),
      }),
      ...(sourceRule.contrastScale === undefined ? {} : {
        contrastScale: finite(`${role}.contrastScale`, sourceRule.contrastScale, 0),
      }),
      ...(sourceRule.valueShift === undefined ? {} : {
        valueShift: finite(`${role}.valueShift`, sourceRule.valueShift, -4, 4),
      }),
      ...(sourceRule.gesture === undefined ? {} : { gesture: sourceRule.gesture }),
      ...(sourceRule.detailScale === undefined ? {} : {
        detailScale: finite(`${role}.detailScale`, sourceRule.detailScale, 0),
      }),
      ...(physical === undefined ? {} : { physical: Object.freeze({
        ...(physical.substrate === undefined ? {} : { substrate: physical.substrate }),
        ...(physical.finish === undefined ? {} : { finish: physical.finish }),
        ...(physical.roughnessFloor === undefined ? {} : {
          roughnessFloor: finite(`${role}.roughnessFloor`, physical.roughnessFloor, 0, 1),
        }),
        ...(physical.metalnessScale === undefined ? {} : {
          metalnessScale: finite(`${role}.metalnessScale`, physical.metalnessScale, 0),
        }),
        ...(physical.clearcoatScale === undefined ? {} : {
          clearcoatScale: finite(`${role}.clearcoatScale`, physical.clearcoatScale, 0),
        }),
      }) }),
    });
  }
  if (Object.values(runtimeRecipe.roles).some((rule) => (
    rule?.gesture !== undefined && !DRAWING_GESTURES.includes(rule.gesture)
  ))) {
    throw new RangeError('Unknown art-direction drawing gesture');
  }
  return Object.freeze({
    schemaVersion: 1,
    id: recipe.id,
    label: recipe.label,
    palette: Object.freeze({
      ink: recipeColor('palette.ink', recipe.palette.ink),
      saturationScale: finite('palette.saturationScale', recipe.palette.saturationScale, 0),
      contrastScale: finite('palette.contrastScale', recipe.palette.contrastScale, 0),
      warmth: finite('palette.warmth', recipe.palette.warmth, -1, 1),
    }),
    drawing: Object.freeze({
      contourScale: finite('drawing.contourScale', recipe.drawing.contourScale, 0, undefined, true),
      markSpacingScale: finite(
        'drawing.markSpacingScale', recipe.drawing.markSpacingScale, 0, undefined, true,
      ),
      pigmentStrength: finite('drawing.pigmentStrength', recipe.drawing.pigmentStrength, 0),
      detailBudget: finite('drawing.detailBudget', recipe.drawing.detailBudget, 0),
      valueShift: finite('drawing.valueShift', recipe.drawing.valueShift, -4, 4),
    }),
    physical: Object.freeze({
      roughnessFloor: finite('physical.roughnessFloor', recipe.physical.roughnessFloor, 0, 1),
      metalnessScale: finite('physical.metalnessScale', recipe.physical.metalnessScale, 0),
      clearcoatScale: finite('physical.clearcoatScale', recipe.physical.clearcoatScale, 0),
    }),
    roles: Object.freeze(roles),
    scene: Object.freeze({
      paper: recipeColor('scene.paper', recipe.scene.paper),
      backdrop: recipeColor('scene.backdrop', recipe.scene.backdrop),
      ground: recipeColor('scene.ground', recipe.scene.ground),
      lighting: Object.freeze({
        key: recipeColor('scene.lighting.key', recipe.scene.lighting.key),
        fill: recipeColor('scene.lighting.fill', recipe.scene.lighting.fill),
        keyIntensity: finite('scene.lighting.keyIntensity', recipe.scene.lighting.keyIntensity, 0),
        fillIntensity: finite('scene.lighting.fillIntensity', recipe.scene.lighting.fillIntensity, 0),
        environmentIntensity: finite(
          'scene.lighting.environmentIntensity', recipe.scene.lighting.environmentIntensity, 0,
        ),
      }),
    }),
  });
}

export function resolveArtDirection(source: ArtDirectionSource = 'authored'): ArtDirectionRecipe {
  return typeof source === 'string' ? artDirectionById(source) : normalizeArtDirection(source);
}

export function artDirectionFingerprint(recipe: ArtDirectionRecipe): string {
  return `art:${recipe.schemaVersion}:${recipe.id}:${hashString(stable(recipe)).toString(16).padStart(8, '0')}`;
}

export function assetAppearanceFingerprint(
  recipe: ArtDirectionRecipe,
  parts: readonly SemanticPartArtBinding[],
): string {
  return `appearance:1:${recipe.id}:${hashString(stable({ recipe, parts })).toString(16).padStart(8, '0')}`;
}

export function createAssetAppearance(
  direction: ArtDirectionSource | undefined,
  parts: readonly SemanticPartArtBinding[],
): AssetAppearance {
  const artDirection = resolveArtDirection(direction);
  const seen = new Set<string>();
  const frozenParts = parts.map((part) => {
    if (part.semanticPartId.trim().length === 0) {
      throw new RangeError('Art binding semanticPartId must not be empty');
    }
    const roles = [...part.roles];
    if (new Set(roles).size !== roles.length) {
      throw new RangeError(`Duplicate art role on semantic part ${part.semanticPartId}`);
    }
    for (const role of roles) {
      if (!ART_ROLES.includes(role)) throw new RangeError(`Unknown art role ${role}`);
    }
    return Object.freeze({ semanticPartId: part.semanticPartId, roles: Object.freeze(roles) });
  });
  for (const part of frozenParts) {
    if (seen.has(part.semanticPartId)) {
      throw new RangeError(`Duplicate art binding for semantic part ${part.semanticPartId}`);
    }
    seen.add(part.semanticPartId);
  }
  return Object.freeze({
    artDirection,
    appearanceFingerprint: assetAppearanceFingerprint(artDirection, frozenParts),
    parts: Object.freeze(frozenParts),
  });
}

/** Convenience for utility assets whose semantic parts intentionally share one visual role. */
export function createUniformAssetAppearance(
  direction: ArtDirectionSource | undefined,
  semanticPartIds: readonly string[],
  roles: readonly ArtRole[] = ['primary-form'],
): AssetAppearance {
  return createAssetAppearance(direction, semanticPartIds.map((semanticPartId) => Object.freeze({
    semanticPartId,
    roles,
  })));
}

export function artRolesForPart(
  appearance: AssetAppearance,
  semanticPartId: string,
): readonly ArtRole[] {
  return appearance.parts.find((part) => part.semanticPartId === semanticPartId)?.roles ?? [];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roleScale(
  recipe: ArtDirectionRecipe,
  roles: readonly ArtRole[],
  key: 'saturationScale' | 'contrastScale' | 'detailScale',
): number {
  return roles.reduce((scale, role) => scale * (recipe.roles[role]?.[key] ?? 1), 1);
}

export function transformArtDirectionColor(
  color: RgbColor,
  recipe: ArtDirectionRecipe,
  roles: readonly ArtRole[] = [],
): RgbColor {
  const saturation = recipe.palette.saturationScale * roleScale(recipe, roles, 'saturationScale');
  const contrast = recipe.palette.contrastScale * roleScale(recipe, roles, 'contrastScale');
  const average = (color[0] + color[1] + color[2]) / 3;
  const warm = recipe.palette.warmth * 255;
  const channel = (value: number, warmth: number): number => Math.round(clamp(
    ((average + (value - average) * saturation) - 127.5) * contrast + 127.5 + warmth,
    0,
    255,
  ));
  return Object.freeze([
    channel(color[0], warm),
    channel(color[1], warm * 0.24),
    channel(color[2], -warm * 0.72),
  ] as const);
}

export function resolveDrawingIntent(
  intent: DrawingIntent,
  recipe: ArtDirectionRecipe,
  roles: readonly ArtRole[] = [],
): DrawingIntent {
  const roleShift = roles.reduce((sum, role) => sum + (recipe.roles[role]?.valueShift ?? 0), 0);
  const index = DRAWING_VALUES.indexOf(intent.value);
  const shifted = clamp(index + recipe.drawing.valueShift + roleShift, 0, DRAWING_VALUES.length - 1);
  const gesture = roles.reduce<DrawingGesture>(
    (resolved, role) => recipe.roles[role]?.gesture ?? resolved,
    intent.gesture,
  );
  return Object.freeze({ value: DRAWING_VALUES[Math.round(shifted)] as DrawingValue, gesture });
}

export type ResolvedSemanticSurface = SemanticSurfaceSpec;

export function resolveSemanticSurface(
  surface: SemanticSurfaceSpec,
  appearance: AssetAppearance,
  semanticPartId: string,
): ResolvedSemanticSurface {
  const recipe = appearance.artDirection;
  const roles = artRolesForPart(appearance, semanticPartId);
  const rolePhysical = roles.reduce<ArtDirectionRoleRule['physical']>((resolved, role) => ({
    ...resolved,
    ...recipe.roles[role]?.physical,
  }), Object.freeze({}));
  const roughnessFloor = rolePhysical?.roughnessFloor ?? recipe.physical.roughnessFloor;
  const metalnessScale = rolePhysical?.metalnessScale ?? recipe.physical.metalnessScale;
  const clearcoatScale = rolePhysical?.clearcoatScale ?? recipe.physical.clearcoatScale;
  const physical = surface.physical;
  return Object.freeze({
    ...surface,
    color: transformArtDirectionColor(surface.color, recipe, roles),
    drawing: Object.freeze({
      application: surface.drawing.application,
      drawing: resolveDrawingIntent(surface.drawing.drawing, recipe, roles),
    }),
    physical: Object.freeze({
      ...physical,
      ...(rolePhysical?.substrate === undefined ? {} : { substrate: rolePhysical.substrate }),
      ...(rolePhysical?.finish === undefined ? {} : { finish: rolePhysical.finish }),
      ...(physical.roughness === undefined ? {} : {
        roughness: Math.max(roughnessFloor, physical.roughness),
      }),
      ...(physical.metalness === undefined ? {} : {
        metalness: physical.metalness * metalnessScale,
      }),
      ...(physical.clearcoat === undefined ? {} : {
        clearcoat: physical.clearcoat * clearcoatScale,
      }),
    }),
  });
}

export function artDirectionDetailScale(
  recipe: ArtDirectionRecipe,
  roles: readonly ArtRole[],
): number {
  return recipe.drawing.detailBudget * roleScale(recipe, roles, 'detailScale');
}
