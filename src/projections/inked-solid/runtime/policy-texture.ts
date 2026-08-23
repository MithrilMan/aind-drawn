import * as THREE from 'three';

import type { InkedSolidBlueprint } from '../blueprint.js';
import type { MediumId } from '../../../materials/medium.js';

export const INKED_SOLID_POLICY_CAPACITY = 128;
export const INKED_SOLID_POLICY_TEXELS = 6;

const FILL_TEXTURE_MODE: Readonly<Record<MediumId, number>> = Object.freeze({
  graphite: 0,
  ink: 1,
  watercolor: 2,
  oil: 3,
  chalk: 4,
  marker: 5,
});

export function normalizedInkedSolidSeed(seed: number): number {
  return (seed % 65_521) / 65_521;
}

function linearColor(color: readonly [number, number, number]): THREE.Color {
  return new THREE.Color(color[0] / 255, color[1] / 255, color[2] / 255)
    .convertSRGBToLinear();
}

export class InkedSolidPolicyTexture {
  public readonly texture: THREE.DataTexture;
  private readonly data = new Float32Array(
    INKED_SOLID_POLICY_CAPACITY * INKED_SOLID_POLICY_TEXELS * 4,
  );

  public constructor() {
    this.texture = new THREE.DataTexture(
      this.data,
      INKED_SOLID_POLICY_TEXELS,
      INKED_SOLID_POLICY_CAPACITY,
      THREE.RGBAFormat,
      THREE.FloatType,
    );
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }

  public write(slot: number, blueprint: InkedSolidBlueprint): void {
    this.assertSlot(slot);
    const { contour, deposition } = blueprint;
    const contourColor = linearColor(contour.color);
    this.writeTexel(slot, 0, contourColor.r, contourColor.g, contourColor.b, contour.width);
    this.writeTexel(
      slot,
      1,
      contour.opacity,
      contour.echoOpacity,
      contour.ghostOpacity,
      contour.ghostSpread,
    );
    this.writeTexel(
      slot,
      2,
      contour.granulation,
      contour.wander,
      contour.depthThreshold,
      contour.normalThreshold,
    );
    this.writeTexel(
      slot,
      3,
      contour.jitter,
      contour.boilFramesPerSecond,
      normalizedInkedSolidSeed(contour.seed),
      deposition.pigmentStrength,
    );
    this.writeTexel(
      slot,
      4,
      deposition.planeSeparationStrength,
      deposition.planeSeparationSteps,
      deposition.variationStrength,
      deposition.variationScale,
    );
    this.writeTexel(
      slot,
      5,
      FILL_TEXTURE_MODE[deposition.texture],
      normalizedInkedSolidSeed(deposition.seed),
      0,
      0,
    );
    this.texture.needsUpdate = true;
  }

  public clear(slot: number): void {
    this.assertSlot(slot);
    const start = slot * INKED_SOLID_POLICY_TEXELS * 4;
    this.data.fill(0, start, start + INKED_SOLID_POLICY_TEXELS * 4);
    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    this.texture.dispose();
  }

  private writeTexel(
    slot: number,
    texel: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
  ): void {
    const offset = (slot * INKED_SOLID_POLICY_TEXELS + texel) * 4;
    this.data[offset] = red;
    this.data[offset + 1] = green;
    this.data[offset + 2] = blue;
    this.data[offset + 3] = alpha;
  }

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= INKED_SOLID_POLICY_CAPACITY) {
      throw new RangeError(`Inked-solid policy slot must be between 0 and ${INKED_SOLID_POLICY_CAPACITY - 1}`);
    }
  }
}
