/**
 * Namespaced, serialisable extension point for family-owned blueprint metadata.
 *
 * Generic blueprints carry capabilities without interpreting them. The family
 * that owns a capability also owns its payload type, constructor, and reader.
 * This keeps renderer and rig contracts closed to asset vocabulary while
 * preserving type-safe access in family-specific runtimes.
 */
export type AssetCapability = Readonly<{
  id: string;
  data: object;
}>;

export type AssetCapabilities = readonly AssetCapability[];

export function createAssetCapability(
  id: string,
  data: object,
): AssetCapability {
  if (id.trim().length === 0) throw new TypeError('Asset capability id cannot be empty');
  return Object.freeze({ id, data: Object.freeze(data) });
}

export function readAssetCapability<TData extends object>(
  capabilities: AssetCapabilities | undefined,
  id: string,
  decode: (data: object) => TData,
): TData | undefined {
  const data = capabilities?.find((capability) => capability.id === id)?.data;
  return data === undefined ? undefined : decode(data);
}
