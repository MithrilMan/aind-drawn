export type Point3 = readonly [x: number, y: number, z: number];

export type Bounds3 = Readonly<{
  minimum: Point3;
  maximum: Point3;
}>;

export type SurfaceAnchor = Readonly<{
  point: Point3;
  normal: Point3;
  roll: number;
}>;

export type RadialDeformation = Readonly<{
  verticalTaper: number;
  equatorBulge: number;
  lobeAmplitude: number;
  lobeCount: number;
  lobePhase: number;
}>;

export type Superellipsoid = Readonly<{
  radii: Point3;
  exponent: number;
  deformation?: RadialDeformation;
}>;

const EPSILON = 1e-9;
const WORLD_UP: Point3 = [0, 1, 0];

export function add3(left: Point3, right: Point3): Point3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

export function scale3(value: Point3, amount: number): Point3 {
  return [value[0] * amount, value[1] * amount, value[2] * amount];
}

export function dot3(left: Point3, right: Point3): number {
  return left[0] * right[0] + left[1] * right[1] + left[2] * right[2];
}

export function cross3(left: Point3, right: Point3): Point3 {
  return [
    left[1] * right[2] - left[2] * right[1],
    left[2] * right[0] - left[0] * right[2],
    left[0] * right[1] - left[1] * right[0],
  ];
}

export function normalize3(value: Point3): Point3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < EPSILON) {
    throw new RangeError('Cannot normalize a zero-length vector');
  }
  return scale3(value, 1 / length);
}

function signedPower(value: number, exponent: number): number {
  return Math.sign(value) * Math.pow(Math.abs(value), exponent);
}

export function validateSuperellipsoid(shape: Superellipsoid): void {
  if (shape.radii.some((radius) => !(radius > 0) || !Number.isFinite(radius))) {
    throw new RangeError('Superellipsoid radii must be positive finite numbers');
  }
  if (!(shape.exponent >= 1) || !Number.isFinite(shape.exponent)) {
    throw new RangeError('Superellipsoid exponent must be a finite number greater than or equal to one');
  }
  if (shape.deformation !== undefined) {
    const values = [
      shape.deformation.verticalTaper,
      shape.deformation.equatorBulge,
      shape.deformation.lobeAmplitude,
      shape.deformation.lobeCount,
      shape.deformation.lobePhase,
    ];
    if (values.some((value) => !Number.isFinite(value))) {
      throw new RangeError('Radial deformation values must be finite numbers');
    }
    if (!(shape.deformation.lobeCount >= 1)) {
      throw new RangeError('Radial deformation lobe count must be at least one');
    }
  }
}

export function radialDeformationScale(
  deformation: RadialDeformation | undefined,
  direction: Point3,
): number {
  if (deformation === undefined) return 1;
  const unit = normalize3(direction);
  const profileAmount = Math.hypot(unit[0], unit[1]);
  const profileAngle = Math.atan2(unit[1], unit[0]);
  const scale = 1
    - deformation.verticalTaper * unit[1]
    + deformation.equatorBulge * (1 - unit[1] * unit[1])
    + deformation.lobeAmplitude
      * profileAmount
      * Math.sin(profileAngle * deformation.lobeCount + deformation.lobePhase);
  return Math.max(0.55, Math.min(1.5, scale));
}

function surfacePoint(shape: Superellipsoid, unitDirection: Point3): Point3 {
  const [radiusX, radiusY, radiusZ] = shape.radii;
  const direction: Point3 = [
    unitDirection[0] * radiusX,
    unitDirection[1] * radiusY,
    unitDirection[2] * radiusZ,
  ];
  const denominator = Math.pow(
    Math.pow(Math.abs(direction[0] / radiusX), shape.exponent)
      + Math.pow(Math.abs(direction[1] / radiusY), shape.exponent)
      + Math.pow(Math.abs(direction[2] / radiusZ), shape.exponent),
    1 / shape.exponent,
  );
  const basePoint = scale3(direction, 1 / denominator);
  const scale = radialDeformationScale(shape.deformation, unitDirection);
  return scale3(basePoint, scale);
}

function deformedSurfaceNormal(shape: Superellipsoid, unitDirection: Point3): Point3 {
  const fallback: Point3 = Math.abs(dot3(unitDirection, WORLD_UP)) > 0.98 ? [0, 0, 1] : WORLD_UP;
  const right = normalize3(cross3(fallback, unitDirection));
  const up = normalize3(cross3(unitDirection, right));
  const epsilon = 1e-4;
  const sample = (tangent: Point3, amount: number): Point3 => surfacePoint(
    shape,
    normalize3(add3(unitDirection, scale3(tangent, amount))),
  );
  const derivativeRight = add3(sample(right, epsilon), scale3(sample(right, -epsilon), -1));
  const derivativeUp = add3(sample(up, epsilon), scale3(sample(up, -epsilon), -1));
  let normal = normalize3(cross3(derivativeRight, derivativeUp));
  const point = surfacePoint(shape, unitDirection);
  if (dot3(normal, point) < 0) normal = scale3(normal, -1);
  return normal;
}

