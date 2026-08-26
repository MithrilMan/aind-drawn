import {
  vehicleSpeed,
  type ArcadeDriveInput,
  type ArcadeVehicleState,
} from './arcade-vehicle-physics.js';
import {
  obstacleClearance,
  type VehicleCollisionProfile,
} from './obstacle-collision.js';
import type { RaceObstacle } from './race-world.js';

export type FlowEventKind =
  | 'takeoff'
  | 'drift-boost'
  | 'linked-corner'
  | 'near-miss'
  | 'slingshot'
  | 'clean-landing'
  | 'rough-landing';

export type FlowEvent = Readonly<{
  kind: FlowEventKind;
  sequence: number;
  remaining: number;
}>;

export type RaceFlowSnapshot = Readonly<{
  driftScore: number;
  driftChain: number;
  driftMultiplier: number;
  driftLinks: number;
  boostCharge: number;
  boostRemaining: number;
  boostIntensity: number;
  draftStrength: number;
  nearMisses: number;
  landingQuality: number | null;
  event: FlowEvent | null;
}>;

export type FlowVehicle = Readonly<{
  id: string;
  state: ArcadeVehicleState;
}>;

export type FlowStepContext = Readonly<{
  deltaSeconds: number;
  before: ArcadeVehicleState;
  after: ArcadeVehicleState;
  input: ArcadeDriveInput;
  offRoad: boolean;
  collisionObstacleId: string | null;
  obstacles: readonly RaceObstacle[];
  opponents: readonly FlowVehicle[];
  collisionProfile: VehicleCollisionProfile;
}>;

type DraftCandidate = Readonly<{
  id: string;
  strength: number;
}>;

type RelativeVehicle = Readonly<{
  along: number;
  lateral: number;
  distance: number;
}>;

type TrackedPass = {
  kind: 'obstacle' | 'rival';
  minimumClearance: number;
  maximumSpeed: number;
};

const BOOST_MAXIMUM_SECONDS = 1.35;
const DRIFT_EXIT_COMMIT_SECONDS = 0.32;
const DRIFT_LINK_WINDOW_SECONDS = 0.78;
const NEAR_MISS_TRACKING_CLEARANCE = 2.15;
const NEAR_MISS_REWARD_CLEARANCE = 0.82;
const RIVAL_HALF_WIDTH = 1.05;

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function steeringInput(input: ArcadeDriveInput): number {
  return clamp(
    input.steeringAxis ?? Number(input.left) - Number(input.right),
    -1,
    1,
  );
}

function relativeVehicle(
  player: ArcadeVehicleState,
  opponent: ArcadeVehicleState,
): RelativeVehicle {
  const deltaX = opponent.x - player.x;
  const deltaZ = opponent.z - player.z;
  const forwardX = Math.cos(player.heading);
  const forwardZ = -Math.sin(player.heading);
  const rightX = Math.sin(player.heading);
  const rightZ = Math.cos(player.heading);
  return Object.freeze({
    along: deltaX * forwardX + deltaZ * forwardZ,
    lateral: deltaX * rightX + deltaZ * rightZ,
    distance: Math.hypot(deltaX, deltaZ),
  });
}

function bestDraftCandidate(
  player: ArcadeVehicleState,
  opponents: readonly FlowVehicle[],
): DraftCandidate | null {
  const playerSpeed = vehicleSpeed(player);
  if (playerSpeed < 12 || player.airborne) return null;
  let best: DraftCandidate | null = null;
  for (const opponent of opponents) {
    if (opponent.state.airborne || vehicleSpeed(opponent.state) < 8) continue;
    const relative = relativeVehicle(player, opponent.state);
    if (relative.along < 1.8 || relative.along > 13.5 || Math.abs(relative.lateral) > 2.45) {
      continue;
    }
    const alignment = Math.cos(opponent.state.heading - player.heading);
    if (alignment < 0.86) continue;
    const distanceStrength = 1 - clamp((relative.along - 1.8) / 11.7);
    const lateralStrength = 1 - clamp(Math.abs(relative.lateral) / 2.45);
    const alignmentStrength = clamp((alignment - 0.86) / 0.14);
    const strength = distanceStrength * lateralStrength * alignmentStrength;
    if (strength <= (best?.strength ?? 0)) continue;
    best = Object.freeze({ id: opponent.id, strength });
  }
  return best;
}

function obstacleGroup(id: string): string {
  if (!id.startsWith('barrier:')) return `obstacle:${id}`;
  const [, run = 'unknown'] = id.split(':');
  return `obstacle:barrier:${run}`;
}

