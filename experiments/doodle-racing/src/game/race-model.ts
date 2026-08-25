import * as THREE from 'three';

import {
  createArcadeVehicleState,
  stepArcadeVehicle,
  vehicleSpeed,
  type ArcadeDriveInput,
  type ArcadeVehicleState,
} from './arcade-vehicle-physics.js';
import {
  nearestCoursePoint,
  sampleCourseAt,
  type CourseLayout,
  type CourseProjection,
} from './course.js';
import {
  advanceRaceRouteProgress,
  createRaceRouteProgress,
  lastValidatedCheckpointProgress,
  projectRaceRouteProgress,
  type RaceRouteProgress,
} from './race-progress.js';
import {
  createVehicleCollisionProfile,
  resolveObstacleCollisions,
  type VehicleCollisionProfile,
} from './obstacle-collision.js';
import type { RaceWorldLayout } from './race-world.js';
import {
  PAPER_CIRCUIT_VEHICLES,
  createPaperCircuitVehicleIdentity,
} from './vehicle-field.js';

export const RACE_LAP_OPTIONS = Object.freeze([3, 5, 10, 20] as const);
export type RaceLapCount = (typeof RACE_LAP_OPTIONS)[number];
export const DEFAULT_RACE_LAPS: RaceLapCount = 5;

export type RaceStartOptions = Readonly<{
  laps?: RaceLapCount;
}>;

export type RacePhase = 'menu' | 'intro' | 'countdown' | 'running' | 'paused' | 'finished';
export type DriveInput = ArcadeDriveInput;
/** Optional actions consumed by the free-roam character, ignored by vehicles. */
export type ExploreInput = Readonly<DriveInput & {
  run?: boolean;
  jump?: boolean;
  interact?: boolean;
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
  slipAngle: number;
  drifting: boolean;
  impact: number;
  elevation: number;
  pitch: number;
  curbImpact: number;
  curbPenalty: number;
}>;

export type RaceSnapshot = Readonly<{
  phase: RacePhase;
  introProgress: number;
  finishCinematicProgress: number;
  presentationTime: number;
  countdown: number;
  elapsed: number;
  totalLaps: number;
  playerLap: number;
  playerPosition: number;
  playerSpeedKph: number;
  offRoad: boolean;
  drifting: boolean;
  driftScore: number;
  driftChain: number;
  driftMultiplier: number;
  impact: number;
  impactObstacleId: string | null;
  respawning: boolean;
  racers: readonly RacerSnapshot[];
}>;

type MutableRacer = {
  id: string;
  name: string;
  isPlayer: boolean;
  vehicle: ArcadeVehicleState;
  route: RaceRouteProgress;
  laneOffset: number;
  pace: number;
};

const INTRO_SECONDS = 6;
const FINISH_CINEMATIC_SECONDS = 8;
const COUNTDOWN_SECONDS = 3;
const PLAYER_ID = 'you';

function headingFor(tangentX: number, tangentZ: number): number {
  return Math.atan2(-tangentZ, tangentX);
}

function snapshotOf(racer: MutableRacer): RacerSnapshot {
  return Object.freeze({
    id: racer.id,
    name: racer.name,
    isPlayer: racer.isPlayer,
    x: racer.vehicle.x,
    z: racer.vehicle.z,
    heading: racer.vehicle.heading,
    speed: vehicleSpeed(racer.vehicle),
    steering: racer.vehicle.steering,
    travelDistance: racer.vehicle.travelDistance,
    lap: racer.route.lap,
    progress: racer.route.progress,
    raceScore: racer.route.raceScore,
    slipAngle: racer.vehicle.slipAngle,
    drifting: racer.vehicle.drifting,
    impact: racer.vehicle.impact,
    elevation: racer.vehicle.elevation,
    pitch: racer.vehicle.pitch,
    curbImpact: racer.vehicle.curbImpact,
    curbPenalty: racer.vehicle.curbPenalty,
  });
}

export class RaceSimulation {
  private racers: MutableRacer[] = [];
  private readonly collisionProfiles = new Map<string, VehicleCollisionProfile>();
  private phase: RacePhase = 'menu';
  private phaseBeforePause: 'intro' | 'countdown' | 'running' = 'intro';
  private introElapsed = 0;
  private presentationTime = 0;
  private finishElapsed = 0;
  private countdown = COUNTDOWN_SECONDS;
  private elapsed = 0;
  private totalLaps: RaceLapCount = DEFAULT_RACE_LAPS;
  private offRoad = false;
  private lostTime = 0;
  private respawnRemaining = 0;
  private driftScore = 0;
  private driftChain = 0;
  private driftGrace = 0;
  private impactObstacleId: string | null = null;

  public constructor(
    private readonly course: CourseLayout,
    private readonly world: RaceWorldLayout,
  ) {
    for (const vehicle of PAPER_CIRCUIT_VEHICLES) {
      this.collisionProfiles.set(vehicle.id, createVehicleCollisionProfile(
        createPaperCircuitVehicleIdentity(vehicle.id, vehicle.seed),
      ));
    }
    this.openMenu();
  }