export function boundsOfSuperellipsoid(
  shape: Superellipsoid,
  segments: readonly [longitude: number, latitude: number] = [96, 48],
): Bounds3 {
  validateSuperellipsoid(shape);
  const longitudeSegments = Math.max(8, Math.floor(segments[0]));
  const latitudeSegments = Math.max(4, Math.floor(segments[1]));
  const minimum = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const maximum = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let latitudeIndex = 0; latitudeIndex <= latitudeSegments; latitudeIndex += 1) {
    const latitude = -Math.PI / 2 + latitudeIndex / latitudeSegments * Math.PI;
    const ringRadius = Math.cos(latitude);
    for (let longitudeIndex = 0; longitudeIndex < longitudeSegments; longitudeIndex += 1) {
      const longitude = longitudeIndex / longitudeSegments * Math.PI * 2;
      const point = surfacePoint(shape, [
        Math.cos(longitude) * ringRadius,
        Math.sin(latitude),
        Math.sin(longitude) * ringRadius,
      ]);
      for (let axis = 0; axis < 3; axis += 1) {
        minimum[axis] = Math.min(minimum[axis] as number, point[axis] as number);
        maximum[axis] = Math.max(maximum[axis] as number, point[axis] as number);
      }
    }
  }
  return Object.freeze({
    minimum: Object.freeze([
      minimum[0] as number,
      minimum[1] as number,
      minimum[2] as number,
    ] as const),
    maximum: Object.freeze([
      maximum[0] as number,
      maximum[1] as number,
      maximum[2] as number,
    ] as const),
  });
}

/**
 * Intersects a ray from the origin with a possibly deformed superellipsoid.
 * Base surfaces use the analytic normal; radial deformations use a stable
 * surface differential. Layout, anchors, and generated meshes therefore share
 * exactly the same renderer-independent field.
 */
export function pointOnSuperellipsoid(
  shape: Superellipsoid,
  direction: Point3,
): Readonly<{ point: Point3; normal: Point3 }> {
  validateSuperellipsoid(shape);
  if (Math.hypot(...direction) < EPSILON) {
    throw new RangeError('Surface direction must not be zero');
  }
  const [radiusX, radiusY, radiusZ] = shape.radii;
  const exponent = shape.exponent;
  const unitDirection = normalize3([
    direction[0] / radiusX,
    direction[1] / radiusY,
    direction[2] / radiusZ,
  ]);
  const point = surfacePoint(shape, unitDirection);
  const normal = shape.deformation === undefined
    ? normalize3([
      signedPower(point[0] / radiusX, exponent - 1) / radiusX,
      signedPower(point[1] / radiusY, exponent - 1) / radiusY,
      signedPower(point[2] / radiusZ, exponent - 1) / radiusZ,
    ])
    : deformedSurfaceNormal(shape, unitDirection);
  return Object.freeze({ point, normal });
}

export function surfaceFrame(
  normal: Point3,
  roll = 0,
): Readonly<{ right: Point3; up: Point3; normal: Point3 }> {
  const forward = normalize3(normal);
  const fallback: Point3 = Math.abs(dot3(forward, WORLD_UP)) > 0.98 ? [0, 0, 1] : WORLD_UP;
  const baseRight = normalize3(cross3(fallback, forward));
  const baseUp = normalize3(cross3(forward, baseRight));
  const cosine = Math.cos(roll);
  const sine = Math.sin(roll);
  const right = add3(scale3(baseRight, cosine), scale3(baseUp, sine));
  const up = add3(scale3(baseUp, cosine), scale3(baseRight, -sine));
  return Object.freeze({ right, up, normal: forward });
}

export function moveOnSurface(
  anchor: SurfaceAnchor,
  offset: readonly [right: number, up: number] = [0, 0],
  proud = 0,
): SurfaceAnchor {
  const frame = surfaceFrame(anchor.normal, anchor.roll);
  const point = add3(
    add3(anchor.point, scale3(frame.right, offset[0])),
    add3(scale3(frame.up, offset[1]), scale3(frame.normal, proud)),
  );
  return Object.freeze({ point, normal: frame.normal, roll: anchor.roll });
}
