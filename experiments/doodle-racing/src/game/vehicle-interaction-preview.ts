import * as THREE from 'three';

import {
  SolidRig,
  isolateSolidRigParts,
  type MediumId,
} from '../../../../src/index.js';
import { DoodleScene } from './doodle-scene.js';
import type { VehicleInteractionPreviewSource } from './vehicle-field.js';

const CAMERA_OFFSET = new THREE.Vector3(4.2, 3.4, 5.2);

export class VehicleInteractionPreview {
  private readonly doodle: DoodleScene;
  private readonly focusCenter = new THREE.Vector3();
  private readonly focusSize = new THREE.Vector3();
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

  public show(source: VehicleInteractionPreviewSource | null): void {
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
    rig.setInteractionState(source.interactionId, 'open');
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

  public render(deltaSeconds: number): void {
    if (this.rig === null) return;
    this.elapsed += deltaSeconds;
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
    camera.position.copy(this.focusCenter).add(CAMERA_OFFSET);
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
}
