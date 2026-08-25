import type { SemanticPartArtBinding } from '../../../appearance/art-direction.js';
import type { TreeSemanticPartId } from '../identity/semantics.js';

const binding = (
  semanticPartId: TreeSemanticPartId,
  roles: SemanticPartArtBinding['roles'],
): SemanticPartArtBinding => Object.freeze({ semanticPartId, roles: Object.freeze([...roles]) });

export const TREE_ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  binding('trunk', ['primary-form', 'ground-contact']),
  binding('branches', ['secondary-form', 'line-detail']),
  binding('canopy', ['primary-form', 'foliage']),
]);
