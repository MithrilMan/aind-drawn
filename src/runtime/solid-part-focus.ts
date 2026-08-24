import * as THREE from 'three';

import type { Point3 } from '../core/geometry3.js';
import type { SolidRig } from './solid-rig.js';

export type SolidRigPartFocus = Readonly<{
  partIds: readonly string[];
  bounds: Readonly<{
    minimum: Point3;
    maximum: Point3;
  }>;
  center: Point3;
  size: Point3;
}>;

function point3(vector: THREE.Vector3): Point3 {
  return Object.freeze([vector.x, vector.y, vector.z] as const);
}

/**
 * Isolates an explicit set of semantic carrier parts on an existing solid rig
 * and measures their world-space extent. The caller retains ownership of the
 * rig and may apply interaction or motion state before focusing it.
 */
export function isolateSolidRigParts(
  rig: SolidRig,
  partIds: readonly string[],
): SolidRigPartFocus {
  if (partIds.length === 0) throw new RangeError('Solid part focus requires at least one part');
  const selected = new Set(partIds);
  if (selected.size !== partIds.length) {
    throw new RangeError('Solid part focus cannot contain duplicate part ids');
  }
  for (const partId of selected) {
    if (rig.getPart(partId) === null) throw new Error(`Unknown solid focus part: ${partId}`);
  }

  for (const partId of rig.partIds) {
    const part = rig.getPart(partId);
    if (part !== null) part.visible = selected.has(partId);
  }
  rig.root.updateWorldMatrix(true, true);

  const bounds = new THREE.Box3();
  for (const partId of selected) {
    const part = rig.getPart(partId);
    if (part !== null) bounds.expandByObject(part, true);
  }
  if (bounds.isEmpty()) throw new Error('Solid part focus has no visible geometry');

  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  return Object.freeze({
    partIds: Object.freeze([...selected]),
    bounds: Object.freeze({
      minimum: point3(bounds.min),
      maximum: point3(bounds.max),
    }),
    center: point3(center),
    size: point3(size),
  });
}
