import type { SemanticPartArtBinding } from '../../../appearance/art-direction.js';
import type { VehicleSemanticPartId } from '../identity/semantics.js';

const binding = (
  semanticPartId: VehicleSemanticPartId,
  roles: SemanticPartArtBinding['roles'],
): SemanticPartArtBinding => Object.freeze({ semanticPartId, roles: Object.freeze([...roles]) });

export const VEHICLE_ART_BINDINGS: readonly SemanticPartArtBinding[] = Object.freeze([
  binding('body', ['primary-form']),
  binding('cabin', ['transparent', 'secondary-form']),
  binding('roof', ['secondary-form']),
  binding('wheels', ['ground-contact', 'line-detail']),
  binding('doors', ['interactive', 'secondary-form']),
  binding('hood', ['interactive', 'secondary-form']),
  binding('cargo', ['interactive', 'secondary-form']),
  binding('lights', ['accent', 'focal-feature']),
  binding('bumpers', ['secondary-form', 'line-detail']),
  binding('accessories', ['accent', 'line-detail']),
]);
