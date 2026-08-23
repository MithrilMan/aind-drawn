import type { Point3 } from '../../../core/geometry3.js';
import type { InkedSolidStrokeDefinition } from '../../../projections/inked-solid/contracts.js';
import type { SolidAssetBlueprint } from '../../../contracts/solid-asset.js';
import { vehicleSideSign, type VehicleSide } from '../identity/recipe.js';

function localStroke(
  id: string,
  partId: string,
  points: readonly Point3[],
  radius: number,
  options: Readonly<{ closed?: boolean; wobble?: number }> = {},
): InkedSolidStrokeDefinition {
  return Object.freeze({
    id,
    partId,
    path: Object.freeze({ type: 'part-local', points: Object.freeze(points) }),
    radius,
    ...(options.closed === undefined ? {} : { closed: options.closed }),
    ...(options.wobble === undefined ? {} : { wobble: options.wobble }),
  });
}

/** Spatial seams and grooves that belong to vehicle parts rather than the camera contour pass. */
export function createSolidVehicleInkStrokes(
  solid: SolidAssetBlueprint,
): readonly InkedSolidStrokeDefinition[] {
  if (solid.family !== 'vehicle') {
    throw new RangeError('Vehicle ink strokes require a solid vehicle blueprint');
  }
  const body = solid.parts.find(({ id }) => id === 'body');
  if (body?.geometry.type !== 'superellipsoid') {
    throw new RangeError('Vehicle ink strokes require the semantic body volume');
  }
  const [bodyRadiusX, bodyRadiusY, bodyRadiusZ] = body.geometry.radii;
  const radius = Math.max(0.008, Math.min(bodyRadiusY, bodyRadiusZ) * 0.018);
  const strokes: InkedSolidStrokeDefinition[] = [];
  for (const side of [-1, 1] as const) {
    const z = side * bodyRadiusZ * 1.015;
    for (let index = -1; index <= 1; index += 1) {
      const y = -bodyRadiusY * 0.08 + index * bodyRadiusY * 0.19;
      strokes.push(localStroke(
        `grille:${side}:${index}`,
        body.id,
        Object.freeze([
          Object.freeze([bodyRadiusX * 0.94, y, z * 0.42] as const),
          Object.freeze([bodyRadiusX * 0.99, y + radius * 0.4, z * 0.18] as const),
        ]),
        radius * 0.66,
        { wobble: radius * 0.35 },
      ));
    }
  }

  for (const window of solid.parts.filter(({ id }) => /^door:(left|right):window$/u.test(id))) {
    if (window.geometry.type !== 'extruded-profile') continue;
    const side: VehicleSide = window.id.includes(':left:') ? 'left' : 'right';
    const lift = Math.max(0.006, window.geometry.depth * 0.08);
    const z = side === 'right' ? lift : -window.geometry.depth - lift;
    const outline = Object.freeze(window.geometry.outline.map(([x, y]): Point3 => (
      Object.freeze([x, y, z] as const)
    )));
    strokes.push(localStroke(
      `window:division:${side}`,
      window.id,
      outline,
      radius * 0.72,
      { closed: true, wobble: radius * 0.2 },
    ));
  }

  for (const lid of solid.parts.filter(({ id }) => id === 'hood' || id === 'cargo')) {
    if (lid.geometry.type !== 'mesh') continue;
    const topPerimeter = lid.geometry.vertices.slice(0, 4).map(([x, y, z]): Point3 => (
      Object.freeze([x, y + radius * 0.7, z] as const)
    ));
    strokes.push(localStroke(
      `${lid.id}:panel-seam`,
      lid.id,
      Object.freeze(topPerimeter),
      radius * 0.72,
      { closed: true, wobble: radius * 0.16 },
    ));
  }

  for (const tyre of solid.parts.filter(({ id }) => id.endsWith(':tyre'))) {
    if (tyre.geometry.type !== 'mesh') continue;
    const outerRadius = Math.max(...tyre.geometry.vertices.map(([x, y]) => Math.hypot(x, y)));
    const maximumZ = Math.max(...tyre.geometry.vertices.map(([, , z]) => Math.abs(z)));
    for (const side of [-1, 1] as const) {
      const points = Object.freeze(Array.from({ length: 28 }, (_, index): Point3 => {
        const angle = index / 28 * Math.PI * 2;
        return Object.freeze([
          Math.cos(angle) * outerRadius * 0.74,
          Math.sin(angle) * outerRadius * 0.74,
          side * maximumZ * 1.015,
        ] as const);
      }));
      strokes.push(localStroke(
        `${tyre.id}:tread:${side}`,
        tyre.id,
        points,
        radius * 0.52,
        { closed: true, wobble: radius * 0.18 },
      ));
    }
  }

  for (const hub of solid.parts.filter(({ id }) => id.endsWith(':hub'))) {
    if (hub.geometry.type !== 'mesh') continue;
    const hubRadius = Math.max(...hub.geometry.vertices.map(([x, y]) => Math.hypot(x, y)));
    const maximumZ = Math.max(...hub.geometry.vertices.map(([, , z]) => Math.abs(z)));
    const side: VehicleSide = hub.id.includes(':left:') ? 'left' : 'right';
    const sideSign = vehicleSideSign(side);
    // Keep the graphite marks just outside the hub face. At an exact side
    // elevation the previous 2% offset was close enough to z-fight with the
    // hub, which made the wheel motion cue disappear precisely in the view
    // where it matters most.
    const spokeRadius = Math.max(0.008, hubRadius * 0.028);
    const z = sideSign * (maximumZ + Math.max(0.012, hubRadius * 0.045));
    const ring = Object.freeze(Array.from({ length: 28 }, (_, index): Point3 => {
      const angle = index / 28 * Math.PI * 2;
      return Object.freeze([
        Math.cos(angle) * hubRadius * 0.82,
        Math.sin(angle) * hubRadius * 0.82,
        z,
      ] as const);
    }));
    strokes.push(localStroke(
      `${hub.id}:rim-ring`,
      hub.id,
      ring,
      spokeRadius * 0.72,
      { closed: true, wobble: spokeRadius * 0.12 },
    ));
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2 + 0.18;
      strokes.push(localStroke(
        `${hub.id}:rim-spoke:${index}`,
        hub.id,
        Object.freeze([
          Object.freeze([
            Math.cos(angle) * hubRadius * 0.16,
            Math.sin(angle) * hubRadius * 0.16,
            z,
          ] as const),
          Object.freeze([
            Math.cos(angle) * hubRadius * 0.82,
            Math.sin(angle) * hubRadius * 0.82,
            z,
          ] as const),
        ]),
        spokeRadius,
        { wobble: spokeRadius * 0.2 },
      ));
    }
    const markerAngle = 0.18;
    strokes.push(localStroke(
      `${hub.id}:rim-marker`,
      hub.id,
      Object.freeze([
        Object.freeze([
          Math.cos(markerAngle) * hubRadius * 0.7,
          Math.sin(markerAngle) * hubRadius * 0.7,
          z + sideSign * spokeRadius * 0.12,
        ] as const),
        Object.freeze([
          Math.cos(markerAngle) * hubRadius * 0.98,
          Math.sin(markerAngle) * hubRadius * 0.98,
          z + sideSign * spokeRadius * 0.12,
        ] as const),
      ]),
      spokeRadius * 1.55,
      { wobble: spokeRadius * 0.12 },
    ));
  }
  return Object.freeze(strokes);
}
