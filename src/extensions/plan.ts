import type { SemanticPartArtBinding } from '../appearance/art-direction.js';
import type { AssetIdentityEnvelope } from '../contracts/asset-envelope.js';
import type { AssetSemanticManifest } from '../contracts/asset-semantics.js';
import { validateAssetSemanticManifest } from '../contracts/blueprint-validation.js';
import type {
  AssetExtensionHost,
  AssetExtensionPlan,
  AssetExtensionPlanEntry,
  AssetExtensionRegistry,
  AssetExtensionScope,
} from './contracts.js';
import type { AssetExtensionIdentity, ExtendedAssetIdentity } from './identity.js';

function createScope(extension: AssetExtensionIdentity): AssetExtensionScope {
  const prefix = `extension:${extension.id}:${extension.instanceId}`;
  return Object.freeze({
    prefix,
    id: (localId: string) => {
      const normalized = localId.trim();
      if (normalized.length === 0) throw new RangeError('Extension local id must not be empty');
      return `${prefix}:${normalized}`;
    },
  });
}
export function assetExtensionScope(extension: AssetExtensionIdentity): AssetExtensionScope {
  return createScope(extension);
}

export function createAssetExtensionPlan<TIdentity extends AssetIdentityEnvelope<string>>(
  identity: ExtendedAssetIdentity<TIdentity>,
  baseManifest: AssetSemanticManifest<TIdentity['family']>,
  baseArtBindings: readonly SemanticPartArtBinding[],
  host: AssetExtensionHost<TIdentity['family']>,
  registry: AssetExtensionRegistry,
): AssetExtensionPlan<TIdentity> {
  if (identity.family !== host.family || identity.family !== baseManifest.family) {
    throw new RangeError('Identity, extension host, and semantic manifest families must match');
  }
  const slots = new Map(host.slots.map((slot) => [slot.id, slot]));
  const usedSlots = new Map<string, number>();
  const entries: AssetExtensionPlanEntry[] = [];
  const parts = [...baseManifest.parts];
  const socketIds = [...baseManifest.socketIds];
  const colliderIds = [...baseManifest.colliderIds];
  const interactions = [...baseManifest.interactions];
  const artBindings = [...baseArtBindings];

  for (const extension of identity.extensions) {
    const definition = registry.definition(extension.id);
    if (definition === undefined) {
      throw new RangeError(`No asset extension definition registered for ${extension.id}`);
    }
    if (definition.family !== identity.family) {
      throw new RangeError(
        `Asset extension ${extension.id} targets ${definition.family}, not ${identity.family}`,
      );
    }
    const slot = slots.get(definition.slotId);
    if (slot === undefined) {
      throw new RangeError(
        `Asset family ${identity.family} does not expose extension slot ${definition.slotId}`,
      );
    }
    const count = (usedSlots.get(slot.id) ?? 0) + 1;
    if (slot.cardinality === 'one' && count > 1) {
      throw new RangeError(`Asset extension slot ${slot.id} accepts only one extension`);
    }
    usedSlots.set(slot.id, count);
    definition.validateIdentity(extension, identity);
    const scope = createScope(extension);
    const context = Object.freeze({ identity, extension, scope, slot });
    const contribution = definition.semantics(context);
    parts.push(...contribution.parts);
    socketIds.push(...(contribution.socketIds ?? []));
    colliderIds.push(...(contribution.colliderIds ?? []));
    interactions.push(...(contribution.interactions ?? []));
    artBindings.push(...contribution.artBindings);
    entries.push(Object.freeze({ definition, extension, scope, slot }));
  }

  const manifest = Object.freeze({
    family: identity.family,
    parts: Object.freeze(parts),
    socketIds: Object.freeze(socketIds),
    colliderIds: Object.freeze(colliderIds),
    interactions: Object.freeze(interactions),
  }) as AssetSemanticManifest<TIdentity['family']>;
  validateAssetSemanticManifest(manifest);
  return Object.freeze({
    identity,
    manifest,
    artBindings: Object.freeze(artBindings),
    entries: Object.freeze(entries),
  });
}
