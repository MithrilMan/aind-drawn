import * as THREE from 'three';

function createTarget(
  width: number,
  height: number,
  options: THREE.RenderTargetOptions = {},
): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
    ...options,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export class InkedSolidRenderTargets {
  public readonly depth = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);

  public readonly albedo = createTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });

  public readonly normal = createTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
  });

  public readonly mark = createTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });

  public readonly anchor = createTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    type: THREE.HalfFloatType,
  });

  public constructor() {
    this.depth.format = THREE.DepthFormat;
    this.albedo.depthTexture = this.depth;
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    const targetWidth = Math.max(1, Math.round(width * pixelRatio));
    const targetHeight = Math.max(1, Math.round(height * pixelRatio));
    this.albedo.setSize(targetWidth, targetHeight);
    this.normal.setSize(targetWidth, targetHeight);
    this.mark.setSize(targetWidth, targetHeight);
    this.anchor.setSize(targetWidth, targetHeight);
  }

  public dispose(): void {
    this.albedo.dispose();
    this.normal.dispose();
    this.mark.dispose();
    this.anchor.dispose();
  }
}
