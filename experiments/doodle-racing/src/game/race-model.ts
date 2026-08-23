import * as THREE from 'three';

import {
  nearestCoursePoint,
  sampleCourseAt,
  type CourseLayout,
} from './course.js';

export type RacePhase = 'countdown' | 'running' | 'paused' | 'finished';

export type DriveInput = Readonly<{
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}>;

export type RacerSnapshot = Readonly<{
  id: string;
  name: string;
  isPlayer: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  steering: number;
  travelDistance: number;
  lap: number;
  progress: number;
  raceScore: number;
}>;

export type RaceSnapshot = Readonly<{
  phase: RacePhase;
  countdown: number;
  elapsed: number;
  totalLaps: number;
  playerLap: number;
  playerPosition: number;
  offRoad: boolean;
  racers: readonly RacerSnapshot[];
}>;

type MutableRacer = {
  id: string;
  name: string;
  isPlayer: boolean;
  x: number;
  z: number;
  heading: number;
  speed: number;
  steering: number;
  travelDistance: number;
  lap: number;
  progress: number;
  previousProgress: number;
  raceProgress: number;
  laneOffset: number;
  pace: number;
};

const TOTAL_LAPS = 3;
const COUNTDOWN_SECONDS = 3;
const PLAYER_ID = 'you';

function headingFor(tangentX: number, tangentZ: number): number {
  return Math.atan2(-tangentZ, tangentX);
}

function approachZero(value: number, amount: number): number {
  if (Math.abs(value) <= amount) return 0;
  return value - Math.sign(value) * amount;
}

function snapshotOf(racer: MutableRacer): RacerSnapshot {
  return Object.freeze({
    id: racer.id,
    name: racer.name,
    isPlayer: racer.isPlayer,
    x: racer.x,
    z: racer.z,
    heading: racer.heading,
    speed: racer.speed,
    steering: racer.steering,
    travelDistance: racer.travelDistance,
    lap: racer.lap,
    progress: racer.progress,
    raceScore: racer.lap + racer.progress,
  });
}

export class RaceSimulation {
  private racers: MutableRacer[] = [];
  private phase: RacePhase = 'countdown';
  private phaseBeforePause: 'countdown' | 'running' = 'countdown';
  private countdown = COUNTDOWN_SECONDS;
  private elapsed = 0;
  private offRoad = false;

  public constructor(private readonly course: CourseLayout) {
    this.reset();
  }

  public reset(): void {
    this.phase = 'countdown';
    this.phaseBeforePause = 'countdown';
    this.countdown = COUNTDOWN_SECONDS;
    this.elapsed = 0;
    this.offRoad = false;
    this.racers = [
      this.createRacer(PLAYER_ID, 'You', true, 0.046, -0.72, 0),
      this.createRacer('mica', 'Mica', false, 0.032, 0.72, 9.6),
      this.createRacer('rook', 'Rook', false, 0.018, -0.72, 9.15),
      this.createRacer('pip', 'Pip', false, 0.004, 0.72, 8.82),
    ];
  }

  public togglePause(): RacePhase {
    if (this.phase === 'finished') return this.phase;
    if (this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
    } else {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
    }
    return this.phase;
  }

  public pause(): void {
    if (this.phase === 'countdown' || this.phase === 'running') {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
    }
  }