export class RaceFlowController {
  private driftScore = 0;
  private driftChain = 0;
  private driftGrace = 0;
  private driftLinks = 0;
  private boostCharge = 0;
  private boostRemaining = 0;
  private boostPower = 0;
  private draftStrength = 0;
  private draftTargetId: string | null = null;
  private draftHold = 0;
  private nearMisses = 0;
  private wasDrifting = false;
  private driftDirection: -1 | 0 | 1 = 0;
  private driftExitRemaining = 0;
  private linkWindow = 0;
  private linkCooldown = 0;
  private counterSteerQuality = 0;
  private landingQuality: number | null = null;
  private landingQualityRemaining = 0;
  private eventKind: FlowEventKind | null = null;
  private eventSequence = 0;
  private eventRemaining = 0;
  private readonly trackedPasses = new Map<string, TrackedPass>();
  private readonly passCooldowns = new Map<string, number>();

  public reset(): void {
    this.driftScore = 0;
    this.driftChain = 0;
    this.driftGrace = 0;
    this.driftLinks = 0;
    this.boostCharge = 0;
    this.boostRemaining = 0;
    this.boostPower = 0;
    this.draftStrength = 0;
    this.draftTargetId = null;
    this.draftHold = 0;
    this.nearMisses = 0;
    this.wasDrifting = false;
    this.driftDirection = 0;
    this.driftExitRemaining = 0;
    this.linkWindow = 0;
    this.linkCooldown = 0;
    this.counterSteerQuality = 0;
    this.landingQuality = null;
    this.landingQualityRemaining = 0;
    this.eventKind = null;
    this.eventRemaining = 0;
    this.trackedPasses.clear();
    this.passCooldowns.clear();
  }

  public prepareDrive(
    deltaSeconds: number,
    player: ArcadeVehicleState,
    opponents: readonly FlowVehicle[],
    input: ArcadeDriveInput,
  ): ArcadeDriveInput {
    const delta = clamp(deltaSeconds, 0, 0.05);
    this.boostRemaining = Math.max(0, this.boostRemaining - delta);
    if (this.boostRemaining === 0) this.boostPower = 0;
    this.eventRemaining = Math.max(0, this.eventRemaining - delta);
    this.landingQualityRemaining = Math.max(0, this.landingQualityRemaining - delta);
    if (this.landingQualityRemaining === 0) this.landingQuality = null;

    const previousTargetId = this.draftTargetId;
    const previousDraftHold = this.draftHold;
    const candidate = bestDraftCandidate(player, opponents);
    if (candidate !== null) {
      if (candidate.id === previousTargetId) this.draftHold += delta * candidate.strength;
      else {
        this.draftTargetId = candidate.id;
        this.draftHold = delta * candidate.strength;
      }
    } else {
      this.trySlingshot(player, opponents, previousTargetId, previousDraftHold);
      this.draftTargetId = null;
      this.draftHold = 0;
    }
    const rawDraftStrength = candidate?.strength ?? 0;
    const draftResponse = rawDraftStrength > this.draftStrength ? 7.5 : 4.2;
    this.draftStrength += (rawDraftStrength - this.draftStrength)
      * (1 - Math.exp(-draftResponse * delta));

    return Object.freeze({
      ...input,
      boost: this.boostRemaining > 0 ? this.boostPower : 0,
      draft: this.draftStrength,
    });
  }

  public settleStep(context: FlowStepContext): ArcadeVehicleState {
    const delta = clamp(context.deltaSeconds, 0, 0.05);
    this.linkCooldown = Math.max(0, this.linkCooldown - delta);
    this.linkWindow = Math.max(0, this.linkWindow - delta);
    this.agePassCooldowns(delta);

    if (context.collisionObstacleId !== null || context.offRoad) {
      this.cancelFlow();
      this.trackedPasses.clear();
      return context.after;
    }

    if (!context.before.airborne && context.after.airborne) this.emit('takeoff', 0.82);
    const landed = context.before.airborne && !context.after.airborne;
    const afterLanding = landed
      ? this.resolveLanding(context.after)
      : context.after;
    this.updateDrift(delta, afterLanding, context.input);
    this.updateNearMisses(
      afterLanding,
      context.obstacles,
      context.opponents,
      context.collisionProfile,
    );
    return afterLanding;
  }

  public snapshot(): RaceFlowSnapshot {
    const event = this.eventKind === null || this.eventRemaining <= 0
      ? null
      : Object.freeze({
        kind: this.eventKind,
        sequence: this.eventSequence,
        remaining: this.eventRemaining,
      });
    return Object.freeze({
      driftScore: Math.floor(this.driftScore),
      driftChain: Math.floor(this.driftChain),
      driftMultiplier: this.multiplier(),
      driftLinks: this.driftLinks,
      boostCharge: this.boostCharge,
      boostRemaining: this.boostRemaining,
      boostIntensity: this.boostRemaining > 0 ? this.boostPower : 0,
      draftStrength: this.draftStrength,
      nearMisses: this.nearMisses,
      landingQuality: this.landingQuality,
      event,
    });
  }

