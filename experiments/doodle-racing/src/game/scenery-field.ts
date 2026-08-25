import {
  SolidRig,
  createSolidTreeBlueprint,
  createTreeIdentity,
  type SolidAssetBlueprint,
} from '../../../../src/index.js';
import { createCourseBlueprint } from './course-blueprint.js';
import type { CourseLayout } from './course.js';
import type { DoodleSceneAsset } from './doodle-scene.js';
import { createRaceSceneryBlueprint } from './race-scenery-blueprint.js';
import type { RaceWorldLayout } from './race-world.js';

type TreeAsset = Readonly<{
  solid: SolidAssetBlueprint<'tree'>;
  rig: SolidRig;
}>;

export class SceneryField {
  private readonly courseSolid: SolidAssetBlueprint<'race-course'>;
  private readonly courseRig: SolidRig;
  private readonly scenerySolid: SolidAssetBlueprint<'race-scenery'>;
  private readonly sceneryRig: SolidRig;
  private readonly trees: readonly TreeAsset[];

  public constructor(course: CourseLayout, world: RaceWorldLayout) {
    this.courseSolid = createCourseBlueprint(course);
    this.courseRig = new SolidRig(this.courseSolid, { instanceId: 'paper-circuit:course' });
    this.scenerySolid = createRaceSceneryBlueprint(course, world);
    this.sceneryRig = new SolidRig(this.scenerySolid, { instanceId: 'paper-circuit:scenery' });
    this.trees = Object.freeze(world.trees.map((placement) => {
      const identity = createTreeIdentity(placement.seed, {
        archetype: placement.seed % 5 === 0 ? 'pine' : placement.seed % 3 === 0 ? 'windswept' : 'broadleaf',
        season: placement.seed % 4 === 0 ? 'autumn' : 'summer',
      });
      const solid = createSolidTreeBlueprint(identity, {
        artDirection: 'storybook',
        physical: Object.freeze({ finish: 'matte' }),
      });
      const rig = new SolidRig(solid, { instanceId: `paper-circuit:${placement.id}` });
      rig.root.scale.setScalar(placement.scale);
      const halfAngle = placement.rotation * 0.5;
      rig.setWorldPose(Object.freeze({
        position: Object.freeze([placement.x, 0, placement.z] as const),
        rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
      }));
      return Object.freeze({ solid, rig });
    }));
  }

  public doodleAssets(): readonly DoodleSceneAsset[] {
    return Object.freeze([
      Object.freeze({ solid: this.courseSolid, rig: this.courseRig }),
      Object.freeze({ solid: this.scenerySolid, rig: this.sceneryRig }),
      ...this.trees.map(({ solid, rig }) => Object.freeze({ solid, rig })),
    ]);
  }

  public collisionRigs(): readonly SolidRig[] {
    return Object.freeze([
      this.sceneryRig,
      ...this.trees.map(({ rig }) => rig),
    ]);
  }

  public setVisible(visible: boolean): void {
    this.courseRig.root.visible = visible;
    this.sceneryRig.root.visible = visible;
    for (const { rig } of this.trees) rig.root.visible = visible;
  }

  public dispose(): void {
    this.courseRig.dispose();
    this.sceneryRig.dispose();
    for (const { rig } of this.trees) rig.dispose();
  }
}
