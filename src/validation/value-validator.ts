import {
  AssetValidationError,
  type AssetValidationIssue,
  type AssetValidationPathSegment,
} from '../contracts/asset-validation.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';

export type ValidationPath = readonly AssetValidationPathSegment[];

type NumberOptions = Readonly<{
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  integer?: boolean;
}>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class AssetValidationCollector {
  private readonly collected: AssetValidationIssue[] = [];

  public issue(path: ValidationPath, code: string, message: string): void {
    this.collected.push(Object.freeze({
      path: Object.freeze([...path]),
      code,
      message,
    }));
  }

  public object(
    value: unknown,
    path: ValidationPath,
    allowedKeys?: readonly string[],
  ): Record<string, unknown> {
    if (!isRecord(value)) {
      this.issue(path, 'type.object', 'Expected an object');
      return {};
    }
    const prototype = Object.getPrototypeOf(value) as object | null;
    if (prototype !== Object.prototype && prototype !== null) {
      this.issue(path, 'type.plain_object', 'Expected a plain object');
    }
    if (allowedKeys !== undefined) {
      const allowed = new Set(allowedKeys);
      for (const key of Object.keys(value)) {
        if (!allowed.has(key)) {
          this.issue([...path, key], 'object.unknown_key', `Unknown field ${key}`);
        }
      }
    }
    return value;
  }

  public array(value: unknown, path: ValidationPath): readonly unknown[] {
    if (!Array.isArray(value)) {
      this.issue(path, 'type.array', 'Expected an array');
      return [];
    }
    return value;
  }

  public tuple(value: unknown, path: ValidationPath, length: number): readonly unknown[] {
    const tuple = this.array(value, path);
    if (tuple.length !== length) {
      this.issue(path, 'array.length', `Expected exactly ${length} entries`);
    }
    return tuple;
  }

  public string(value: unknown, path: ValidationPath, allowEmpty = false): void {
    if (typeof value !== 'string') {
      this.issue(path, 'type.string', 'Expected a string');
      return;
    }
    if (!allowEmpty && value.trim().length === 0) {
      this.issue(path, 'value.non_empty', 'Expected a non-empty string');
    }
  }

  public boolean(value: unknown, path: ValidationPath): void {
    if (typeof value !== 'boolean') {
      this.issue(path, 'type.boolean', 'Expected a boolean');
    }
  }

  public number(value: unknown, path: ValidationPath, options: NumberOptions = {}): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.issue(path, 'type.finite_number', 'Expected a finite number');
      return;
    }
    if (options.integer === true && !Number.isInteger(value)) {
      this.issue(path, 'type.integer', 'Expected an integer');
    }
    if (options.minimum !== undefined && value < options.minimum) {
      this.issue(path, 'value.minimum', `Expected a value greater than or equal to ${options.minimum}`);
    }
    if (options.maximum !== undefined && value > options.maximum) {
      this.issue(path, 'value.maximum', `Expected a value less than or equal to ${options.maximum}`);
    }
    if (options.exclusiveMinimum !== undefined && value <= options.exclusiveMinimum) {
      this.issue(path, 'value.exclusive_minimum', `Expected a value greater than ${options.exclusiveMinimum}`);
    }
  }

  public oneOf(
    value: unknown,
    path: ValidationPath,
    allowed: readonly (string | number)[],
  ): void {
    if (!allowed.some((candidate) => candidate === value)) {
      this.issue(path, 'value.enum', `Expected one of: ${allowed.join(', ')}`);
    }
  }

  public literal(
    value: unknown,
    path: ValidationPath,
    expected: string | number | boolean,
  ): void {
    if (value !== expected) {
      this.issue(path, 'value.literal', `Expected ${String(expected)}`);
    }
  }

  public uniqueStrings(values: readonly unknown[], path: ValidationPath): void {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      this.string(value, [...path, index]);
      if (typeof value !== 'string') return;
      if (seen.has(value)) {
        this.issue([...path, index], 'id.duplicate', `Duplicate identifier ${value}`);
      }
      seen.add(value);
    });
  }

  public finish(): void {
    if (this.collected.length > 0) {
      throw new AssetValidationError(this.collected);
    }
  }
}

function cloneJson(
  value: unknown,
  path: ValidationPath,
  collector: AssetValidationCollector,
  ancestors: ReadonlySet<object>,
): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    collector.number(value, path);
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value !== 'object') {
    collector.issue(path, 'json.unsupported', 'Expected a JSON-compatible value');
    return null;
  }
  if (ancestors.has(value)) {
    collector.issue(path, 'json.cycle', 'JSON values cannot contain cycles');
    return null;
  }
  const nextAncestors = new Set(ancestors);
  nextAncestors.add(value);
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry, index) => (
      cloneJson(entry, [...path, index], collector, nextAncestors)
    )));
  }
  const record = collector.object(value, path);
  const result: Record<string, JsonValue> = {};
  for (const [key, entry] of Object.entries(record)) {
    result[key] = cloneJson(entry, [...path, key], collector, nextAncestors);
  }
  return Object.freeze(result);
}

export function cloneJsonValue(value: unknown): JsonValue {
  const collector = new AssetValidationCollector();
  const result = cloneJson(value, [], collector, new Set());
  collector.finish();
  return result;
}

export function cloneJsonObject(value: unknown): JsonObject {
  const result = cloneJsonValue(value);
  if (result === null || typeof result !== 'object' || Array.isArray(result)) {
    throw new AssetValidationError([Object.freeze({
      path: Object.freeze([]),
      code: 'type.object',
      message: 'Expected a JSON object',
    })]);
  }
  return result as JsonObject;
}
