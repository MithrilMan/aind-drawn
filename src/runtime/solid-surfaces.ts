import * as THREE from 'three';

import type { ResolvedSemanticSurface } from '../appearance/art-direction.js';
import type {
  PhysicalFinishId,
  PhysicalSubstrateId,
} from '../materials/surface.js';
import {
  createSolidFinishTextureBundle,
  type SolidFinishTextureBundle,
  type SolidFinishTextureProfile,
} from './solid-finish-textures.js';

export type SolidSurfaceResourceCacheOptions = Readonly<{
  environmentMap?: THREE.Texture;
}>;

export type SolidSurfaceLease = Readonly<{
  material: THREE.MeshPhysicalMaterial;
  release: () => void;
}>;

export type SolidSurfaceResourceDiagnostics = Readonly<{
  entries: number;
  activeLeases: number;
  textureProfiles: number;
  hits: number;
  misses: number;
}>;

type SurfaceEntry = {
  readonly material: THREE.MeshPhysicalMaterial;
  references: number;
};

function rgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(
    color[0] / 255,
    color[1] / 255,
    color[2] / 255,
    THREE.SRGBColorSpace,
  );
}

function lift(color: THREE.Color, amount: number): THREE.Color {
  return color.clone().lerp(new THREE.Color(1, 1, 1), amount);
}

function substrateParameters(
  substrate: PhysicalSubstrateId,
  color: THREE.Color,
): THREE.MeshPhysicalMaterialParameters {
  const recipes: Readonly<Record<PhysicalSubstrateId, THREE.MeshPhysicalMaterialParameters>> = {
    generic: { roughness: 0.72, metalness: 0, clearcoat: 0, envMapIntensity: 0.82 },
    skin: {
      roughness: 0.62, metalness: 0, sheen: 1, sheenRoughness: 0.85,
      sheenColor: lift(color, 0.22), clearcoat: 0.25, clearcoatRoughness: 0.5,
      envMapIntensity: 0.9,
    },
    fiber: {
      roughness: 0.95, metalness: 0, sheen: 1, sheenRoughness: 0.6,
      sheenColor: lift(color, 0.35), clearcoat: 0, envMapIntensity: 0.6,
    },
    wood: {
      roughness: 0.62, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3,
      envMapIntensity: 0.85, anisotropy: 0.5, anisotropyRotation: 0,
    },
    glass: {
      roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.025,
      envMapIntensity: 1.15,
    },
    rubber: {
      roughness: 0.82, metalness: 0, clearcoat: 0, sheen: 0.5,
      sheenRoughness: 0.8, sheenColor: lift(color, 0.3), envMapIntensity: 0.7,
    },
    ceramic: {
      roughness: 0.3, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.015,
      envMapIntensity: 1.25,
    },
    resin: {
      roughness: 0.55, metalness: 0, clearcoat: 0.25, clearcoatRoughness: 0.4,
      envMapIntensity: 0.8,
    },
    metal: {
      roughness: 0.3, metalness: 0.82, clearcoat: 0.3, clearcoatRoughness: 0.22,
      envMapIntensity: 1.1,
    },
    'painted-metal': {
      roughness: 0.3, metalness: 0.12, clearcoat: 0.72, clearcoatRoughness: 0.12,
      envMapIntensity: 1.05,
    },
    stone: { roughness: 0.92, metalness: 0, clearcoat: 0, envMapIntensity: 0.68 },
    paper: { roughness: 1, metalness: 0, clearcoat: 0, envMapIntensity: 0.52 },
  };
  return recipes[substrate];
}

function finishParameters(finish: PhysicalFinishId): THREE.MeshPhysicalMaterialParameters {
  const recipes: Readonly<Record<PhysicalFinishId, THREE.MeshPhysicalMaterialParameters>> = {
    raw: { roughness: 0.92, clearcoat: 0 },
    matte: { roughness: 0.82, clearcoat: 0 },
    satin: { roughness: 0.44, clearcoat: 0.28, clearcoatRoughness: 0.32 },
    gloss: { roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.07 },
    polished: { roughness: 0.16, clearcoat: 0.18, clearcoatRoughness: 0.05 },
    flocked: { roughness: 1, clearcoat: 0, sheen: 1, sheenRoughness: 0.35 },
    crazed: { roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.04 },
    iridescent: {
      roughness: 0.3, clearcoat: 0.35, clearcoatRoughness: 0.1,
      iridescence: 0.85, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 520],
    },
  };
  return recipes[finish];
}

