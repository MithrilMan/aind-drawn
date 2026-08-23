export const SEMANTIC_SPATIAL_KINDS = Object.freeze([
  'surface',
  'front-extrusion',
  'shell',
  'cluster',
  'wrap',
  'volume',
  'articulated',
] as const);

export type SemanticSpatialKind = typeof SEMANTIC_SPATIAL_KINDS[number];

export type InteractionSpec = Readonly<{
  id: string;
  kind: 'toggle' | 'portal';
  initialState: string;
  states: readonly string[];
  sensorId: string;
  activationSocketId: string;
}>;

export type SemanticPartSpec = Readonly<{
  id: string;
  parentId?: string;
  spatial: SemanticSpatialKind;
}>;

export type AssetSemanticManifest<TFamily extends string = string> = Readonly<{
  family: TFamily;
  parts: readonly SemanticPartSpec[];
  socketIds: readonly string[];
  colliderIds: readonly string[];
  interactions: readonly InteractionSpec[];
}>;
