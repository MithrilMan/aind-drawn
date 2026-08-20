import {
  add3,
  pointOnSuperellipsoid,
  scale3,
  surfaceFrame,
  type Point3,
  type Superellipsoid,
} from '../../core/geometry3.js';
import type {
  CharacterHairProfile,
  CharacterHairTuftCluster,
} from '../character-identity/hair-profile.js';
import type { MeshGeometrySpec } from '../solid-types.js';

type HairShellIntent = Extract<CharacterHairProfile['spatial'], { kind: 'head-shell' }>;
type HairWrapIntent = Extract<CharacterHairProfile['spatial'], { kind: 'head-wrap' }>;

function mesh(vertices: readonly Point3[], faces: readonly (readonly number[])[], smooth: boolean) {
  return Object.freeze({
    type: 'mesh',
    vertices: Object.freeze(vertices.map((vertex) => Object.freeze(vertex))),
    faces: Object.freeze(faces.map((face) => Object.freeze(face))),
    smooth,
  } satisfies MeshGeometrySpec);
}

export function createHairTuftGeometry(
  shape: Superellipsoid,
  tufts: CharacterHairTuftCluster,
  radialClearance: number,
  shellThickness: number,
): MeshGeometrySpec {
  const [radiusX, radiusY, radiusZ] = shape.radii;
  const minimumRadius = Math.min(radiusX, radiusY, radiusZ);
  const vertices: Point3[] = [];
  const faces: number[][] = [];
  const ringSegments = 7;
  const fullCircle = tufts.azimuthSpread >= Math.PI * 2 - 0.001;
  for (let tuftIndex = 0; tuftIndex < tufts.count; tuftIndex += 1) {
    const amount = tufts.count === 1
      ? 0.5
      : tuftIndex / (fullCircle ? tufts.count : tufts.count - 1);
    const azimuth = Math.PI * 0.5 + (amount - 0.5) * tufts.azimuthSpread;
    const elevation = Math.max(-0.9, Math.min(0.94,
      tufts.elevation + (tuftIndex % 2 === 0 ? 0.035 : -0.025)));
    const ringRadius = Math.sqrt(1 - elevation * elevation);
    const surface = pointOnSuperellipsoid(shape, [
      Math.cos(azimuth) * ringRadius * radiusX,
      elevation * radiusY,
      Math.sin(azimuth) * ringRadius * radiusZ,
    ]);
    const frame = surfaceFrame(surface.normal);
    const base = add3(surface.point, scale3(
      surface.normal,
      minimumRadius * (radialClearance + shellThickness * 0.72),
    ));
    const heightScale = 1 - (tuftIndex % 3) * tufts.stagger;
    const tip = add3(base, scale3(surface.normal, radiusY * tufts.height * heightScale));
    const radius = minimumRadius * tufts.radius * (tuftIndex % 2 === 0 ? 1 : 0.86);
    const baseIndex = vertices.length;
    for (let ringIndex = 0; ringIndex < ringSegments; ringIndex += 1) {
      const angle = ringIndex / ringSegments * Math.PI * 2;
      vertices.push(add3(
        base,
        add3(
          scale3(frame.right, Math.cos(angle) * radius),
          scale3(frame.up, Math.sin(angle) * radius),
        ),
      ));
    }
    const tipIndex = vertices.length;
    vertices.push(tip);
    const centerIndex = vertices.length;
    vertices.push(base);
    for (let ringIndex = 0; ringIndex < ringSegments; ringIndex += 1) {
      const next = (ringIndex + 1) % ringSegments;
      faces.push(
        [baseIndex + ringIndex, baseIndex + next, tipIndex],
        [centerIndex, baseIndex + next, baseIndex + ringIndex],
      );
    }
  }
  return mesh(vertices, faces, true);
}

