import {
  SeedTree,
  SolidRig,
  applySolidCharacterMotion,
  createCharacterMotionState,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  sampleCharacterMotion,
  setCharacterMotion,
  type CharacterExpression,
  type CharacterIdentityRecipe,
  type CharacterMotionState,
  type CharacterPose,
  type SolidAssetBlueprint,
} from '../../../../../../src/index.js';
import {
  SpatialHash2D,
  discSeparationInto,
  fixedRateUpdateTick,
} from '@mithrilman/aind-game-runtime';
import type { DoodleSceneAsset } from '../../doodle-scene.js';
import {
  crowdCelebrationTarget,
  stepCrowdPursuit,
  type CrowdSeparationAgent,
} from '../shared/crowd-steering.js';
import { createPaperCircuitPersonIdentity } from '../shared/paper-circuit-person.js';
import type { RacerSnapshot } from '../../race-model.js';
import {
  createGrandstandSpectators,
  type RaceWorldLayout,
  type SpectatorPlacement,
} from '../../race-world.js';

type SpectatorAsset = {
  placement: SpectatorPlacement;
  identity: CharacterIdentityRecipe;
  solid: SolidAssetBlueprint<'character'>;
  rig: SolidRig;
  strokes: ReturnType<typeof createSolidCharacterInkStrokes>;
  motion: CharacterMotionState;
  cues: readonly CrowdCue[];
  cueDuration: number;
  scheduleOffset: number;
  motionTimeOffset: number;
  motionTimeScale: number;
  activeCue: number;
  celebrationCue: number;
  scale: number;
  x: number;
  y: number;
  z: number;
  heading: number;
  invasionDelay: number;
  invasionSpeed: number;
  invasionMode: 'waiting' | 'running' | 'celebrating';
  invasionParticipant: boolean;
  celebrationSlot: number;
  motionPhase: number;
  lastMotionTick: number;
};

type CrowdCue = Readonly<{
  pose: CharacterPose;
  expression: CharacterExpression;
  speed: number;
  talking: boolean;
}>;

export type CrowdMotionTiming = Readonly<{
  cueDuration: number;
  scheduleOffset: number;
  motionTimeOffset: number;
  motionTimeScale: number;
}>;

const CROWD_POSES = Object.freeze<CharacterPose[]>([
  'play', 'dance', 'airborne', 'idle', 'dance', 'sit',
]);
const CROWD_EXPRESSIONS = Object.freeze<CharacterExpression[]>([
  'happy', 'happy', 'surprised', 'happy', 'idle',
]);
const CROWD_MOTION_UPDATES_PER_SECOND = 20;
const GRANDSTAND_INVADER_COUNT = 18;
const CROWD_SEPARATION_DISTANCE = 0.86;

export function createCrowdMotionTiming(seed: number): CrowdMotionTiming {
  const random = new SeedTree(seed).random('paper-circuit:crowd-motion:timing');
  return Object.freeze({
    cueDuration: random.float(0.82, 2.15),
    scheduleOffset: random.float(0, 5.8),
    motionTimeOffset: random.float(3.2, 19.6),
    motionTimeScale: random.float(0.78, 1.22),
  });
}

export class CrowdField {
  private readonly spectators: readonly SpectatorAsset[];
  private readonly invaders: readonly SpectatorAsset[];
  private readonly separationIndex = new SpatialHash2D<CrowdSeparationAgent>(1);
  private readonly separationNeighbours: CrowdSeparationAgent[] = [];
  private readonly separationVector = { x: 0, z: 0 };
  private readonly celebrationTarget = { x: 0, z: 0 };

