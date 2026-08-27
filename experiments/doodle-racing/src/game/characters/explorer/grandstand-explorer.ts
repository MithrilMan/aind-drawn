import {
  SeedTree,
  SolidRig,
  CHARACTER_ART_BINDINGS,
  CHARACTER_EXTENSION_HOST,
  applySolidCharacterMotion,
  assetExtensionScope,
  createAssetExtensionPlan,
  createCharacterMotionState,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  extendAssetIdentity,
  extendSolidAssetBlueprint,
  sampleCharacterMotion,
  setCharacterMotion,
  type CharacterExpression,
  type CharacterMotionState,
  type CharacterPose,
  type CharacterWink,
  type ExtendedAssetIdentity,
  type SolidAssetBlueprint,
  type SolidSceneResourceCache,
} from '../../../../../../src/index.js';
import {
  applySolidPaperCircuitBackpackMotion,
  createPaperCircuitBackpackIdentity,
  createPaperCircuitBackpackInkStrokes,
  createSolidPaperCircuitBackpackBlueprint,
  paperCircuitBackpackOpenAmount,
  type PaperCircuitBackpackIdentity,
} from '../../../extensions/paper-circuit-backpack/index.js';
import {
  PAPER_CIRCUIT_EXTENSION_REGISTRY,
  applySolidPaperCircuitHelmetGripMotion,
  applySolidPaperCircuitHelmetItemVisorMotion,
  applySolidPaperCircuitVisorReachMotion,
  applySolidPaperCircuitVisorMotion,
  createPaperCircuitHelmetIdentity,
  createPaperCircuitHelmetInkStrokes,
  createPaperCircuitHelmetItemInkStrokes,
  createPaperCircuitVisorMotionState,
  createSolidPaperCircuitHelmetBlueprint,
  interpolatePaperCircuitHelmetCarryPose,
  PAPER_CIRCUIT_HELMET_HAND_CARRY_AMOUNT,
  paperCircuitHelmetGripAmountForCarry,
  samplePaperCircuitVisorMotion,
  samplePaperCircuitVisorReachMotion,
  setPaperCircuitVisorPosition,
  type PaperCircuitHelmetIdentity,
  type PaperCircuitVisorMotionState,
  type PaperCircuitVisorPosition,
} from '../../../extensions/paper-circuit-helmet/index.js';
import type { DoodleSceneAsset } from '../../doodle-scene.js';
import {
  createPaperCircuitPersonIdentity,
  type PaperCircuitPersonIdentity,
} from '../shared/paper-circuit-person.js';
import type { CourseLayout } from '../../course.js';
import type { ExploreInput } from '../../race-model.js';
import {
  resolveGroundMotion,
  type GroundCollider,
} from '../../solid-ground-collision.js';
import {
  GRANDSTAND_ROW_SPACING,
  GRANDSTAND_STEP_BASE_HEIGHT,
  GRANDSTAND_STEP_DEPTH,
  GRANDSTAND_STEP_HEIGHT_RISE,
  grandstandSurfaceAt,
  type GrandstandLayout,
} from '../../race-world.js';

const WALK_SPEED = 3.25;
const RUN_SPEED = 5.6;
const TURN_SPEED = 4.4;
const EXPLORER_SCALE = 0.66;
const PREVIEW_SCALE = 1.02;
const GRAVITY = 16;
const JUMP_SPEED = 5.9;
const MAX_STEP_UP = Math.max(GRANDSTAND_STEP_BASE_HEIGHT, GRANDSTAND_STEP_HEIGHT_RISE) + 0.04;
const MAX_JUMP_STEP_UP = 0.74;
const HELMET_STOW_SECONDS = 0.92;

type LocalBounds = Readonly<{
  minAlong: number;
  maxAlong: number;
  minAway: number;
  maxAway: number;
}>;

type WorldPosition = Readonly<{ x: number; y: number; z: number }>;

export type GrandstandExplorerSnapshot = Readonly<{
  species: 'human';
  x: number;
  y: number;
  z: number;
  heading: number;
  speed: number;
  along: number;
  away: number;
  row: number;
  pose: CharacterPose;
  expression: CharacterExpression;
  elapsed: number;
}>;