export function createHairShellGeometry(
  shape: Superellipsoid,
  spatial: HairShellIntent,
): MeshGeometrySpec {
  const [radiusX, radiusY, radiusZ] = shape.radii;
  const closed = spatial.azimuthCoverage >= 0.999;
  const longitudeSegments = closed ? 32 : 18;
  const longitudeCount = closed ? longitudeSegments : longitudeSegments + 1;
  const latitudeSegments = 10;
  const latitudeCount = latitudeSegments + 1;
  const layerStride = longitudeCount * latitudeCount;
  const minimumRadius = Math.min(radiusX, radiusY, radiusZ);
  const span = Math.PI * 2 * spatial.azimuthCoverage;
  const start = Math.PI * 0.5 - span * 0.5;
  const vertices: Point3[] = [];
  const smoothUnit = (value: number): number => {
    const clamped = Math.max(0, Math.min(1, value));
    return clamped * clamped * (3 - 2 * clamped);
  };
  const boundaryAt = (longitude: number): number => {
    const sine = Math.sin(longitude);
    // A side/rear drop must not be interpolated across the whole visible face:
    // from oblique cameras that made bob hair become a visor over the eyes.
    const frontWeight = smoothUnit((sine - 0.24) / 0.62);
    const rearWeight = smoothUnit((-sine - 0.24) / 0.62);
    const sideWeight = 1 - Math.max(frontWeight, rearWeight);
    const base = spatial.frontHairline * frontWeight
      + spatial.rearDrop * rearWeight
      + spatial.sideDrop * sideWeight;
    const edge = spatial.edgeWave.amplitude
      * frontWeight
      * Math.sin(longitude * spatial.edgeWave.count + spatial.edgeWave.phase);
    return Math.max(-0.88, Math.min(0.82, base + edge));
  };
  for (const layer of [0, 1] as const) {
    for (let longitudeIndex = 0; longitudeIndex < longitudeCount; longitudeIndex += 1) {
      const longitude = start + longitudeIndex / longitudeSegments * span;
      const lowerLatitude = Math.asin(boundaryAt(longitude));
      const upperLatitude = Math.PI * 0.5 - 0.025;
      for (let latitudeIndex = 0; latitudeIndex < latitudeCount; latitudeIndex += 1) {
        const amount = latitudeIndex / latitudeSegments;
        const latitude = lowerLatitude + (upperLatitude - lowerLatitude) * amount;
        const ringRadius = Math.cos(latitude);
        const surface = pointOnSuperellipsoid(shape, [
          Math.cos(longitude) * ringRadius * radiusX,
          Math.sin(latitude) * radiusY,
          Math.sin(longitude) * ringRadius * radiusZ,
        ]);
        const crownWeight = amount ** 3;
        const ridge = spatial.ridgeWave.amplitude
          * crownWeight
          * (0.56 + 0.44 * Math.cos(
            longitude * spatial.ridgeWave.count + spatial.ridgeWave.phase,
          ));
        const clearance = minimumRadius * (
          spatial.radialClearance
          + layer * spatial.thickness
          + crownWeight * spatial.crownLift
          + ridge
        );
        vertices.push(add3(surface.point, scale3(surface.normal, clearance)));
      }
    }
  }
  const at = (layer: 0 | 1, longitude: number, latitude: number): number => (
    layer * layerStride + longitude * latitudeCount + latitude
  );
  const faces: number[][] = [];
  const longitudeFaceCount = closed ? longitudeCount : longitudeCount - 1;
  for (let longitude = 0; longitude < longitudeFaceCount; longitude += 1) {
    const nextLongitude = (longitude + 1) % longitudeCount;
    for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
      faces.push(
        [
          at(1, longitude, latitude), at(1, longitude, latitude + 1),
          at(1, nextLongitude, latitude + 1), at(1, nextLongitude, latitude),
        ],
        [
          at(0, longitude, latitude), at(0, nextLongitude, latitude),
          at(0, nextLongitude, latitude + 1), at(0, longitude, latitude + 1),
        ],
      );
    }
    faces.push(
      [
        at(0, longitude, 0), at(1, longitude, 0),
        at(1, nextLongitude, 0), at(0, nextLongitude, 0),
      ],
      [
        at(0, longitude, latitudeSegments), at(0, nextLongitude, latitudeSegments),
        at(1, nextLongitude, latitudeSegments), at(1, longitude, latitudeSegments),
      ],
    );
  }
  if (!closed) {
    const last = longitudeCount - 1;
    for (let latitude = 0; latitude < latitudeSegments; latitude += 1) {
      faces.push(
        [
          at(0, 0, latitude), at(0, 0, latitude + 1),
          at(1, 0, latitude + 1), at(1, 0, latitude),
        ],
        [
          at(0, last, latitude), at(1, last, latitude),
          at(1, last, latitude + 1), at(0, last, latitude + 1),
        ],
      );
    }
  }
  return mesh(vertices, faces, true);
}

export function createHairWrapGeometry(
  shape: Superellipsoid,
  spatial: HairWrapIntent,
): MeshGeometrySpec {
  const [radiusX, radiusY, radiusZ] = shape.radii;
  const segments = Math.max(8, spatial.peakCount * 2);
  const outerX = radiusX * (1 + spatial.radialClearance);
  const outerZ = radiusZ * (1 + spatial.radialClearance);
  const thickness = Math.min(radiusX, radiusZ) * 0.075;
  const innerX = outerX - thickness;
  const innerZ = outerZ - thickness;
  const bottomY = radiusY * spatial.bandY;
  const bandTopY = bottomY + radiusY * spatial.bandHeight;
  const vertices: Point3[] = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = index / segments * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const topY = bandTopY + (index % 2 === 0 ? radiusY * spatial.peakHeight : 0);
    vertices.push(
      [cosine * outerX, bottomY, sine * outerZ],
      [cosine * outerX, topY, sine * outerZ],
      [cosine * innerX, bottomY, sine * innerZ],
      [cosine * innerX, topY, sine * innerZ],
    );
  }
  const faces: number[][] = [];
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const currentBase = index * 4;
    const nextBase = next * 4;
    faces.push(
      [currentBase, nextBase, nextBase + 1, currentBase + 1],
      [currentBase + 3, nextBase + 3, nextBase + 2, currentBase + 2],
      [currentBase + 2, nextBase + 2, nextBase, currentBase],
      [currentBase + 1, nextBase + 1, nextBase + 3, currentBase + 3],
    );
  }
  return mesh(vertices, faces, false);
}