  public constructor(world: RaceWorldLayout, crowdSeed?: number) {
    const placements = crowdSeed === undefined
      ? world.grandstand.spectators
      : createGrandstandSpectators(world.grandstand, crowdSeed);
    const spectators = placements.map((placement, index) => {
      const identity = createPaperCircuitPersonIdentity(placement.seed);
      const random = new SeedTree(placement.seed).random('paper-circuit:crowd-motion');
      const solid = createSolidCharacterBlueprint(identity, {
        artDirection: 'storybook',
        physical: Object.freeze({ finish: 'matte' }),
      });
      const rig = new SolidRig(solid, { instanceId: `paper-circuit:${placement.id}` });
      const yaw = placement.heading + random.float(-0.14, 0.14);
      const halfAngle = yaw * 0.5;
      const scale = 0.36 + random.float(0, 0.055);
      rig.root.scale.setScalar(scale);
      rig.setWorldPose(Object.freeze({
        position: Object.freeze([placement.x, placement.y, placement.z] as const),
        rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
      }));
      const cues = Object.freeze(Array.from({ length: 7 }, (): CrowdCue => {
        const pose = random.pick(CROWD_POSES);
        return Object.freeze({
          pose,
          expression: random.pick(CROWD_EXPRESSIONS),
          speed: pose === 'airborne' ? 0.98
            : pose === 'play' ? 0.88
              : pose === 'dance' ? 0.8 : 0.34,
          talking: random.chance(0.46),
        });
      }));
      const timing = createCrowdMotionTiming(placement.seed);
      return {
        placement,
        identity,
        solid,
        rig,
        strokes: createSolidCharacterInkStrokes(solid),
        motion: createCharacterMotionState(),
        cues,
        ...timing,
        activeCue: -1,
        celebrationCue: -1,
        scale,
        x: placement.x,
        y: placement.y,
        z: placement.z,
        heading: yaw,
        invasionDelay: random.float(0.55, 2.05),
        invasionSpeed: random.float(5.4, 6.35),
        invasionMode: 'waiting' as const,
        invasionParticipant: index < GRANDSTAND_INVADER_COUNT,
        celebrationSlot: index,
        motionPhase: random.float(0, 1 / CROWD_MOTION_UPDATES_PER_SECOND),
        lastMotionTick: -1,
      };
    });
    this.spectators = Object.freeze(spectators);
    this.invaders = Object.freeze(spectators.filter(({ invasionParticipant }) => (
      invasionParticipant
    )));
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze(this.spectators.map(({ solid, rig, strokes }) => Object.freeze({
      solid,
      rig,
      strokes,
    })));
  }

  public setCelebrating(active: boolean, elapsedSeconds: number): void {
    if (this.celebrationActive === active) return;
    this.celebrationActive = active;
    this.celebrationStartedAt = elapsedSeconds;
    for (const spectator of this.spectators) {
      spectator.activeCue = -1;
      spectator.celebrationCue = -1;
    }
  }

  public update(elapsedSeconds: number): void {
    for (const spectator of this.spectators) {
      const updateTick = fixedRateUpdateTick(
        elapsedSeconds,
        CROWD_MOTION_UPDATES_PER_SECOND,
        spectator.motionPhase,
      );
      if (updateTick === spectator.lastMotionTick) continue;
      spectator.lastMotionTick = updateTick;
      const motionTime = spectator.motionTimeOffset
        + elapsedSeconds * spectator.motionTimeScale;
      if (this.celebrationActive) {
        const celebrationStartedAt = spectator.motionTimeOffset
          + this.celebrationStartedAt * spectator.motionTimeScale;
        const cueIndex = Math.floor(
          (motionTime - celebrationStartedAt + spectator.scheduleOffset)
            / spectator.cueDuration,
        );
        if (cueIndex !== spectator.celebrationCue) {
          spectator.celebrationCue = cueIndex;
          const cue = spectator.cues[cueIndex % spectator.cues.length] as CrowdCue;
          const cueStartedAt = Math.max(
            0,
            celebrationStartedAt - spectator.scheduleOffset
              + cueIndex * spectator.cueDuration,
          );
          spectator.motion = setCharacterMotion(spectator.motion, {
            pose: 'dance',
            expression: cue.expression,
            speed: 0.82,
            talking: cue.talking,
          }, cueStartedAt);
        }
      } else {
        const cueIndex = Math.floor(
          (motionTime + spectator.scheduleOffset) / spectator.cueDuration,
        );
        if (cueIndex !== spectator.activeCue) {
          spectator.activeCue = cueIndex;
          const cue = spectator.cues[cueIndex % spectator.cues.length] as CrowdCue;
          const cueStartedAt = Math.max(
            0,
            cueIndex * spectator.cueDuration - spectator.scheduleOffset,
          );
          spectator.motion = setCharacterMotion(spectator.motion, cue, cueStartedAt);
        }
      }
      applySolidCharacterMotion(
        spectator.rig,
        sampleCharacterMotion(
          spectator.identity,
          spectator.motion,
          motionTime,
        ),
      );
      spectator.rig.root.scale.setScalar(spectator.scale);
    }
  }

  public beginInvasion(elapsedSeconds: number): void {
    this.invasionStartedAt = elapsedSeconds;
    for (const spectator of this.spectators) spectator.invasionMode = 'waiting';
  }

  public invasionAgents(): readonly CrowdSeparationAgent[] {
    return this.invaders;
  }

