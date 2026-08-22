import type { SolidGeometrySpec } from '../../../contracts/solid-asset.js';

export type InkedSolidSurfaceFlow = 'view-oriented' | 'faceted';

/**
 * Selects the directional drawing field from authored carrier topology.
 * Smooth carriers are redrawn in view space; explicitly faceted carriers use
 * their visible face normal so adjacent planes separate without a screen-space
 * curvature heuristic.
 */
export function inkedSolidSurfaceFlow(
  geometry: SolidGeometrySpec,
): InkedSolidSurfaceFlow {
  if (geometry.type === 'superellipsoid') return 'view-oriented';
  if (geometry.type === 'mesh') return geometry.smooth ? 'view-oriented' : 'faceted';
  return 'faceted';
}
