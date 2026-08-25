import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';
import {
  ART_ROLES,
  assetAppearanceFingerprint,
  type ArtDirectionRecipe,
  type SemanticPartArtBinding,
} from '../../appearance/art-direction.js';
import { DRAWING_GESTURES } from '../../materials/drawing.js';
import { PHYSICAL_FINISHES, PHYSICAL_SUBSTRATES } from '../../materials/surface.js';

export const EPSILON = 1e-9;
export type IndexedRecord = Readonly<{
  value: Record<string, unknown>;
  path: ValidationPath;
}>;

export function validateHeader(
  record: Record<string, unknown>,
  representation: 'raster' | 'solid',
  collector: AssetValidationCollector,
): void {
  collector.literal(record.blueprintVersion, ['blueprintVersion'], 1);
  collector.string(record.family, ['family']);
  collector.literal(record.representation, ['representation'], representation);
  collector.string(record.assetId, ['assetId']);
  collector.number(record.seed, ['seed'], {
    integer: true,
    minimum: 0,
    maximum: 4_294_967_295,
  });
}

export function validateAppearance(
  value: unknown,
  semanticPartIds: ReadonlySet<string>,
  collector: AssetValidationCollector,
): void {
  const appearance = collector.object(value, ['appearance'], [
    'artDirection', 'appearanceFingerprint', 'parts',
  ]);
  collector.string(appearance.appearanceFingerprint, ['appearance', 'appearanceFingerprint']);
  const direction = collector.object(appearance.artDirection, ['appearance', 'artDirection'], [
    'schemaVersion', 'id', 'label', 'palette', 'drawing', 'physical', 'roles', 'scene',
  ]);
  collector.literal(direction.schemaVersion, ['appearance', 'artDirection', 'schemaVersion'], 1);
  collector.string(direction.id, ['appearance', 'artDirection', 'id']);
  collector.string(direction.label, ['appearance', 'artDirection', 'label']);
  const palettePath = ['appearance', 'artDirection', 'palette'] as const;
  const palette = collector.object(direction.palette, palettePath, [
    'ink', 'saturationScale', 'contrastScale', 'warmth',
  ]);
  validateColor(palette.ink, [...palettePath, 'ink'], collector);
  collector.number(palette.saturationScale, [...palettePath, 'saturationScale'], {
    minimum: 0,
  });
  collector.number(palette.contrastScale, [...palettePath, 'contrastScale'], {
    minimum: 0,
  });
  collector.number(palette.warmth, [...palettePath, 'warmth'], { minimum: -1, maximum: 1 });

  const drawingPath = ['appearance', 'artDirection', 'drawing'] as const;
  const drawing = collector.object(direction.drawing, drawingPath, [
    'contourScale', 'markSpacingScale', 'pigmentStrength', 'detailBudget', 'valueShift',
  ]);
  collector.number(drawing.contourScale, [...drawingPath, 'contourScale'], {
    exclusiveMinimum: 0,
  });
  collector.number(drawing.markSpacingScale, [...drawingPath, 'markSpacingScale'], {
    exclusiveMinimum: 0,
  });
  collector.number(drawing.pigmentStrength, [...drawingPath, 'pigmentStrength'], {
    minimum: 0,
  });
  collector.number(drawing.detailBudget, [...drawingPath, 'detailBudget'], { minimum: 0 });
  collector.number(drawing.valueShift, [...drawingPath, 'valueShift'], { minimum: -4, maximum: 4 });

  const physicalPath = ['appearance', 'artDirection', 'physical'] as const;
  const physical = collector.object(direction.physical, physicalPath, [
    'roughnessFloor', 'metalnessScale', 'clearcoatScale',
  ]);
  collector.number(physical.roughnessFloor, [...physicalPath, 'roughnessFloor'], {
    minimum: 0, maximum: 1,
  });
  collector.number(physical.metalnessScale, [...physicalPath, 'metalnessScale'], { minimum: 0 });
  collector.number(physical.clearcoatScale, [...physicalPath, 'clearcoatScale'], { minimum: 0 });

  validateArtRoleRules(direction.roles, collector);
  validateArtScene(direction.scene, collector);
  const parts = collector.array(appearance.parts, ['appearance', 'parts']);
  const seen = new Set<string>();
  parts.forEach((entry, index) => {
    const path = ['appearance', 'parts', index] as const;
    const part = collector.object(entry, path, ['semanticPartId', 'roles']);
    collector.string(part.semanticPartId, [...path, 'semanticPartId']);
    if (typeof part.semanticPartId === 'string') {
      if (!semanticPartIds.has(part.semanticPartId)) {
        collector.issue(
          [...path, 'semanticPartId'],
          'reference.missing',
          `Unknown semantic art binding ${part.semanticPartId}`,
        );
      }
      if (seen.has(part.semanticPartId)) {
        collector.issue([...path, 'semanticPartId'], 'id.duplicate', `Duplicate art binding ${part.semanticPartId}`);
      }
      seen.add(part.semanticPartId);
    }
    collector.array(part.roles, [...path, 'roles']).forEach((role, roleIndex) => {
      collector.oneOf(role, [...path, 'roles', roleIndex], ART_ROLES);
    });
  });
  for (const semanticPartId of semanticPartIds) {
    if (!seen.has(semanticPartId)) {
      collector.issue(
        ['appearance', 'parts'],
        'manifest.binding_missing',
        `Missing art binding for semantic part ${semanticPartId}`,
      );
    }
  }
  if (typeof appearance.appearanceFingerprint === 'string'
      && direction.schemaVersion === 1
      && typeof direction.id === 'string'
      && Array.isArray(appearance.parts)) {
    const expected = assetAppearanceFingerprint(
      direction as unknown as ArtDirectionRecipe,
      appearance.parts as SemanticPartArtBinding[],
    );
    if (appearance.appearanceFingerprint !== expected) {
      collector.issue(
        ['appearance', 'appearanceFingerprint'],
        'value.fingerprint',
        'Appearance fingerprint does not match its art direction recipe and bindings',
      );
    }
  }
}

