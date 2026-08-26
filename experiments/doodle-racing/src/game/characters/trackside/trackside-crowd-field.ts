import {
  SeedTree,
  SolidRig,
  applySolidCharacterMotion,
  createCharacterMotionState,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  sampleCharacterMotion,
  setCharacterMotion,
  type CharacterMotionState,
  type CharacterPose,
  type SolidAssetBlueprint,
} from '../../../../../../src/index.js';
import {
  SpatialHash2D,
  discSeparationInto,
  fixedRateUpdateTick,
} from '@mithrilman/aind-game-runtime';
import {
  crowdCelebrationTarget,
  stepCrowdPursuit,
  type CrowdSeparationAgent,
} from '../shared/crowd-steering.js';
import type { DoodleSceneAsset } from '../../doodle-scene.js';
import { createPaperCircuitPersonIdentity } from '../shared/paper-circuit-person.js';
import type { RacerSnapshot } from '../../race-model.js';
import {
  createTracksideSpectators,
  type RaceWorldLayout,
  type TracksideSpectatorPlacement,
} from '../../race-world.js';
import type { CourseLayout } from '../../course.js';
import {
  TracksideSpectatorBehavior,
  type TracksideAmbientMode,
} from './trackside-spectator.js';

type TracksideSpectatorAsset = {
  placement: TracksideSpectatorPlacement;
  identity: ReturnType<typeof createPaperCircuitPersonIdentity>;
  solid: SolidAssetBlueprint<'character'>;
  rig: SolidRig;
  strokes: ReturnType<typeof createSolidCharacterInkStrokes>;
  motion: CharacterMotionState;
  pose: CharacterPose;
  mode: TracksideAmbientMode | 'invading' | 'celebrating';
  behavior: TracksideSpectatorBehavior;
  scale: number;
  invasionDelay: number;
  invasionSpeed: number;
  invasionParticipant: boolean;
  celebrationSlot: number;
  motionPhase: number;
  lastMotionTick: number;
};

const CROWD_MOTION_UPDATES_PER_SECOND = 20;
const TRACKSIDE_INVADER_COUNT = 6;
const CROWD_SEPARATION_DISTANCE = 0.9;

export class TracksideCrowdField {
  private readonly spectators: readonly TracksideSpectatorAsset[];
  private readonly invaders: readonly TracksideSpectatorAsset[];
  private readonly invaderAgents: readonly CrowdSeparationAgent[];
  private readonly separationIndex = new SpatialHash2D<CrowdSeparationAgent>(1);
  private readonly separationNeighbours: CrowdSeparationAgent[] = [];
  private readonly separationVector = { x: 0, z: 0 };
  private readonly celebrationTarget = { x: 0, z: 0 };
  private invasionStartedAt = 0;

  public constructor(course: CourseLayout, world: RaceWorldLayout, crowdSeed?: number) {
    const placements = crowdSeed === undefined
      ? world.tracksideSpectators
      : createTracksideSpectators(course, crowdSeed);
    const spectators = placements.map((placement, index) => {
      const identity = createPaperCircuitPersonIdentity(placement.seed);
      const random = new SeedTree(placement.seed).random('paper-circuit:trackside-motion');
      const solid = createSolidCharacterBlueprint(identity, {
        artDirection: 'storybook',
        physical: Object.freeze({ finish: 'matte' }),
      });
      const rig = new SolidRig(solid, { instanceId: `paper-circuit:${placement.id}` });
      const behavior = new TracksideSpectatorBehavior(
        placement,
        placement.heading + random.float(-0.12, 0.12),
      );
      // Roadside actors are read as individual characters rather than a distant
      // grandstand mass, so they need to sit much closer to the playable 0.66 scale.
      const scale = random.float(0.5, 0.58);
      const asset: TracksideSpectatorAsset = {
        placement,
        identity,
        solid,
        rig,
        strokes: createSolidCharacterInkStrokes(solid),
        motion: createCharacterMotionState({ autoBlink: true, autoGaze: true }),
        pose: 'idle',
        mode: 'idle',
        behavior,
        scale,
        invasionDelay: random.float(0.45, 1.55),
        invasionSpeed: random.float(5.25, 6.15),
        invasionParticipant: index < TRACKSIDE_INVADER_COUNT,
        celebrationSlot: 32 + index,
        motionPhase: random.float(0, 1 / CROWD_MOTION_UPDATES_PER_SECOND),
        lastMotionTick: -1,
      };
      this.applyAssetPose(asset, 0);
      return asset;
    });
    this.spectators = Object.freeze(spectators);
    this.invaders = Object.freeze(spectators.filter(({ invasionParticipant }) => (
      invasionParticipant
    )));
    this.invaderAgents = Object.freeze(this.invaders.map(({ behavior }) => behavior));
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze(this.spectators.map(({ solid, rig, strokes }) => Object.freeze({
      solid,
      rig,
      strokes,
    })));
  }

