import type { InkedSolidSceneDiagnostics } from '../../../../src/index.js';

import type { CourseLayout, CourseSample } from './course.js';
import type { DoodleRenderStats } from './doodle-scene.js';
import type { RacerSnapshot, RaceSnapshot } from './race-model.js';

type RouteBin = {
  frameMilliseconds: number[];
  renderCpuMilliseconds: number[];
  drawCalls: number;
  triangles: number;
  renderSamples: number;
  visibleInstances: number;
  submittedProxyMeshes: number;
  diagnosticSamples: number;
};

export type RoutePerformanceProbeReport = Readonly<{
  binCount: number;
  measuredLaps: number;
  secondsPerLap: number;
  frames: number;
  summary: RoutePerformanceBinReport;
  bins: readonly RoutePerformanceBinReport[];
}>;

export type RoutePerformanceBinReport = Readonly<{
  bin: number;
  progressStart: number;
  progressEnd: number;
  x: number;
  z: number;
  curvature: number;
  frames: number;
  meanFrameMilliseconds: number;
  p95FrameMilliseconds: number;
  maximumFrameMilliseconds: number;
  framesOver25Milliseconds: number;
  framesOver50Milliseconds: number;
  meanRenderCpuMilliseconds: number;
  p95RenderCpuMilliseconds: number;
  meanDrawCalls: number;
  meanTriangles: number;
  meanVisibleInstances: number;
  meanSubmittedProxyMeshes: number;
}>;

const DEFAULT_BIN_COUNT = 32;
const DEFAULT_LAP_SECONDS = 18;
const DEFAULT_MEASURED_LAPS = 2;
const WARMUP_SECONDS = 2;
const ROUTE_POSE_COUNT = 2_048;
const DIAGNOSTIC_SAMPLE_INTERVAL = 20;

function wrap(value: number): number {
  return ((value % 1) + 1) % 1;
}

function headingFor(sample: CourseSample): number {
  return Math.atan2(-sample.tangentZ, sample.tangentX);
}

function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createBin(): RouteBin {
  return {
    frameMilliseconds: [],
    renderCpuMilliseconds: [],
    drawCalls: 0,
    triangles: 0,
    renderSamples: 0,
    visibleInstances: 0,
    submittedProxyMeshes: 0,
    diagnosticSamples: 0,
  };
}

function routeSample(course: CourseLayout, progress: number): CourseSample {
  const index = Math.floor(wrap(progress) * course.samples.length) % course.samples.length;
  const sample = course.samples[index];
  if (sample === undefined) throw new RangeError('Route performance probe requires course samples');
  return sample;
}

function forcedRacer(
  course: CourseLayout,
  racer: RacerSnapshot,
  progress: number,
  laneOffset: number,
  speed: number,
): RacerSnapshot {
  const sample = routeSample(course, progress);
  return Object.freeze({
    ...racer,
    x: sample.x + sample.normalX * laneOffset,
    z: sample.z + sample.normalZ * laneOffset,
    heading: headingFor(sample),
    speed,
    steering: Math.max(-1, Math.min(1, sample.curvature * 2.4)),
    travelDistance: wrap(progress) * course.totalLength,
    lap: 0,
    progress: wrap(progress),
    raceScore: wrap(progress),
    slipAngle: 0,
    drifting: false,
    impact: 0,
    elevation: 0,
    airborne: false,
    pitch: 0,
    curbImpact: 0,
    curbPenalty: 0,
  });
}

function reportBin(
  course: CourseLayout,
  bin: RouteBin,
  index: number,
  binCount: number,
): RoutePerformanceBinReport {
  const progressStart = index / binCount;
  const sample = routeSample(course, progressStart + 0.5 / binCount);
  return Object.freeze({
    bin: index,
    progressStart,
    progressEnd: (index + 1) / binCount,
    x: sample.x,
    z: sample.z,
    curvature: sample.curvature,
    frames: bin.frameMilliseconds.length,
    meanFrameMilliseconds: mean(bin.frameMilliseconds),
    p95FrameMilliseconds: percentile(bin.frameMilliseconds, 0.95),
    maximumFrameMilliseconds: Math.max(0, ...bin.frameMilliseconds),
    framesOver25Milliseconds: bin.frameMilliseconds.filter((value) => value > 25).length,
    framesOver50Milliseconds: bin.frameMilliseconds.filter((value) => value > 50).length,
    meanRenderCpuMilliseconds: mean(bin.renderCpuMilliseconds),
    p95RenderCpuMilliseconds: percentile(bin.renderCpuMilliseconds, 0.95),
    meanDrawCalls: bin.renderSamples === 0 ? 0 : bin.drawCalls / bin.renderSamples,
    meanTriangles: bin.renderSamples === 0 ? 0 : bin.triangles / bin.renderSamples,
    meanVisibleInstances: bin.diagnosticSamples === 0
      ? 0
      : bin.visibleInstances / bin.diagnosticSamples,
    meanSubmittedProxyMeshes: bin.diagnosticSamples === 0
      ? 0
      : bin.submittedProxyMeshes / bin.diagnosticSamples,
  });
}

/** Dev-only forced lap used to correlate render cost with course position. */
export class RoutePerformanceProbe {
  private readonly bins: RouteBin[];
  private routeFrames: readonly (readonly RacerSnapshot[])[] | null = null;
  private startedAtMilliseconds: number | null = null;
  private elapsedSeconds = 0;
  private latestProgress = 0;
  private recordedFrames = 0;
  private reported = false;

