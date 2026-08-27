import * as THREE from 'three';

import {
  SolidRig,
  SolidSurfaceResourceCache,
  isolateSolidRigParts,
  type Point3,
} from '../../../../src/index.js';
import {
  DoodleScene,
  type DoodleRenderingStyle,
  type DoodleSceneAsset,
} from './doodle-scene.js';
import type { VehicleInteractionPreviewSource } from './vehicle-field.js';

const CAMERA_OFFSET = new THREE.Vector3(4.2, 3.4, 5.2);
const CAMERA_DISTANCE = CAMERA_OFFSET.length();
const DEFAULT_CAMERA_OFFSET_DIRECTION = CAMERA_OFFSET.clone().normalize();
const CAMERA_ORIENTATION_RESPONSE = 14;
const PREVIEW_DETAIL = 0.5;
const DEFAULT_CACHE_CAPACITY = 12;
const PREWARM_TIMEOUT_MS = 800;

type VehicleInteractionPreviewOptions = Readonly<{
  instanceId?: string;
  cacheCapacity?: number;
}>;

type CachedPreview = Readonly<{
  source: VehicleInteractionPreviewSource;
  rig: SolidRig;
  asset: DoodleSceneAsset;
  focusCenter: THREE.Vector3;
  focusSize: THREE.Vector3;
}>;

type IdleDeadlineLike = Readonly<{
  didTimeout: boolean;
  timeRemaining: () => number;
}>;

