import * as THREE from 'three';

import type { SolidMaterialSpec } from '../materials/finish.js';

export type SolidMaterialFactoryOptions = Readonly<{
  environmentMap?: THREE.Texture;
}>;

function rgb(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color().setRGB(color[0] / 255, color[1] / 255, color[2] / 255, THREE.SRGBColorSpace);
}

export function createSolidMaterial(
  spec: SolidMaterialSpec,
  options: SolidMaterialFactoryOptions = {},
): THREE.MeshPhysicalMaterial {
  const presets = {
    matte: { roughness: 0.86, metalness: 0, clearcoat: 0 },
    glossy: { roughness: 0.24, metalness: 0, clearcoat: 0.72 },
    rubber: { roughness: 0.72, metalness: 0, clearcoat: 0.08 },
    ceramic: { roughness: 0.18, metalness: 0, clearcoat: 1 },
    skin: { roughness: 0.62, metalness: 0, clearcoat: 0.16 },
    metal: { roughness: 0.3, metalness: 0.82, clearcoat: 0.3 },
  } as const;
  const preset = presets[spec.finish];
  return new THREE.MeshPhysicalMaterial({
    name: spec.id,
    color: rgb(spec.color),
    roughness: spec.roughness ?? preset.roughness,
    metalness: spec.metalness ?? preset.metalness,
    clearcoat: spec.clearcoat ?? preset.clearcoat,
    envMap: options.environmentMap ?? null,
  });
}
