import * as THREE from 'three';

import {
  createArcadeVehicleState,
  stepArcadeVehicle,
  vehicleSpeed,
  type ArcadeVehicleState,
} from './arcade-vehicle-physics.js';
import {
  nearestCoursePoint,
  sampleCourseAt,
  type CourseLayout,
} from './course.js';
import {
  createVehicleCollisionProfile,
  resolveObstacleCollisions,
  type VehicleCollisionProfile,
} from './obstacle-collision.js';
import type { ExploreInput, RacerSnapshot } from './race-model.js';
import type { RaceWorldLayout } from './race-world.js';
import {
  PAPER_CIRCUIT_VEHICLES,
  createPaperCircuitVehicleIdentity,
  type ExploreVehicleEntry,
  type PaperCircuitVehicleId,
} from './vehicle-field.js';

const PARKING_PROGRESS = Object.freeze([0.046, 0.032, 0.018, 0.004]);
const PARKING_LANE_OFFSET = Object.freeze([-1.35, 1.35, -1.35, 1.35]);
const MAP_EDGE_MARGIN = 1.1;
const EXIT_MAXIMUM_SPEED = 1.2;

export type ExploreDriveFrame = Readonly<{
  racers: readonly RacerSnapshot[];
  activeVehicleId: PaperCircuitVehicleId | null;
  activeRacer: RacerSnapshot | null;
  activeSide: 'left' | 'right' | null;
  entered: ExploreVehicleEntry | null;
  exited: ExploreVehicleEntry | null;
}>;

function headingFor(tangentX: number, tangentZ: number): number {
  return Math.atan2(-tangentZ, tangentX);
}

export class ExploreDriveController {
  private readonly vehicles = new Map<PaperCircuitVehicleId, ArcadeVehicleState>();
  private readonly collisionProfiles = new Map<PaperCircuitVehicleId, VehicleCollisionProfile>();
  private activeVehicleId: PaperCircuitVehicleId | null = null;
  private activeSide: 'left' | 'right' = 'left';
  private interactLatch = false;

  public constructor(
    private readonly course: CourseLayout,
    private readonly world: RaceWorldLayout,
    collisionProfileFor: (vehicleId: string) => VehicleCollisionProfile = (vehicleId) => {
      const recipe = PAPER_CIRCUIT_VEHICLES.find(({ id }) => id === vehicleId);
      if (recipe === undefined) throw new Error(`Missing Paper Circuit vehicle: ${vehicleId}`);
      return createVehicleCollisionProfile(
        createPaperCircuitVehicleIdentity(recipe.id, recipe.seed),
      );
    },
  ) {
    for (const vehicle of PAPER_CIRCUIT_VEHICLES) {
      this.collisionProfiles.set(vehicle.id, collisionProfileFor(vehicle.id));
    }
    this.reset();
  }

  public get isDriving(): boolean {
    return this.activeVehicleId !== null;
  }

  public reset(): void {
    this.vehicles.clear();
    PAPER_CIRCUIT_VEHICLES.forEach((vehicle, index) => {
      const sample = sampleCourseAt(this.course, PARKING_PROGRESS[index] ?? 0);
      const laneOffset = PARKING_LANE_OFFSET[index] ?? 0;
      this.vehicles.set(vehicle.id, createArcadeVehicleState(
        sample.x + sample.normalX * laneOffset,
        sample.z + sample.normalZ * laneOffset,
        headingFor(sample.tangentX, sample.tangentZ),
      ));
    });
    this.activeVehicleId = null;
    this.activeSide = 'left';
    this.interactLatch = false;
  }

  public setCollisionProfile(
    vehicleId: PaperCircuitVehicleId,
    profile: VehicleCollisionProfile,
  ): void {
    if (!this.vehicles.has(vehicleId)) throw new Error(`Unknown Explore vehicle: ${vehicleId}`);
    this.collisionProfiles.set(vehicleId, profile);
  }

