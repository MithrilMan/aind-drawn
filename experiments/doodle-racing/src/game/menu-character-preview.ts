import * as THREE from 'three';

import type { InkedSolidSceneDiagnostics, MediumId } from '../../../../src/index.js';
import type { CourseLayout } from './course.js';
import { DoodleScene } from './doodle-scene.js';
import { GrandstandExplorer, type GrandstandExplorerSnapshot } from './grandstand-explorer.js';
import { MenuPreviewBackdrop } from './menu-preview-backdrop.js';
import type { GrandstandLayout } from './race-world.js';
import { SmokeBurst } from './smoke-burst.js';

const PREVIEW_POSITION = Object.freeze({ x: 0, y: 0, z: 0 });
const PREVIEW_HEADING = 0;
const PREVIEW_TARGET = new THREE.Vector3(0, 1.08, 0);

export class MenuCharacterPreview {
  private readonly doodle: DoodleScene;
  private readonly backdrop = new MenuPreviewBackdrop();
  private readonly smoke = new SmokeBurst();
  private explorer: GrandstandExplorer;
  private pendingSeed: number | null = null;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    private readonly stand: GrandstandLayout,
    private readonly course: CourseLayout,
    medium: MediumId,
    seed: number,
  ) {
    this.doodle = new DoodleScene(canvas, viewport, medium);
    this.explorer = this.createExplorer(seed);
    this.backdrop.setVisible(true);
    this.doodle.setAssets(this.sceneAssets());
    this.updateCamera();
  }

  public setMedium(medium: MediumId): void {
    this.doodle.setMedium(medium);
  }

  public get currentSeed(): number {
    return this.explorer.identity.seed;
  }

  public reroll(seed: number): void {
    if (this.pendingSeed !== null) {
      this.pendingSeed = seed;
      return;
    }
    this.pendingSeed = seed;
    this.smoke.trigger(this.explorer.snapshot(), seed);
  }

  public render(deltaSeconds: number): GrandstandExplorerSnapshot {
    this.smoke.update(deltaSeconds);
    this.completePendingChange();
    const snapshot = this.explorer.updatePreview(deltaSeconds);
    this.updateCamera();
    this.backdrop.update(this.doodle.camera, snapshot);
    this.doodle.render(snapshot.elapsed);
    return snapshot;
  }

  public diagnostics(): InkedSolidSceneDiagnostics | null {
    return this.doodle.diagnostics();
  }

  public dispose(): void {
    this.doodle.dispose();
    this.explorer.dispose();
    this.smoke.dispose();
    this.backdrop.dispose();
  }

  private createExplorer(seed: number): GrandstandExplorer {
    const explorer = new GrandstandExplorer(this.stand, this.course, seed);
    explorer.setPreviewTransform(PREVIEW_POSITION, PREVIEW_HEADING);
    explorer.setPreviewMode(true);
    explorer.setVisible(true);
    return explorer;
  }

  private completePendingChange(): void {
    const seed = this.pendingSeed;
    if (seed === null || !this.smoke.isCovered) return;
    const previous = this.explorer;
    this.explorer = this.createExplorer(seed);
    this.doodle.setAssets(this.sceneAssets());
    previous.dispose();
    this.pendingSeed = null;
  }

  private sceneAssets() {
    return Object.freeze([
      this.backdrop.doodleAsset(),
      ...this.explorer.doodleAssets(),
      this.smoke.doodleAsset(),
    ]);
  }

  private updateCamera(): void {
    const camera = this.doodle.camera;
    camera.position.set(1.2, 2.05, 4.85);
    camera.up.set(0, 1, 0);
    camera.lookAt(PREVIEW_TARGET);
    const { width, height } = this.doodle.viewportSize();
    const viewSize = width <= 480 ? 4.9 : 5.15;
    const aspect = width / height;
    camera.left = -viewSize * aspect * 0.5;
    camera.right = viewSize * aspect * 0.5;
    camera.top = viewSize * 0.5;
    camera.bottom = -viewSize * 0.5;
    camera.updateProjectionMatrix();
  }
}