  private updateDrift(
    delta: number,
    vehicle: ArcadeVehicleState,
    input: ArcadeDriveInput,
  ): void {
    const drifting = vehicle.drifting && !vehicle.airborne;
    if (drifting) {
      const direction = Math.sign(vehicle.slipAngle) as -1 | 0 | 1;
      const linked = direction !== 0
        && this.driftDirection !== 0
        && direction !== this.driftDirection
        && (this.wasDrifting || this.driftExitRemaining > 0 || this.linkWindow > 0);
      if (linked && this.linkCooldown === 0) this.rewardLinkedCorner();
      if (direction !== 0) this.driftDirection = direction;
      this.wasDrifting = true;
      this.driftExitRemaining = 0;
      this.linkWindow = DRIFT_LINK_WINDOW_SECONDS;

      const speed = vehicleSpeed(vehicle);
      const angleFactor = clamp((Math.abs(vehicle.slipAngle) - 0.075) / 0.42);
      const speedFactor = clamp((speed - 8) / 21);
      this.boostCharge = clamp(
        this.boostCharge + (0.16 + angleFactor * 0.5) * speedFactor * delta,
      );
      const steering = steeringInput(input);
      const counterSteer = clamp((-vehicle.slipAngle * steering - 0.01) / 0.24);
      this.counterSteerQuality = Math.max(
        this.counterSteerQuality * Math.exp(-1.7 * delta),
        counterSteer,
      );
      const gain = Math.abs(vehicle.slipAngle) * speed * delta * 21;
      this.driftChain += gain;
      this.driftScore += gain * this.multiplier();
      this.driftGrace = 0.9;
      return;
    }

    if (this.wasDrifting) {
      this.wasDrifting = false;
      this.driftExitRemaining = DRIFT_EXIT_COMMIT_SECONDS;
    } else if (this.driftExitRemaining > 0) {
      this.driftExitRemaining = Math.max(0, this.driftExitRemaining - delta);
      if (this.driftExitRemaining === 0) this.commitDriftExit();
    }
    this.driftGrace = Math.max(0, this.driftGrace - delta);
    if (this.driftGrace === 0) {
      this.driftChain = 0;
      this.driftLinks = 0;
      if (this.driftExitRemaining === 0) this.driftDirection = 0;
    }
  }

  private commitDriftExit(): void {
    const cleanExit = this.boostCharge >= 0.12 && this.counterSteerQuality >= 0.08;
    if (cleanExit) {
      const charge = this.boostCharge;
      this.triggerBoost(0.42 + charge * 0.88, 0.52 + charge * 0.48, 'drift-boost');
    }
    this.boostCharge = cleanExit ? 0 : this.boostCharge * 0.35;
    this.counterSteerQuality = 0;
    this.linkWindow = 0;
  }

  private rewardLinkedCorner(): void {
    this.linkCooldown = 0.38;
    this.driftLinks += 1;
    this.boostCharge = clamp(this.boostCharge + 0.17);
    this.driftChain += 90;
    this.driftScore += 120 * this.multiplier();
    this.emit('linked-corner', 0.82);
  }

  private trySlingshot(
    player: ArcadeVehicleState,
    opponents: readonly FlowVehicle[],
    previousTargetId: string | null,
    previousDraftHold: number,
  ): void {
    if (previousTargetId === null || previousDraftHold < 0.58 || vehicleSpeed(player) < 15) return;
    const target = opponents.find(({ id }) => id === previousTargetId);
    if (target === undefined) return;
    const relative = relativeVehicle(player, target.state);
    const lateralExit = Math.abs(relative.lateral) > 2.05;
    if (!lateralExit || relative.along < -1.5 || relative.along > 15 || relative.distance > 16) return;
    this.triggerBoost(0.56, 0.66, 'slingshot');
    this.driftChain += 85;
    this.driftScore += 150 * this.multiplier();
    this.driftGrace = Math.max(this.driftGrace, 1.05);
  }

  private resolveLanding(state: ArcadeVehicleState): ArcadeVehicleState {
    const quality = clamp(
      1 - Math.abs(state.slipAngle) / 0.32 - Math.abs(state.steering) * 0.24,
    );
    this.landingQuality = quality;
    this.landingQualityRemaining = 1.1;
    if (quality >= 0.68) {
      this.boostCharge = clamp(this.boostCharge + 0.14);
      this.triggerBoost(0.38 + quality * 0.14, 0.48 + quality * 0.16, 'clean-landing');
      this.driftChain += 75;
      this.driftScore += 110 * this.multiplier();
      this.driftGrace = Math.max(this.driftGrace, 1.05);
      return state;
    }

    const retainedSpeed = 0.72 + quality * 0.23;
    this.boostCharge *= 0.5;
    this.emit('rough-landing', 0.9);
    return Object.freeze({
      ...state,
      velocityX: state.velocityX * retainedSpeed,
      velocityZ: state.velocityZ * retainedSpeed,
      angularVelocity: state.angularVelocity * (0.55 + quality * 0.35),
      slipAngle: state.slipAngle * 0.5,
      drifting: false,
      impact: Math.max(state.impact, 0.32 + (1 - quality) * 0.38),
    });
  }