export type GrandstandExplorerCinematicFrame = Readonly<{
  x: number;
  y: number;
  z: number;
  heading: number;
  pose: CharacterPose;
  expression: CharacterExpression;
  wink?: CharacterWink;
  helmetCarryAmount?: number;
}>;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothStep(value: number): number {
  const amount = clamp(value, 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function localPosition(
  stand: GrandstandLayout,
  along: number,
  away: number,
): Readonly<{ x: number; z: number }> {
  return Object.freeze({
    x: stand.x + Math.cos(stand.heading) * along + Math.sin(stand.heading) * away,
    z: stand.z - Math.sin(stand.heading) * along + Math.cos(stand.heading) * away,
  });
}

function mapLocalBounds(
  course: CourseLayout,
  stand: GrandstandLayout,
): LocalBounds {
  const corners = [
    [course.bounds.minimumX, course.bounds.minimumZ],
    [course.bounds.minimumX, course.bounds.maximumZ],
    [course.bounds.maximumX, course.bounds.minimumZ],
    [course.bounds.maximumX, course.bounds.maximumZ],
  ] as const;
  let minAlong = Number.POSITIVE_INFINITY;
  let maxAlong = Number.NEGATIVE_INFINITY;
  let minAway = Number.POSITIVE_INFINITY;
  let maxAway = Number.NEGATIVE_INFINITY;
  for (const [x, z] of corners) {
    const deltaX = x - stand.x;
    const deltaZ = z - stand.z;
    const along = deltaX * Math.cos(stand.heading) + deltaZ * -Math.sin(stand.heading);
    const away = deltaX * Math.sin(stand.heading) + deltaZ * Math.cos(stand.heading);
    minAlong = Math.min(minAlong, along);
    maxAlong = Math.max(maxAlong, along);
    minAway = Math.min(minAway, away);
    maxAway = Math.max(maxAway, away);
  }
  return Object.freeze({ minAlong, maxAlong, minAway, maxAway });
}

function previewExpression(pose: CharacterPose, beat: number): CharacterExpression {
  if (beat === 0) return 'happy';
  if (beat === 1) return 'surprised';
  if (pose === 'airborne') return 'scared';
  if (pose === 'run') return 'angry';
  if (pose === 'idle') return beat % 2 === 0 ? 'sad' : 'happy';
  if (pose === 'play' || pose === 'dance') return 'happy';
  return beat % 2 === 0 ? 'happy' : 'idle';
}

function visorPosition(
  pose: CharacterPose,
  expression: CharacterExpression,
): PaperCircuitVisorPosition {
  return pose === 'walk' || pose === 'run' || pose === 'airborne' || expression === 'scared'
    ? 'down'
    : 'up';
}

export class GrandstandExplorer {
  public readonly identity: ExtendedAssetIdentity<PaperCircuitPersonIdentity>;
  public readonly helmet: PaperCircuitHelmetIdentity;
  public readonly backpack: PaperCircuitBackpackIdentity;
  public readonly solid: SolidAssetBlueprint<'character'>;
  public readonly rig: SolidRig;
  public readonly backpackSolid: SolidAssetBlueprint<'paper-circuit-backpack'>;
  public readonly backpackRig: SolidRig;
  public readonly helmetItemSolid: SolidAssetBlueprint<'paper-circuit-helmet'>;
  public readonly helmetItemRig: SolidRig;

  private motion: CharacterMotionState = createCharacterMotionState({
    autoBlink: true,
    autoGaze: true,
  });
  private visorMotion: PaperCircuitVisorMotionState = createPaperCircuitVisorMotionState();
  private visorAmount = 0;
  private helmetCarryAmount = 0;
  private helmetWorn: boolean | null = null;
  private helmetStowStartedAt: number | null = null;
  private actorVisible = false;
  private elapsed = 0;
  private along = 0;
  private away = -0.9;
  private y = 0;
  private verticalVelocity = 0;
  private surfaceRow = -1;
  private readonly collisionRadius: number;
  private readonly collisionMinimumY: number;
  private readonly collisionHeight: number;
  private readonly mapBounds: LocalBounds;
  private readonly previewSequence: readonly CharacterPose[];
  private readonly previewExpressions: readonly CharacterExpression[];
  private readonly previewDurations: readonly number[];
  private readonly previewLoopDuration: number;
  private heading: number;
  private activePose: CharacterPose = 'idle';
  private activeExpression: CharacterExpression = 'idle';
  private activeWink: CharacterWink = null;
  private jumpLatch = false;
  private previewMode = false;
  private previewHelmetEquipAt: number | null = 2;
  private previewPosition: WorldPosition | null = null;
  private previewHeading = 0;

  public constructor(
    private readonly stand: GrandstandLayout,
    courseOrSeed: CourseLayout | number,
    maybeSeed?: number,
    resources?: SolidSceneResourceCache,
    detail = 1,
  ) {
    const course = typeof courseOrSeed === 'number' ? undefined : courseOrSeed;
    const seed = typeof courseOrSeed === 'number' ? courseOrSeed : maybeSeed ?? 15823;
    this.mapBounds = course === undefined
      ? Object.freeze({
        minAlong: -stand.length * 0.5,
        maxAlong: stand.length * 0.5,
        minAway: -1.65,
        maxAway: (stand.rows - 1) * GRANDSTAND_ROW_SPACING
          + GRANDSTAND_STEP_DEPTH * 0.5 + 1.15,
      })
      : mapLocalBounds(course, stand);
    const person = createPaperCircuitPersonIdentity(seed);
    this.helmet = createPaperCircuitHelmetIdentity(person);
    this.backpack = createPaperCircuitBackpackIdentity(person);
    this.identity = extendAssetIdentity(person, [this.helmet]);
    const previewRandom = new SeedTree(seed).random('paper-circuit:explorer:preview');
    const previewPoses = Object.freeze<CharacterPose[]>([
      'walk', 'play', 'airborne', 'idle', 'run',
    ]);
    // Start every menu loop with the authored dance so the preview advertises
    // the full motion vocabulary instead of relying on a lucky random cue.
    this.previewSequence = Object.freeze([
      'dance',
      ...Array.from({ length: 3 }, () => previewRandom.pick(previewPoses)),
    ]);
    this.previewExpressions = Object.freeze(
      this.previewSequence.map((pose, index) => previewExpression(pose, index)),
    );
    this.previewDurations = Object.freeze(this.previewSequence.map((_, index) => (
      index === 0 ? previewRandom.float(1.15, 1.7) : previewRandom.float(0.8, 1.65)
    )));
    this.previewLoopDuration = this.previewDurations.reduce((sum, duration) => sum + duration, 0);
    const baseSolid = createSolidCharacterBlueprint(this.identity, {
      artDirection: 'storybook',
      physical: Object.freeze({ finish: 'matte' }),
    });
    const extensionPlan = createAssetExtensionPlan(
      this.identity,
      baseSolid.manifest,
      CHARACTER_ART_BINDINGS,
      CHARACTER_EXTENSION_HOST,
      PAPER_CIRCUIT_EXTENSION_REGISTRY,
    );
    this.solid = extendSolidAssetBlueprint(baseSolid, extensionPlan);
    this.rig = new SolidRig(this.solid, {
      instanceId: 'paper-circuit:explorer',
      ...(resources === undefined ? {} : { resources }),
      detail,
    });
    this.backpackSolid = createSolidPaperCircuitBackpackBlueprint(this.backpack, {
      artDirection: this.solid.appearance.artDirection,
    });
    this.backpackRig = new SolidRig(this.backpackSolid, {
      instanceId: 'paper-circuit:explorer:backpack',
      ...(resources === undefined ? {} : { resources }),
      detail,
    });
    this.helmetItemSolid = createSolidPaperCircuitHelmetBlueprint(this.helmet.data.item, {
      artDirection: this.solid.appearance.artDirection,
    });
    this.helmetItemRig = new SolidRig(this.helmetItemSolid, {
      instanceId: 'paper-circuit:explorer:held-helmet',
      ...(resources === undefined ? {} : { resources }),
      detail,
    });
    const xRadius = Math.max(
      Math.abs(this.solid.bounds.minimum[0]),
      Math.abs(this.solid.bounds.maximum[0]),
    );
    const zRadius = Math.max(
      Math.abs(this.solid.bounds.minimum[2]),
      Math.abs(this.solid.bounds.maximum[2]),
    );
    this.collisionRadius = Math.max(xRadius, zRadius) * EXPLORER_SCALE + 0.04;
    this.collisionMinimumY = this.solid.bounds.minimum[1] * EXPLORER_SCALE;
    this.collisionHeight = (
      this.solid.bounds.maximum[1] - this.solid.bounds.minimum[1]
    ) * EXPLORER_SCALE;
    this.heading = stand.heading;
    const surface = grandstandSurfaceAt(stand, this.away, this.along);
    this.y = surface.height;
    this.surfaceRow = surface.row;
    this.rig.root.visible = false;
    this.backpackRig.root.visible = false;
    this.helmetItemRig.root.visible = false;
    this.applyPose();
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze([Object.freeze({
      solid: this.backpackSolid,
      rig: this.backpackRig,
      strokes: createPaperCircuitBackpackInkStrokes(this.backpackSolid, this.backpack),
    }), Object.freeze({
      solid: this.solid,
      rig: this.rig,
      strokes: Object.freeze([
        ...createSolidCharacterInkStrokes(this.solid),
        ...createPaperCircuitHelmetInkStrokes(this.solid, this.helmet),
      ]),
    }), Object.freeze({
      solid: this.helmetItemSolid,
      rig: this.helmetItemRig,
      strokes: createPaperCircuitHelmetItemInkStrokes(this.helmetItemSolid),
    })]);
  }

  public doodleAsset(): DoodleSceneAsset {
    return this.doodleAssets()[1] as DoodleSceneAsset;
  }

  public snapshot(): GrandstandExplorerSnapshot {
    const local = localPosition(this.stand, this.along, this.away);
    const position = this.previewMode && this.previewPosition !== null
      ? this.previewPosition
      : { x: local.x, y: this.y, z: local.z };
    return Object.freeze({
      species: this.identity.species,
      x: position.x,
      y: position.y,
      z: position.z,
      heading: this.heading,
      speed: this.activePose === 'run'
        ? 0.98
        : this.activePose === 'airborne' ? 0.86
        : this.activePose === 'walk' ? 0.72 : this.activePose === 'play' ? 0.86 : 0,
      along: this.along,
      away: this.away,
      row: this.surfaceRow,
      pose: this.activePose,
      expression: this.activeExpression,
      elapsed: this.elapsed,
    });
  }

  public update(
    deltaSeconds: number,
    input: ExploreInput,
    colliders: readonly GroundCollider[] = Object.freeze([]),
  ): GrandstandExplorerSnapshot {
    if (this.previewMode) return this.updatePreview(deltaSeconds);
    const delta = clamp(deltaSeconds, 0, 0.05);
    this.elapsed += delta;
    const helmetStowing = this.helmetStowStartedAt !== null;
    if (this.helmetStowStartedAt !== null) {
      const stowProgress = smoothStep(
        (this.elapsed - this.helmetStowStartedAt) / HELMET_STOW_SECONDS,
      );
      this.helmetCarryAmount = 1 - stowProgress;
      if (stowProgress >= 1) this.helmetStowStartedAt = null;
    }
    const turn = helmetStowing ? 0 : clamp(
      input.steeringAxis ?? Number(input.left) - Number(input.right),
      -1,
      1,
    );
    // Character solids face local +Z. Applying left-right directly to yaw
    // keeps visual rotation and the movement convention in sync.
    this.heading += turn * TURN_SPEED * delta;

    const direction = helmetStowing ? 0 : clamp(
      (input.throttle ?? Number(input.accelerate))
        - (input.brakePressure ?? Number(input.brake)),
      -1,
      1,
    );
    const isRunning = input.run === true;
    const movement = direction * (isRunning ? RUN_SPEED : WALK_SPEED) * delta;
    const jumpRequested = input.jump === true;
    const grounded = this.verticalVelocity === 0;
    if (!jumpRequested) this.jumpLatch = false;
    if (jumpRequested && !this.jumpLatch && grounded) {
      this.verticalVelocity = JUMP_SPEED;
      this.jumpLatch = true;
    }
    if (movement !== 0) {
      // Keep movement aligned with the authored character front (+Z), not
      // the vehicle convention (+X).
      const forwardX = Math.sin(this.heading);
      const forwardZ = Math.cos(this.heading);
      const deltaX = forwardX * movement;
      const deltaZ = forwardZ * movement;
      const alongAxisX = Math.cos(this.stand.heading);
      const alongAxisZ = -Math.sin(this.stand.heading);
      const awayAxisX = Math.sin(this.stand.heading);
      const awayAxisZ = Math.cos(this.stand.heading);
      const minAlong = this.mapBounds.minAlong + this.collisionRadius;
      const maxAlong = this.mapBounds.maxAlong - this.collisionRadius;
      let nextAlong = clamp(
        this.along + deltaX * alongAxisX + deltaZ * alongAxisZ,
        minAlong,
        maxAlong,
      );
      let nextAway = clamp(
        this.away + deltaX * awayAxisX + deltaZ * awayAxisZ,
        this.mapBounds.minAway + this.collisionRadius,
        this.mapBounds.maxAway - this.collisionRadius,
      );
      const currentSurface = grandstandSurfaceAt(this.stand, this.away, this.along);
      const nextSurface = grandstandSurfaceAt(this.stand, nextAway, nextAlong);
      const maximumStepUp = this.verticalVelocity > 0 ? MAX_JUMP_STEP_UP : MAX_STEP_UP;
      if (nextSurface.height - currentSurface.height > maximumStepUp) {
        // The high/back side of the stand is a wall, not a secret elevator.
        nextAway = this.away;
      }
      const currentWorld = localPosition(this.stand, this.along, this.away);
      const desiredWorld = localPosition(this.stand, nextAlong, nextAway);
      const resolved = resolveGroundMotion(
        currentWorld,
        desiredWorld,
        this.collisionRadius,
        this.y + this.collisionMinimumY,
        this.collisionHeight,
        colliders,
      );
      const resolvedDeltaX = resolved.x - this.stand.x;
      const resolvedDeltaZ = resolved.z - this.stand.z;
      nextAlong = clamp(
        resolvedDeltaX * alongAxisX + resolvedDeltaZ * alongAxisZ,
        minAlong,
        maxAlong,
      );
      nextAway = clamp(
        resolvedDeltaX * awayAxisX + resolvedDeltaZ * awayAxisZ,
        this.mapBounds.minAway + this.collisionRadius,
        this.mapBounds.maxAway - this.collisionRadius,
      );
      this.along = nextAlong;
      this.away = nextAway;
    }

    const surface = grandstandSurfaceAt(this.stand, this.away, this.along);
    this.surfaceRow = surface.row;
    this.verticalVelocity -= GRAVITY * delta;
    this.y += this.verticalVelocity * delta;
    if (this.y <= surface.height) {
      this.y = surface.height;
      this.verticalVelocity = 0;
    }
    const airborne = this.verticalVelocity !== 0 || this.y > surface.height + 1e-4;
    const emoteRequested = input.handbrake && input.jump !== true && input.run !== true;
    const pose: CharacterPose = airborne
      ? 'airborne'
      : emoteRequested
      ? 'play'
      : direction === 0 ? 'idle' : isRunning ? 'run' : 'walk';
    const expression: CharacterExpression = helmetStowing || emoteRequested || airborne
      ? 'happy'
      : 'idle';
    if (pose !== this.activePose || expression !== this.activeExpression) {
      this.activePose = pose;
      this.activeExpression = expression;
      this.motion = setCharacterMotion(this.motion, {
        pose,
        speed: pose === 'run' ? 0.98
          : pose === 'walk' ? 0.72
            : pose === 'play' ? 0.86 : pose === 'airborne' ? 0.9 : 0,
        expression,
        facing: 1,
      }, this.elapsed);
    }
    this.applyPose();
    return this.snapshot();
  }

  public updateCinematic(
    deltaSeconds: number,
    frame: GrandstandExplorerCinematicFrame,
  ): GrandstandExplorerSnapshot {
    this.previewMode = false;
    this.elapsed += clamp(deltaSeconds, 0, 0.05);
    const deltaX = frame.x - this.stand.x;
    const deltaZ = frame.z - this.stand.z;
    this.along = clamp(
      deltaX * Math.cos(this.stand.heading) + deltaZ * -Math.sin(this.stand.heading),
      this.mapBounds.minAlong + this.collisionRadius,
      this.mapBounds.maxAlong - this.collisionRadius,
    );
    this.away = clamp(
      deltaX * Math.sin(this.stand.heading) + deltaZ * Math.cos(this.stand.heading),
      this.mapBounds.minAway + this.collisionRadius,
      this.mapBounds.maxAway - this.collisionRadius,
    );
    const surface = grandstandSurfaceAt(this.stand, this.away, this.along);
    this.y = Math.max(surface.height, frame.y);
    this.verticalVelocity = 0;
    this.surfaceRow = surface.row;
    this.heading = frame.heading;
    this.jumpLatch = false;
    const wink = frame.wink ?? null;
    if (
      frame.pose !== this.activePose
      || frame.expression !== this.activeExpression
      || wink !== this.activeWink
    ) {
      this.activePose = frame.pose;
      this.activeExpression = frame.expression;
      this.activeWink = wink;
      this.motion = setCharacterMotion(this.motion, {
        pose: frame.pose,
        speed: frame.pose === 'run' ? 0.98
          : frame.pose === 'airborne' || frame.pose === 'play' ? 0.9 : 0,
        expression: frame.expression,
        talking: false,
        wink,
        facing: 1,
      }, this.elapsed);
    }
    if (frame.helmetCarryAmount !== undefined) {
      this.helmetStowStartedAt = null;
      this.helmetCarryAmount = frame.helmetCarryAmount;
    }
    this.applyPose();
    return this.snapshot();
  }

  public reset(): void {
    this.elapsed = 0;
    this.along = 0;
    this.away = -0.9;
    const surface = grandstandSurfaceAt(this.stand, this.away, this.along);
    this.y = surface.height;
    this.verticalVelocity = 0;
    this.surfaceRow = surface.row;
    this.heading = this.stand.heading;
    this.jumpLatch = false;
    this.previewMode = false;
    this.activePose = 'idle';
    this.activeExpression = 'idle';
    this.activeWink = null;
    this.helmetCarryAmount = 0;
    this.helmetStowStartedAt = null;
    this.motion = createCharacterMotionState({ autoBlink: true, autoGaze: true });
    this.visorMotion = createPaperCircuitVisorMotionState();
    this.applyPose();
  }

  public placeAt(snapshot: Pick<GrandstandExplorerSnapshot, 'x' | 'y' | 'z' | 'heading'>): void {
    this.previewMode = false;
    const deltaX = snapshot.x - this.stand.x;
    const deltaZ = snapshot.z - this.stand.z;
    this.along = clamp(
      deltaX * Math.cos(this.stand.heading) + deltaZ * -Math.sin(this.stand.heading),
      this.mapBounds.minAlong + this.collisionRadius,
      this.mapBounds.maxAlong - this.collisionRadius,
    );
    this.away = clamp(
      deltaX * Math.sin(this.stand.heading) + deltaZ * Math.cos(this.stand.heading),
      this.mapBounds.minAway + this.collisionRadius,
      this.mapBounds.maxAway - this.collisionRadius,
    );
    const surface = grandstandSurfaceAt(this.stand, this.away, this.along);
    this.y = Math.max(surface.height, snapshot.y);
    this.verticalVelocity = 0;
    this.surfaceRow = surface.row;
    this.heading = snapshot.heading;
    this.elapsed = 0;
    this.jumpLatch = false;
    this.activePose = 'idle';
    this.activeExpression = 'idle';
    this.activeWink = null;
    this.helmetStowStartedAt = null;
    this.motion = createCharacterMotionState({ autoBlink: true, autoGaze: true });
    this.visorMotion = createPaperCircuitVisorMotionState();
    this.applyPose();
  }

  public setVisible(visible: boolean): void {
    this.actorVisible = visible;
    this.rig.root.visible = visible;
    this.backpackRig.root.visible = visible;
    this.helmetItemRig.root.visible = this.shouldShowHelmetItem();
  }

  public setPreviewTransform(position: WorldPosition, heading: number): void {
    this.previewPosition = position;
    this.previewHeading = heading;
  }

  public setPreviewMode(active: boolean): void {
    if (this.previewMode === active) return;
    this.previewMode = active;
    if (active) {
      this.elapsed = 0;
      this.activePose = 'idle';
      this.activeExpression = 'idle';
      this.activeWink = null;
      this.helmetCarryAmount = 0;
      this.previewHelmetEquipAt = 2;
      this.motion = createCharacterMotionState({ autoBlink: true, autoGaze: true });
      this.visorMotion = createPaperCircuitVisorMotionState();
      this.applyPose();
    } else {
      this.reset();
    }
  }

  public updatePreview(deltaSeconds: number): GrandstandExplorerSnapshot {
    if (!this.previewMode) this.setPreviewMode(true);
    const delta = clamp(deltaSeconds, 0, 0.05);
    this.elapsed += delta;
    this.helmetCarryAmount = this.previewHelmetEquipAt === null
      ? 0
      : smoothStep((this.elapsed - this.previewHelmetEquipAt) / 0.82);
    const helmetTransitioning = this.helmetCarryAmount > 0 && this.helmetCarryAmount < 1;
    let cycle = this.elapsed % this.previewLoopDuration;
    let pose = this.previewSequence[this.previewSequence.length - 1] as CharacterPose;
    let expression = this.previewExpressions[
      this.previewExpressions.length - 1
    ] as CharacterExpression;
    for (let index = 0; index < this.previewSequence.length; index += 1) {
      const duration = this.previewDurations[index] as number;
      if (cycle <= duration) {
        pose = this.previewSequence[index] as CharacterPose;
        expression = this.previewExpressions[index] as CharacterExpression;
        break;
      }
      cycle -= duration;
    }
    if (helmetTransitioning) {
      pose = 'idle';
      expression = 'happy';
    }
    if (pose !== this.activePose || expression !== this.activeExpression) {
      this.activePose = pose;
      this.activeExpression = expression;
      this.motion = setCharacterMotion(this.motion, {
        pose,
        speed: pose === 'run' ? 0.98 : pose === 'walk' ? 0.8 : pose === 'play' || pose === 'airborne' ? 0.9 : 0,
        expression,
        facing: 1,
      }, this.elapsed);
    }
    this.heading = this.previewHeading + Math.sin(this.elapsed * 0.9) * 0.08;
    this.applyPose();
    return this.snapshot();
  }

  public holdPreviewHelmetStored(): void {
    if (!this.previewMode) throw new Error('Preview helmet timing requires preview mode');
    this.previewHelmetEquipAt = null;
    this.helmetCarryAmount = 0;
    this.applyPose();
  }

  public schedulePreviewHelmetEquip(delaySeconds = 2): void {
    if (!this.previewMode) throw new Error('Preview helmet timing requires preview mode');
    if (!(delaySeconds >= 0) || !Number.isFinite(delaySeconds)) {
      throw new RangeError('Preview helmet delay must be a non-negative finite number');
    }
    this.previewHelmetEquipAt = this.elapsed + delaySeconds;
  }

  public stowHelmetInBackpack(): void {
    this.previewMode = false;
    this.helmetCarryAmount = 1;
    this.helmetStowStartedAt = this.elapsed;
    this.applyPose();
  }

  public dispose(): void {
    this.rig.dispose();
    this.backpackRig.dispose();
    this.helmetItemRig.dispose();
  }

  private applyPose(): void {
    const position = this.previewMode && this.previewPosition !== null
      ? this.previewPosition
      : { ...localPosition(this.stand, this.along, this.away), y: this.y };
    const halfAngle = this.heading * 0.5;
    this.rig.setWorldPose(Object.freeze({
      position: Object.freeze([position.x, position.y, position.z] as const),
      rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
    }));
    const actorScale = this.previewMode ? PREVIEW_SCALE : EXPLORER_SCALE;
    this.rig.root.scale.setScalar(actorScale);
    applySolidCharacterMotion(
      this.rig,
      sampleCharacterMotion(this.identity, this.motion, this.elapsed),
    );
    const backpackPose = this.rig.getSocketWorldPose('backpack');
    const handPose = this.rig.getSocketWorldPose('hand:right');
    const headPose = this.rig.getSocketWorldPose('head');
    if (backpackPose === null || handPose === null || headPose === null) {
      throw new Error('Paper Circuit helmet carry motion requires backpack, hand, and head sockets');
    }
    this.backpackRig.setWorldPose(backpackPose);
    this.backpackRig.root.scale.setScalar(actorScale * 0.92);
    applySolidPaperCircuitBackpackMotion(
      this.backpackRig,
      paperCircuitBackpackOpenAmount(this.helmetCarryAmount),
    );
    const storagePose = this.backpackRig.getSocketWorldPose('helmet-storage');
    if (storagePose === null) throw new Error('Paper Circuit backpack requires helmet storage');
    this.helmetItemRig.setWorldPose(interpolatePaperCircuitHelmetCarryPose(
      storagePose,
      handPose,
      headPose,
      this.helmetCarryAmount,
      this.identity.head.height * actorScale * 0.86,
    ));
    const mount = this.solid.nodes.find((node) => (
      node.id === assetExtensionScope(this.helmet).id('helmet')
    ));
    const fitScale = mount?.restScale?.[0];
    if (fitScale === undefined) throw new Error('Paper Circuit helmet mount has no fit scale');
    const storedScale = 0.62;
    const handScale = smoothStep(
      this.helmetCarryAmount / PAPER_CIRCUIT_HELMET_HAND_CARRY_AMOUNT,
    );
    const carryScale = storedScale + (1 - storedScale) * handScale;
    this.helmetItemRig.root.scale.setScalar(fitScale * actorScale * carryScale);
    applySolidPaperCircuitHelmetGripMotion(
      this.helmetItemRig,
      this.helmet.data.item,
      paperCircuitHelmetGripAmountForCarry(this.helmetCarryAmount),
    );
    applySolidPaperCircuitHelmetItemVisorMotion(
      this.helmetItemRig,
      this.helmet.data.item,
      0,
    );
    this.setHelmetWorn(this.helmetCarryAmount >= 1);
    this.visorMotion = setPaperCircuitVisorPosition(
      this.visorMotion,
      this.helmet,
      this.helmetCarryAmount < 1
        ? 'down'
        : visorPosition(this.activePose, this.activeExpression),
      this.elapsed,
    );
    this.visorAmount = samplePaperCircuitVisorMotion(
      this.visorMotion,
      this.helmet,
      this.elapsed,
    );
    applySolidPaperCircuitVisorMotion(this.rig, this.helmet, this.visorAmount);
    applySolidPaperCircuitVisorReachMotion(
      this.rig,
      this.helmetWorn === true
        ? samplePaperCircuitVisorReachMotion(
          this.visorMotion,
          this.helmet,
          this.elapsed,
        )
        : 0,
    );
  }

  private setHelmetWorn(worn: boolean): void {
    if (this.helmetWorn === worn) {
      this.helmetItemRig.root.visible = this.shouldShowHelmetItem();
      return;
    }
    this.helmetWorn = worn;
    const scope = assetExtensionScope(this.helmet);
    for (const id of ['helmet', 'visor', 'hinge:left', 'hinge:right']) {
      this.rig.setPartVisible(scope.id(`part:${id}`), worn);
    }
    const containmentId = scope.id('containment:helmet');
    if (this.rig.containmentIds.includes(containmentId)) {
      this.rig.setContainmentState(containmentId, worn);
    }
    this.helmetItemRig.root.visible = this.shouldShowHelmetItem();
  }

  private shouldShowHelmetItem(): boolean {
    return this.actorVisible && this.helmetWorn !== true && this.helmetCarryAmount > 0.015;
  }

}