  public setCollisionProfile(vehicleId: string, profile: VehicleCollisionProfile): void {
    if (!this.collisionProfiles.has(vehicleId)) throw new Error(`Unknown race vehicle: ${vehicleId}`);
    this.collisionProfiles.set(vehicleId, profile);
  }

  public start(options: RaceStartOptions = {}): void {
    this.totalLaps = options.laps ?? DEFAULT_RACE_LAPS;
    this.resetRaceState();
    this.phase = 'intro';
  }

  public openMenu(): void {
    this.totalLaps = DEFAULT_RACE_LAPS;
    this.resetRaceState();
    this.phase = 'menu';
  }

  public reset(): void {
    this.openMenu();
  }

  private resetRaceState(): void {
    this.phase = 'intro';
    this.phaseBeforePause = 'intro';
    this.introElapsed = 0;
    this.presentationTime = 0;
    this.finishElapsed = 0;
    this.countdown = COUNTDOWN_SECONDS;
    this.elapsed = 0;
    this.offRoad = false;
    this.lostTime = 0;
    this.respawnRemaining = 0;
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftGrace = 0;
    this.impactObstacleId = null;
    this.racers = [
      this.createRacer(PLAYER_ID, 'You', true, 0.046, -1.35, 0),
      this.createRacer('mica', 'Mica', false, 0.032, 1.35, 27),
      this.createRacer('rook', 'Rook', false, 0.018, -1.35, 26.2),
      this.createRacer('pip', 'Pip', false, 0.004, 1.35, 25.4),
    ];
  }

  public togglePause(): RacePhase {
    if (this.phase === 'menu' || this.phase === 'finished') return this.phase;
    if (this.phase === 'paused') this.phase = this.phaseBeforePause;
    else {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
    }
    return this.phase;
  }

  public pause(): void {
    if (this.phase !== 'intro' && this.phase !== 'countdown' && this.phase !== 'running') return;
    this.phaseBeforePause = this.phase;
    this.phase = 'paused';
  }

