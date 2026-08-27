import * as THREE from 'three';

import {
  InkedSolidScenePass,
  createInkedSolidBlueprint,
  type ArtDirectionId,
  type InkedSolidSceneDiagnostics,
  type InkedSolidVisualizationId,
  type MediumId,
} from '../../../../src/index.js';
import {
  DoodleAssetRegistry,
  type DoodleAssetSyncStats,
  type DoodleSceneAsset,
} from './doodle-asset-registry.js';

export type { DoodleSceneAsset } from './doodle-asset-registry.js';

export type DoodleSceneOptions = Readonly<{
  preserveDrawingBuffer?: boolean;
}>;

export type DoodleRenderingStyle = Readonly<{
  medium: MediumId;
  visualization: InkedSolidVisualizationId;
  artDirection?: ArtDirectionId | null;
  viewMarks?: boolean;
}>;

export type DoodleRenderStats = Readonly<{
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
}>;

export class DoodleScene {
  public readonly scene = new THREE.Scene();
  // Keep the near plane deliberately close: the Explore camera is allowed to
  // orbit close to authored scenery, and an orthographic camera otherwise
  // makes nearby characters look like they are being randomly sliced away.
  public readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.01, 400);

  private readonly renderer: THREE.WebGLRenderer;
  private readonly pixelRatio: number;
  private readonly observer: ResizeObserver;
  private readonly assetRegistry = new DoodleAssetRegistry();
  private assets: readonly DoodleSceneAsset[] = Object.freeze([]);
  private pass: InkedSolidScenePass | null = null;
  private medium: MediumId;
  private visualization: InkedSolidVisualizationId;
  private artDirection: ArtDirectionId | null;
  private viewMarks: boolean;
  private suspended = false;

  public constructor(
    canvas: HTMLCanvasElement,
    private readonly viewport: HTMLElement,
    style: MediumId | DoodleRenderingStyle,
    options: DoodleSceneOptions = {},
  ) {
    this.medium = typeof style === 'string' ? style : style.medium;
    this.visualization = typeof style === 'string' ? 'natural' : style.visualization;
    this.artDirection = typeof style === 'string' ? null : style.artDirection ?? null;
    this.viewMarks = typeof style === 'string' ? true : style.viewMarks ?? true;
    this.pixelRatio = Math.min(
      window.devicePixelRatio,
      window.matchMedia('(pointer: coarse), (max-width: 720px)').matches ? 1.5 : 2,
    );
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.info.autoReset = false;
    // Four carrier buffers plus depth make DPR 2 disproportionately expensive
    // on phones. A 1.5 cap preserves clean contours while cutting those pixels
    // by roughly 44% on common retina mobile displays.
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setClearColor(0xe9ddbd, 1);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(viewport);
    this.resize();
  }

  public setAssets(assets: readonly DoodleSceneAsset[]): void {
    const startedAt = performance.now();
    const nextRoots = new Set(assets.map(({ rig }) => rig.root));
    for (const asset of this.assets) {
      if (!nextRoots.has(asset.rig.root) && asset.rig.root.parent === this.scene) {
        this.scene.remove(asset.rig.root);
      }
    }
    this.assets = Object.freeze([...assets]);
    for (const asset of this.assets) {
      if (asset.rig.root.parent !== this.scene) this.scene.add(asset.rig.root);
    }
    const stats = this.pass === null
      ? this.rebuildPass()
      : this.assetRegistry.sync(
        this.pass,
        this.assets,
        this.medium,
        this.artDirection,
        this.viewMarks,
      );
    if (import.meta.env.DEV) {
      console.info(
        `Paper Circuit asset sync ${(performance.now() - startedAt).toFixed(2)} ms`
          + ` / +${stats.added} =${stats.kept} -${stats.removed}`,
      );
    }
  }

  public setMedium(medium: MediumId): void {
    if (medium === this.medium) return;
    this.medium = medium;
    this.rebuildPass();
  }

  public setRenderingStyle(style: DoodleRenderingStyle): void {
    const artDirection = style.artDirection ?? null;
    const viewMarks = style.viewMarks ?? true;
    if (
      style.medium === this.medium
      && style.visualization === this.visualization
      && artDirection === this.artDirection
      && viewMarks === this.viewMarks
    ) return;
    this.medium = style.medium;
    this.visualization = style.visualization;
    this.artDirection = artDirection;
    this.viewMarks = viewMarks;
    this.rebuildPass();
  }

  /** Releases full-size render targets while an owning surface is not presented. */
  public setSuspended(suspended: boolean): void {
    if (suspended === this.suspended) return;
    this.suspended = suspended;
    this.resize();
  }

  public render(elapsedSeconds: number): void {
    if (this.suspended) return;
    this.renderer.info.reset();
    this.pass?.render(this.scene, this.camera, elapsedSeconds);
  }

  public renderStats(): DoodleRenderStats {
    const { render } = this.renderer.info;
    return Object.freeze({
      drawCalls: render.calls,
      triangles: render.triangles,
      lines: render.lines,
      points: render.points,
    });
  }

  public captureDataUrl(type = 'image/png', quality?: number): string {
    return this.renderer.domElement.toDataURL(type, quality);
  }

  public diagnostics(): InkedSolidSceneDiagnostics | null {
    return this.pass?.getDiagnostics() ?? null;
  }

  public viewportSize(): Readonly<{ width: number; height: number }> {
    return Object.freeze({
      width: Math.max(1, this.viewport.clientWidth),
      height: Math.max(1, this.viewport.clientHeight),
    });
  }

  public dispose(): void {
    this.observer.disconnect();
    this.assetRegistry.dispose();
    this.pass?.dispose();
    this.pass = null;
    this.renderer.dispose();
  }

  private rebuildPass(): DoodleAssetSyncStats {
    this.assetRegistry.dispose();
    this.pass?.dispose();
    const first = this.assets[0];
    if (first === undefined) {
      this.pass = null;
      return Object.freeze({ added: 0, kept: 0, removed: 0 });
    }
    const firstInk = createInkedSolidBlueprint(first.solid, {
      medium: this.medium,
      ...(this.artDirection === null ? {} : { artDirection: this.artDirection }),
      ...(!this.viewMarks ? { viewMarks: false as const } : {}),
      ...(first.strokes === undefined ? {} : { strokes: first.strokes }),
    });
    this.pass = new InkedSolidScenePass(this.renderer, {
      paper: firstInk.paper,
      visualization: this.visualization,
    });
    const stats = this.assetRegistry.sync(
      this.pass,
      this.assets,
      this.medium,
      this.artDirection,
      this.viewMarks,
    );
    this.resize();
    return stats;
  }

  private readonly resize = (): void => {
    if (this.suspended) {
      this.renderer.setSize(1, 1, false);
      this.pass?.setSize(1, 1, 1);
      return;
    }
    const { width, height } = this.viewportSize();
    this.renderer.setSize(width, height, false);
    this.pass?.setSize(width, height, this.renderer.getPixelRatio());
  };
}
