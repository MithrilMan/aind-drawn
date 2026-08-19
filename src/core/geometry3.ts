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

export type Superellipsoid = Readonly<{
  radii: Point3;
  exponent: number;
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
}

/**
 * Intersects a ray from the origin with a superellipsoid and returns the
 * matching analytic normal. The function is renderer-independent so layout,
 * gameplay anchors, and the generated mesh share exactly the same surface.
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
  const denominator = Math.pow(
    Math.pow(Math.abs(direction[0] / radiusX), exponent)
      + Math.pow(Math.abs(direction[1] / radiusY), exponent)
      + Math.pow(Math.abs(direction[2] / radiusZ), exponent),
    1 / exponent,
  );
  const point = scale3(direction, 1 / denominator);
  const normal = normalize3([
    signedPower(point[0] / radiusX, exponent - 1) / radiusX,
    signedPower(point[1] / radiusY, exponent - 1) / radiusY,
    signedPower(point[2] / radiusZ, exponent - 1) / radiusZ,
  ]);
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
