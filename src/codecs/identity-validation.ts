import { cloneJsonObject, AssetValidationCollector, type ValidationPath } from '../validation/value-validator.js';

const UINT32_MAXIMUM = 4_294_967_295;

export function validateIdentityRoot(
  input: unknown,
  family: string,
  fields: readonly string[],
  collector: AssetValidationCollector,
): Record<string, unknown> {
  const root = collector.object(input, [], ['schemaVersion', 'family', 'seed', ...fields]);
  collector.literal(root.schemaVersion, ['schemaVersion'], 1);
  collector.literal(root.family, ['family'], family);
  collector.number(root.seed, ['seed'], { integer: true, minimum: 0, maximum: UINT32_MAXIMUM });
  return root;
}

export function validateColor(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
): void {
  const color = collector.tuple(value, path, 3);
  color.forEach((channel, index) => {
    collector.number(channel, [...path, index], { integer: true, minimum: 0, maximum: 255 });
  });
}

export function validateFiniteFields(
  record: Record<string, unknown>,
  path: ValidationPath,
  fields: readonly string[],
  collector: AssetValidationCollector,
): void {
  for (const field of fields) collector.number(record[field], [...path, field]);
}

export function validatePositiveFields(
  record: Record<string, unknown>,
  path: ValidationPath,
  fields: readonly string[],
  collector: AssetValidationCollector,
): void {
  for (const field of fields) {
    collector.number(record[field], [...path, field], { exclusiveMinimum: 0 });
  }
}

export function validateUnitFields(
  record: Record<string, unknown>,
  path: ValidationPath,
  fields: readonly string[],
  collector: AssetValidationCollector,
): void {
  for (const field of fields) {
    collector.number(record[field], [...path, field], { minimum: 0, maximum: 1 });
  }
}

export function finishIdentity(
  input: unknown,
  collector: AssetValidationCollector,
): Readonly<Record<string, import('../contracts/json.js').JsonValue>> {
  collector.finish();
  return cloneJsonObject(input);
}

export function colorRecord(
  value: unknown,
  path: ValidationPath,
  fields: readonly string[],
  collector: AssetValidationCollector,
): Record<string, unknown> {
  const record = collector.object(value, path, fields);
  for (const field of fields) validateColor(record[field], [...path, field], collector);
  return record;
}