  public update(
    deltaSeconds: number,
    input: ExploreInput,
    entry: ExploreVehicleEntry | null,
  ): ExploreDriveFrame {
    const interactRequested = input.interact === true;
    const interactPressed = interactRequested && !this.interactLatch;
    this.interactLatch = interactRequested;
    let entered: ExploreVehicleEntry | null = null;
    let exited: ExploreVehicleEntry | null = null;

    if (this.activeVehicleId === null) {
      if (interactPressed && entry !== null) {
        this.activeVehicleId = entry.vehicleId;
        this.activeSide = entry.side;
        entered = entry;
      }
    } else {
      const active = this.vehicles.get(this.activeVehicleId);
      if (active !== undefined && interactPressed && vehicleSpeed(active) <= EXIT_MAXIMUM_SPEED) {
        exited = Object.freeze({
          vehicleId: this.activeVehicleId,
          side: this.activeSide,
          distance: 0,
        });
        this.activeVehicleId = null;
      }
    }

    const activeVehicleId = this.activeVehicleId;
    if (activeVehicleId !== null && entered === null) {
      const active = this.vehicles.get(activeVehicleId);
      if (active !== undefined) {
        const projection = nearestCoursePoint(this.course, active.x, active.z);
        const surface = projection.distanceFromCentre <= this.course.trackWidth * 0.5 - 0.34
          ? 'road'
          : 'off-road';
        const stepped = stepArcadeVehicle(active, input, surface, deltaSeconds);
        const collisionProfile = this.collisionProfiles.get(activeVehicleId);
        if (collisionProfile === undefined) {
          throw new Error(`Missing collision profile for Explore vehicle: ${activeVehicleId}`);
        }
        const collided = resolveObstacleCollisions(
          active,
          stepped,
          this.world.obstacles,
          collisionProfile,
        ).state;
        const clampedX = THREE.MathUtils.clamp(
          collided.x,
          this.course.bounds.minimumX + MAP_EDGE_MARGIN,
          this.course.bounds.maximumX - MAP_EDGE_MARGIN,
        );
        const clampedZ = THREE.MathUtils.clamp(
          collided.z,
          this.course.bounds.minimumZ + MAP_EDGE_MARGIN,
          this.course.bounds.maximumZ - MAP_EDGE_MARGIN,
        );
        this.vehicles.set(activeVehicleId, Object.freeze({
          ...collided,
          x: clampedX,
          z: clampedZ,
          velocityX: clampedX === collided.x ? collided.velocityX : 0,
          velocityZ: clampedZ === collided.z ? collided.velocityZ : 0,
        }));
      }
    }

    return this.frame(entered, exited);
  }

  public frame(
    entered: ExploreVehicleEntry | null = null,
    exited: ExploreVehicleEntry | null = null,
  ): ExploreDriveFrame {
    const racers = Object.freeze(PAPER_CIRCUIT_VEHICLES.map((vehicle) => {
      const state = this.vehicles.get(vehicle.id);
      if (state === undefined) throw new Error(`Missing Explore vehicle state: ${vehicle.id}`);
      const projection = nearestCoursePoint(this.course, state.x, state.z);
      return Object.freeze({
        id: vehicle.id,
        name: vehicle.name,
        isPlayer: vehicle.id === this.activeVehicleId,
        x: state.x,
        z: state.z,
        heading: state.heading,
        elevation: state.elevation,
        pitch: state.pitch,
        curbImpact: state.curbImpact,
        curbPenalty: state.curbPenalty,
        speed: vehicleSpeed(state),
        steering: state.steering,
        travelDistance: state.travelDistance,
        lap: 0,
        progress: projection.progress,
        raceScore: projection.progress,
        slipAngle: state.slipAngle,
        drifting: state.drifting,
        impact: state.impact,
      } satisfies RacerSnapshot);
    }));
    return Object.freeze({
      racers,
      activeVehicleId: this.activeVehicleId,
      activeRacer: racers.find(({ id }) => id === this.activeVehicleId) ?? null,
      activeSide: this.activeVehicleId === null ? null : this.activeSide,
      entered,
      exited,
    });
  }
}
