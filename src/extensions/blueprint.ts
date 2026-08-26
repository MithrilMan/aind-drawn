import { createAssetAppearance } from '../appearance/art-direction.js';
import {
  validateRasterAssetBlueprint,
  validateSolidAssetBlueprint,
} from '../contracts/blueprint-validation.js';
import type { AssetIdentityEnvelope } from '../contracts/asset-envelope.js';
import type { AssetBlueprint } from '../contracts/raster-asset.js';
import type { SolidAssetBlueprint } from '../contracts/solid-asset.js';
import type { Bounds } from '../core/geometry.js';
import type { Bounds3 } from '../core/geometry3.js';
import type { AssetExtensionPlan } from './contracts.js';
import { extendedAssetId } from './identity.js';

function unionBounds(left: Bounds, right: Bounds): Bounds {
  const minimumX = Math.min(left.x, right.x);
  const minimumY = Math.min(left.y, right.y);
  const maximumX = Math.max(left.x + left.width, right.x + right.width);
  const maximumY = Math.max(left.y + left.height, right.y + right.height);
  return Object.freeze({
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  });
}

function unionBounds3(left: Bounds3, right: Bounds3): Bounds3 {
  return Object.freeze({
    minimum: Object.freeze([
      Math.min(left.minimum[0], right.minimum[0]),
      Math.min(left.minimum[1], right.minimum[1]),
      Math.min(left.minimum[2], right.minimum[2]),
    ] as const),
    maximum: Object.freeze([
      Math.max(left.maximum[0], right.maximum[0]),
      Math.max(left.maximum[1], right.maximum[1]),
      Math.max(left.maximum[2], right.maximum[2]),
    ] as const),
  });
}

export function extendRasterAssetBlueprint<TIdentity extends AssetIdentityEnvelope<string>>(
  blueprint: AssetBlueprint<TIdentity['family']>,
  plan: AssetExtensionPlan<TIdentity>,
): AssetBlueprint<TIdentity['family']> {
  if (blueprint.family !== plan.identity.family) {
    throw new RangeError('Raster blueprint and extension plan families must match');
  }
  let bounds = blueprint.bounds;
  const bones = [...blueprint.bones];
  const layers = [...blueprint.layers];
  const colliders = [...blueprint.colliders];
  const sockets = [...blueprint.sockets];
  const interactionBindings = [...blueprint.interactionBindings];
  for (const entry of plan.entries) {
    const contribution = entry.definition.raster?.(Object.freeze({
      identity: plan.identity,
      extension: entry.extension,
      scope: entry.scope,
      slot: entry.slot,
      blueprint,
    }));
    if (contribution === undefined) {
      throw new RangeError(`Asset extension ${entry.extension.id} has no raster projection`);
    }
    if (contribution.bounds !== undefined) bounds = unionBounds(bounds, contribution.bounds);
    bones.push(...(contribution.bones ?? []));
    layers.push(...(contribution.layers ?? []));
    colliders.push(...(contribution.colliders ?? []));
    sockets.push(...(contribution.sockets ?? []));
    interactionBindings.push(...(contribution.interactionBindings ?? []));
  }
  const extended = Object.freeze({
    ...blueprint,
    assetId: extendedAssetId(blueprint.assetId, plan.identity.extensions),
    appearance: createAssetAppearance(blueprint.appearance.artDirection, plan.artBindings),
    manifest: plan.manifest,
    bounds,
    bones: Object.freeze(bones),
    layers: Object.freeze(layers),
    colliders: Object.freeze(colliders),
    sockets: Object.freeze(sockets),
    interactionBindings: Object.freeze(interactionBindings),
  });
  return validateRasterAssetBlueprint(extended);
}

export function extendSolidAssetBlueprint<TIdentity extends AssetIdentityEnvelope<string>>(
  blueprint: SolidAssetBlueprint<TIdentity['family']>,
  plan: AssetExtensionPlan<TIdentity>,
): SolidAssetBlueprint<TIdentity['family']> {
  if (blueprint.family !== plan.identity.family) {
    throw new RangeError('Solid blueprint and extension plan families must match');
  }
  let bounds = blueprint.bounds;
  const nodes = [...blueprint.nodes];
  const parts = [...blueprint.parts];
  const surfaces = [...blueprint.surfaces];
  const colliders = [...blueprint.colliders];
  const sockets = [...blueprint.sockets];
  const interactionBindings = [...blueprint.interactionBindings];
  const containments = [...(blueprint.containments ?? [])];
  for (const entry of plan.entries) {
    const contribution = entry.definition.solid?.(Object.freeze({
      identity: plan.identity,
      extension: entry.extension,
      scope: entry.scope,
      slot: entry.slot,
      blueprint,
    }));
    if (contribution === undefined) {
      throw new RangeError(`Asset extension ${entry.extension.id} has no solid projection`);
    }
    if (contribution.bounds !== undefined) bounds = unionBounds3(bounds, contribution.bounds);
    nodes.push(...(contribution.nodes ?? []));
    parts.push(...(contribution.parts ?? []));
    surfaces.push(...(contribution.surfaces ?? []));
    colliders.push(...(contribution.colliders ?? []));
    sockets.push(...(contribution.sockets ?? []));
    interactionBindings.push(...(contribution.interactionBindings ?? []));
    containments.push(...(contribution.containments ?? []));
  }
  const extended = Object.freeze({
    ...blueprint,
    assetId: extendedAssetId(blueprint.assetId, plan.identity.extensions),
    appearance: createAssetAppearance(blueprint.appearance.artDirection, plan.artBindings),
    manifest: plan.manifest,
    bounds,
    nodes: Object.freeze(nodes),
    parts: Object.freeze(parts),
    surfaces: Object.freeze(surfaces),
    colliders: Object.freeze(colliders),
    sockets: Object.freeze(sockets),
    interactionBindings: Object.freeze(interactionBindings),
    ...(containments.length === 0 ? {} : { containments: Object.freeze(containments) }),
  });
  return validateSolidAssetBlueprint(extended);
}
