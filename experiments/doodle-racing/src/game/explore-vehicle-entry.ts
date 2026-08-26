import type {
  CharacterExpression,
  CharacterPose,
  CharacterWink,
} from '../../../../src/index.js';
import type { GrandstandExplorerSnapshot } from './grandstand-explorer.js';
import type { ExploreVehicleEntry } from './vehicle-field.js';

const FOCUS_SECONDS = 0.48;
const SMIRK_SECONDS = 0.5;
const WINK_SECONDS = 0.38;
const EQUIP_SECONDS = 1.04;
const CLEAR_SECONDS = 0.38;
const OPEN_SECONDS = 0.72;
const BOARD_SECONDS = 0.62;
const RETURN_SECONDS = 0.55;
const TOTAL_SECONDS = FOCUS_SECONDS
  + SMIRK_SECONDS
  + WINK_SECONDS
  + EQUIP_SECONDS
  + CLEAR_SECONDS
  + OPEN_SECONDS
  + BOARD_SECONDS
  + RETURN_SECONDS;

export type ExploreVehicleEntryPhase =
  | 'focusing'
  | 'smirking'
  | 'winking'
  | 'equipping'
  | 'clearing'
  | 'opening'
  | 'boarding'
  | 'returning'
  | 'complete';

export type ExploreVehicleEntryFrame = Readonly<{
  phase: ExploreVehicleEntryPhase;
  phaseProgress: number;
  progress: number;
  cameraCloseAmount: number;
  cameraReturnAmount: number;
  cameraHeading: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  pose: CharacterPose;
  expression: CharacterExpression;
  wink: CharacterWink;
  helmetCarryAmount: number;
  doorOpen: boolean;
  complete: boolean;
}>;

