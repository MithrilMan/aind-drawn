export type Seed = number | string;

const UINT32_RANGE = 4_294_967_296;

export function hashString(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

export function normalizeSeed(seed: Seed): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed);
}

export function combineSeed(seed: Seed, namespace: string): number {
  return hashString(`${normalizeSeed(seed)}:${namespace}`);
}

export type WeightedValue<T> = Readonly<{ value: T; weight: number }>;

export class Random {
  private readonly initialSeed: number;
  private state: number;

  public constructor(seed: Seed) {
    this.initialSeed = normalizeSeed(seed) || 1;
    this.state = this.initialSeed;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  }

  public float(minimum = 0, maximum = 1): number {
    if (maximum < minimum) {
      throw new RangeError('maximum must be greater than or equal to minimum');
    }
    return minimum + this.next() * (maximum - minimum);
  }

  public integer(minimum: number, maximum: number): number {
    if (!Number.isInteger(minimum) || !Number.isInteger(maximum)) {
      throw new RangeError('integer bounds must be integers');
    }
    return Math.floor(this.float(minimum, maximum + 1));
  }

  public chance(probability: number): boolean {
    if (probability < 0 || probability > 1) {
      throw new RangeError('probability must be between 0 and 1');
    }
    return this.next() < probability;
  }

  public pick<T>(values: readonly T[]): T {
    if (values.length === 0) {
      throw new RangeError('cannot pick from an empty collection');
    }
    return values[this.integer(0, values.length - 1)] as T;
  }

  public weighted<T>(values: readonly WeightedValue<T>[]): T {
    const positive = values.filter(({ weight }) => Number.isFinite(weight) && weight > 0);
    if (positive.length === 0) {
      throw new RangeError('weighted collection must contain a positive finite weight');
    }

    const total = positive.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = this.float(0, total);
    for (const entry of positive) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        return entry.value;
      }
    }
    return positive[positive.length - 1]?.value as T;
  }

  public fork(namespace: string): Random {
    return new Random(combineSeed(this.initialSeed, namespace));
  }
}

export class SeedTree {
  private readonly root: number;

  public constructor(seed: Seed) {
    this.root = normalizeSeed(seed);
  }

  public seed(namespace: string): number {
    return combineSeed(this.root, namespace);
  }

  public random(namespace: string): Random {
    return new Random(this.seed(namespace));
  }
}
