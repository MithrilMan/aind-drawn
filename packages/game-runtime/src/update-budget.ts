/** Returns the deterministic tick for work intentionally sampled below render rate. */
export function fixedRateUpdateTick(
  elapsedSeconds: number,
  updatesPerSecond: number,
  phaseSeconds = 0,
): number {
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(phaseSeconds)) {
    throw new RangeError('Fixed-rate update time and phase must be finite');
  }
  if (!(updatesPerSecond > 0) || !Number.isFinite(updatesPerSecond)) {
    throw new RangeError('Fixed-rate update frequency must be a positive finite number');
  }
  return Math.floor((elapsedSeconds + phaseSeconds) * updatesPerSecond + Number.EPSILON);
}
