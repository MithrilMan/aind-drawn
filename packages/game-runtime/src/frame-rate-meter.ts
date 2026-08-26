export type FrameRateMeterOptions = Readonly<{
  sampleSeconds?: number;
  maximumFrameSeconds?: number;
}>;

function positiveFinite(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a positive finite number`);
  }
  return value;
}

/** Allocation-free rolling frame-rate measurement independent of any renderer. */
export class FrameRateMeter {
  public readonly sampleSeconds: number;
  public readonly maximumFrameSeconds: number;
  public framesPerSecond = 0;
  public frameTimeMilliseconds = 0;

  private elapsed = 0;
  private frames = 0;

  public constructor(options: FrameRateMeterOptions = {}) {
    this.sampleSeconds = positiveFinite('Frame-rate sample duration', options.sampleSeconds ?? 0.5);
    this.maximumFrameSeconds = positiveFinite(
      'Maximum measured frame duration',
      options.maximumFrameSeconds ?? 0.25,
    );
  }

  /** Adds one presented frame and returns true when a new sample is available. */
  public sampleFrame(deltaSeconds: number): boolean {
    if (!(deltaSeconds >= 0) || !Number.isFinite(deltaSeconds)) {
      throw new RangeError('Frame duration must be a non-negative finite number');
    }
    if (deltaSeconds > this.maximumFrameSeconds) {
      this.elapsed = 0;
      this.frames = 0;
      return false;
    }
    this.elapsed += deltaSeconds;
    this.frames += 1;
    if (this.elapsed + Number.EPSILON < this.sampleSeconds) return false;
    this.framesPerSecond = this.frames / this.elapsed;
    this.frameTimeMilliseconds = this.elapsed * 1000 / this.frames;
    this.elapsed = 0;
    this.frames = 0;
    return true;
  }

  public reset(): void {
    this.elapsed = 0;
    this.frames = 0;
    this.framesPerSecond = 0;
    this.frameTimeMilliseconds = 0;
  }
}
