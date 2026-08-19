export type Point = readonly [x: number, y: number];
export type MutablePoint = [x: number, y: number];
export type Bounds = Readonly<{
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export const TAU = Math.PI * 2;

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function smoothStep(value: number): number {
  const normalized = clamp(value, 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

export function resample(points: readonly Point[], step: number): MutablePoint[] {
  if (points.length === 0) {
    return [];
  }
  if (!(step > 0)) {
    throw new RangeError('step must be greater than zero');
  }

  const first = points[0] as Point;
  const result: MutablePoint[] = [[first[0], first[1]]];
  let remaining = step;

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1] as Point;
    const current = points[index] as Point;
    let x = previous[0];
    let y = previous[1];
    let distance = Math.hypot(current[0] - x, current[1] - y);

    while (distance >= remaining && distance > 0) {
      const amount = remaining / distance;
      x += (current[0] - x) * amount;
      y += (current[1] - y) * amount;
      result.push([x, y]);
      distance = Math.hypot(current[0] - x, current[1] - y);
      remaining = step;
    }
    remaining -= distance;
  }

  const last = points[points.length - 1] as Point;
  const resultLast = result[result.length - 1] as Point;
  if (Math.hypot(last[0] - resultLast[0], last[1] - resultLast[1]) > step * 0.25) {
    result.push([last[0], last[1]]);
  }
  return result;
}

export function chaikin(points: readonly Point[], closed: boolean, iterations = 1): MutablePoint[] {
  if (points.length < 2 || iterations <= 0) {
    return points.map(([x, y]) => [x, y]);
  }

  let current = points.map<MutablePoint>(([x, y]) => [x, y]);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const result: MutablePoint[] = [];
    const count = current.length;
    if (!closed) {
      result.push([...(current[0] as MutablePoint)]);
    }
    const end = closed ? count : count - 1;
    for (let index = 0; index < end; index += 1) {
      const from = current[index] as Point;
      const to = current[(index + 1) % count] as Point;
      result.push(
        [lerp(from[0], to[0], 0.25), lerp(from[1], to[1], 0.25)],
        [lerp(from[0], to[0], 0.75), lerp(from[1], to[1], 0.75)],
      );
    }
    if (!closed) {
      result.push([...(current[count - 1] as MutablePoint)]);
    }
    current = result;
  }
  return current;
}

export function circlePoints(
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number,
  count = 22,
  rotation = 0,
): MutablePoint[] {
  const points: MutablePoint[] = [];
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * TAU;
    const x = Math.cos(angle) * radiusX;
    const y = Math.sin(angle) * radiusY;
    points.push([centerX + x * cosine - y * sine, centerY + x * sine + y * cosine]);
  }
  return points;
}

export function boundsOf(points: readonly Point[]): Bounds {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  let minimumX = Number.POSITIVE_INFINITY;
  let minimumY = Number.POSITIVE_INFINITY;
  let maximumX = Number.NEGATIVE_INFINITY;
  let maximumY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of points) {
    minimumX = Math.min(minimumX, x);
    minimumY = Math.min(minimumY, y);
    maximumX = Math.max(maximumX, x);
    maximumY = Math.max(maximumY, y);
  }
  return {
    x: minimumX,
    y: minimumY,
    width: maximumX - minimumX,
    height: maximumY - minimumY,
  };
}

export function closePath(points: readonly Point[]): MutablePoint[] {
  if (points.length === 0) {
    return [];
  }
  return [...points.map(([x, y]) => [x, y] as MutablePoint), [...(points[0] as Point)]];
}
