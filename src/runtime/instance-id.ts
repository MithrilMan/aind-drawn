import type { AssetInstanceId } from '../contracts/asset-instance.js';

let nextGeneratedInstanceId = 1;

function requireNonEmpty(value: string, label: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new RangeError(`${label} must not be empty`);
  }
  return normalized;
}

/**
 * Creates a process-local runtime ID. Persisted scenes should provide their own
 * stable IDs instead of storing generated values.
 */
export function createAssetInstanceId(assetId: string): AssetInstanceId {
  const normalizedAssetId = requireNonEmpty(assetId, 'asset id');
  const id = `${normalizedAssetId}#${nextGeneratedInstanceId}`;
  nextGeneratedInstanceId += 1;
  return id;
}

export function resolveAssetInstanceId(
  assetId: string,
  instanceId: AssetInstanceId | undefined,
): AssetInstanceId {
  return instanceId === undefined
    ? createAssetInstanceId(assetId)
    : requireNonEmpty(instanceId, 'instance id');
}
