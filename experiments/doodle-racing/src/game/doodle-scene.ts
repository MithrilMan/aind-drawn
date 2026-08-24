import * as THREE from 'three';

import {
  InkedSolidScenePass,
  createInkedSolidBlueprint,
  type InkedSolidStrokeDefinition,
  type MediumId,
  type SolidAssetBlueprint,
  type SolidRig,
} from '../../../../src/index.js';

export type DoodleSceneAsset = Readonly<{
  solid: SolidAssetBlueprint;
  rig: SolidRig;
  strokes?: readonly InkedSolidStrokeDefinition[];
}>;

export class DoodleScene {
  public readonly scene = new THREE.Scene();
  public readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 220);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly observer: ResizeObserver;
  private assets: readonly DoodleSceneAsset[] = Object.freeze([]);
  private pass: InkedSolidScenePass | null = null;
  private medium: MediumId;

  public constructor(
    canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    medium: MediumId,
  ) {
    this.medium = medium;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setClearColor(0xe9ddbd, 1);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(viewport);
    this.resize();
  }

  public setAssets(assets: readonly DoodleSceneAsset[]): void {
    this.assets = Object.freeze([...assets]);
    for (const asset of this.assets) {
      if (asset.rig.root.parent !== this.scene) this.scene.add(asset.rig.root);
    }
    this.rebuildPass();
  }

  public setMedium(medium: MediumId): void {
    if (medium === this.medium) return;
    this.medium = medium;
    this.rebuildPass();
  }

  public render(elapsedSeconds: number): void {
    this.pass?.render(this.scene, this.camera, elapsedSeconds);
  }

  public viewportSize(): Readonly<{ width: number; height: number }> {
    return Object.freeze({
      width: Math.max(1, this.viewport.clientWidth),
      height: Math.max(1, this.viewport.clientHeight),
    });
  }

  public dispose(): void {
    this.observer.disconnect();
    this.pass?.dispose();
    this.pass = null;
    this.renderer.dispose();
  }

  private rebuildPass(): void {
    this.pass?.dispose();
    const first = this.assets[0];
    if (first === undefined) {
      this.pass = null;
      return;
    }
    const firstInk = createInkedSolidBlueprint(first.solid, {
      medium: this.medium,
      ...(first.strokes === undefined ? {} : { strokes: first.strokes }),
    });
    this.pass = new InkedSolidScenePass(this.renderer, { paper: firstInk.paper });
    for (const asset of this.assets) {
      this.pass.register({
        instanceId: asset.rig.instanceId,
        blueprint: createInkedSolidBlueprint(asset.solid, {
          medium: this.medium,
          ...(asset.strokes === undefined ? {} : { strokes: asset.strokes }),
        }),
        rig: asset.rig,
      });
    }
    this.resize();
  }

  private readonly resize = (): void => {
    const { width, height } = this.viewportSize();
    this.renderer.setSize(width, height, false);
    this.pass?.setSize(width, height, this.renderer.getPixelRatio());
  };
}