type EntryTarget = Readonly<{ x: number; y: number; z: number }>;
type VehicleAnchor = Readonly<{ x: number; z: number }>;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothStep(value: number): number {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

function interpolateAngle(start: number, end: number, progress: number): number {
  const delta = Math.atan2(Math.sin(end - start), Math.cos(end - start));
  return start + delta * clamp01(progress);
}

function phaseFrame(
  phase: ExploreVehicleEntryPhase,
  phaseProgress: number,
  elapsed: number,
  source: GrandstandExplorerSnapshot,
  target: EntryTarget,
  vehicle: VehicleAnchor,
  variant: number,
): ExploreVehicleEntryFrame {
  const progress = clamp01(elapsed / TOTAL_SECONDS);
  const clearingElapsed = elapsed
    - FOCUS_SECONDS - SMIRK_SECONDS - WINK_SECONDS - EQUIP_SECONDS;
  const outwardX = source.x - vehicle.x;
  const outwardZ = source.z - vehicle.z;
  const outwardLength = Math.hypot(outwardX, outwardZ);
  const normalizedOutwardX = outwardLength <= 1e-5
    ? Math.sin(source.heading)
    : outwardX / outwardLength;
  const normalizedOutwardZ = outwardLength <= 1e-5
    ? Math.cos(source.heading)
    : outwardZ / outwardLength;
  const cameraHeading = Math.hypot(outwardX, outwardZ) <= 1e-5
    ? source.heading
    : Math.atan2(outwardX, outwardZ);
  const staging = Object.freeze({
    x: source.x + normalizedOutwardX * 0.78,
    y: source.y,
    z: source.z + normalizedOutwardZ * 0.78,
  });
  const clearingProgress = smoothStep(clamp01(clearingElapsed / CLEAR_SECONDS));
  const boardingElapsed = clearingElapsed - CLEAR_SECONDS - OPEN_SECONDS;
  const boardingProgress = smoothStep(clamp01(boardingElapsed / BOARD_SECONDS));
  const clearingOrLater = phase === 'clearing' || phase === 'opening'
    || phase === 'boarding' || phase === 'returning' || phase === 'complete';
  const boardingOrLater = phase === 'boarding' || phase === 'returning' || phase === 'complete';
  const stagedX = source.x + (staging.x - source.x) * (clearingOrLater ? clearingProgress : 0);
  const stagedY = source.y + (staging.y - source.y) * (clearingOrLater ? clearingProgress : 0);
  const stagedZ = source.z + (staging.z - source.z) * (clearingOrLater ? clearingProgress : 0);
  const actorProgress = boardingOrLater ? boardingProgress : 0;
  const helmetCarryAmount = phase === 'equipping'
    ? smoothStep(phaseProgress)
    : phase === 'clearing' || phase === 'opening' || boardingOrLater ? 1 : 0;
  const cameraCloseAmount = phase === 'focusing' ? smoothStep(phaseProgress) : 1;
  const expression: CharacterExpression = elapsed < FOCUS_SECONDS
    ? 'idle'
    : variant % 3 === 1 && phase === 'smirking'
      ? 'happy'
      : variant % 3 === 2 && phase === 'smirking' && phaseProgress < 0.32
        ? 'surprised'
        : 'smirk';
  return Object.freeze({
    phase,
    phaseProgress,
    progress,
    cameraCloseAmount,
    cameraReturnAmount: phase === 'returning' || phase === 'complete'
      ? smoothStep(phaseProgress)
      : 0,
    cameraHeading,
    x: stagedX + (target.x - stagedX) * actorProgress,
    y: stagedY + (target.y - stagedY - 0.28) * actorProgress,
    z: stagedZ + (target.z - stagedZ) * actorProgress,
    heading: interpolateAngle(source.heading, cameraHeading, cameraCloseAmount),
    pose: phase === 'clearing' ? 'walk' : actorProgress > 0.42 ? 'sit' : 'idle',
    expression,
    wink: phase === 'winking' && phaseProgress > 0.16 && phaseProgress < 0.82
      ? variant % 2 === 0 ? 'left' : 'right'
      : null,
    helmetCarryAmount,
    doorOpen: phase === 'opening' || phase === 'boarding' || phase === 'returning',
    complete: phase === 'complete',
  });
}

export function sampleExploreVehicleEntry(
  source: GrandstandExplorerSnapshot,
  target: EntryTarget,
  vehicle: VehicleAnchor,
  elapsedSeconds: number,
  variant = 0,
): ExploreVehicleEntryFrame {
  const elapsed = Math.max(0, elapsedSeconds);
  let local = elapsed;
  if (local < FOCUS_SECONDS) {
    return phaseFrame('focusing', local / FOCUS_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= FOCUS_SECONDS;
  if (local < SMIRK_SECONDS) {
    return phaseFrame('smirking', local / SMIRK_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= SMIRK_SECONDS;
  if (local < WINK_SECONDS) {
    return phaseFrame('winking', local / WINK_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= WINK_SECONDS;
  if (local < EQUIP_SECONDS) {
    return phaseFrame('equipping', local / EQUIP_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= EQUIP_SECONDS;
  if (local < CLEAR_SECONDS) {
    return phaseFrame('clearing', local / CLEAR_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= CLEAR_SECONDS;
  if (local < OPEN_SECONDS) {
    return phaseFrame('opening', local / OPEN_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= OPEN_SECONDS;
  if (local < BOARD_SECONDS) {
    return phaseFrame('boarding', local / BOARD_SECONDS, elapsed, source, target, vehicle, variant);
  }
  local -= BOARD_SECONDS;
  if (local < RETURN_SECONDS) {
    return phaseFrame('returning', local / RETURN_SECONDS, elapsed, source, target, vehicle, variant);
  }
  return phaseFrame('complete', 1, TOTAL_SECONDS, source, target, vehicle, variant);
}

export class ExploreVehicleEntryDirector {
  private elapsed = 0;

  public constructor(
    public readonly entry: ExploreVehicleEntry,
    private readonly source: GrandstandExplorerSnapshot,
    private readonly target: EntryTarget,
    private readonly vehicle: VehicleAnchor,
    private readonly variant = 0,
  ) {}

  public snapshot(): ExploreVehicleEntryFrame {
    return sampleExploreVehicleEntry(
      this.source,
      this.target,
      this.vehicle,
      this.elapsed,
      this.variant,
    );
  }

  public update(deltaSeconds: number): ExploreVehicleEntryFrame {
    this.elapsed += Math.max(0, Math.min(0.05, deltaSeconds));
    return this.snapshot();
  }
}
