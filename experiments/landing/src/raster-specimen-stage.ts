import * as THREE from 'three';

import {
  SpriteRig,
  applyRasterCharacterMotion,
  applyRasterVehicleMotion,
  type AssetBlueprint,
  type CharacterMotionSample,
  type VehicleMotionSample,
} from '../../../src/index.js';

const FRAME_PADDING = 1.12;

export class RasterSpecimenStage {
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 30);
  private readonly renderer: THREE.WebGLRenderer;
  private readonly resizeObserver: ResizeObserver;
  private readonly scene = new THREE.Scene();
  private rig: SpriteRig | null = null;

  public constructor(canvas: HTMLCanvasElement, private readonly viewport: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: 'low-power',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.camera.position.set(0, 0, 10);
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
    });
    this.resizeObserver.observe(viewport);
  }

  public setBlueprint(blueprint: AssetBlueprint): void {
    this.rig?.root.removeFromParent();
    this.rig?.dispose();
    this.rig = new SpriteRig(blueprint, { boilFrames: 3, textureAnisotropy: 2 });
    this.scene.add(this.rig.root);
    this.resize();
  }

  public render(elapsedSeconds: number): void {
    this.rig?.updateBoil(elapsedSeconds);
    this.renderer.render(this.scene, this.camera);
  }

  public applyCharacterMotion(sample: CharacterMotionSample): void {
    if (this.rig?.blueprint.family === 'character') {
      applyRasterCharacterMotion(this.rig, sample);
    }
  }

  public applyVehicleMotion(sample: VehicleMotionSample): void {
    if (this.rig?.blueprint.family === 'vehicle') {
      applyRasterVehicleMotion(this.rig, sample);
    }
  }

  public setInteractionStates(states: Readonly<Record<string, string>>): void {
    if (this.rig === null) return;
    for (const [id, state] of Object.entries(states)) {
      if (this.rig.interactionIds.includes(id)) this.rig.setInteractionState(id, state);
    }
  }

  public dispose(): void {
    this.resizeObserver.disconnect();
    this.rig?.dispose();
    this.renderer.dispose();
  }

  private resize(): void {
    const width = Math.max(1, this.viewport.clientWidth);
    const height = Math.max(1, this.viewport.clientHeight);
    this.renderer.setSize(width, height, false);
    const bounds = this.rig?.blueprint.bounds;
    if (bounds === undefined) return;
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
