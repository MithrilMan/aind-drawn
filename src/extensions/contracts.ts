import type { SemanticPartArtBinding } from '../appearance/art-direction.js';
import type { AssetIdentityEnvelope } from '../contracts/asset-envelope.js';
import type {
  AssetSemanticManifest,
  InteractionSpec,
  SemanticPartSpec,
} from '../contracts/asset-semantics.js';
import type {
  AssetBlueprint,
  LayerDefinition,
  RasterBoneDefinition,
  RasterColliderDefinition,
  RasterInteractionBinding,
  RasterSocketDefinition,
} from '../contracts/raster-asset.js';
import type {
  SolidAssetBlueprint,
  SolidColliderDefinition,
  SolidContainmentDefinition,
  SolidInteractionBinding,
  SolidNodeDefinition,
  SolidPartDefinition,
  SolidSocketDefinition,
} from '../contracts/solid-asset.js';
import type { Bounds } from '../core/geometry.js';
import type { Bounds3 } from '../core/geometry3.js';
import type { SemanticSurfaceSpec } from '../materials/surface.js';
import type { AssetExtensionIdentity, ExtendedAssetIdentity } from './identity.js';

export type AssetExtensionSlot = Readonly<{
  id: string;
  cardinality: 'one' | 'many';
  semanticParentId: string;
  raster?: Readonly<{ ownerBone: string; baseOrder: number }>;
  solid?: Readonly<{ ownerNode: string; baseOrder: number }>;
}>;

export type AssetExtensionHost<TFamily extends string = string> = Readonly<{
  family: TFamily;
  slots: readonly AssetExtensionSlot[];
}>;

export type AssetExtensionScope = Readonly<{
  prefix: string;
  id: (localId: string) => string;
}>;

export type AssetExtensionSemanticContribution = Readonly<{
  parts: readonly SemanticPartSpec[];
  artBindings: readonly SemanticPartArtBinding[];
  socketIds?: readonly string[];
  colliderIds?: readonly string[];
  interactions?: readonly InteractionSpec[];
}>;

export type RasterAssetExtensionContribution = Readonly<{
  bounds?: Bounds;
  bones?: readonly RasterBoneDefinition[];
  layers?: readonly LayerDefinition[];
  colliders?: readonly RasterColliderDefinition[];
  sockets?: readonly RasterSocketDefinition[];
  interactionBindings?: readonly RasterInteractionBinding[];
}>;

export type SolidAssetExtensionContribution = Readonly<{
  bounds?: Bounds3;
  nodes?: readonly SolidNodeDefinition[];
  parts?: readonly SolidPartDefinition[];
  surfaces?: readonly SemanticSurfaceSpec[];
  colliders?: readonly SolidColliderDefinition[];
  sockets?: readonly SolidSocketDefinition[];
  interactionBindings?: readonly SolidInteractionBinding[];
  containments?: readonly SolidContainmentDefinition[];
}>;

type BaseExtensionContext = Readonly<{
  identity: AssetIdentityEnvelope<string>;
  extension: AssetExtensionIdentity;
  scope: AssetExtensionScope;
  slot: AssetExtensionSlot;
}>;

export type AssetExtensionDefinition = Readonly<{
  id: string;
  family: string;
  slotId: string;
  validateIdentity: (
    extension: AssetExtensionIdentity,
    identity: AssetIdentityEnvelope<string>,
  ) => void;
  semantics: (context: BaseExtensionContext) => AssetExtensionSemanticContribution;
  raster?: (
    context: BaseExtensionContext & Readonly<{ blueprint: AssetBlueprint }>,
  ) => RasterAssetExtensionContribution;
  solid?: (
    context: BaseExtensionContext & Readonly<{ blueprint: SolidAssetBlueprint }>,
  ) => SolidAssetExtensionContribution;
}>;

type TypedExtensionContext<
  TIdentity extends AssetIdentityEnvelope<string>,
  TExtension extends AssetExtensionIdentity,
