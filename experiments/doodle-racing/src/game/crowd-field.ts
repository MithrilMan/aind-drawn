import {
  SeedTree,
  SolidRig,
  applySolidCharacterMotion,
  createCharacterIdentity,
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
} from '../../../../src/index.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import type { RaceWorldLayout } from './race-world.js';

type SpectatorAsset = {
  identity: CharacterIdentityRecipe;
  solid: SolidAssetBlueprint<'character'>;
  rig: SolidRig;
  motion: CharacterMotionState;
  cues: readonly CrowdCue[];
  cueDuration: number;
  phaseOffset: number;
  activeCue: number;
  scale: number;
};

type CrowdCue = Readonly<{
  pose: CharacterPose;
  expression: CharacterExpression;
  speed: number;
  talking: boolean;
}>;

const CROWD_POSES = Object.freeze<CharacterPose[]>([
  'play', 'play', 'airborne', 'idle', 'play', 'sit',
]);
const CROWD_EXPRESSIONS = Object.freeze<CharacterExpression[]>([
  'happy', 'happy', 'surprised', 'happy', 'idle',
]);

export class CrowdField {
  private readonly spectators: readonly SpectatorAsset[];

  public constructor(world: RaceWorldLayout) {
    this.spectators = Object.freeze(world.grandstand.spectators.map((placement, index) => {
      const identity = createCharacterIdentity(placement.seed);
      const random = new SeedTree(placement.seed).random('paper-circuit:crowd-motion');
      const solid = createSolidCharacterBlueprint(identity, { finish: 'matte' });
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
          speed: pose === 'airborne' ? 0.98 : pose === 'play' ? 0.88 : 0.34,
          talking: random.chance(0.46),
        });
      }));
      return {
        identity,
        solid,
        rig,
        motion: createCharacterMotionState(),
        cues,
        cueDuration: random.float(0.72, 1.34),
        phaseOffset: random.float(0, 2.4) + index * 0.037,
        activeCue: -1,
        scale,
      };
    }));
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze(this.spectators.map(({ solid, rig }) => Object.freeze({
      solid,
      rig,
      strokes: createSolidCharacterInkStrokes(solid),
    })));
  }

  public update(elapsedSeconds: number): void {
    for (const spectator of this.spectators) {
      const cueIndex = Math.floor(
        (elapsedSeconds + spectator.phaseOffset) / spectator.cueDuration,
      );
      if (cueIndex !== spectator.activeCue) {
        spectator.activeCue = cueIndex;
        const cue = spectator.cues[cueIndex % spectator.cues.length] as CrowdCue;
        const cueStartedAt = Math.max(
          0,
          cueIndex * spectator.cueDuration - spectator.phaseOffset,
        );
        spectator.motion = setCharacterMotion(spectator.motion, cue, cueStartedAt);
      }
      applySolidCharacterMotion(
        spectator.rig,
        sampleCharacterMotion(
          spectator.identity,
          spectator.motion,
          elapsedSeconds,
        ),
      );
      spectator.rig.root.scale.setScalar(spectator.scale);
    }
  }

  public dispose(): void {
    for (const { rig } of this.spectators) rig.dispose();
  }
}
