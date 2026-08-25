import * as THREE from 'three';

import {
  SolidRig,
  createSolidVehicleBlueprint,
  createSolidVehicleInkStrokes,
  type MediumId,
} from '../../../../src/index.js';
import { DoodleScene } from './doodle-scene.js';
import {
  DEFAULT_VEHICLE_SEEDS,
  createPaperCircuitVehicleIdentity,
} from './vehicle-field.js';

const PREVIEW_ORDER = Object.freeze<readonly MediumId[]>([
  'oil',
  'graphite',
  'ink',
  'watercolor',
  'chalk',
  'marker',
]);
const CAMERA_TARGET = new THREE.Vector3(0, 0.68, 0);

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => {
    resolve();
  }));
}

/**
 * Rasterizes the same procedural vehicle through every public MediumId using one
 * short-lived Doodle renderer. The menu keeps lightweight images instead of six
 * permanent WebGL contexts, which matters considerably on mobile browsers.
 */
export class MediumVehicleGallery {
  private readonly doodle: DoodleScene;
  private readonly rig: SolidRig;
  private active = true;
  private disposed = false;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    private readonly targets: ReadonlyMap<MediumId, HTMLImageElement>,
  ) {
    const identity = createPaperCircuitVehicleIdentity('you', DEFAULT_VEHICLE_SEEDS.you);
    const solid = createSolidVehicleBlueprint(identity, {
      artDirection: 'storybook',
      physical: Object.freeze({ finish: 'matte' }),
    });
    this.rig = new SolidRig(solid, { instanceId: 'paper-circuit:medium-gallery-car' });
    this.doodle = new DoodleScene(canvas, viewport, 'oil', {
      preserveDrawingBuffer: true,
    });
    this.doodle.setAssets([Object.freeze({
      solid,
      rig: this.rig,
      strokes: createSolidVehicleInkStrokes(solid),
    })]);
    this.updateCamera();
  }

  public async render(): Promise<void> {
    try {
      for (const medium of PREVIEW_ORDER) {
        if (!this.active) return;
        this.doodle.setMedium(medium);
        this.updateCamera();
        this.doodle.render(0.72);
        const target = this.targets.get(medium);
        if (target === undefined) throw new Error(`Missing medium thumbnail target: ${medium}`);
        target.src = this.doodle.captureDataUrl('image/png');
        target.closest('.medium-card-visual')?.classList.add('is-rendered');
        await nextFrame();
      }
    } finally {
      this.disposeRenderer();
    }
  }

  public dispose(): void {
    if (!this.active) return;
    this.active = false;
    this.disposeRenderer();
  }

  private updateCamera(): void {
    const camera = this.doodle.camera;
    camera.position.set(4.7, 3.25, 5.4);
    camera.up.set(0, 1, 0);
    camera.lookAt(CAMERA_TARGET);
    const { width, height } = this.doodle.viewportSize();
    const aspect = width / height;
    const viewSize = 4.85;
    camera.left = -viewSize * aspect * 0.5;
    camera.right = viewSize * aspect * 0.5;
    camera.top = viewSize * 0.5;
    camera.bottom = -viewSize * 0.5;
    camera.updateProjectionMatrix();
  }

  private disposeRenderer(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    this.doodle.dispose();
    this.rig.dispose();
  }
}
