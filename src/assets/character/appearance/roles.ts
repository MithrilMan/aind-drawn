import type { SemanticPartArtBinding } from '../../../appearance/art-direction.js';
import type { CharacterSemanticPartId } from '../identity/semantics.js';

const binding = (
  semanticPartId: CharacterSemanticPartId,
  roles: SemanticPartArtBinding['roles'],
): SemanticPartArtBinding => Object.freeze({ semanticPartId, roles: Object.freeze([...roles]) });

export const CHARACTER_ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  binding('body', ['primary-form']),
  binding('limbs', ['secondary-form']),
  binding('tail', ['secondary-form', 'line-detail']),
  binding('outfit', ['secondary-form', 'accent']),
  binding('head', ['primary-form']),
  binding('ears', ['secondary-form']),
  binding('hair', ['secondary-form', 'line-detail']),
  binding('muzzle', ['secondary-form']),
  binding('facial-hair', ['secondary-form', 'line-detail']),
  binding('brows', ['focal-feature', 'line-detail']),
  binding('nose', ['focal-feature']),
  binding('eyes', ['focal-feature']),
  binding('eyewear', ['accent', 'line-detail']),
  binding('tears', ['accent', 'transparent']),
  binding('mouth', ['focal-feature', 'line-detail']),
]);
