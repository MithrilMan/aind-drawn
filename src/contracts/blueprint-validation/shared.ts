import { AssetValidationCollector, type ValidationPath } from '../../validation/value-validator.js';

export const EPSILON = 1e-9;
export const TONE_STYLES = Object.freeze([
  'black', 'hatch', 'scribble', 'stipple', 'light',
] as const);

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