  public update(deltaSeconds: number, input: DriveInput): RaceSnapshot {
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, 0.05);
    if (this.phase !== 'paused') this.presentationTime += delta;
    if (this.phase === 'intro') {
      this.introElapsed = Math.min(INTRO_SECONDS, this.introElapsed + delta);
      if (this.introElapsed === INTRO_SECONDS) this.phase = 'countdown';
    } else if (this.phase === 'countdown') {
      this.countdown = Math.max(0, this.countdown - delta);
      if (this.countdown === 0) this.phase = 'running';
    } else if (this.phase === 'running') {
      this.elapsed += delta;
      this.updatePlayer(delta, input);
      this.updateOpponents(delta);
      if (this.player().route.lap >= this.totalLaps) this.phase = 'finished';
    } else if (this.phase === 'finished') {
      this.finishElapsed = Math.min(
        FINISH_CINEMATIC_SECONDS,
        this.finishElapsed + delta,
      );
    }
    return this.snapshot();
  }

  public snapshot(): RaceSnapshot {
    const racers = Object.freeze(this.racers.map(snapshotOf));
    const player = racers.find(({ id }) => id === PLAYER_ID) as RacerSnapshot;
    const ordered = [...racers].sort((left, right) => right.raceScore - left.raceScore);
    return Object.freeze({
      phase: this.phase,
      introProgress: this.introElapsed / INTRO_SECONDS,
      finishCinematicProgress: this.finishElapsed / FINISH_CINEMATIC_SECONDS,
      presentationTime: this.presentationTime,
      countdown: this.countdown,
      elapsed: this.elapsed,
      totalLaps: this.totalLaps,
      playerLap: Math.min(this.totalLaps, player.lap + 1),
      playerPosition: ordered.findIndex(({ id }) => id === PLAYER_ID) + 1,
      playerSpeedKph: player.speed * 6.2,
      offRoad: this.offRoad,
      drifting: player.drifting,
      driftScore: Math.floor(this.driftScore),
      driftChain: Math.floor(this.driftChain),
      driftMultiplier: 1 + Math.min(3, Math.floor(this.driftChain / 260) * 0.5),
      impact: player.impact,
      impactObstacleId: this.impactObstacleId,
      respawning: this.respawnRemaining > 0,
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
      vehicle: createArcadeVehicleState(
        coursePoint.x + coursePoint.normalX * laneOffset,
        coursePoint.z + coursePoint.normalZ * laneOffset,
        headingFor(coursePoint.tangentX, coursePoint.tangentZ),
      ),
      route: createRaceRouteProgress(this.course, progress),
      laneOffset,
      pace,
    };
  }

  private updatePlayer(delta: number, input: DriveInput): void {
    const player = this.player();
    if (this.respawnRemaining > 0) {
      this.respawnRemaining = Math.max(0, this.respawnRemaining - delta);
      return;
    }
    const previousVehicle = player.vehicle;
    const before = nearestCoursePoint(this.course, previousVehicle.x, previousVehicle.z);
    const surface = before.distanceFromCentre <= this.course.trackWidth * 0.5 - 0.34
      ? 'road'
      : 'off-road';
    const stepped = stepArcadeVehicle(player.vehicle, input, surface, delta);
    const collisionProfile = this.collisionProfile(player.id);
    const collision = resolveObstacleCollisions(
      player.vehicle,
      stepped,
      this.world.obstacles,
      collisionProfile,
    );
    player.vehicle = collision.state;
    this.impactObstacleId = collision.obstacleId;

    const projection = nearestCoursePoint(this.course, player.vehicle.x, player.vehicle.z);
    this.offRoad = projection.distanceFromCentre > this.course.trackWidth * 0.5 - 0.34;
    this.updateDrift(delta, player.vehicle);
    this.updatePlayerProgress(player, previousVehicle, projection);
    this.updateRespawn(delta, player, projection);
  }

  private updateDrift(delta: number, vehicle: ArcadeVehicleState): void {
    if (vehicle.drifting) {
      const gain = Math.abs(vehicle.slipAngle) * vehicleSpeed(vehicle) * delta * 21;
      const multiplier = 1 + Math.min(3, Math.floor(this.driftChain / 260) * 0.5);
      this.driftChain += gain;
      this.driftScore += gain * multiplier;
      this.driftGrace = 0.85;
      return;
    }
    this.driftGrace = Math.max(0, this.driftGrace - delta);
    if (this.driftGrace === 0) this.driftChain = 0;
  }

  private updatePlayerProgress(
    player: MutableRacer,
    previousVehicle: ArcadeVehicleState,
    projection: CourseProjection,
  ): void {
    player.route = advanceRaceRouteProgress(
      this.course,
      player.route,
      previousVehicle,
      player.vehicle,
      projection.progress,
    );
  }

  private updateRespawn(
    delta: number,
    player: MutableRacer,
    projection: CourseProjection,
  ): void {
    const lost = projection.distanceFromCentre > this.course.trackWidth * 0.5 + 11;
    this.lostTime = lost ? this.lostTime + delta : 0;
    if (this.lostTime < 1.15) return;
    const safeProgress = lastValidatedCheckpointProgress(this.course, player.route);
    const safe = sampleCourseAt(this.course, safeProgress);
    player.vehicle = createArcadeVehicleState(
      safe.x,
      safe.z,
      headingFor(safe.tangentX, safe.tangentZ),
    );
    player.route = projectRaceRouteProgress(this.course, player.route, safeProgress);
    this.lostTime = 0;
    this.respawnRemaining = 0.7;
    this.impactObstacleId = 'respawn';
  }

  private updateOpponents(delta: number): void {
    for (const racer of this.racers) {
      if (racer.isPlayer) continue;
      const previousVehicle = racer.vehicle;
      const projection = nearestCoursePoint(this.course, racer.vehicle.x, racer.vehicle.z);
      const speed = vehicleSpeed(racer.vehicle);
      const lookAhead = 5.2 + speed * 0.42;
      const target = sampleCourseAt(
        this.course,
        projection.progress + lookAhead / this.course.totalLength,
      );
      const targetX = target.x + target.normalX * racer.laneOffset;
      const targetZ = target.z + target.normalZ * racer.laneOffset;
      const desiredHeading = Math.atan2(-(targetZ - racer.vehicle.z), targetX - racer.vehicle.x);
      const headingError = THREE.MathUtils.euclideanModulo(
        desiredHeading - racer.vehicle.heading + Math.PI,
        Math.PI * 2,
      ) - Math.PI;
      const cornerPenalty = Math.min(0.38, Math.abs(target.curvature) * 6.4);
      const targetSpeed = racer.pace * (1 - cornerPenalty);
      const input: DriveInput = Object.freeze({
        accelerate: speed < targetSpeed,
        brake: speed > targetSpeed + 1.2,
        left: headingError > 0.035,
        right: headingError < -0.035,
        handbrake: Math.abs(headingError) > 0.58 && speed > 16,
      });
      const surface = projection.distanceFromCentre <= this.course.trackWidth * 0.5 - 0.34
        ? 'road'
        : 'off-road';
      const stepped = stepArcadeVehicle(racer.vehicle, input, surface, delta);
      racer.vehicle = resolveObstacleCollisions(
        racer.vehicle,
        stepped,
        this.world.obstacles,
        this.collisionProfile(racer.id),
      ).state;
      const nextProjection = nearestCoursePoint(this.course, racer.vehicle.x, racer.vehicle.z);
      racer.route = advanceRaceRouteProgress(
        this.course,
        racer.route,
        previousVehicle,
        racer.vehicle,
        nextProjection.progress,
      );
    }
  }

  private player(): MutableRacer {
    return this.racers[0] as MutableRacer;
  }

  private collisionProfile(vehicleId: string): VehicleCollisionProfile {
    const profile = this.collisionProfiles.get(vehicleId);
    if (profile === undefined) throw new Error(`Missing collision profile for race vehicle: ${vehicleId}`);
    return profile;
  }
}
