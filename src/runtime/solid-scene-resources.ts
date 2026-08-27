import {
  SolidGeometryResourceCache,
  type SolidGeometryResourceDiagnostics,
} from './solid-geometries.js';
import {
  SolidSurfaceResourceCache,
  type SolidSurfaceResourceCacheOptions,
  type SolidSurfaceResourceDiagnostics,
} from './solid-surfaces.js';

export type SolidSceneResourceDiagnostics = Readonly<{
  geometry: SolidGeometryResourceDiagnostics;
  surfaces: SolidSurfaceResourceDiagnostics;
}>;

/** Owns the reusable renderer resources for one bounded solid scene. */
export class SolidSceneResourceCache {
  public readonly geometry = new SolidGeometryResourceCache();
  public readonly surfaces: SolidSurfaceResourceCache;
  private disposed = false;

  public constructor(options: SolidSurfaceResourceCacheOptions = {}) {
    this.surfaces = new SolidSurfaceResourceCache(options);
  }

  public getDiagnostics(): SolidSceneResourceDiagnostics {
    return Object.freeze({
      geometry: this.geometry.getDiagnostics(),
      surfaces: this.surfaces.getDiagnostics(),
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.geometry.dispose();
    this.surfaces.dispose();
  }
}
