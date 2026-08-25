import type { SemanticPartArtBinding } from '../../../appearance/art-direction.js';
import type { BuildingSemanticPartId } from '../identity/semantics.js';

const binding = (
  semanticPartId: BuildingSemanticPartId,
  roles: SemanticPartArtBinding['roles'],
): SemanticPartArtBinding => Object.freeze({ semanticPartId, roles: Object.freeze([...roles]) });

export const BUILDING_ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  binding('structure', ['primary-form']),
  binding('roof', ['secondary-form']),
  binding('windows', ['transparent', 'focal-feature']),
  binding('door', ['interactive', 'accent']),
  binding('balconies', ['secondary-form', 'line-detail']),
  binding('chimney', ['secondary-form', 'line-detail']),
]);