  public constructor(
    private readonly course: CourseLayout,
    private readonly binCount = DEFAULT_BIN_COUNT,
    private readonly secondsPerLap = DEFAULT_LAP_SECONDS,
    private readonly measuredLaps = DEFAULT_MEASURED_LAPS,
  ) {
    if (!Number.isInteger(binCount) || binCount < 4) {
      throw new RangeError('Route performance probe bin count must be an integer of at least four');
    }
    if (!(secondsPerLap > 0) || !(measuredLaps > 0)) {
      throw new RangeError('Route performance probe duration and lap count must be positive');
    }
    this.bins = Array.from({ length: binCount }, createBin);
  }

  public force(snapshot: RaceSnapshot, nowMilliseconds: number): RaceSnapshot {
    this.startedAtMilliseconds ??= nowMilliseconds;
    this.routeFrames ??= this.compileRouteFrames(snapshot.racers);
    this.elapsedSeconds = Math.max(0, (nowMilliseconds - this.startedAtMilliseconds) / 1_000);
    const measuredSeconds = Math.max(0, this.elapsedSeconds - WARMUP_SECONDS);
    this.latestProgress = this.elapsedSeconds < WARMUP_SECONDS
      ? 0
      : wrap(measuredSeconds / this.secondsPerLap);
    const frameIndex = Math.min(
      ROUTE_POSE_COUNT - 1,
      Math.floor(this.latestProgress * ROUTE_POSE_COUNT),
    );
    const racers = this.routeFrames[frameIndex];
    if (racers === undefined) throw new RangeError('Route performance probe frame is missing');
    const player = racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) throw new Error('Route performance probe requires a player racer');
    return Object.freeze({
      ...snapshot,
      phase: 'running',
      introProgress: 1,
      finishCinematicProgress: 0,
      presentationTime: this.elapsedSeconds,
      countdown: 0,
      elapsed: measuredSeconds,
      playerLap: 1,
      playerPosition: 1,
      playerSpeedKph: player.speed * 6.2,
      offRoad: false,
      drifting: false,
      impact: 0,
      impactObstacleId: null,
      respawning: false,
      racers,
    });
  }

  public shouldSampleDiagnostics(): boolean {
    return this.isRecording && this.recordedFrames % DIAGNOSTIC_SAMPLE_INTERVAL === 0;
  }

  public record(
    frameMilliseconds: number,
    renderCpuMilliseconds: number,
    render: DoodleRenderStats,
    diagnostics: InkedSolidSceneDiagnostics | null,
  ): boolean {
    if (!this.isRecording || this.isComplete) return false;
    const index = Math.min(this.binCount - 1, Math.floor(this.latestProgress * this.binCount));
    const bin = this.bins[index];
    if (bin === undefined) throw new RangeError('Route performance probe bin is missing');
    bin.frameMilliseconds.push(frameMilliseconds);
    bin.renderCpuMilliseconds.push(renderCpuMilliseconds);
    bin.drawCalls += render.drawCalls;
    bin.triangles += render.triangles;
    bin.renderSamples += 1;
    if (diagnostics !== null) {
      bin.visibleInstances += diagnostics.visibleInstances;
      bin.submittedProxyMeshes += diagnostics.submittedProxyMeshes;
      bin.diagnosticSamples += 1;
    }
    this.recordedFrames += 1;
    return this.isComplete;
  }

  public report(): RoutePerformanceProbeReport | null {
    if (!this.isComplete || this.reported) return null;
    this.reported = true;
    const bins = Object.freeze(this.bins.map((bin, index) => (
      reportBin(this.course, bin, index, this.binCount)
    )));
    const combined = createBin();
    for (const bin of this.bins) {
      combined.frameMilliseconds.push(...bin.frameMilliseconds);
      combined.renderCpuMilliseconds.push(...bin.renderCpuMilliseconds);
      combined.drawCalls += bin.drawCalls;
      combined.triangles += bin.triangles;
      combined.renderSamples += bin.renderSamples;
      combined.visibleInstances += bin.visibleInstances;
      combined.submittedProxyMeshes += bin.submittedProxyMeshes;
      combined.diagnosticSamples += bin.diagnosticSamples;
    }
    return Object.freeze({
      binCount: this.binCount,
      measuredLaps: this.measuredLaps,
      secondsPerLap: this.secondsPerLap,
      frames: this.recordedFrames,
      summary: reportBin(this.course, combined, 0, 1),
      bins,
    });
  }

  private get isRecording(): boolean {
    return this.startedAtMilliseconds !== null && this.elapsedSeconds >= WARMUP_SECONDS;
  }

  private get isComplete(): boolean {
    return this.startedAtMilliseconds !== null
      && this.elapsedSeconds >= WARMUP_SECONDS + this.secondsPerLap * this.measuredLaps;
  }

  private compileRouteFrames(
    racers: readonly RacerSnapshot[],
  ): readonly (readonly RacerSnapshot[])[] {
    const speed = this.course.totalLength / this.secondsPerLap;
    return Object.freeze(Array.from({ length: ROUTE_POSE_COUNT }, (_, frameIndex) => {
      const progress = frameIndex / ROUTE_POSE_COUNT;
      return Object.freeze(racers.map((racer, racerIndex) => forcedRacer(
        this.course,
        racer,
        progress - racerIndex * 0.026,
        racer.isPlayer ? 0 : racerIndex % 2 === 0 ? -1.15 : 1.15,
        speed * (1 - racerIndex * 0.018),
      )));
    }));
  }
}
