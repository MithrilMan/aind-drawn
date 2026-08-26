import type { AssetIdentityEnvelope } from '../contracts/asset-envelope.js';
import type { JsonObject, JsonValue } from '../contracts/json.js';
import { hashString, normalizeSeed, type Seed } from '../core/random.js';

export type AssetExtensionIdentity<
  TId extends string = string,
  TData extends JsonObject = JsonObject,
> = Readonly<{
  id: TId;
  instanceId: string;
  seed: number;
  data: TData;
}>;

export type ExtendedAssetIdentity<
  TIdentity extends AssetIdentityEnvelope<string> = AssetIdentityEnvelope<string>,
> = TIdentity & Readonly<{
  extensions: readonly AssetExtensionIdentity[];
}>;

function cloneJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    return Object.freeze(items.map((item) => cloneJson(item)));
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return Object.freeze(Object.fromEntries(
      entries.map(([key, item]) => [key, cloneJson(item)]),
    ));
  }
  return value;
}

function stable(value: JsonValue): string {
  if (Array.isArray(value)) {
    const items = value as readonly JsonValue[];
    return `[${items.map((item) => stable(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value);
    return `{${entries
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function nonEmpty(name: string, value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new RangeError(`${name} must not be empty`);
  return normalized;
}

export function createAssetExtensionIdentity<
  TId extends string,
  TData extends JsonObject,
>(definition: Readonly<{
  id: TId;
  instanceId?: string;
  seed: Seed;
  data: TData;
}>): AssetExtensionIdentity<TId, TData> {
  return Object.freeze({
    id: nonEmpty('Extension id', definition.id) as TId,
    instanceId: nonEmpty('Extension instanceId', definition.instanceId ?? 'default'),
    seed: normalizeSeed(definition.seed),
    data: cloneJson(definition.data) as TData,
  });
}

export function extendAssetIdentity<TIdentity extends AssetIdentityEnvelope<string>>(
  identity: TIdentity,
  extensions: readonly AssetExtensionIdentity[],
): ExtendedAssetIdentity<TIdentity> {
  const seen = new Set<string>();
  const frozenExtensions = extensions.map((extension) => {
    const key = `${extension.id}\u0000${extension.instanceId}`;
    if (seen.has(key)) {
      throw new RangeError(
        `Duplicate asset extension ${extension.id} with instanceId ${extension.instanceId}`,
      );
    }
    seen.add(key);
    return extension;
  });
  return Object.freeze({ ...identity, extensions: Object.freeze(frozenExtensions) });
}

export function assetExtensionFingerprint(extensions: readonly AssetExtensionIdentity[]): string {
  const canonical = [...extensions]
    .sort((left, right) => (
      `${left.id}\u0000${left.instanceId}`.localeCompare(`${right.id}\u0000${right.instanceId}`)
    ))
    .map((extension) => stable(extension as unknown as JsonObject))
    .join('|');
  return `extensions:${hashString(canonical).toString(16).padStart(8, '0')}`;
}

export function extendedAssetId(
  baseAssetId: string,
  extensions: readonly AssetExtensionIdentity[],
): string {
  return extensions.length === 0
    ? baseAssetId
    : `${baseAssetId}:${assetExtensionFingerprint(extensions)}`;
}
