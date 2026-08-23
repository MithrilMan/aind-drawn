import * as THREE from 'three';

import {
  InkedSolidScenePass,
  SolidRig,
  applySolidVehicleMotion,
  createInkedSolidBlueprint,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  createVehicleIdentity,
  createVehicleMotionState,
  sampleVehicleMotion,
  setVehicleMotion,
  type MediumId,
  type SolidAssetBlueprint,
  type VehicleIdentityRecipe,
  type VehicleMotionState,
} from '../../../../src/index.js';
import { createCourseBlueprint } from './course-blueprint.js';
import type { CourseLayout } from './course.js';
import type { RaceSnapshot, RacerSnapshot } from './race-model.js';

export type RaceCameraMode = 'follow' | 'full';

type VehicleRenderAsset = {
  identity: VehicleIdentityRecipe;
  solid: SolidAssetBlueprint<'vehicle'>;
  rig: SolidRig;
  motion: VehicleMotionState;
};

const VEHICLE_RECIPES = Object.freeze([
  Object.freeze({ id: 'you', seed: 4115, archetype: 'coupe' as const }),
  Object.freeze({ id: 'mica', seed: 4879, archetype: 'city' as const }),
  Object.freeze({ id: 'rook', seed: 4107, archetype: 'sedan' as const }),
  Object.freeze({ id: 'pip', seed: 4129, archetype: 'pickup' as const }),
]);

export class RaceStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 180);
  private readonly courseSolid: SolidAssetBlueprint<'race-course'>;
  private readonly courseRig: SolidRig;
  private readonly vehicles = new Map<string, VehicleRenderAsset>();
  private readonly observer: ResizeObserver;
  private readonly currentTarget = new THREE.Vector3();
  private pass: InkedSolidScenePass | null = null;
  private medium: MediumId;
  private cameraMode: RaceCameraMode = 'follow';
  private viewSize = 20;

  public constructor(
    canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    private readonly course: CourseLayout,
    medium: MediumId,
  ) {
    this.medium = medium;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xeee3c9, 1);
    this.courseSolid = createCourseBlueprint(course);
    this.courseRig = new SolidRig(this.courseSolid, { instanceId: 'paper-circuit:course' });
    this.scene.add(this.courseRig.root);
    for (const recipe of VEHICLE_RECIPES) {
      const identity = createVehicleIdentity(recipe.seed, {
        archetype: recipe.archetype,
        roofRack: false,
        spoiler: false,
      });
      const solid = createSolidVehicleBlueprint(identity, { finish: 'matte' });
      const rig = new SolidRig(solid, { instanceId: `paper-circuit:${recipe.id}` });
      this.scene.add(rig.root);
      this.vehicles.set(recipe.id, {
        identity,
        solid,
        rig,
        motion: createVehicleMotionState(),
      });
    }
    this.rebuildPass();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(viewport);
    this.resize();
  }

  public setMedium(medium: MediumId): void {
    if (medium === this.medium) return;
    this.medium = medium;
    this.rebuildPass();
  }

  public setCameraMode(mode: RaceCameraMode): void {
    this.cameraMode = mode;
  }

  public render(
    snapshot: RaceSnapshot,
    deltaSeconds: number,
    elapsedSeconds: number,
  ): void {
    for (const racer of snapshot.racers) this.updateVehicle(racer, elapsedSeconds);
    this.updateCamera(snapshot, deltaSeconds);
    this.pass?.render(this.scene, this.camera, elapsedSeconds);
  }

  public dispose(): void {
    this.observer.disconnect();
    this.pass?.dispose();
    this.courseRig.dispose();
    for (const { rig } of this.vehicles.values()) rig.dispose();
    this.vehicles.clear();
    this.renderer.dispose();
  }

  private updateVehicle(racer: RacerSnapshot, elapsedSeconds: number): void {
    const asset = this.vehicles.get(racer.id);
    if (asset === undefined) return;
    const halfAngle = racer.heading * 0.5;
    asset.rig.setWorldPose(Object.freeze({
      position: Object.freeze([racer.x, 0.06, racer.z] as const),
      rotation: Object.freeze([0, Math.sin(halfAngle), 0, Math.cos(halfAngle)] as const),
    }));
    asset.motion = setVehicleMotion(asset.motion, {
      travelDistance: racer.travelDistance,
      speed: Math.abs(racer.speed),
      steering: racer.steering,
      suspension: 0.42,
    });
    applySolidVehicleMotion(
      asset.rig,
      sampleVehicleMotion(asset.identity, asset.motion, elapsedSeconds),
    );
  }

  private updateCamera(snapshot: RaceSnapshot, deltaSeconds: number): void {
    const player = snapshot.racers.find(({ isPlayer }) => isPlayer);
    if (player === undefined) return;
    const fullCourse = this.cameraMode === 'full';
    const target = fullCourse
      ? new THREE.Vector3(
        (this.course.bounds.minimumX + this.course.bounds.maximumX) * 0.5,
        0,
        (this.course.bounds.minimumZ + this.course.bounds.maximumZ) * 0.5,
      )
      : new THREE.Vector3(player.x, 0.2, player.z);
    const smoothing = fullCourse ? 1 : 1 - Math.exp(-5.8 * deltaSeconds);
    this.currentTarget.lerp(target, smoothing);
    this.viewSize = fullCourse ? this.fullCourseViewSize() : 19;
    const offset = fullCourse
      ? new THREE.Vector3(-30, 42, 34)
      : new THREE.Vector3(-11, 17, 14);
    this.camera.position.copy(this.currentTarget).add(offset);
    this.camera.lookAt(this.currentTarget);
    this.updateProjection();
  }

  private fullCourseViewSize(): number {
    const width = this.course.bounds.maximumX - this.course.bounds.minimumX;
    const depth = this.course.bounds.maximumZ - this.course.bounds.minimumZ;
    const aspect = Math.max(0.4, this.viewport.clientWidth / Math.max(1, this.viewport.clientHeight));
    return Math.max(depth, width / aspect) * 1.16;
  }

  private updateProjection(): void {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    const aspect = width / height;
    this.camera.left = -this.viewSize * aspect * 0.5;
    this.camera.right = this.viewSize * aspect * 0.5;
    this.camera.top = this.viewSize * 0.5;
    this.camera.bottom = -this.viewSize * 0.5;
    this.camera.updateProjectionMatrix();
  }

  private rebuildPass(): void {
    this.pass?.dispose();
    const courseInk = createInkedSolidBlueprint(this.courseSolid, { medium: this.medium });
    this.pass = new InkedSolidScenePass(this.renderer, { paper: courseInk.paper });
    this.pass.register({
      instanceId: this.courseRig.instanceId,
      blueprint: courseInk,
      rig: this.courseRig,
    });
    for (const { solid, rig } of this.vehicles.values()) {
      this.pass.register({
        instanceId: rig.instanceId,
        blueprint: createInkedSolidBlueprint(solid, {
          medium: this.medium,
          strokes: createSolidVehicleInkStrokes(solid),
        }),
        rig,
      });
    }
    this.resize();
  }

  private readonly resize = (): void => {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    this.pass?.setSize(width, height, this.renderer.getPixelRatio());
    this.updateProjection();
  };
}