  public beginInvasion(elapsedSeconds: number): void {
    this.invasionStartedAt = elapsedSeconds;
  }

  public invasionAgents(): readonly CrowdSeparationAgent[] {
    return this.invaderAgents;
  }

  public update(
    elapsedSeconds: number,
    deltaSeconds: number,
    racers: readonly RacerSnapshot[],
    invasionTarget: Readonly<{ x: number; z: number }> | null = null,
    caught = false,
    sharedSeparationIndex: SpatialHash2D<CrowdSeparationAgent> | null = null,
  ): void {
    const separationIndex = sharedSeparationIndex ?? this.separationIndex;
    if (invasionTarget !== null && sharedSeparationIndex === null) {
      separationIndex.rebuild(this.invaderAgents);
    }
    for (const spectator of this.spectators) {
      if (
        invasionTarget !== null
        && spectator.invasionParticipant
        && elapsedSeconds - this.invasionStartedAt >= spectator.invasionDelay
      ) {
        const pursuitTarget = caught
          ? crowdCelebrationTarget(
            invasionTarget,
            spectator.celebrationSlot,
            this.celebrationTarget,
          )
          : invasionTarget;
        separationIndex.queryRadiusInto(
          spectator.behavior.x,
          spectator.behavior.z,
          CROWD_SEPARATION_DISTANCE,
          this.separationNeighbours,
        );
        discSeparationInto(
          spectator.behavior,
          this.separationNeighbours,
          CROWD_SEPARATION_DISTANCE,
          this.separationVector,
        );
        const pursuit = stepCrowdPursuit(
          spectator.behavior,
          pursuitTarget,
          racers,
          caught ? spectator.invasionSpeed * 0.58 : spectator.invasionSpeed,
          deltaSeconds,
          this.separationVector,
        );
        spectator.behavior.setWorldState(
          pursuit.x,
          pursuit.z,
          pursuit.moving ? pursuit.heading : spectator.behavior.heading,
        );
        this.setMotion(
          spectator,
          caught && Math.hypot(
            spectator.behavior.x - pursuitTarget.x,
            spectator.behavior.z - pursuitTarget.z,
          ) < 0.55
            ? 'celebrating'
            : 'invading',
          elapsedSeconds,
        );
      } else {
        this.setMotion(
          spectator,
          spectator.behavior.update(elapsedSeconds, deltaSeconds, racers),
          elapsedSeconds,
        );
      }
      this.applyAssetPose(spectator, elapsedSeconds);
    }
  }

  public nearestDistanceTo(x: number, z: number): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const spectator of this.invaders) {
      nearest = Math.min(nearest, Math.hypot(
        x - spectator.behavior.x,
        z - spectator.behavior.z,
      ));
    }
    return nearest;
  }

  public setVisible(visible: boolean): void {
    for (const { rig } of this.spectators) rig.root.visible = visible;
  }

  public dispose(): void {
    for (const { rig } of this.spectators) rig.dispose();
  }

  private setMotion(
    spectator: TracksideSpectatorAsset,
    mode: TracksideSpectatorAsset['mode'],
    elapsedSeconds: number,
  ): void {
    if (spectator.mode === mode) return;
    spectator.mode = mode;
    const pose: CharacterPose = mode === 'fleeing' || mode === 'invading'
      ? 'run'
      : mode === 'returning' ? 'walk'
      : mode === 'celebrating' ? 'dance' : 'idle';
    spectator.pose = pose;
    spectator.motion = setCharacterMotion(spectator.motion, {
      pose,
      expression: mode === 'fleeing' ? 'scared'
        : mode === 'watching' ? 'surprised'
          : mode === 'celebrating' ? 'happy' : 'idle',
      speed: pose === 'run' ? 0.98 : pose === 'walk' ? 0.72 : pose === 'dance' ? 0.86 : 0,
      talking: mode === 'celebrating',
    }, elapsedSeconds);
  }

  private applyAssetPose(spectator: TracksideSpectatorAsset, elapsedSeconds: number): void {
    const halfAngle = spectator.behavior.heading * 0.5;
    spectator.rig.setWorldPose(Object.freeze({
      position: Object.freeze([
        spectator.behavior.x,
        spectator.placement.y,
        spectator.behavior.z,
      ] as const),
      rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
    }));
    spectator.rig.root.scale.setScalar(spectator.scale);
    const updateTick = fixedRateUpdateTick(
      elapsedSeconds,
      CROWD_MOTION_UPDATES_PER_SECOND,
      spectator.motionPhase,
    );
    if (updateTick === spectator.lastMotionTick) return;
    spectator.lastMotionTick = updateTick;
    applySolidCharacterMotion(
      spectator.rig,
      sampleCharacterMotion(spectator.identity, spectator.motion, elapsedSeconds),
    );
    spectator.rig.root.scale.setScalar(spectator.scale);
  }
}
