import type { RacerSnapshot } from '../../race-model.js';
import type { TracksideSpectatorPlacement } from '../../race-world.js';
import { tracksideReactionFor } from '../shared/crowd-steering.js';

export type TracksideAmbientMode = 'idle' | 'watching' | 'fleeing' | 'returning';

const FLEE_SPEED = 4.8;
const RETURN_SPEED = 1.35;
const PANIC_HOLD_SECONDS = 1.15;
const ESCAPE_REPLAN_SECONDS = 0.38;
const MAXIMUM_HOME_DISTANCE = 8;

function normalized(x: number, z: number): Readonly<{ x: number; z: number }> {
  const length = Math.hypot(x, z);
  return length <= 1e-6
    ? Object.freeze({ x: 0, z: 1 })
    : Object.freeze({ x: x / length, z: z / length });
}

function turnToward(current: number, target: number, maximumStep: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  return current + Math.max(-maximumStep, Math.min(maximumStep, difference));
}

/**
 * Owns the reversible roadside-spectator state machine. Rendering remains in
 * TracksideCrowdField; threat response, escape replanning, and returning home
 * stay local to this character role.
 */
export class TracksideSpectatorBehavior {
  public x: number;
  public z: number;
  public heading: number;
  public mode: TracksideAmbientMode = 'idle';

  private panicUntil = 0;
  private nextEscapeReplanAt = 0;
  private threatVehicleId: string | null = null;
  private escapeX: number;
  private escapeZ: number;
  private escapePlan = 0;

  public constructor(
    public readonly placement: TracksideSpectatorPlacement,
    initialHeading = placement.heading,
  ) {
    this.x = placement.x;
    this.z = placement.z;
    this.heading = initialHeading;
    this.escapeX = placement.outwardX;
    this.escapeZ = placement.outwardZ;
  }

  public update(
    elapsedSeconds: number,
    deltaSeconds: number,
    racers: readonly RacerSnapshot[],
  ): TracksideAmbientMode {
    const reaction = tracksideReactionFor(this.placement, this.x, this.z, racers);
    if (reaction.mode === 'fleeing') {
      if (
        reaction.vehicleId !== this.threatVehicleId
        || elapsedSeconds >= this.nextEscapeReplanAt
      ) {
        this.replanEscape(reaction.vehicleId, racers);
        this.nextEscapeReplanAt = elapsedSeconds + ESCAPE_REPLAN_SECONDS;
      }
      this.threatVehicleId = reaction.vehicleId;
      this.panicUntil = elapsedSeconds + PANIC_HOLD_SECONDS;
    }

    if (this.panicUntil > elapsedSeconds) {
      this.moveAlongEscape(deltaSeconds);
      this.mode = 'fleeing';
      return this.mode;
    }

    this.threatVehicleId = null;
    const homeX = this.placement.x - this.x;
    const homeZ = this.placement.z - this.z;
    const homeDistance = Math.hypot(homeX, homeZ);
    if (homeDistance > 0.035) {
      const step = Math.min(homeDistance, Math.max(0, deltaSeconds) * RETURN_SPEED);
      this.x += homeX / homeDistance * step;
      this.z += homeZ / homeDistance * step;
      this.heading = turnToward(
        this.heading,
        Math.atan2(homeX, homeZ),
        Math.max(0, deltaSeconds) * 6.2,
      );
      this.mode = 'returning';
      return this.mode;
    }

    this.x = this.placement.x;
    this.z = this.placement.z;
    this.heading = turnToward(
      this.heading,
      reaction.heading,
      Math.max(0, deltaSeconds) * 5.8,
    );
    this.mode = reaction.mode;
    return this.mode;
  }

  public setWorldState(x: number, z: number, heading = this.heading): void {
    this.x = x;
    this.z = z;
    this.heading = heading;
  }

  private replanEscape(
    vehicleId: string | null,
    racers: readonly RacerSnapshot[],
  ): void {
    const threat = racers.find(({ id }) => id === vehicleId);
    const awayX = threat === undefined ? this.placement.outwardX : this.x - threat.x;
    const awayZ = threat === undefined ? this.placement.outwardZ : this.z - threat.z;
    const away = normalized(awayX, awayZ);
    const tangentX = -this.placement.outwardZ;
    const tangentZ = this.placement.outwardX;
    const side = (this.escapePlan + Math.abs(this.placement.seed)) % 2 === 0 ? 1 : -1;
    this.escapePlan += 1;

    const homeDistance = Math.hypot(
      this.x - this.placement.x,
      this.z - this.placement.z,
    );
    const boundaryWeight = Math.max(0, (homeDistance - MAXIMUM_HOME_DISTANCE * 0.72) * 0.55);
    const planned = normalized(
      away.x * 1.35
        + this.placement.outwardX * 0.8
        + tangentX * side * 0.32
        + (this.placement.x - this.x) * boundaryWeight,
      away.z * 1.35
        + this.placement.outwardZ * 0.8
        + tangentZ * side * 0.32
        + (this.placement.z - this.z) * boundaryWeight,
    );
    this.escapeX = planned.x;
    this.escapeZ = planned.z;
  }

  private moveAlongEscape(deltaSeconds: number): void {
    const step = Math.max(0, deltaSeconds) * FLEE_SPEED;
    let nextX = this.x + this.escapeX * step;
    let nextZ = this.z + this.escapeZ * step;
    const homeX = nextX - this.placement.x;
    const homeZ = nextZ - this.placement.z;
    const homeDistance = Math.hypot(homeX, homeZ);
    if (homeDistance > MAXIMUM_HOME_DISTANCE) {
      nextX = this.placement.x + homeX / homeDistance * MAXIMUM_HOME_DISTANCE;
      nextZ = this.placement.z + homeZ / homeDistance * MAXIMUM_HOME_DISTANCE;
    }
    this.x = nextX;
    this.z = nextZ;
    this.heading = turnToward(
      this.heading,
      Math.atan2(this.escapeX, this.escapeZ),
      Math.max(0, deltaSeconds) * 9,
    );
  }
}
