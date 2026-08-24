import type { MediumId } from '../../../../src/index.js';
import type { CourseLayout } from './course.js';
import { CrowdField } from './crowd-field.js';
import { DoodleScene } from './doodle-scene.js';
import { RaceCameraController, type RaceCameraMode } from './race-camera.js';
import type { RaceSnapshot } from './race-model.js';
import type { RaceWorldLayout } from './race-world.js';
import { SceneryField } from './scenery-field.js';
import { VehicleField } from './vehicle-field.js';

export type { RaceCameraMode } from './race-camera.js';

export class RaceStage {
  private readonly doodle: DoodleScene;
  private readonly scenery: SceneryField;
  private readonly vehicles = new VehicleField();
  private readonly crowd: CrowdField;
  private readonly camera: RaceCameraController;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    course: CourseLayout,
    world: RaceWorldLayout,
    medium: MediumId,
  ) {
    this.doodle = new DoodleScene(canvas, viewport, medium);
    this.scenery = new SceneryField(course, world);
    this.crowd = new CrowdField(world);
    this.doodle.setAssets(Object.freeze([
      ...this.scenery.doodleAssets(),
      ...this.vehicles.doodleAssets(),
      ...this.crowd.doodleAssets(),
    ]));
    this.camera = new RaceCameraController(
      this.doodle.camera,
      course,
      world,
      () => this.doodle.viewportSize(),
    );
  }

  public setMedium(medium: MediumId): void {
    this.doodle.setMedium(medium);
  }

  public setCameraMode(mode: RaceCameraMode): void {
    this.camera.setMode(mode);
  }

  public render(snapshot: RaceSnapshot, deltaSeconds: number): void {
    this.vehicles.update(snapshot.racers, snapshot.presentationTime);
    this.crowd.update(snapshot.presentationTime);
    this.camera.update(snapshot, deltaSeconds, snapshot.presentationTime);
    this.doodle.render(snapshot.presentationTime);
  }

  public dispose(): void {
    this.doodle.dispose();
    this.crowd.dispose();
    this.vehicles.dispose();
    this.scenery.dispose();
  }
}