  private updateNearMisses(
    player: ArcadeVehicleState,
    obstacles: readonly RaceObstacle[],
    opponents: readonly FlowVehicle[],
    profile: VehicleCollisionProfile,
  ): void {
    const speed = vehicleSpeed(player);
    const current = new Map<string, Readonly<{ kind: TrackedPass['kind']; clearance: number }>>();
    for (const obstacle of obstacles) {
      const clearance = obstacleClearance(player, obstacle, profile);
      if (clearance > NEAR_MISS_TRACKING_CLEARANCE) continue;
      const id = obstacleGroup(obstacle.id);
      const previous = current.get(id);
      if (previous === undefined || clearance < previous.clearance) {
        current.set(id, Object.freeze({ kind: 'obstacle', clearance }));
      }
    }
    for (const opponent of opponents) {
      const relative = relativeVehicle(player, opponent.state);
      const clearance = relative.distance - profile.halfWidth - RIVAL_HALF_WIDTH;
      if (clearance > NEAR_MISS_TRACKING_CLEARANCE) continue;
      current.set(`rival:${opponent.id}`, Object.freeze({ kind: 'rival', clearance }));
    }

    for (const [id, tracked] of this.trackedPasses) {
      if (current.has(id)) continue;
      this.trackedPasses.delete(id);
      const maximumClearance = tracked.kind === 'rival'
        ? NEAR_MISS_REWARD_CLEARANCE + 0.12
        : NEAR_MISS_REWARD_CLEARANCE;
      if (
        tracked.minimumClearance >= 0.08
        && tracked.minimumClearance <= maximumClearance
        && tracked.maximumSpeed >= 16
        && !this.passCooldowns.has(id)
      ) {
        this.rewardNearMiss();
        this.passCooldowns.set(id, 2.4);
      }
    }

    for (const [id, sample] of current) {
      const tracked = this.trackedPasses.get(id);
      if (tracked === undefined) {
        this.trackedPasses.set(id, {
          kind: sample.kind,
          minimumClearance: sample.clearance,
          maximumSpeed: speed,
        });
      } else {
        tracked.minimumClearance = Math.min(tracked.minimumClearance, sample.clearance);
        tracked.maximumSpeed = Math.max(tracked.maximumSpeed, speed);
      }
    }
  }

  private rewardNearMiss(): void {
    this.nearMisses += 1;
    this.boostCharge = clamp(this.boostCharge + 0.12);
    this.driftChain += 65;
    this.driftScore += 100 * this.multiplier();
    this.driftGrace = Math.max(this.driftGrace, 1.05);
    this.emit('near-miss', 0.8);
  }

  private agePassCooldowns(delta: number): void {
    for (const [id, remaining] of this.passCooldowns) {
      const next = remaining - delta;
      if (next <= 0) this.passCooldowns.delete(id);
      else this.passCooldowns.set(id, next);
    }
  }

  private triggerBoost(duration: number, power: number, event: FlowEventKind): void {
    this.boostRemaining = Math.min(
      BOOST_MAXIMUM_SECONDS,
      Math.max(this.boostRemaining, duration),
    );
    this.boostPower = Math.max(this.boostPower, clamp(power));
    this.emit(event, 0.92);
  }

  private cancelFlow(): void {
    this.boostCharge = 0;
    this.boostRemaining = 0;
    this.boostPower = 0;
    this.draftStrength = 0;
    this.draftTargetId = null;
    this.draftHold = 0;
    this.driftChain = 0;
    this.driftGrace = 0;
    this.driftLinks = 0;
    this.wasDrifting = false;
    this.driftDirection = 0;
    this.driftExitRemaining = 0;
    this.linkWindow = 0;
    this.counterSteerQuality = 0;
    this.landingQuality = null;
    this.landingQualityRemaining = 0;
    this.eventKind = null;
    this.eventRemaining = 0;
  }

  private multiplier(): number {
    return 1 + Math.min(3, Math.floor(this.driftChain / 260) * 0.5);
  }

  private emit(kind: FlowEventKind, duration: number): void {
    this.eventKind = kind;
    this.eventSequence += 1;
    this.eventRemaining = duration;
  }
}
