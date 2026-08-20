import * as THREE from 'three';

import {
  CharacterAnimator,
  SpriteRig,
  type AssetBlueprint,
  type CharacterExpression,
  type CharacterMotion,
} from '../../../src/index.js';

export type RasterPreviewFraming = 'full' | 'face';

type RasterPreviewOptions = Readonly<{
  autoGaze?: boolean;
}>;

/**
 * Small live consumer of the public raster runtime. It deliberately shares no
 * drawing implementation with the solid preview: parity is proven through the
 * identity and motion contracts, not through a hand-maintained thumbnail.
 */
export class CharacterRasterPreview {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 20);
  private rig: SpriteRig | null = null;
  private animator: CharacterAnimator | null = null;
  private framing: RasterPreviewFraming = 'full';

  public constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.width, canvas.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera.position.set(0, 0, 10);
  }

  public setBlueprint(blueprint: AssetBlueprint, options: RasterPreviewOptions = {}): void {
    this.rig?.root.removeFromParent();
    this.rig?.dispose();
    this.rig = new SpriteRig(blueprint, { boilFrames: 3 });
    this.animator = new CharacterAnimator(
      this.rig,
      options.autoGaze === undefined ? {} : { autoGaze: options.autoGaze },
    );
    this.scene.add(this.rig.root);
    this.frame(this.framing);
  }

  public setExpression(expression: CharacterExpression): void {
    this.animator?.setExpression(expression);
  }

  public frame(framing: RasterPreviewFraming): void {
    this.framing = framing;
    const blueprint = this.rig?.blueprint;
    if (blueprint === undefined) return;

    let centerX = blueprint.bounds.x + blueprint.bounds.width * 0.5;
    let centerY = blueprint.bounds.y + blueprint.bounds.height * 0.5;
    let extent = Math.max(blueprint.bounds.width, blueprint.bounds.height) * 0.58;

    if (framing === 'face') {
      this.rig?.root.updateMatrixWorld(true);
      const head = this.rig?.getBone('head');
      const headLayer = blueprint.layers.find((layer) => layer.id === 'head');
      if (head !== null && head !== undefined) {
        const position = head.getWorldPosition(new THREE.Vector3());
        centerX = position.x;
        centerY = position.y;
      }
      if (headLayer !== undefined) {
        extent = Math.max(headLayer.world.width, headLayer.world.height) * 0.46;
      }
    }

    this.camera.left = -extent;
    this.camera.right = extent;
    this.camera.top = extent;
    this.camera.bottom = -extent;
    this.camera.position.set(centerX, centerY, 10);
    this.camera.lookAt(centerX, centerY, 0);
    this.camera.updateProjectionMatrix();
  }

  public update(deltaSeconds: number, motion: CharacterMotion): void {
    this.animator?.update(deltaSeconds, motion);
    this.renderer.render(this.scene, this.camera);
  }

  /** Advances a transition without starting continuous playback. */
  public settle(motion: CharacterMotion): void {
    for (let index = 0; index < 4; index += 1) {
      this.animator?.update(0.1, motion);
    }
    this.renderer.render(this.scene, this.camera);
  }

  public dispose(): void {
    this.rig?.dispose();
    this.rig = null;
    this.animator = null;
    this.renderer.dispose();
  }
}