> = Readonly<{
  identity: TIdentity;
  extension: TExtension;
  scope: AssetExtensionScope;
  slot: AssetExtensionSlot;
}>;

export type TypedAssetExtensionDefinition<
  TIdentity extends AssetIdentityEnvelope<string>,
  TExtension extends AssetExtensionIdentity,
> = Readonly<{
  id: TExtension['id'];
  family: TIdentity['family'];
  slotId: string;
  readIdentity: (extension: AssetExtensionIdentity, identity: TIdentity) => TExtension;
  semantics: (
    context: TypedExtensionContext<TIdentity, TExtension>,
  ) => AssetExtensionSemanticContribution;
  raster?: (
    context: TypedExtensionContext<TIdentity, TExtension>
      & Readonly<{ blueprint: AssetBlueprint<TIdentity['family']> }>,
  ) => RasterAssetExtensionContribution;
  solid?: (
    context: TypedExtensionContext<TIdentity, TExtension>
      & Readonly<{ blueprint: SolidAssetBlueprint<TIdentity['family']> }>,
  ) => SolidAssetExtensionContribution;
}>;

export function defineAssetExtension<
  TIdentity extends AssetIdentityEnvelope<string>,
  TExtension extends AssetExtensionIdentity,
>(definition: TypedAssetExtensionDefinition<TIdentity, TExtension>): AssetExtensionDefinition {
  const context = (source: BaseExtensionContext): TypedExtensionContext<TIdentity, TExtension> => {
    const identity = source.identity as TIdentity;
    return Object.freeze({
      identity,
      extension: definition.readIdentity(source.extension, identity),
      scope: source.scope,
      slot: source.slot,
    });
  };
  return Object.freeze({
    id: definition.id,
    family: definition.family,
    slotId: definition.slotId,
    validateIdentity: (extension, identity) => {
      definition.readIdentity(extension, identity as TIdentity);
    },
    semantics: (source) => definition.semantics(context(source)),
    ...(definition.raster === undefined ? {} : {
      raster: (source: BaseExtensionContext & Readonly<{ blueprint: AssetBlueprint }>) => (
        definition.raster?.(Object.freeze({
          ...context(source),
          blueprint: source.blueprint,
        })) ?? Object.freeze({})
      ),
    }),
    ...(definition.solid === undefined ? {} : {
      solid: (source: BaseExtensionContext & Readonly<{ blueprint: SolidAssetBlueprint }>) => (
        definition.solid?.(Object.freeze({
          ...context(source),
          blueprint: source.blueprint,
        })) ?? Object.freeze({})
      ),
    }),
  });
}

export type AssetExtensionRegistry = Readonly<{
  definitions: readonly AssetExtensionDefinition[];
  definition: (id: string) => AssetExtensionDefinition | undefined;
}>;

export function createAssetExtensionRegistry(
  definitions: readonly AssetExtensionDefinition[],
): AssetExtensionRegistry {
  const byId = new Map<string, AssetExtensionDefinition>();
  for (const definition of definitions) {
    if (byId.has(definition.id)) {
      throw new RangeError(`Duplicate asset extension definition ${definition.id}`);
    }
    byId.set(definition.id, definition);
  }
  return Object.freeze({
    definitions: Object.freeze([...definitions]),
    definition: (id: string) => byId.get(id),
  });
}

export type AssetExtensionPlanEntry = Readonly<{
  definition: AssetExtensionDefinition;
  extension: AssetExtensionIdentity;
  scope: AssetExtensionScope;
  slot: AssetExtensionSlot;
}>;

export type AssetExtensionPlan<
  TIdentity extends AssetIdentityEnvelope<string> = AssetIdentityEnvelope<string>,
> = Readonly<{
  identity: ExtendedAssetIdentity<TIdentity>;
  manifest: AssetSemanticManifest<TIdentity['family']>;
  artBindings: readonly SemanticPartArtBinding[];
  entries: readonly AssetExtensionPlanEntry[];
}>;
