import * as THREE from 'three';

import {
  SpriteRig,
  type AssetBlueprint,
} from '../../../src/index.js';
import type {
  FamilyIdentity,
  FamilyDynamicState,
  StudioRasterRuntimeFactory,
  StudioRuntimeAdapter,
} from './family-catalog.js';

const FRAME_PADDING = 1.16;

export class RasterStage {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  private readonly viewport: HTMLElement;
  private readonly observer: ResizeObserver;
  private rig: SpriteRig | null = null;
  private runtime: StudioRuntimeAdapter | null = null;

  public constructor(canvas: HTMLCanvasElement, viewport: HTMLElement) {
    this.viewport = viewport;
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.camera.position.set(0, 0, 10);
    this.observer = new ResizeObserver(() => {
      this.resize();
    });
    this.observer.observe(viewport);
  }

  public setBlueprint(
    blueprint: AssetBlueprint,
    identity: FamilyIdentity,
    createRuntime: StudioRasterRuntimeFactory,
    autoGaze: boolean,
  ): void {
    this.rig?.root.removeFromParent();
    this.rig?.dispose();
    this.rig = new SpriteRig(blueprint, { boilFrames: 3 });
    this.runtime = createRuntime(this.rig, identity, { autoGaze });
    this.scene.add(this.rig.root);
    this.frame();
  }

  public setInteractionState(id: string, state: string): void {
    if (this.rig?.interactionIds.includes(id) === true) this.rig.setInteractionState(id, state);
  }

  public update(
    deltaSeconds: number,
    elapsedSeconds: number,
    dynamicState: FamilyDynamicState,
    speed: number,
  ): void {
    this.runtime?.update({ deltaSeconds, elapsedSeconds, dynamicState, speed });
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.observer.disconnect();
    this.rig?.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    this.frame();
  }

  private frame(): void {
    const bounds = this.rig?.blueprint.bounds;
    if (bounds === undefined) return;
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    const aspect = width / height;
    const viewHeight = Math.max(
      bounds.height * FRAME_PADDING,
      bounds.width * FRAME_PADDING / aspect,
    );
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    this.camera.left = -viewHeight * aspect / 2;
    this.camera.right = viewHeight * aspect / 2;
    this.camera.top = viewHeight / 2;
    this.camera.bottom = -viewHeight / 2;
    this.camera.position.set(centerX, centerY, 10);
    this.camera.lookAt(centerX, centerY, 0);
    this.camera.updateProjectionMatrix();
  }
}
