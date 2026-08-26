import type { AssetSemanticManifest, SemanticPartSpec } from '../../../contracts/asset-semantics.js';

export type CharacterSemanticPartId =
  | 'body'
  | 'limbs'
  | 'tail'
  | 'outfit'
  | 'head'
  | 'ears'
  | 'hair'
  | 'muzzle'
  | 'facial-hair'
  | 'brows'
  | 'nose'
  | 'eyes'
  | 'eyewear'
  | 'tears'
  | 'mouth';

const PARTS: readonly SemanticPartSpec[] = Object.freeze([
  Object.freeze({ id: 'body', spatial: 'volume' }),
  Object.freeze({ id: 'limbs', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'tail', parentId: 'body', spatial: 'articulated' }),
  Object.freeze({ id: 'outfit', parentId: 'body', spatial: 'surface' }),
  Object.freeze({ id: 'head', parentId: 'body', spatial: 'volume' }),
  Object.freeze({ id: 'ears', parentId: 'head', spatial: 'volume' }),
  Object.freeze({ id: 'hair', parentId: 'head', spatial: 'shell' }),
  Object.freeze({ id: 'muzzle', parentId: 'head', spatial: 'cluster' }),
  Object.freeze({ id: 'facial-hair', parentId: 'head', spatial: 'shell' }),
  Object.freeze({ id: 'brows', parentId: 'head', spatial: 'surface' }),
  Object.freeze({ id: 'nose', parentId: 'head', spatial: 'front-extrusion' }),
  Object.freeze({ id: 'eyes', parentId: 'head', spatial: 'surface' }),
  Object.freeze({ id: 'eyewear', parentId: 'head', spatial: 'wrap' }),
  Object.freeze({ id: 'tears', parentId: 'eyes', spatial: 'cluster' }),
  Object.freeze({ id: 'mouth', parentId: 'head', spatial: 'surface' }),
]);

export const CHARACTER_SEMANTIC_MANIFEST: AssetSemanticManifest<'character'> = Object.freeze({
  family: 'character',
  parts: PARTS,
  socketIds: Object.freeze([
    'feet', 'head', 'crown', 'face', 'back', 'backpack', 'hand:left', 'hand:right', 'tail',
  ]),
  colliderIds: Object.freeze(['body', 'head']),
  interactions: Object.freeze([]),
});

export const CHARACTER_FACE_SEMANTIC_MANIFEST: AssetSemanticManifest<'character'> = Object.freeze({
  family: 'character',
  parts: PARTS,
  socketIds: Object.freeze(['floor', 'center', 'crown', 'face']),
  colliderIds: Object.freeze(['head']),
  interactions: Object.freeze([]),
});

export function characterSemanticPartId(concreteId: string): CharacterSemanticPartId {
  if (concreteId === 'torso' || concreteId === 'body:torso') return 'body';
  if (/^(arm|hand|leg|foot):/.test(concreteId)) return 'limbs';
  if (concreteId === 'tail' || concreteId.startsWith('tail:')) return 'tail';
  if (concreteId === 'outfit' || concreteId.startsWith('outfit:')) return 'outfit';
  if (concreteId === 'head') return 'head';
  if (concreteId === 'ears' || concreteId.startsWith('ear:')) return 'ears';
  if (concreteId === 'hair' || concreteId.startsWith('hair:')) return 'hair';
  if (concreteId === 'muzzle' || concreteId.startsWith('muzzle:')) return 'muzzle';
  if (concreteId.startsWith('facial-hair:')) return 'facial-hair';
  if (concreteId.startsWith('brow:')) return 'brows';
  if (concreteId === 'nose') return 'nose';
  if (concreteId.startsWith('eye:')) return 'eyes';
  if (concreteId === 'accessory:eyewear' || concreteId.startsWith('accessory:eyewear:')) return 'eyewear';
  if (concreteId.startsWith('tear:')) return 'tears';
  if (concreteId === 'mouth' || concreteId.startsWith('mouth:')) return 'mouth';
  throw new Error(`Unknown character semantic owner for ${concreteId}`);
}