function textureProfile(surface: ResolvedSemanticSurface): SolidFinishTextureProfile | undefined {
  if (surface.physical.finish === 'iridescent') return 'pearl';
  if (surface.physical.finish === 'crazed') return 'crazed';
  if (surface.physical.finish === 'flocked' || surface.physical.substrate === 'fiber') return 'wool';
  if (surface.physical.substrate === 'wood') return 'wood';
  if (surface.physical.substrate === 'resin') return 'resin';
  return undefined;
}

function surfaceKey(surface: ResolvedSemanticSurface): string {
  const { physical } = surface;
  return [
    surface.color.join(','),
    physical.substrate,
    physical.finish,
    physical.roughness ?? '-',
    physical.metalness ?? '-',
    physical.clearcoat ?? '-',
  ].join('|');
}

/**
 * Scene-scoped immutable GPU resource cache. Equal resolved surfaces share one
 * MeshPhysicalMaterial and one procedural texture bundle across every active rig.
 */
export class SolidSurfaceResourceCache {
  private readonly entries = new Map<string, SurfaceEntry>();
  private readonly textureBundles = new Map<SolidFinishTextureProfile, SolidFinishTextureBundle>();
  private readonly environmentMap: THREE.Texture | undefined;
  private hits = 0;
  private misses = 0;
  private disposed = false;

  public constructor(options: SolidSurfaceResourceCacheOptions = {}) {
    this.environmentMap = options.environmentMap;
  }

  public acquire(surface: ResolvedSemanticSurface): SolidSurfaceLease {
    this.assertAlive();
    const key = surfaceKey(surface);
    let entry = this.entries.get(key);
    if (entry === undefined) {
      entry = { material: this.create(surface, key), references: 0 };
      this.entries.set(key, entry);
      this.misses += 1;
    } else {
      this.hits += 1;
    }
    entry.references += 1;
    let active = true;
    return Object.freeze({
      material: entry.material,
      release: () => {
        if (!active) return;
        active = false;
        const current = this.entries.get(key);
        if (current === undefined) return;
        current.references -= 1;
        if (current.references === 0) {
          current.material.dispose();
          this.entries.delete(key);
        }
      },
    });
  }

  public getDiagnostics(): SolidSurfaceResourceDiagnostics {
    let activeLeases = 0;
    for (const entry of this.entries.values()) activeLeases += entry.references;
    return Object.freeze({
      entries: this.entries.size,
      activeLeases,
      textureProfiles: this.textureBundles.size,
      hits: this.hits,
      misses: this.misses,
    });
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const entry of this.entries.values()) entry.material.dispose();
    const textures = new Set<THREE.Texture>();
    for (const bundle of this.textureBundles.values()) {
      if (bundle.normalMap !== undefined) textures.add(bundle.normalMap);
      if (bundle.roughnessMap !== undefined) textures.add(bundle.roughnessMap);
      if (bundle.iridescenceThicknessMap !== undefined) textures.add(bundle.iridescenceThicknessMap);
    }
    for (const texture of textures) texture.dispose();
    this.entries.clear();
    this.textureBundles.clear();
  }

  private create(surface: ResolvedSemanticSurface, key: string): THREE.MeshPhysicalMaterial {
    const color = rgb(surface.color);
    const physical = surface.physical;
    const material = new THREE.MeshPhysicalMaterial({
      ...substrateParameters(physical.substrate, color),
      ...finishParameters(physical.finish),
      name: `aind:surface:${key}`,
      color,
      ...(physical.roughness === undefined ? {} : { roughness: physical.roughness }),
      ...(physical.metalness === undefined ? {} : { metalness: physical.metalness }),
      ...(physical.clearcoat === undefined ? {} : { clearcoat: physical.clearcoat }),
      envMap: this.environmentMap ?? null,
    });
    const profile = textureProfile(surface);
    if (profile !== undefined) this.applyTextures(material, this.textures(profile));
    return material;
  }

  private textures(profile: SolidFinishTextureProfile): SolidFinishTextureBundle {
    const existing = this.textureBundles.get(profile);
    if (existing !== undefined) return existing;
    const created = createSolidFinishTextureBundle(profile);
    this.textureBundles.set(profile, created);
    return created;
  }

  private applyTextures(
    material: THREE.MeshPhysicalMaterial,
    textures: SolidFinishTextureBundle,
  ): void {
    material.normalMap = textures.normalMap ?? null;
    material.roughnessMap = textures.roughnessMap ?? null;
    material.iridescenceThicknessMap = textures.iridescenceThicknessMap ?? null;
    if (textures.normalScale !== undefined) material.normalScale.set(...textures.normalScale);
    material.needsUpdate = true;
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error('Solid surface resource cache is disposed');
  }
}

export function createSolidSurfaceResourceCache(
  options: SolidSurfaceResourceCacheOptions = {},
): SolidSurfaceResourceCache {
  return new SolidSurfaceResourceCache(options);
}