  public updateInvasion(
    elapsedSeconds: number,
    deltaSeconds: number,
    target: Readonly<{ x: number; z: number }>,
    racers: readonly RacerSnapshot[],
    caught: boolean,
    sharedSeparationIndex: SpatialHash2D<CrowdSeparationAgent> | null = null,
  ): void {
    const invasionElapsed = elapsedSeconds - this.invasionStartedAt;
    const separationIndex = sharedSeparationIndex ?? this.separationIndex;
    if (sharedSeparationIndex === null) separationIndex.rebuild(this.invaders);
    for (const spectator of this.spectators) {
      if (!spectator.invasionParticipant) {
        if (spectator.invasionMode !== 'celebrating') {
          spectator.invasionMode = 'celebrating';
          spectator.motion = setCharacterMotion(spectator.motion, {
            pose: 'dance',
            expression: 'happy',
            speed: 0.82,
            talking: true,
          }, elapsedSeconds);
        }
        this.applyMotionAtBudget(spectator, elapsedSeconds, elapsedSeconds);
        continue;
      }
      if (invasionElapsed >= spectator.invasionDelay) {
        const pursuitTarget = caught
          ? crowdCelebrationTarget(target, spectator.celebrationSlot, this.celebrationTarget)
          : target;
        separationIndex.queryRadiusInto(
          spectator.x,
          spectator.z,
          CROWD_SEPARATION_DISTANCE,
          this.separationNeighbours,
        );
        discSeparationInto(
          spectator,
          this.separationNeighbours,
          CROWD_SEPARATION_DISTANCE,
          this.separationVector,
        );
        const pursuit = stepCrowdPursuit(
          spectator,
          pursuitTarget,
          racers,
          caught ? spectator.invasionSpeed * 0.58 : spectator.invasionSpeed,
          deltaSeconds,
          this.separationVector,
        );
        spectator.x = pursuit.x;
        spectator.z = pursuit.z;
        if (pursuit.moving) spectator.heading = pursuit.heading;
        const distanceToTarget = Math.hypot(
          pursuitTarget.x - spectator.x,
          pursuitTarget.z - spectator.z,
        );
        const mode = caught && distanceToTarget < 1.8 ? 'celebrating' : 'running';
        if (mode !== spectator.invasionMode) {
          spectator.invasionMode = mode;
          spectator.motion = setCharacterMotion(spectator.motion, {
            pose: mode === 'celebrating' ? 'dance' : 'run',
            expression: mode === 'celebrating' ? 'happy' : 'surprised',
            speed: mode === 'celebrating' ? 0.9 : 0.98,
            talking: mode === 'celebrating',
          }, elapsedSeconds);
        }
      } else if (spectator.invasionMode !== 'waiting') {
        spectator.invasionMode = 'waiting';
      }
      const travelled = Math.hypot(
        spectator.x - spectator.placement.x,
        spectator.z - spectator.placement.z,
      );
      spectator.y = Math.max(0, spectator.placement.y - travelled * 0.58);
      const halfAngle = spectator.heading * 0.5;
      spectator.rig.setWorldPose(Object.freeze({
        position: Object.freeze([spectator.x, spectator.y, spectator.z] as const),
        rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
      }));
      this.applyMotionAtBudget(spectator, elapsedSeconds, elapsedSeconds);
    }
  }

  public nearestDistanceTo(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const spectator of this.invaders) {
      nearest = Math.min(nearest, Math.hypot(x - spectator.x, z - spectator.z));
    }
    return nearest;
  }

  private celebrationActive = false;
  private celebrationStartedAt = 0;
  private invasionStartedAt = 0;

  public setVisible(visible: boolean): void {
    for (const { rig } of this.spectators) rig.root.visible = visible;
  }

  public dispose(): void {
    for (const { rig } of this.spectators) rig.dispose();
  }

  private applyMotionAtBudget(
    spectator: SpectatorAsset,
    elapsedSeconds: number,
    motionTime: number,
  ): void {
    const updateTick = fixedRateUpdateTick(
      elapsedSeconds,
      CROWD_MOTION_UPDATES_PER_SECOND,
      spectator.motionPhase,
    );
    if (updateTick === spectator.lastMotionTick) return;
    spectator.lastMotionTick = updateTick;
    applySolidCharacterMotion(
      spectator.rig,
      sampleCharacterMotion(spectator.identity, spectator.motion, motionTime),
    );
    spectator.rig.root.scale.setScalar(spectator.scale);
  }
}