  public update(deltaSeconds: number, input: DriveInput): RaceSnapshot {
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05);
    if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - delta);
      if (this.countdown === 0) this.phase = 'running';
    } else if (this.phase === 'running') {
      this.elapsed += delta;
      this.updatePlayer(delta, input);
      this.updateOpponents(delta);
      const player = this.player();
      if (player.lap >= TOTAL_LAPS) this.phase = 'finished';
    }
    return this.snapshot();
  }

  public snapshot(): RaceSnapshot {
    const racers = Object.freeze(this.racers.map(snapshotOf));
    const player = racers.find(({ id }) => id === PLAYER_ID) as RacerSnapshot;
    const ordered = [...racers].sort((left, right) => right.raceScore - left.raceScore);
    return Object.freeze({
      phase: this.phase,
      countdown: this.countdown,
      elapsed: this.elapsed,
      totalLaps: TOTAL_LAPS,
      playerLap: Math.min(TOTAL_LAPS, player.lap + 1),
      playerPosition: ordered.findIndex(({ id }) => id === PLAYER_ID) + 1,
      offRoad: this.offRoad,
      racers,
    });
  }

  private createRacer(
    id: string,
    name: string,
    isPlayer: boolean,
    progress: number,
    laneOffset: number,
    pace: number,
  ): MutableRacer {
    const coursePoint = sampleCourseAt(this.course, progress);
    return {
      id,
      name,
      isPlayer,
      x: coursePoint.x + coursePoint.normalX * laneOffset,
      z: coursePoint.z + coursePoint.normalZ * laneOffset,
      heading: headingFor(coursePoint.tangentX, coursePoint.tangentZ),
      speed: 0,
      steering: 0,
      travelDistance: 0,
      lap: 0,
      progress,
      previousProgress: progress,
      raceProgress: progress,
      laneOffset,
      pace,
    };
  }

  private updatePlayer(delta: number, input: DriveInput): void {
    const player = this.player();
    const drive = Number(input.accelerate) - Number(input.brake);
    if (drive > 0) player.speed += (player.speed < 0 ? 13 : 8.8) * delta;
    else if (drive < 0) player.speed -= (player.speed > 0 ? 14 : 6.4) * delta;
    else player.speed = approachZero(player.speed, 3.2 * delta);

    const steering = Number(input.left) - Number(input.right);
    player.steering = THREE.MathUtils.lerp(player.steering, steering, 1 - Math.exp(-11 * delta));
    const speedRatio = THREE.MathUtils.clamp(player.speed / 8, -1, 1);
    player.heading += player.steering * speedRatio * 1.72 * delta;
    player.speed = THREE.MathUtils.clamp(player.speed, -4.2, this.offRoad ? 6.2 : 12.1);
    player.x += Math.cos(player.heading) * player.speed * delta;
    player.z -= Math.sin(player.heading) * player.speed * delta;
    player.travelDistance += player.speed * delta;

    const projection = nearestCoursePoint(this.course, player.x, player.z);
    this.offRoad = projection.distanceFromCentre > this.course.trackWidth * 0.5 - 0.55;
    if (this.offRoad) player.speed *= Math.exp(-2.2 * delta);
    const recoveryDistance = this.course.trackWidth * 0.5 + 2.1;
    if (projection.distanceFromCentre > recoveryDistance) {
      const recovery = 1 - Math.exp(-2.5 * delta);
      player.x = THREE.MathUtils.lerp(player.x, projection.x, recovery);
      player.z = THREE.MathUtils.lerp(player.z, projection.z, recovery);
    }

    if (player.previousProgress > 0.82 && projection.progress < 0.18 && player.speed > 1) {
      player.lap += 1;
    } else if (
      player.previousProgress < 0.18
      && projection.progress > 0.82
      && player.speed < -1
    ) {
      player.lap = Math.max(0, player.lap - 1);
    }
    player.previousProgress = projection.progress;
    player.progress = projection.progress;
    player.raceProgress = player.lap + player.progress;
  }

  private updateOpponents(delta: number): void {
    for (const racer of this.racers) {
      if (racer.isPlayer) continue;
      const paceVariation = Math.sin(this.elapsed * 0.73 + racer.pace) * 0.34;
      const speed = racer.pace + paceVariation;
      racer.raceProgress += speed * delta / this.course.totalLength;
      racer.lap = Math.max(0, Math.floor(racer.raceProgress));
      racer.progress = THREE.MathUtils.euclideanModulo(racer.raceProgress, 1);
      racer.speed = speed;
      racer.travelDistance += speed * delta;
      const point = sampleCourseAt(this.course, racer.progress);
      const weave = Math.sin(this.elapsed * 0.52 + racer.pace * 1.7) * 0.18;
      const lane = racer.laneOffset + weave;
      racer.x = point.x + point.normalX * lane;
      racer.z = point.z + point.normalZ * lane;
      racer.heading = headingFor(point.tangentX, point.tangentZ);
      racer.steering = Math.sin(this.elapsed * 0.84 + racer.pace) * 0.22;
    }
  }

  private player(): MutableRacer {
    return this.racers[0] as MutableRacer;
  }
}
