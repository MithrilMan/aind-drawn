export type SpatialPoint2D = Readonly<{
  x: number;
  z: number;
}>;

export type MutableSpatialVector2D = {
  x: number;
  z: number;
};

function positiveFinite(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

/**
 * Renderer-neutral broad phase for dynamic 2D points. Buckets and query
 * outputs are reused so steady-state simulation does not allocate per agent.
 */
export class SpatialHash2D<T extends SpatialPoint2D> {
  public readonly cellSize: number;

  private readonly rows = new Map<number, Map<number, T[]>>();

  public constructor(cellSize: number) {
    this.cellSize = positiveFinite('Spatial hash cell size', cellSize);
  }

  public rebuild(items: readonly T[]): void {
    for (const row of this.rows.values()) {
      for (const bucket of row.values()) bucket.length = 0;
    }
    for (const item of items) {
      if (!Number.isFinite(item.x) || !Number.isFinite(item.z)) {
        throw new RangeError('Spatial hash points must have finite coordinates');
      }
      const cellX = Math.floor(item.x / this.cellSize);
      const cellZ = Math.floor(item.z / this.cellSize);
      let row = this.rows.get(cellZ);
      if (row === undefined) {
        row = new Map<number, T[]>();
        this.rows.set(cellZ, row);
      }
      let bucket = row.get(cellX);
      if (bucket === undefined) {
        bucket = [];
        row.set(cellX, bucket);
      }
      bucket.push(item);
    }
  }

  public queryRadiusInto(x: number, z: number, radius: number, output: T[]): T[] {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new RangeError('Spatial query coordinates must be finite');
    }
    positiveFinite('Spatial query radius', radius);
    output.length = 0;
    const minimumX = Math.floor((x - radius) / this.cellSize);
    const maximumX = Math.floor((x + radius) / this.cellSize);
    const minimumZ = Math.floor((z - radius) / this.cellSize);
    const maximumZ = Math.floor((z + radius) / this.cellSize);
    const radiusSquared = radius * radius;
    for (let cellZ = minimumZ; cellZ <= maximumZ; cellZ += 1) {
      const row = this.rows.get(cellZ);
      if (row === undefined) continue;
      for (let cellX = minimumX; cellX <= maximumX; cellX += 1) {
        const bucket = row.get(cellX);
        if (bucket === undefined) continue;
        for (const item of bucket) {
          const deltaX = item.x - x;
          const deltaZ = item.z - z;
          if (deltaX * deltaX + deltaZ * deltaZ <= radiusSquared) output.push(item);
        }
      }
    }
    return output;
  }
}

/** Accumulates soft-disc separation from nearby points into a caller-owned vector. */
export function discSeparationInto<T extends SpatialPoint2D>(
  source: T,
  neighbours: readonly T[],
  minimumDistance: number,
  output: MutableSpatialVector2D,
): MutableSpatialVector2D {
  positiveFinite('Disc separation distance', minimumDistance);
  output.x = 0;
  output.z = 0;
  for (const neighbour of neighbours) {
    if (neighbour === source) continue;
    const deltaX = source.x - neighbour.x;
    const deltaZ = source.z - neighbour.z;
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance >= minimumDistance) continue;
    if (distance <= 1e-7) {
      output.x += 1;
      continue;
    }
    const strength = 1 - distance / minimumDistance;
    output.x += deltaX / distance * strength;
    output.z += deltaZ / distance * strength;
  }
  return output;
}
