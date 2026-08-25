import type { AssetAppearance } from '../appearance/art-direction.js';

/** Representation identifiers owned by the shared projection contracts. */
export type AssetRepresentationId = 'raster' | 'solid' | 'inked-solid';

/** Common header for immutable, representation-neutral identity recipes. */
export type AssetIdentityEnvelope<TFamily extends string> = Readonly<{
  schemaVersion: 1;
  family: TFamily;
  seed: number;
}>;

/** Common envelope for a family identity projected through one representation policy. */
export type AssetRecipeEnvelope<
  TFamily extends string,
  TRepresentation extends Exclude<AssetRepresentationId, 'inked-solid'>,
  TIdentity extends AssetIdentityEnvelope<TFamily>,
  TStyle,
> = Readonly<{
  schemaVersion: 1;
  family: TFamily;
  representation: TRepresentation;
  identity: TIdentity;
  style: TStyle;
}>;

/** Common header for generated representation blueprints. */
export type AssetBlueprintHeader<
  TFamily extends string,
  TRepresentation extends AssetRepresentationId,
> = Readonly<{
  blueprintVersion: 1;
  family: TFamily;
  representation: TRepresentation;
  /** Deterministic authored-content identity, shared by projections of one complete asset. */
  assetId: string;
  seed: number;
  /** Appearance varies independently from authored identity and topology. */
  appearance: AssetAppearance;
}>;
