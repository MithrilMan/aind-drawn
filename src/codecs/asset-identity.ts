import type { AssetIdentityEnvelope } from '../contracts/asset-envelope.js';
import type { JsonObject } from '../contracts/json.js';
import { cloneJsonObject } from '../validation/value-validator.js';

/** Creates a detached, deeply immutable JSON document from a trusted identity. */
export function encodeAssetIdentity<TFamily extends string>(
  identity: AssetIdentityEnvelope<TFamily> & object,
): JsonObject {
  return cloneJsonObject(identity);
}