type IdleScheduler = Readonly<{
  requestIdleCallback?: (
    callback: (deadline: IdleDeadlineLike) => void,
    options?: Readonly<{ timeout: number }>,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
}>;

export class VehicleInteractionPreview {
  private readonly doodle: DoodleScene;
  private readonly surfaceCache = new SolidSurfaceResourceCache();
  private readonly focusCenter = new THREE.Vector3();
  private readonly focusSize = new THREE.Vector3();
  private readonly cameraOffsetDirection = DEFAULT_CAMERA_OFFSET_DIRECTION.clone();
  private readonly desiredCameraOffsetDirection = DEFAULT_CAMERA_OFFSET_DIRECTION.clone();
  private readonly cache = new Map<string, CachedPreview>();
  private readonly prewarmQueue: VehicleInteractionPreviewSource[] = [];
  private readonly instanceId: string;
  private readonly cacheCapacity: number;
  private activeKey: string | null = null;
  private prewarmHandle: number | null = null;
  private prewarmUsesIdleCallback = false;
  private elapsed = 0;
  private disposed = false;

  public constructor(
    canvas: HTMLCanvasElement,
    viewport: HTMLElement,
    renderingStyle: DoodleRenderingStyle,
    options: VehicleInteractionPreviewOptions = {},
  ) {
    this.instanceId = options.instanceId ?? 'paper-circuit:vehicle-interaction-preview';
    this.cacheCapacity = options.cacheCapacity ?? DEFAULT_CACHE_CAPACITY;
    if (!Number.isInteger(this.cacheCapacity) || this.cacheCapacity < 1) {
      throw new RangeError('Vehicle interaction preview cache capacity must be a positive integer');
    }
    this.doodle = new DoodleScene(canvas, viewport, renderingStyle);
  }

  public setRenderingStyle(style: DoodleRenderingStyle): void {
    this.assertAlive();
    this.doodle.setRenderingStyle(style);
  }

  /**
   * Prepares a bounded working set outside the gameplay frame. Preview rigs stay
   * registered but hidden so proximity callouts never compile geometry or ink carriers.
   */
  public prewarm(sources: readonly VehicleInteractionPreviewSource[]): void {
    this.assertAlive();
    const desired = new Map<string, VehicleInteractionPreviewSource>();
    for (const source of sources) {
      if (desired.has(source.key)) continue;
      desired.set(source.key, source);
      if (desired.size === this.cacheCapacity) break;
    }

    const stale: CachedPreview[] = [];
    for (const [key, cached] of this.cache) {
      const source = desired.get(key);
      if (source?.solid === cached.source.solid) continue;
      this.cache.delete(key);
      if (this.activeKey === key) this.activeKey = null;
      stale.push(cached);
    }
    if (stale.length > 0) {
      this.syncSceneAssets();
      for (const cached of stale) cached.rig.dispose();
    }

    this.prewarmQueue.length = 0;
    for (const source of desired.values()) {
      if (!this.cache.has(source.key)) this.prewarmQueue.push(source);
    }
    this.schedulePrewarm();
  }

  public show(
    source: VehicleInteractionPreviewSource | null,
    cameraOffsetDirection?: Point3,
  ): void {
    this.assertAlive();
    if (source === null && this.activeKey === null) return;
    if (source?.key === this.activeKey) return;
    const previous = this.activeKey === null ? undefined : this.cache.get(this.activeKey);
    if (previous !== undefined) previous.rig.root.visible = false;
    if (source === null) {
      this.activeKey = null;
      return;
    }

    const cached = this.prepare(source);
    this.touch(source.key);
    cached.rig.root.visible = true;
    this.activeKey = source.key;
    this.focusCenter.copy(cached.focusCenter);
    this.focusSize.copy(cached.focusSize);
    // The camera belongs to the preview viewport, not to the generated rig.
    // Replacing a seed must therefore retain the current orbit unless the
    // gameplay callout explicitly supplies a new world-relative direction.
    if (cameraOffsetDirection !== undefined) {
      this.setCameraOffsetDirection(cameraOffsetDirection, true);
    }
    this.updateCamera();
  }

  public render(deltaSeconds: number, cameraOffsetDirection?: Point3): void {
    if (this.activeKey === null) return;
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
    if (this.disposed) return;
    this.disposed = true;
    this.cancelPrewarm();
    this.doodle.dispose();
    for (const { rig } of this.cache.values()) rig.dispose();
    this.cache.clear();
    this.surfaceCache.dispose();
    this.activeKey = null;
  }

  private prepare(source: VehicleInteractionPreviewSource): CachedPreview {
    const existing = this.cache.get(source.key);
    if (existing !== undefined) return existing;

    const rig = new SolidRig(source.solid, {
      instanceId: `${this.instanceId}:${source.key}`,
      surfaceCache: this.surfaceCache,
      detail: PREVIEW_DETAIL,
    });
    rig.root.visible = false;
    try {
      rig.setInteractionState(source.interactionId, source.interactionState);
      const focus = isolateSolidRigParts(rig, source.partIds);
      const cached = Object.freeze({
        source,
        rig,
        asset: Object.freeze({ solid: source.solid, rig, strokes: source.strokes }),
        focusCenter: new THREE.Vector3(...focus.center),
        focusSize: new THREE.Vector3(...focus.size),
      });
      this.evictFor(source.key);
      this.cache.set(source.key, cached);
      try {
        this.syncSceneAssets();
      } catch (error) {
        this.cache.delete(source.key);
        throw error;
      }
      return cached;
    } catch (error) {
      rig.dispose();
      throw new Error(`Interaction preview ${source.key} could not focus its authored parts`, {
        cause: error,
      });
    }
  }

  private evictFor(nextKey: string): void {
    if (this.cache.has(nextKey) || this.cache.size < this.cacheCapacity) return;
    const candidate = [...this.cache.keys()].find((key) => key !== this.activeKey);
    if (candidate === undefined) return;
    const evicted = this.cache.get(candidate);
    this.cache.delete(candidate);
    this.syncSceneAssets();
    evicted?.rig.dispose();
  }

  private touch(key: string): void {
    const cached = this.cache.get(key);
    if (cached === undefined) return;
    this.cache.delete(key);
    this.cache.set(key, cached);
  }

  private syncSceneAssets(): void {
    this.doodle.setAssets(Object.freeze([...this.cache.values()].map(({ asset }) => asset)));
  }

  private schedulePrewarm(): void {
    if (this.prewarmHandle !== null || this.prewarmQueue.length === 0 || this.disposed) return;
    const idleWindow: IdleScheduler = window;
    if (idleWindow.requestIdleCallback !== undefined) {
      this.prewarmUsesIdleCallback = true;
      this.prewarmHandle = idleWindow.requestIdleCallback(this.runPrewarm, {
        timeout: PREWARM_TIMEOUT_MS,
      });
      return;
    }
    this.prewarmUsesIdleCallback = false;
    this.prewarmHandle = window.setTimeout(
      () => {
        this.runPrewarm(Object.freeze({ didTimeout: true, timeRemaining: () => 0 }));
      },
      0,
    );
  }

  private cancelPrewarm(): void {
    if (this.prewarmHandle === null) return;
    const idleWindow: IdleScheduler = window;
    if (this.prewarmUsesIdleCallback && idleWindow.cancelIdleCallback !== undefined) {
      idleWindow.cancelIdleCallback(this.prewarmHandle);
    } else {
      window.clearTimeout(this.prewarmHandle);
    }
    this.prewarmHandle = null;
  }

  private readonly runPrewarm = (deadline: IdleDeadlineLike): void => {
    this.prewarmHandle = null;
    if (this.disposed) return;
    if (!deadline.didTimeout && deadline.timeRemaining() < 4) {
      this.schedulePrewarm();
      return;
    }
    const source = this.prewarmQueue.shift();
    if (source !== undefined && !this.cache.has(source.key)) {
      const cached = this.prepare(source);
      this.renderPrewarmed(cached);
    }
    this.schedulePrewarm();
  };

  private renderPrewarmed(cached: CachedPreview): void {
    if (this.activeKey !== null) return;
    this.focusCenter.copy(cached.focusCenter);
    this.focusSize.copy(cached.focusSize);
    cached.rig.root.visible = true;
    try {
      this.updateCamera();
      this.doodle.render(this.elapsed);
    } finally {
      cached.rig.root.visible = false;
    }
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

  private assertAlive(): void {
    if (this.disposed) throw new Error('Vehicle interaction preview is disposed');
  }
}
