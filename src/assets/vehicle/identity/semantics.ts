import type { AssetSemanticManifest, SemanticPartSpec } from '../../../contracts/asset-semantics.js';

export type VehicleSemanticPartId =
  | 'body'
  | 'cabin'
  | 'roof'
  | 'wheels'
  | 'doors'
  | 'hood'
  | 'cargo'
  | 'lights'
  | 'bumpers'
  | 'accessories';

const PARTS: readonly SemanticPartSpec[] = Object.freeze([
  Object.freeze({ id: 'body', spatial: 'volume' }),
  Object.freeze({ id: 'cabin', parentId: 'body', spatial: 'volume' }),
  Object.freeze({ id: 'roof', parentId: 'cabin', spatial: 'wrap' }),
  Object.freeze({ id: 'wheels', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'doors', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'hood', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'cargo', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'lights', parentId: 'body', spatial: 'front-extrusion' }),
  Object.freeze({ id: 'bumpers', parentId: 'body', spatial: 'volume' }),
  Object.freeze({ id: 'accessories', parentId: 'body', spatial: 'volume' }),
]);

export const VEHICLE_SEMANTIC_MANIFEST: AssetSemanticManifest<'vehicle'> = Object.freeze({
  family: 'vehicle',
  parts: PARTS,
  socketIds: Object.freeze([
    'door:left:handle', 'door:right:handle',
    'entry:left', 'entry:right', 'hood:service', 'driver', 'passenger', 'cargo', 'tow',
  ]),
  colliderIds: Object.freeze([
    'vehicle:body', 'door:left:leaf', 'door:right:leaf',
    'door:left:sensor', 'door:right:sensor', 'hood:sensor', 'cargo:sensor',
  ]),
  interactions: Object.freeze([
    Object.freeze({
      id: 'door:left', kind: 'portal', initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      sensorId: 'door:left:sensor', activationSocketId: 'entry:left',
    }),
    Object.freeze({
      id: 'door:right', kind: 'portal', initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      sensorId: 'door:right:sensor', activationSocketId: 'entry:right',
    }),
    Object.freeze({
      id: 'hood', kind: 'toggle', initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      sensorId: 'hood:sensor', activationSocketId: 'hood:service',
    }),
    Object.freeze({
      id: 'cargo', kind: 'toggle', initialState: 'closed',
      states: Object.freeze(['closed', 'open']),
      sensorId: 'cargo:sensor', activationSocketId: 'cargo',
    }),
  ]),
});

export function vehicleSemanticPartId(concreteId: string): VehicleSemanticPartId {
  if (concreteId.startsWith('wheel:')) return 'wheels';
  if (concreteId.startsWith('door:')) return 'doors';
  if (concreteId.startsWith('hood')) return 'hood';
  if (concreteId.startsWith('cargo')) return 'cargo';
  if (
    concreteId.startsWith('headlight:')
    || concreteId.startsWith('taillight:')
    || concreteId === 'detail:lights'
  ) return 'lights';
  if (concreteId.startsWith('bumper:') || concreteId.startsWith('grille:')) return 'bumpers';
  if (
    concreteId.startsWith('roof-rack:')
    || concreteId.startsWith('detail:roof-rack')
    || concreteId.startsWith('spoiler')
    || concreteId === 'detail:spoiler'
    || concreteId === 'tow-hitch'
  ) return 'accessories';
  if (concreteId === 'cabin') return 'cabin';
  if (concreteId === 'roof') return 'roof';
  if (concreteId === 'body') return 'body';
  throw new Error(`Unknown vehicle semantic owner for ${concreteId}`);
}
