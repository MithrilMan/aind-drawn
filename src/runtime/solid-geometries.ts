import * as THREE from 'three';

import type { SolidGeometrySpec } from '../contracts/solid-asset.js';
import {
  createSolidGeometry,
  resolveSolidGeometryDetail,
} from './solid-geometry.js';

type GeometryRecord = {
  geometry: THREE.BufferGeometry;
  leases: number;
  byteSize: number;
};

export type SolidGeometryLease = Readonly<{
  geometry: THREE.BufferGeometry;
  release: () => void;
}>;

export type SolidGeometryResourceDiagnostics = Readonly<{
  geometries: number;
  activeLeases: number;
  retainedBytes: number;
  cacheHits: number;
  cacheMisses: number;
}>;

function geometryKey(spec: SolidGeometrySpec, detail: number): string {
  return JSON.stringify([detail, spec]);
}

function geometryByteSize(geometry: THREE.BufferGeometry): number {
  return Object.values(geometry.attributes).reduce(
    (total, attribute) => total + attribute.array.byteLength,
    geometry.index?.array.byteLength ?? 0,
  );
}

/**
 * Scene-owned cache for immutable solid geometry. Equal serialisable specs at
 * equal runtime detail share one BufferGeometry and stay warm for the cache
 * lifetime, so replacing a rig does not immediately rebuild and re-upload it.
 */
export class SolidGeometryResourceCache {
  private readonly records = new Map<string, GeometryRecord>();
  private hits = 0;
  private misses = 0;
  private disposed = false;

  public acquire(spec: SolidGeometrySpec, detail?: number): SolidGeometryLease {
    this.assertAlive();
    const resolvedDetail = resolveSolidGeometryDetail(detail);
    const key = geometryKey(spec, resolvedDetail);
    let record = this.records.get(key);
    if (record === undefined) {
      const geometry = createSolidGeometry(spec, { detail: resolvedDetail });
      record = {
        geometry,
        leases: 0,
        byteSize: geometryByteSize(geometry),
      };
      this.records.set(key, record);
      this.misses += 1;
    } else {
      this.hits += 1;
    }
    record.leases += 1;
    let active = true;
    return Object.freeze({
      geometry: record.geometry,
      release: () => {
        if (!active) return;
        active = false;
        record.leases -= 1;
      },
    });
  }

  public getDiagnostics(): SolidGeometryResourceDiagnostics {
    let activeLeases = 0;
    let retainedBytes = 0;
    for (const record of this.records.values()) {
      activeLeases += record.leases;
      retainedBytes += record.byteSize;
    }
    return Object.freeze({
      geometries: this.records.size,
      activeLeases,
      retainedBytes,
      cacheHits: this.hits,
      cacheMisses: this.misses,
    });
  }

  public clear(): void {
    this.assertAlive();
    if ([...this.records.values()].some(({ leases }) => leases !== 0)) {
      throw new Error('Cannot clear solid geometry resources with active leases');
    }
    for (const { geometry } of this.records.values()) geometry.dispose();
    this.records.clear();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const { geometry } of this.records.values()) geometry.dispose();
    this.records.clear();
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('SolidGeometryResourceCache has been disposed');
  }
}
