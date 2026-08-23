import type { AssetSemanticManifest, SemanticPartSpec } from '../../../contracts/asset-semantics.js';

export type BuildingSemanticPartId =
  | 'structure'
  | 'roof'
  | 'windows'
  | 'door'
  | 'balconies'
  | 'chimney';

const PARTS: readonly SemanticPartSpec[] = Object.freeze([
  Object.freeze({ id: 'structure', spatial: 'volume' }),
  Object.freeze({ id: 'roof', parentId: 'structure', spatial: 'volume' }),
  Object.freeze({ id: 'windows', parentId: 'structure', spatial: 'surface' }),
  Object.freeze({ id: 'door', parentId: 'structure', spatial: 'articulated' }),
  Object.freeze({ id: 'balconies', parentId: 'structure', spatial: 'front-extrusion' }),
  Object.freeze({ id: 'chimney', parentId: 'roof', spatial: 'volume' }),
]);

export const BUILDING_SEMANTIC_MANIFEST: AssetSemanticManifest<'building'> = Object.freeze({
  family: 'building',
  parts: PARTS,
  socketIds: Object.freeze(['base', 'top', 'door:entry', 'door:handle', 'roof']),
  colliderIds: Object.freeze(['body', 'door:sensor', 'door:leaf']),
  interactions: Object.freeze([Object.freeze({
    id: 'door',
    kind: 'portal',
    initialState: 'closed',
    states: Object.freeze(['closed', 'open']),
    sensorId: 'door:sensor',
    activationSocketId: 'door:entry',
  })]),
});

export function buildingSemanticPartId(concreteId: string): BuildingSemanticPartId {
  if (concreteId.includes('roof')) return 'roof';
  if (concreteId.includes('window')) return 'windows';
  if (concreteId.startsWith('door')) return 'door';
  if (concreteId.includes('balcon')) return 'balconies';
  if (concreteId.includes('chimney')) return 'chimney';
  if (concreteId === 'building:shell') return 'structure';
  throw new Error(`Unknown building semantic owner for ${concreteId}`);
}
