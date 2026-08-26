export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

export function smoothstep(value: number, minimum: number, maximum: number): number {
  if (minimum === maximum) return value < minimum ? 0 : 1;
  const amount = clamp((value - minimum) / (maximum - minimum), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

export function euclideanModulo(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

export function shortestAngleDelta(start: number, end: number): number {
  return euclideanModulo(end - start + Math.PI, Math.PI * 2) - Math.PI;
}

export function approach(value: number, target: number, maximumDelta: number): number {
  if (Math.abs(target - value) <= maximumDelta) return target;
  return value + Math.sign(target - value) * maximumDelta;
}