function validateColor(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const color = collector.tuple(value, path, 3);
  color.forEach((channel, index) => {
    collector.number(channel, [...path, index], { minimum: 0, maximum: 255 });
  });
}

function validateArtRoleRules(
  value: unknown,
  collector: AssetValidationCollector,
): void {
  const path = ['appearance', 'artDirection', 'roles'] as const;
  const rules = collector.object(value, path, ART_ROLES);
  for (const [role, valueRule] of Object.entries(rules)) {
    if (!ART_ROLES.includes(role as typeof ART_ROLES[number])) continue;
    const rulePath = [...path, role];
    const rule = collector.object(valueRule, rulePath, [
      'saturationScale', 'contrastScale', 'valueShift', 'gesture', 'detailScale', 'physical',
    ]);
    for (const field of ['saturationScale', 'contrastScale', 'detailScale'] as const) {
      if (field in rule) collector.number(rule[field], [...rulePath, field], { minimum: 0 });
    }
    if ('valueShift' in rule) {
      collector.number(rule.valueShift, [...rulePath, 'valueShift'], { minimum: -4, maximum: 4 });
    }
    if ('gesture' in rule) collector.oneOf(rule.gesture, [...rulePath, 'gesture'], DRAWING_GESTURES);
    if ('physical' in rule) {
      const physicalPath = [...rulePath, 'physical'];
      const physical = collector.object(rule.physical, physicalPath, [
        'substrate', 'finish', 'roughnessFloor', 'metalnessScale', 'clearcoatScale',
      ]);
      if ('substrate' in physical) {
        collector.oneOf(physical.substrate, [...physicalPath, 'substrate'], PHYSICAL_SUBSTRATES);
      }
      if ('finish' in physical) {
        collector.oneOf(physical.finish, [...physicalPath, 'finish'], PHYSICAL_FINISHES);
      }
      if ('roughnessFloor' in physical) {
        collector.number(physical.roughnessFloor, [...physicalPath, 'roughnessFloor'], {
          minimum: 0, maximum: 1,
        });
      }
      for (const field of ['metalnessScale', 'clearcoatScale'] as const) {
        if (field in physical) {
          collector.number(physical[field], [...physicalPath, field], { minimum: 0 });
        }
      }
    }
  }
}

function validateArtScene(
  value: unknown,
  collector: AssetValidationCollector,
): void {
  const path = ['appearance', 'artDirection', 'scene'] as const;
  const scene = collector.object(value, path, ['paper', 'backdrop', 'ground', 'lighting']);
  validateColor(scene.paper, [...path, 'paper'], collector);
  validateColor(scene.backdrop, [...path, 'backdrop'], collector);
  validateColor(scene.ground, [...path, 'ground'], collector);
  const lightingPath = [...path, 'lighting'];
  const lighting = collector.object(scene.lighting, lightingPath, [
    'key', 'fill', 'keyIntensity', 'fillIntensity', 'environmentIntensity',
  ]);
  validateColor(lighting.key, [...lightingPath, 'key'], collector);
  validateColor(lighting.fill, [...lightingPath, 'fill'], collector);
  collector.number(lighting.keyIntensity, [...lightingPath, 'keyIntensity'], { minimum: 0 });
  collector.number(lighting.fillIntensity, [...lightingPath, 'fillIntensity'], { minimum: 0 });
  collector.number(lighting.environmentIntensity, [...lightingPath, 'environmentIntensity'], {
    minimum: 0,
  });
}

