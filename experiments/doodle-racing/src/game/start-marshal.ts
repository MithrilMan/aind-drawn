import {
  SolidRig,
  applySolidCharacterMotion,
  createCharacterMotionState,
  createSolidCharacterBlueprint,
  createSolidCharacterInkStrokes,
  sampleCharacterMotion,
  setCharacterMotion,
  type CharacterMotionState,
} from '../../../../src/index.js';
import {
  applySolidPaperCircuitRaceFlagMotion,
  createPaperCircuitRaceFlagIdentity,
  createSolidPaperCircuitRaceFlagBlueprint,
} from '../extensions/paper-circuit-race-flag/index.js';
import { sampleCourseAt, type CourseLayout } from './course.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import { createPaperCircuitPersonIdentity } from './paper-circuit-person.js';
import type { RaceSnapshot } from './race-model.js';

const MARSHAL_SEED = 74_031;
const MARSHAL_SCALE = 0.48;

export class StartMarshal {
  private readonly identity = createPaperCircuitPersonIdentity(MARSHAL_SEED);
  private readonly solid = createSolidCharacterBlueprint(this.identity, {
    artDirection: 'storybook',
    physical: Object.freeze({ finish: 'matte' }),
  });
  private readonly rig = new SolidRig(this.solid, { instanceId: 'paper-circuit:start-marshal' });
  private readonly flagIdentity = createPaperCircuitRaceFlagIdentity(MARSHAL_SEED + 1);
  private readonly flagSolid = createSolidPaperCircuitRaceFlagBlueprint(this.flagIdentity);
  private readonly flagRig = new SolidRig(this.flagSolid, { instanceId: 'paper-circuit:start-flag' });
  private motion: CharacterMotionState = createCharacterMotionState({ autoBlink: true, autoGaze: true });
  private active = false;
  private readonly x: number;
  private readonly z: number;
  private readonly heading: number;

  public constructor(course: CourseLayout) {
    const start = sampleCourseAt(course, 0.008);
    const offset = course.trackWidth * 0.5 + 1.3;
    this.x = start.x + start.normalX * offset;
    this.z = start.z + start.normalZ * offset;
    this.heading = Math.atan2(-start.normalX, -start.normalZ);
    this.applyPose(0, 0);
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze([
      Object.freeze({
        solid: this.solid,
        rig: this.rig,
        strokes: createSolidCharacterInkStrokes(this.solid),
      }),
      Object.freeze({ solid: this.flagSolid, rig: this.flagRig }),
    ]);
  }

  public update(snapshot: RaceSnapshot): void {
    const active = snapshot.phase === 'countdown'
      || (snapshot.phase === 'running' && snapshot.elapsed < 1.65);
    if (active !== this.active) {
      this.active = active;
      this.motion = setCharacterMotion(this.motion, {
        pose: active ? 'play' : 'idle',
        expression: active ? 'happy' : 'idle',
        speed: active ? 0.96 : 0,
        talking: active,
      }, snapshot.presentationTime);
    }
    const intensity = active
      ? snapshot.phase === 'countdown' ? 0.72 : 1
      : 0.08;
    this.applyPose(snapshot.presentationTime, intensity);
  }

  public updateIdle(elapsedSeconds: number): void {
    if (this.active) {
      this.active = false;
      this.motion = setCharacterMotion(this.motion, {
        pose: 'idle', expression: 'idle', speed: 0, talking: false,
      }, elapsedSeconds);
    }
    this.applyPose(elapsedSeconds, 0.08);
  }

  public setVisible(visible: boolean): void {
    this.rig.root.visible = visible;
    this.flagRig.root.visible = visible;
  }

  public dispose(): void {
    this.rig.dispose();
    this.flagRig.dispose();
  }

  private applyPose(elapsedSeconds: number, flagIntensity: number): void {
    const halfAngle = this.heading * 0.5;
    this.rig.setWorldPose(Object.freeze({
      position: Object.freeze([this.x, 0, this.z] as const),
      rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
    }));
    this.rig.root.scale.setScalar(MARSHAL_SCALE);
    applySolidCharacterMotion(
      this.rig,
      sampleCharacterMotion(this.identity, this.motion, elapsedSeconds),
    );
    this.rig.root.scale.setScalar(MARSHAL_SCALE);
    const hand = this.rig.getSocketWorldPose('hand:right');
    if (hand === null) throw new Error('Start marshal requires the right-hand socket');
    this.flagRig.setWorldPose(hand);
    this.flagRig.root.scale.setScalar(MARSHAL_SCALE);
    applySolidPaperCircuitRaceFlagMotion(this.flagRig, elapsedSeconds, flagIntensity);
  }
}

