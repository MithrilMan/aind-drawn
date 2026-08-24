import * as THREE from 'three';

import {
  SolidRig,
  isolateSolidRigParts,
  type MediumId,
  type Point3,
} from '../../../../src/index.js';
import { DoodleScene } from './doodle-scene.js';
import type { VehicleInteractionPreviewSource } from './vehicle-field.js';

const CAMERA_OFFSET = new THREE.Vector3(4.2, 3.4, 5.2);
const CAMERA_DISTANCE = CAMERA_OFFSET.length();
const DEFAULT_CAMERA_OFFSET_DIRECTION = CAMERA_OFFSET.clone().normalize();
const CAMERA_ORIENTATION_RESPONSE = 14;

export class VehicleInteractionPreview {
  private readonly doodle: DoodleScene;
  private readonly focusCenter = new THREE.Vector3();
  private readonly focusSize = new THREE.Vector3();
  private readonly cameraOffsetDirection = DEFAULT_CAMERA_OFFSET_DIRECTION.clone();
  private readonly desiredCameraOffsetDirection = DEFAULT_CAMERA_OFFSET_DIRECTION.clone();
  private rig: SolidRig | null = null;
  private sourceKey: string | null = null;
  private elapsed = 0;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    medium: MediumId,
    private readonly instanceId = 'paper-circuit:vehicle-interaction-preview',
  ) {
    this.doodle = new DoodleScene(canvas, viewport, medium);
  }

  public setMedium(medium: MediumId): void {
    this.doodle.setMedium(medium);
  }

  public show(
    source: VehicleInteractionPreviewSource | null,
    cameraOffsetDirection?: Point3,
  ): void {
    if (source?.key === this.sourceKey) return;
    const previous = this.rig;
    if (source === null) {
      this.rig = null;
      this.sourceKey = null;
      this.doodle.setAssets([]);
      previous?.dispose();
      return;
    }

    const rig = new SolidRig(source.solid, {
      instanceId: this.instanceId,
    });
    rig.setInteractionState(source.interactionId, source.interactionState);
    let focus;
    try {
      focus = isolateSolidRigParts(rig, source.partIds);
    } catch (error) {
      rig.dispose();
      throw new Error(`Interaction preview ${source.key} could not focus its authored parts`, {
        cause: error,
      });
    }
    this.focusCenter.set(...focus.center);
    this.focusSize.set(...focus.size);
    // The camera belongs to the preview viewport, not to the generated rig.
    // Replacing a seed must therefore retain the current orbit unless the
    // gameplay callout explicitly supplies a new world-relative direction.
    if (cameraOffsetDirection !== undefined) {
      this.setCameraOffsetDirection(cameraOffsetDirection, true);
    }
    this.rig = rig;
    this.sourceKey = source.key;
    this.doodle.setAssets([Object.freeze({
      solid: source.solid,
      rig,
      strokes: source.strokes,
    })]);
    previous?.dispose();
    this.updateCamera();
  }

  public render(deltaSeconds: number, cameraOffsetDirection?: Point3): void {
    if (this.rig === null) return;
    this.elapsed += deltaSeconds;
    this.setCameraOffsetDirection(cameraOffsetDirection, false);
    this.cameraOffsetDirection.lerp(
      this.desiredCameraOffsetDirection,
      1 - Math.exp(-CAMERA_ORIENTATION_RESPONSE * deltaSeconds),
    ).normalize();
    this.updateCamera();
    this.doodle.render(this.elapsed);
  }

  public dispose(): void {
    this.doodle.dispose();
    this.rig?.dispose();
    this.rig = null;
    this.sourceKey = null;
  }

  private updateCamera(): void {
    const camera = this.doodle.camera;
    camera.position.copy(this.focusCenter).addScaledVector(
      this.cameraOffsetDirection,
      CAMERA_DISTANCE,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(this.focusCenter);
    const { width, height } = this.doodle.viewportSize();
    const aspect = width / height;
    const partSpan = Math.max(
      this.focusSize.x,
      this.focusSize.z,
      this.focusSize.y * 1.35,
      1.1,
    );
    const viewSize = partSpan * 1.48;
    camera.left = -viewSize * aspect * 0.5;
    camera.right = viewSize * aspect * 0.5;
    camera.top = viewSize * 0.5;
    camera.bottom = -viewSize * 0.5;
    camera.updateProjectionMatrix();
  }

  private setCameraOffsetDirection(direction: Point3 | undefined, immediate: boolean): void {
    if (direction === undefined) return;
    this.desiredCameraOffsetDirection.set(...direction).normalize();
    if (immediate) this.cameraOffsetDirection.copy(this.desiredCameraOffsetDirection);
  }
}
