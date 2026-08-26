import { clamp } from './scalar.js';

export type FixedStepOptions = Readonly<{
  stepSeconds?: number;
  maximumFrameSeconds?: number;
  maximumStepsPerFrame?: number;
}>;

export type FixedStepAdvance = Readonly<{
  steps: number;
  alpha: number;
  simulationTime: number;
  droppedSeconds: number;
}>;

function positiveFinite(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

/** Deterministic accumulator with a bounded catch-up budget and interpolation alpha. */
export class FixedStepClock {
  public readonly stepSeconds: number;
  public readonly maximumFrameSeconds: number;
  public readonly maximumStepsPerFrame: number;

  private accumulator = 0;
  private elapsed = 0;
  private dropped = 0;

  public constructor(options: FixedStepOptions = {}) {
    this.stepSeconds = positiveFinite('Fixed step', options.stepSeconds ?? 1 / 120);
    this.maximumFrameSeconds = positiveFinite(
      'Maximum frame duration',
      options.maximumFrameSeconds ?? 0.1,
    );
    const maximumSteps = options.maximumStepsPerFrame ?? 12;
    if (!Number.isInteger(maximumSteps) || maximumSteps <= 0) {
      throw new RangeError('Maximum fixed steps per frame must be a positive integer');
    }
    this.maximumStepsPerFrame = maximumSteps;
  }

  public advance(deltaSeconds: number, step: (deltaSeconds: number, time: number) => void): FixedStepAdvance {
    if (!(deltaSeconds >= 0) || !Number.isFinite(deltaSeconds)) {
      throw new RangeError('Frame delta must be a non-negative finite number');
    }
    const accepted = clamp(deltaSeconds, 0, this.maximumFrameSeconds);
    this.dropped += deltaSeconds - accepted;
    this.accumulator += accepted;
    let steps = 0;
    while (this.accumulator + Number.EPSILON >= this.stepSeconds && steps < this.maximumStepsPerFrame) {
      this.elapsed += this.stepSeconds;
      step(this.stepSeconds, this.elapsed);
      this.accumulator -= this.stepSeconds;
      steps += 1;
    }
    if (this.accumulator < this.stepSeconds * 1e-12) this.accumulator = 0;
    if (this.accumulator >= this.stepSeconds) {
      const droppedSteps = Math.floor(
        (this.accumulator + Number.EPSILON) / this.stepSeconds,
      );
      const droppedDuration = droppedSteps * this.stepSeconds;
      this.dropped += droppedDuration;
      this.accumulator = Math.max(0, this.accumulator - droppedDuration);
    }
    return Object.freeze({
      steps,
      alpha: clamp(this.accumulator / this.stepSeconds, 0, 1),
      simulationTime: this.elapsed,
      droppedSeconds: this.dropped,
    });
  }

  public reset(simulationTime = 0): void {
    if (!(simulationTime >= 0) || !Number.isFinite(simulationTime)) {
      throw new RangeError('Simulation time must be a non-negative finite number');
    }
    this.accumulator = 0;
    this.elapsed = simulationTime;
    this.dropped = 0;
  }
}
