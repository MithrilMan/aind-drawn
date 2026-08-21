import * as THREE from 'three';

import type { SolidFinishId, SolidMaterialSpec } from '../materials/finish.js';
import {
  createSolidFinishTextureBundle,
  type SolidFinishTextureBundle,
  type SolidFinishTextureProfile,
} from './solid-finish-textures.js';

export type SolidMaterialProviderOptions = Readonly<{
  environmentMap?: THREE.Texture;
}>;

type SolidFinishRecipe = Readonly<{
  parameters: (color: THREE.Color) => THREE.MeshPhysicalMaterialParameters;
  textureProfile?: SolidFinishTextureProfile;
}>;

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

const SOLID_FINISH_RECIPES: Readonly<Record<SolidFinishId, SolidFinishRecipe>> = Object.freeze({
  matte: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.9, metalness: 0, clearcoat: 0, envMapIntensity: 0.78,
    }),
  }),
  glossy: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.26, metalness: 0, clearcoat: 1,
      clearcoatRoughness: 0.07, envMapIntensity: 1,
    }),
  }),
  rubber: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.82, metalness: 0, clearcoat: 0,
      sheen: 0.5, sheenRoughness: 0.8, sheenColor: new THREE.Color(1, 1, 1),
      envMapIntensity: 0.7,
    }),
  }),
  ceramic: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.3, metalness: 0, clearcoat: 1,
      clearcoatRoughness: 0.015, envMapIntensity: 1.25,
    }),
  }),
  pearl: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.3, metalness: 0, ior: 1.9,
      clearcoat: 0.35, clearcoatRoughness: 0.1, envMapIntensity: 1.05,
      iridescence: 0.85, iridescenceIOR: 1.5, iridescenceThicknessRange: [180, 520],
    }),
    textureProfile: 'pearl',
  }),
  flocked: Object.freeze({
    parameters: (color: THREE.Color): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 1, metalness: 0, clearcoat: 0,
      sheen: 1, sheenRoughness: 0.35, sheenColor: lift(color, 0.5),
      envMapIntensity: 0.55,
    }),
  }),
  wood: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.62, metalness: 0,
      clearcoat: 0.35, clearcoatRoughness: 0.3, envMapIntensity: 0.85,
      anisotropy: 0.5, anisotropyRotation: 0,
    }),
    textureProfile: 'wood',
  }),
  wool: Object.freeze({
    parameters: (color: THREE.Color): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.95, metalness: 0, clearcoat: 0,
      sheen: 1, sheenRoughness: 0.6, sheenColor: lift(color, 0.35),
      envMapIntensity: 0.6,
    }),
    textureProfile: 'wool',
  }),
  resin: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.55, metalness: 0,
      clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 0.8,
    }),
    textureProfile: 'resin',
  }),
  chrome: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.16, metalness: 1, clearcoat: 0, envMapIntensity: 1.4,
    }),
  }),
  metal: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.3, metalness: 0.82,
      clearcoat: 0.3, clearcoatRoughness: 0.22, envMapIntensity: 1.1,
    }),
  }),
  crazed: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.34, metalness: 0,
      clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.15,
    }),
    textureProfile: 'crazed',
  }),
  skin: Object.freeze({
    parameters: (): THREE.MeshPhysicalMaterialParameters => ({
      roughness: 0.62, metalness: 0,
      sheen: 1, sheenRoughness: 0.85, sheenColor: new THREE.Color('#ff9d8e'),
      clearcoat: 0.25, clearcoatRoughness: 0.5, envMapIntensity: 0.9,
    }),
  }),
});

/**
 * Runtime owner for physical materials and their shared procedural maps.
 * One provider belongs to one SolidRig and disposes every GPU resource it creates.
 */
export class SolidMaterialProvider {
  private readonly options: SolidMaterialProviderOptions;
  private readonly materials = new Set<THREE.MeshPhysicalMaterial>();
  private readonly textureBundles = new Map<SolidFinishTextureProfile, SolidFinishTextureBundle>();
  private disposed = false;

  public constructor(options: SolidMaterialProviderOptions = {}) {
    this.options = options;
  }

  public create(spec: SolidMaterialSpec): THREE.MeshPhysicalMaterial {
    if (this.disposed) throw new Error('Solid material provider is disposed');
    const recipe = SOLID_FINISH_RECIPES[spec.finish];
    const color = rgb(spec.color);
    const parameters = recipe.parameters(color);
    const material = new THREE.MeshPhysicalMaterial({
      ...parameters,
      name: spec.id,
      color,
      ...(spec.roughness === undefined ? {} : { roughness: spec.roughness }),
      ...(spec.metalness === undefined ? {} : { metalness: spec.metalness }),
      ...(spec.clearcoat === undefined ? {} : { clearcoat: spec.clearcoat }),
      envMap: this.options.environmentMap ?? null,
    });
    if (recipe.textureProfile !== undefined) {
      this.applyTextures(material, this.textures(recipe.textureProfile));
    }
    this.materials.add(material);
    return material;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const material of this.materials) material.dispose();
    const textures = new Set<THREE.Texture>();
    for (const bundle of this.textureBundles.values()) {
      if (bundle.normalMap !== undefined) textures.add(bundle.normalMap);
      if (bundle.roughnessMap !== undefined) textures.add(bundle.roughnessMap);
      if (bundle.iridescenceThicknessMap !== undefined) {
        textures.add(bundle.iridescenceThicknessMap);
      }
    }
    for (const texture of textures) texture.dispose();
    this.materials.clear();
    this.textureBundles.clear();
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
}

export function createSolidMaterialProvider(
  options: SolidMaterialProviderOptions = {},
): SolidMaterialProvider {
  return new SolidMaterialProvider(options);
}