export function finiteTuple(
  value: unknown,
  path: ValidationPath,
  length: number,
  collector: AssetValidationCollector,
): readonly unknown[] {
  const tuple = collector.tuple(value, path, length);
  for (let index = 0; index < length; index += 1) {
    collector.number(tuple[index], [...path, index]);
  }
  return tuple;
}

export function positiveTuple(
  value: unknown,
  path: ValidationPath,
  length: number,
  collector: AssetValidationCollector,
): readonly unknown[] {
  const tuple = collector.tuple(value, path, length);
  for (let index = 0; index < length; index += 1) {
    collector.number(tuple[index], [...path, index], { exclusiveMinimum: 0 });
  }
  return tuple;
}

export function validateCapabilities(
  capabilities: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  if (capabilities === undefined) return;
  const entries = collector.array(capabilities, path);
  const ids = new Set<string>();
  entries.forEach((entry, index) => {
    const entryPath = [...path, index];
    const record = collector.object(entry, entryPath, ['id', 'data']);
    collector.string(record.id, [...entryPath, 'id']);
    collector.object(record.data, [...entryPath, 'data']);
    if (typeof record.id !== 'string') return;
    if (ids.has(record.id)) {
      collector.issue([...entryPath, 'id'], 'id.duplicate', `Duplicate capability ${record.id}`);
    }
    ids.add(record.id);
  });
}

export function indexById(
  values: readonly unknown[],
  path: ValidationPath,
  label: string,
  collector: AssetValidationCollector,
): Map<string, IndexedRecord> {
  const result = new Map<string, IndexedRecord>();
  values.forEach((value, index) => {
    const entryPath = [...path, index];
    const record = collector.object(value, entryPath);
    collector.string(record.id, [...entryPath, 'id']);
    if (typeof record.id !== 'string' || record.id.trim().length === 0) return;
    if (result.has(record.id)) {
      collector.issue([...entryPath, 'id'], 'id.duplicate', `Duplicate ${label} ${record.id}`);
      return;
    }
    result.set(record.id, Object.freeze({ value: record, path: entryPath }));
  });
  return result;
}

export function validateHierarchy(
  parents: ReadonlyMap<string, string | undefined>,
  paths: ReadonlyMap<string, ValidationPath>,
  label: string,
  parentField: string,
  collector: AssetValidationCollector,
): void {
  for (const [id, parent] of parents) {
    if (parent !== undefined && !parents.has(parent)) {
      collector.issue(
        [...(paths.get(id) ?? []), parentField],
        'reference.missing',
        `${label} ${id} references unknown parent ${parent}`,
      );
    }
  }
  for (const id of parents.keys()) {
    const ancestry = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && parents.has(current)) {
      if (ancestry.has(current)) {
        collector.issue(
          paths.get(id) ?? [],
          'hierarchy.cycle',
          `${label} hierarchy contains a cycle at ${current}`,
        );
        break;
      }
      ancestry.add(current);
      current = parents.get(current);
    }
  }
}

export function validateExactInventory(
  actual: ReadonlySet<string>,
  expected: ReadonlySet<string>,
  path: ValidationPath,
  label: string,
  collector: AssetValidationCollector,
): void {
  for (const id of expected) {
    if (!actual.has(id)) {
      collector.issue(
        path,
        'manifest.inventory_missing',
        `Missing ${label} ${id} declared by the manifest`,
      );
    }
  }
  for (const id of actual) {
    if (!expected.has(id)) {
      collector.issue(
        path,
        'manifest.inventory_extra',
        `${label} ${id} is absent from the manifest`,
      );
    }
  }
}

export function validateInteractionSensors(
  manifest: unknown,
  colliderKinds: ReadonlyMap<string, string>,
  collector: AssetValidationCollector,
): void {
  const manifestRecord = manifest as Record<string, unknown> | undefined;
  const interactions = Array.isArray(manifestRecord?.interactions)
    ? manifestRecord.interactions
    : [];
  for (const interaction of interactions) {
    if (typeof interaction !== 'object' || interaction === null) continue;
    const spec = interaction as Record<string, unknown>;
    if (typeof spec.sensorId === 'string' && colliderKinds.get(spec.sensorId) !== 'sensor') {
      collector.issue(
        ['manifest', 'interactions'],
        'reference.sensor',
        `Interaction ${String(spec.id)} requires sensor collider ${spec.sensorId}`,
      );
    }
  }
}
